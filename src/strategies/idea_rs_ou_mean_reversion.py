"""Bounded Agent-Researched Ornstein-Uhlenbeck (OU) Mean-Reversion Spread Strategy (Idea RS).
Implements continuous-time stochastic OU mean-reversion modeling for cross-exchange funding spreads,
including parameter fitting (theta, mu, sigma, half-life), bounded half-life filters, and risk controls.
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


class OUMeanReversionStrategy(BaseStrategy):
    """Bounded Ornstein-Uhlenbeck (OU) Mean-Reversion Spread Strategy.
    
    Mechanics:
    - Continuous-time OU SDE: dX_t = theta * (mu - X_t) dt + sigma * dW_t
    - Discrete OLS Estimation: X_{t+1} = a + b * X_t + epsilon
        b = exp(-theta * Delta_t)  => theta = -ln(b) / Delta_t
        mu = a / (1 - b)
        sigma_eq = sigma_epsilon / sqrt(1 - b^2)
        Half-Life t_{1/2} = ln(2) / theta
    - Bounded Half-Life Filter: Requires 2.0h <= t_{1/2} <= 48.0h.
    - Z-Score Signal Generation: Z_t = (X_t - mu) / sigma_eq
        * Entry: |Z_t| >= entry_z_score (default 2.0)
        * Exit:  |Z_t| <= exit_z_score  (default 0.5)
        * Stop:  |Z_t| >= stop_loss_z_score (default 3.5)
    - Leverage: 3.0x max leverage cap.
    """

    def __init__(self, strategy_id: str = "idea_rs_ou_mean_reversion") -> None:
        super().__init__(strategy_id=strategy_id)
        self.venue_a: str = "binance"
        self.venue_b: str = "bybit"
        self.symbol: str = "BTCUSDT"
        self.target_notional: float = 2000.0  # $1,000 per leg ($2,000 total)
        self.entry_z_score: float = 2.0
        self.exit_z_score: float = 0.5
        self.stop_loss_z_score: float = 3.5
        self.min_half_life_hours: float = 2.0
        self.max_half_life_hours: float = 48.0
        self.leverage: float = DEFAULT_LEVERAGE_CAP  # 3.0x

        # Historical spread buffer (funding rate differences)
        self.spread_history: collections.deque[float] = collections.deque(maxlen=120)

        # Fitted OU parameters
        self.theta: float = 0.5         # Mean-reversion speed
        self.mu: float = 0.00010        # Long-term equilibrium spread
        self.sigma_eq: float = 0.00020  # Equilibrium standard deviation
        self.half_life_hours: float = 8.0
        self.is_ou_calibrated: bool = False

        # Market & Position state
        self.rate_venue_a: float = 0.0
        self.rate_venue_b: float = 0.0
        self.price_venue_a: float = 0.0
        self.price_venue_b: float = 0.0
        self.current_spread: float = 0.0
        self.current_z_score: float = 0.0

        # Position tracking
        self.is_position_open: bool = False
        self.position_direction: int = 0  # +1 (Long Spread: Long A, Short B), -1 (Short Spread: Short A, Long B)
        self.qty_venue_a: float = 0.0
        self.qty_venue_b: float = 0.0
        self.accumulated_pnl: float = 0.0
        self.accumulated_fees: float = 0.0

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize OU Mean-Reversion strategy parameters."""
        self.config = config
        self.venue_a = config.get("venue_a", self.venue_a)
        self.venue_b = config.get("venue_b", self.venue_b)
        self.symbol = config.get("symbol", self.symbol)
        self.target_notional = float(config.get("target_notional", self.target_notional))
        self.entry_z_score = float(config.get("entry_z_score", self.entry_z_score))
        self.exit_z_score = float(config.get("exit_z_score", self.exit_z_score))
        self.stop_loss_z_score = float(config.get("stop_loss_z_score", self.stop_loss_z_score))
        self.min_half_life_hours = float(config.get("min_half_life_hours", self.min_half_life_hours))
        self.max_half_life_hours = float(config.get("max_half_life_hours", self.max_half_life_hours))
        self.leverage = float(config.get("leverage", DEFAULT_LEVERAGE_CAP))
        if self.leverage > 3.0:
            logger.warning("OU Mean-Reversion strategy enforces maximum leverage cap of 3.0x.")
            self.leverage = 3.0

        self.is_initialized = True
        logger.info(
            f"OUMeanReversionStrategy initialized: venue_a={self.venue_a}, "
            f"venue_b={self.venue_b}, entry_z={self.entry_z_score}, exit_z={self.exit_z_score}"
        )

    def fit_ou_parameters(self, spread_series: list[float] | np.ndarray, dt_hours: float = 8.0) -> dict[str, float]:
        """Estimate discrete-time OU parameters using Ordinary Least Squares (OLS) regression:
        X_{t+1} = a + b * X_t + epsilon
        """
        arr = np.array(spread_series)
        if len(arr) < 10:
            return {
                "theta": self.theta,
                "mu": self.mu,
                "sigma_eq": self.sigma_eq,
                "half_life_hours": self.half_life_hours,
                "is_valid": False,
            }

        x_t = arr[:-1]
        x_tp1 = arr[1:]

        # OLS regression: x_tp1 = a + b * x_t
        slope, intercept = np.polyfit(x_t, x_tp1, 1)

        # Check mean-reversion stability: 0 < b < 1
        if slope <= 0.0 or slope >= 0.9999:
            # Non-mean-reverting / random walk / explosive
            return {
                "theta": 0.0,
                "mu": float(np.mean(arr)),
                "sigma_eq": float(np.std(arr)),
                "half_life_hours": 999.0,
                "is_valid": False,
            }

        theta = -float(math.log(slope)) / dt_hours
        mu = float(intercept / (1.0 - slope))
        residuals = x_tp1 - (intercept + slope * x_t)
        sigma_eps = float(np.std(residuals))
        sigma_eq = float(sigma_eps / math.sqrt(1.0 - (slope ** 2)))
        half_life = float(math.log(2.0) / theta) if theta > 0 else 999.0

        is_valid = self.min_half_life_hours <= half_life <= self.max_half_life_hours

        self.theta = theta
        self.mu = mu
        self.sigma_eq = max(sigma_eq, 1e-6)
        self.half_life_hours = half_life
        self.is_ou_calibrated = is_valid

        return {
            "theta": theta,
            "mu": mu,
            "sigma_eq": self.sigma_eq,
            "half_life_hours": half_life,
            "is_valid": is_valid,
        }

    def compute_z_score(self, current_spread: float) -> float:
        """Compute standardized Z-score of current spread relative to equilibrium mean."""
        if self.sigma_eq <= 0:
            return 0.0
        return float((current_spread - self.mu) / self.sigma_eq)

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Update market prices for order notional calculations."""
        if event.exchange == self.venue_a and event.symbol == self.symbol:
            self.price_venue_a = (event.bid_price + event.ask_price) / 2.0
        elif event.exchange == self.venue_b and event.symbol == self.symbol:
            self.price_venue_b = (event.bid_price + event.ask_price) / 2.0
        return []

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Update funding rates, refit OU model, calculate Z-score, and evaluate entry/exit."""
        if event.exchange == self.venue_a and event.symbol == self.symbol:
            self.rate_venue_a = event.funding_rate
        elif event.exchange == self.venue_b and event.symbol == self.symbol:
            self.rate_venue_b = event.funding_rate
        else:
            return []

        # Update spread history: Spread = FR_A - FR_B
        self.current_spread = self.rate_venue_a - self.rate_venue_b
        self.spread_history.append(self.current_spread)

        # Refit OU parameters when sufficient history is available
        if len(self.spread_history) >= 10:
            self.fit_ou_parameters(list(self.spread_history))

        self.current_z_score = self.compute_z_score(self.current_spread)
        now_utc = event.next_snapshot_utc or datetime.datetime.now(datetime.timezone.utc)

        # Settle funding cashflows on active position
        if self.is_position_open:
            p_a = self.price_venue_a or 30000.0
            p_b = self.price_venue_b or 30000.0
            pnl_a = self.qty_venue_a * p_a * (self.rate_venue_a if self.qty_venue_a < 0 else -self.rate_venue_a)
            pnl_b = self.qty_venue_b * p_b * (self.rate_venue_b if self.qty_venue_b < 0 else -self.rate_venue_b)
            self.accumulated_pnl += (pnl_a + pnl_b)

        # 1. Position is Open: Check Mean-Reversion Exit or Stop Loss
        if self.is_position_open:
            should_exit = False
            # Condition A: Spread reverted back toward mean (|Z| <= exit_z_score)
            if abs(self.current_z_score) <= self.exit_z_score:
                logger.info(f"OU Mean Reversion target hit (Z={self.current_z_score:.2f}). Exiting.")
                should_exit = True
            # Condition B: Outlier blowout stop loss (|Z| >= stop_loss_z_score)
            elif abs(self.current_z_score) >= self.stop_loss_z_score:
                logger.warning(f"OU Stop-Loss triggered (Z={self.current_z_score:.2f}). Exiting.")
                should_exit = True

            if should_exit:
                return self._generate_exit_intents(now_utc)
            return []

        # 2. Position is Closed: Check Mean-Reversion Entry Opportunities
        # Only enter if OU process passed stability & half-life filters
        if not self.is_ou_calibrated:
            return []

        intents: list[OrderIntent] = []
        p_a = self.price_venue_a or 30000.0
        p_b = self.price_venue_b or 30000.0
        leg_notional = self.target_notional / 2.0
        qty_a = round(leg_notional / p_a, 4)
        qty_b = round(leg_notional / p_b, 4)

        if qty_a <= 0 or qty_b <= 0:
            return []

        ts_ms = int(now_utc.timestamp() * 1000)

        # Case A: Z_t >= entry_z_score (Spread abnormally high -> Expect spread to contract)
        # Action: Short Venue A (higher rate), Long Venue B (lower rate)
        if self.current_z_score >= self.entry_z_score:
            intent_a_id = f"ou_short_a_{ts_ms}"
            intent_b_id = f"ou_long_b_{ts_ms}"

            intent_a = OrderIntent(
                intent_id=intent_a_id,
                strategy_id=self.strategy_id,
                exchange=self.venue_a,
                symbol=self.symbol,
                side=OrderSide.SELL,
                order_type=OrderType.MARKET,
                quantity=qty_a,
                paired_intent_id=intent_b_id,
                created_at_utc=now_utc,
            )
            intent_b = OrderIntent(
                intent_id=intent_b_id,
                strategy_id=self.strategy_id,
                exchange=self.venue_b,
                symbol=self.symbol,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                quantity=qty_b,
                paired_intent_id=intent_a_id,
                created_at_utc=now_utc,
            )
            self.position_direction = -1
            intents = [intent_a, intent_b]

        # Case B: Z_t <= -entry_z_score (Spread abnormally low -> Expect spread to expand)
        # Action: Long Venue A (lower rate), Short Venue B (higher rate)
        elif self.current_z_score <= -self.entry_z_score:
            intent_a_id = f"ou_long_a_{ts_ms}"
            intent_b_id = f"ou_short_b_{ts_ms}"

            intent_a = OrderIntent(
                intent_id=intent_a_id,
                strategy_id=self.strategy_id,
                exchange=self.venue_a,
                symbol=self.symbol,
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                quantity=qty_a,
                paired_intent_id=intent_b_id,
                created_at_utc=now_utc,
            )
            intent_b = OrderIntent(
                intent_id=intent_b_id,
                strategy_id=self.strategy_id,
                exchange=self.venue_b,
                symbol=self.symbol,
                side=OrderSide.SELL,
                order_type=OrderType.MARKET,
                quantity=qty_b,
                paired_intent_id=intent_a_id,
                created_at_utc=now_utc,
            )
            self.position_direction = 1
            intents = [intent_a, intent_b]

        return intents

    def _generate_exit_intents(self, timestamp: datetime.datetime) -> list[OrderIntent]:
        """Generate closing orders for open OU mean reversion spread position."""
        intents: list[OrderIntent] = []
        ts_ms = int(timestamp.timestamp() * 1000)

        intent_close_a_id = f"ou_close_a_{ts_ms}"
        intent_close_b_id = f"ou_close_b_{ts_ms}"

        if abs(self.qty_venue_a) > 0:
            side_a = OrderSide.BUY if self.qty_venue_a < 0 else OrderSide.SELL
            intents.append(
                OrderIntent(
                    intent_id=intent_close_a_id,
                    strategy_id=self.strategy_id,
                    exchange=self.venue_a,
                    symbol=self.symbol,
                    side=side_a,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.qty_venue_a),
                    paired_intent_id=intent_close_b_id,
                    created_at_utc=timestamp,
                )
            )

        if abs(self.qty_venue_b) > 0:
            side_b = OrderSide.BUY if self.qty_venue_b < 0 else OrderSide.SELL
            intents.append(
                OrderIntent(
                    intent_id=intent_close_b_id,
                    strategy_id=self.strategy_id,
                    exchange=self.venue_b,
                    symbol=self.symbol,
                    side=side_b,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.qty_venue_b),
                    paired_intent_id=intent_close_a_id,
                    created_at_utc=timestamp,
                )
            )

        return intents

    def on_fill(self, event: FillEvent) -> None:
        """Update position quantities upon fill confirmation."""
        self.accumulated_fees += event.fee_paid

        if event.exchange == self.venue_a:
            if event.side == OrderSide.BUY:
                self.qty_venue_a += event.filled_qty
            else:
                self.qty_venue_a -= event.filled_qty

        elif event.exchange == self.venue_b:
            if event.side == OrderSide.BUY:
                self.qty_venue_b += event.filled_qty
            else:
                self.qty_venue_b -= event.filled_qty

        if abs(self.qty_venue_a) > 1e-6 or abs(self.qty_venue_b) > 1e-6:
            self.is_position_open = True
        else:
            self.is_position_open = False
            self.position_direction = 0

        logger.info(
            f"OUMeanReversion on_fill: venue={event.exchange}, qty_a={self.qty_venue_a:.4f}, "
            f"qty_b={self.qty_venue_b:.4f}, open_state={self.is_position_open}"
        )

    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Emergency unwind callback on leg execution failure."""
        logger.warning(f"OUMeanReversion desync alert for {pair_trade_id}: {context}. Unwinding.")
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        return self._generate_exit_intents(now_utc)
