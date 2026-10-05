"""Rate-Momentum Sizing Strategy Module (Idea 02).
Implements directional trend-following with dynamic position sizing tilted by funding rate Z-score,
incorporating anti-crowding protections and leverage constraints.
"""

from __future__ import annotations

import collections
import datetime
import logging
import math
from typing import Any
import numpy as np

from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_TAKER_FEE,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
)
from src.core.exceptions import RiskException
from src.engine.interfaces import (
    BaseStrategy,
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)

logger = logging.getLogger(__name__)


class RateMomentumSizingStrategy(BaseStrategy):
    """Rate-Momentum Sizing Strategy.
    
    Mechanics:
    - Base Directional Signal: EMA trend-following (Fast EMA vs Slow EMA).
    - Dynamic Sizing Tilt:
        Z_FR(t) = (FR(t) - mu_FR) / sigma_FR
        TiltMultiplier = clip(1.0 - gamma * Z_FR(t), 0.2, 2.0)
        S_tilted = S_base * TiltMultiplier
    - Anti-crowding Protections:
      * When longs are crowded (Z_FR > +2.0), long size is throttled down to 0.2x S_base (preventing squeeze liquidations).
      * When shorts are crowded (Z_FR < -2.0), long contrarian size expands up to 2.0x S_base.
    - Leverage cap: 2.0x for directional tilt strategies.
    """

    def __init__(self, strategy_id: str = "idea_02_rate_momentum") -> None:
        super().__init__(strategy_id=strategy_id)
        self.exchange: str = "binance"
        self.symbol: str = "BTCUSDT"
        self.base_notional: float = 2000.0  # Base dollar allocation
        self.gamma: float = 0.4             # Tilt sensitivity parameter
        self.z_score_lookback: int = 90     # Historical funding snapshots (~30 days)
        self.fast_ema_period: int = 12
        self.slow_ema_period: int = 26
        self.leverage: float = 2.0          # Strict 2.0x leverage cap for Directional Tilt

        # State tracking
        self.funding_rate_history: collections.deque[float] = collections.deque(maxlen=90)
        self.price_history: collections.deque[float] = collections.deque(maxlen=200)
        self.current_fast_ema: float | None = None
        self.current_slow_ema: float | None = None
        self.current_price: float = 0.0
        self.current_funding_rate: float = 0.0
        self.current_z_score: float = 0.0
        self.current_tilt_multiplier: float = 1.0
        self.current_position_qty: float = 0.0
        self.entry_price: float = 0.0
        self.accumulated_pnl: float = 0.0
        self.accumulated_fees: float = 0.0

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize Rate-Momentum Sizing strategy parameters."""
        self.config = config
        self.exchange = config.get("exchange", self.exchange)
        self.symbol = config.get("symbol", self.symbol)
        self.base_notional = float(config.get("base_notional", self.base_notional))
        self.gamma = float(config.get("gamma", self.gamma))
        self.z_score_lookback = int(config.get("z_score_lookback", self.z_score_lookback))
        self.funding_rate_history = collections.deque(maxlen=self.z_score_lookback)

        self.fast_ema_period = int(config.get("fast_ema_period", self.fast_ema_period))
        self.slow_ema_period = int(config.get("slow_ema_period", self.slow_ema_period))
        self.leverage = float(config.get("leverage", 2.0))
        if self.leverage > 2.0:
            logger.warning("Rate-Momentum Sizing strategy enforces maximum leverage cap of 2.0x.")
            self.leverage = 2.0

        self.is_initialized = True
        logger.info(
            f"RateMomentumSizingStrategy initialized: exchange={self.exchange}, "
            f"symbol={self.symbol}, base_notional={self.base_notional}, gamma={self.gamma}"
        )

    def calculate_funding_z_score(self, current_rate: float) -> float:
        """Compute rolling Z-score of funding rate:
        Z_FR = (FR - mu) / sigma
        """
        if len(self.funding_rate_history) < 5:
            return 0.0
        rates = np.array(self.funding_rate_history)
        mu = float(np.mean(rates))
        sigma = float(np.std(rates))
        if sigma < 1e-8:
            return 0.0
        return float((current_rate - mu) / sigma)

    def calculate_tilt_multiplier(self, z_score: float, side: OrderSide) -> float:
        """Calculate dynamic position sizing tilt multiplier clipped to [0.2, 2.0].
        
        For BUY (Longs):
          Tilt = clip(1.0 - gamma * Z_FR, 0.2, 2.0)
          - High positive Z_FR (crowded longs) -> Multiplier approaches 0.2 (anti-crowding throttle)
          - High negative Z_FR (crowded shorts) -> Multiplier approaches 2.0 (contrarian long boost)
          
        For SELL (Shorts):
          Tilt = clip(1.0 + gamma * Z_FR, 0.2, 2.0)
          - High negative Z_FR (crowded shorts) -> Multiplier approaches 0.2 (anti-crowding throttle)
          - High positive Z_FR (crowded longs) -> Multiplier approaches 2.0 (contrarian short boost)
        """
        if side == OrderSide.BUY:
            raw_mult = 1.0 - (self.gamma * z_score)
        else:
            raw_mult = 1.0 + (self.gamma * z_score)
        return float(np.clip(raw_mult, 0.2, 2.0))

    def _update_ema(self, price: float) -> None:
        """Update fast and slow exponential moving averages."""
        k_fast = 2.0 / (self.fast_ema_period + 1.0)
        k_slow = 2.0 / (self.slow_ema_period + 1.0)

        if self.current_fast_ema is None:
            self.current_fast_ema = price
        else:
            self.current_fast_ema = (price * k_fast) + (self.current_fast_ema * (1.0 - k_fast))

        if self.current_slow_ema is None:
            self.current_slow_ema = price
        else:
            self.current_slow_ema = (price * k_slow) + (self.current_slow_ema * (1.0 - k_slow))

    def get_trend_direction(self) -> int:
        """Evaluate EMA trend direction: +1 for Bullish, -1 for Bearish, 0 for Neutral."""
        if self.current_fast_ema is None or self.current_slow_ema is None:
            return 0
        if self.current_fast_ema > self.current_slow_ema:
            return 1   # Bullish
        elif self.current_fast_ema < self.current_slow_ema:
            return -1  # Bearish
        return 0

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Process incoming ticker update, update EMAs, and evaluate trend signals."""
        if event.exchange != self.exchange or event.symbol != self.symbol:
            return []

        mid_price = (event.bid_price + event.ask_price) / 2.0
        self.current_price = mid_price
        self.price_history.append(mid_price)
        self._update_ema(mid_price)

        # Generate trading signals only if we have sufficient price history
        if len(self.price_history) < self.slow_ema_period:
            return []

        trend = self.get_trend_direction()
        if trend == 0:
            return []

        now_utc = datetime.datetime.now(datetime.timezone.utc)
        desired_side = OrderSide.BUY if trend > 0 else OrderSide.SELL

        # If we are not in a position, evaluate entry with funding tilt
        if abs(self.current_position_qty) < 1e-6:
            mult = self.calculate_tilt_multiplier(self.current_z_score, desired_side)
            self.current_tilt_multiplier = mult
            tilted_notional = self.base_notional * mult
            qty = round(tilted_notional / mid_price, 4)

            if qty <= 0:
                return []

            intent_id = f"intent_momentum_{int(now_utc.timestamp()*1000)}"
            intent = OrderIntent(
                intent_id=intent_id,
                strategy_id=self.strategy_id,
                exchange=self.exchange,
                symbol=self.symbol,
                side=desired_side,
                order_type=OrderType.MARKET,
                quantity=qty,
                created_at_utc=now_utc,
            )
            return [intent]

        # If existing position is opposing the new trend -> Close and reverse
        current_side = OrderSide.BUY if self.current_position_qty > 0 else OrderSide.SELL
        if current_side != desired_side:
            # 1. Close current position
            close_intent_id = f"close_momentum_{int(now_utc.timestamp()*1000)}"
            close_side = OrderSide.SELL if current_side == OrderSide.BUY else OrderSide.BUY
            close_intent = OrderIntent(
                intent_id=close_intent_id,
                strategy_id=self.strategy_id,
                exchange=self.exchange,
                symbol=self.symbol,
                side=close_side,
                order_type=OrderType.MARKET,
                quantity=abs(self.current_position_qty),
                created_at_utc=now_utc,
            )

            # 2. Open new tilted position
            mult = self.calculate_tilt_multiplier(self.current_z_score, desired_side)
            self.current_tilt_multiplier = mult
            tilted_notional = self.base_notional * mult
            new_qty = round(tilted_notional / mid_price, 4)

            open_intent_id = f"reverse_momentum_{int(now_utc.timestamp()*1000)}"
            open_intent = OrderIntent(
                intent_id=open_intent_id,
                strategy_id=self.strategy_id,
                exchange=self.exchange,
                symbol=self.symbol,
                side=desired_side,
                order_type=OrderType.MARKET,
                quantity=new_qty,
                created_at_utc=now_utc,
            )
            return [close_intent, open_intent]

        return []

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Update funding rate history and recompute Z-score upon funding settlement."""
        if event.exchange != self.exchange or event.symbol != self.symbol:
            return []

        self.current_funding_rate = event.funding_rate
        self.funding_rate_history.append(event.funding_rate)
        self.current_z_score = self.calculate_funding_z_score(event.funding_rate)

        # Settle funding cashflow on active position
        if abs(self.current_position_qty) > 1e-6:
            price = event.mark_price or self.current_price or 30000.0
            notional = abs(self.current_position_qty) * price
            if self.current_position_qty > 0:
                # Long pays if funding > 0, receives if funding < 0
                funding_pnl = -notional * event.funding_rate
            else:
                # Short receives if funding > 0, pays if funding < 0
                funding_pnl = notional * event.funding_rate
            self.accumulated_pnl += funding_pnl

        logger.info(
            f"RateMomentum funding snapshot: FR={event.funding_rate:.6f}, "
            f"Z-Score={self.current_z_score:.2f}, TiltMultiplier={self.current_tilt_multiplier:.2f}"
        )
        return []

    def on_fill(self, event: FillEvent) -> None:
        """Update internal position state and entry price upon fill confirmation."""
        if event.symbol != self.symbol:
            return

        self.accumulated_fees += event.fee_paid
        if event.side == OrderSide.BUY:
            self.current_position_qty += event.filled_qty
            self.entry_price = event.filled_price
        else:
            self.current_position_qty -= event.filled_qty
            self.entry_price = event.filled_price

        logger.info(
            f"RateMomentum on_fill: new_pos_qty={self.current_position_qty:.4f}, "
            f"entry_price={self.entry_price:.2f}"
        )

    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Directional strategy desync handler (e.g. unexpected position or order mismatch)."""
        logger.warning(f"RateMomentum desync alert for {pair_trade_id}: {context}")
        if abs(self.current_position_qty) > 1e-6:
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            side = OrderSide.SELL if self.current_position_qty > 0 else OrderSide.BUY
            return [
                OrderIntent(
                    intent_id=f"emergency_close_{int(now_utc.timestamp()*1000)}",
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.symbol,
                    side=side,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.current_position_qty),
                    created_at_utc=now_utc,
                )
            ]
        return []
