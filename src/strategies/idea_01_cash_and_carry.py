"""Spot-Perp Cash-and-Carry Strategy Module (Idea 01).
Implements single-exchange delta-neutral yield harvesting with borrow cost modeling,
margin liquidation distance checks, and positive/negative carry mechanics.
"""

from __future__ import annotations

import datetime
import logging
import math
from typing import Any

from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_TAKER_FEE,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
)
from src.core.exceptions import LiquidationBufferBreachException, RiskException
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


class CashAndCarryStrategy(BaseStrategy):
    """Spot-Perp Cash-and-Carry strategy.
    
    Mechanics:
    - Positive Carry (FR > 0): Buy Spot + Short Perpetual to collect funding fees every 8h.
    - Negative Carry (FR < 0): Borrow Spot + Sell Spot + Long Perpetual to collect funding fees from short positions,
      factoring in margin borrow interest rate drag (r_borrow).
    - Delta-neutrality: S_spot + S_perp = 0.
    """

    def __init__(self, strategy_id: str = "idea_01_cash_and_carry") -> None:
        super().__init__(strategy_id=strategy_id)
        self.exchange: str = "binance"
        self.spot_symbol: str = "BTC/USDT"
        self.perp_symbol: str = "BTCUSDT"
        self.target_notional: float = 2000.0  # $1,000 spot + $1,000 perp
        self.borrow_rate_apr: float = 0.08    # 8.0% APR
        self.min_entry_spread: float = 0.0003  # 3.0 bps (0.030% per 8h)
        self.leverage: float = 1.0            # Strict 1.0x leverage cap for Cash & Carry
        self.maintenance_margin_rate: float = 0.005  # 0.50% MMR
        self.min_liquidation_buffer: float = MIN_LIQUIDATION_BUFFER_PCT  # >= 35%

        # State tracking
        self.spot_position: float = 0.0
        self.perp_position: float = 0.0
        self.borrowed_spot_qty: float = 0.0
        self.spot_entry_price: float = 0.0
        self.perp_entry_price: float = 0.0
        self.current_spot_price: float = 0.0
        self.current_perp_price: float = 0.0
        self.current_funding_rate: float = 0.0
        self.accumulated_funding_pnl: float = 0.0
        self.accumulated_borrow_cost: float = 0.0
        self.accumulated_fees: float = 0.0
        self.is_position_open: bool = False
        self.active_carry_mode: str = "NONE"  # "POSITIVE", "NEGATIVE", "NONE"
        self.last_funding_timestamp: datetime.datetime | None = None

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize Cash and Carry strategy parameters."""
        self.config = config
        self.exchange = config.get("exchange", self.exchange)
        self.spot_symbol = config.get("spot_symbol", self.spot_symbol)
        self.perp_symbol = config.get("perp_symbol", self.perp_symbol)
        self.target_notional = float(config.get("target_notional", self.target_notional))
        self.borrow_rate_apr = float(config.get("borrow_rate_apr", self.borrow_rate_apr))
        self.min_entry_spread = float(config.get("min_entry_spread", self.min_entry_spread))
        self.leverage = float(config.get("leverage", 1.0))
        if self.leverage > 1.0:
            logger.warning("Cash and Carry strategy enforces maximum leverage cap of 1.0x.")
            self.leverage = 1.0

        self.maintenance_margin_rate = float(
            config.get("maintenance_margin_rate", self.maintenance_margin_rate)
        )
        self.min_liquidation_buffer = float(
            config.get("min_liquidation_buffer", self.min_liquidation_buffer)
        )
        self.is_initialized = True
        logger.info(
            f"CashAndCarryStrategy initialized: exchange={self.exchange}, "
            f"spot={self.spot_symbol}, perp={self.perp_symbol}, notional={self.target_notional}"
        )

    def calculate_borrow_rate_8h(self) -> float:
        """Calculate 8-hour margin borrow interest rate from annual APR."""
        # 365 days * 3 intervals (8-hour) per day = 1095 intervals
        return self.borrow_rate_apr / (365.0 * 3.0)

    def calculate_liquidation_price(self, entry_price: float, side: OrderSide) -> float:
        """Calculate approximate liquidation price for perpetual leg."""
        if self.leverage <= 0:
            return 0.0
        if side == OrderSide.BUY:
            # Long liquidation price
            liq_p = entry_price * (1.0 - (1.0 / self.leverage) + self.maintenance_margin_rate)
            return max(0.0, round(liq_p, 2))
        else:
            # Short liquidation price
            liq_p = entry_price * (1.0 + (1.0 / self.leverage) - self.maintenance_margin_rate)
            return max(0.0, round(liq_p, 2))

    def calculate_liquidation_distance_pct(self, entry_price: float, liq_price: float) -> float:
        """Calculate percentage distance to liquidation."""
        if entry_price <= 0:
            return 0.0
        return abs(entry_price - liq_price) / entry_price

    def calculate_net_delta(self) -> float:
        """Calculate net portfolio delta across spot and perp positions."""
        # Spot is long (+), Perp Short is negative (-), Perp Long is positive (+)
        return round(self.spot_position + self.perp_position, 6)

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Process incoming spot or perp price updates."""
        if event.exchange != self.exchange:
            return []

        mid_price = (event.bid_price + event.ask_price) / 2.0
        if event.symbol == self.spot_symbol:
            self.current_spot_price = mid_price
        elif event.symbol == self.perp_symbol:
            self.current_perp_price = mid_price

        # Check margin liquidation distance if position is open
        if self.is_position_open and self.perp_entry_price > 0 and self.current_perp_price > 0:
            side = OrderSide.SHORT if self.perp_position < 0 else OrderSide.BUY
            liq_p = self.calculate_liquidation_price(self.perp_entry_price, side)
            liq_dist = self.calculate_liquidation_distance_pct(self.current_perp_price, liq_p)
            if liq_dist < self.min_liquidation_buffer:
                logger.warning(
                    f"Margin liquidation distance breach: {liq_dist:.2%} < {self.min_liquidation_buffer:.2%}"
                )

        return []

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Evaluate funding rate and generate positive or negative carry entry/exit order intents."""
        if event.exchange != self.exchange or event.symbol != self.perp_symbol:
            return []

        self.current_funding_rate = event.funding_rate
        self.last_funding_timestamp = event.next_snapshot_utc
        price = event.mark_price or self.current_perp_price or 30000.0

        intents: list[OrderIntent] = []
        now_utc = datetime.datetime.now(datetime.timezone.utc)

        # 1. Position already open: Process funding cashflow or check exit conditions
        if self.is_position_open:
            # Settle funding payment
            funding_cashflow = abs(self.perp_position) * price * self.current_funding_rate
            if self.active_carry_mode == "POSITIVE":
                # Short perp collects positive funding
                self.accumulated_funding_pnl += funding_cashflow
            elif self.active_carry_mode == "NEGATIVE":
                # Long perp collects when funding is negative
                self.accumulated_funding_pnl += -funding_cashflow
                borrow_drag = abs(self.spot_position) * price * self.calculate_borrow_rate_8h()
                self.accumulated_borrow_cost += borrow_drag

            # Check if carry spread inverted or compressed below hurdle -> Exit position
            should_exit = False
            if self.active_carry_mode == "POSITIVE" and self.current_funding_rate < 0:
                should_exit = True
            elif self.active_carry_mode == "NEGATIVE" and (
                self.current_funding_rate > 0
                or abs(self.current_funding_rate) < self.calculate_borrow_rate_8h()
            ):
                should_exit = True

            if should_exit:
                intents = self._generate_exit_intents(now_utc)

            return intents

        # 2. Position closed: Evaluate new entry opportunities
        borrow_rate_8h = self.calculate_borrow_rate_8h()

        # Case A: Positive Carry (FR >= min_entry_spread) -> Long Spot + Short Perp
        if self.current_funding_rate >= self.min_entry_spread:
            intents = self._generate_positive_carry_entry(price, now_utc)

        # Case B: Negative Carry (FR < 0 and |FR| > borrow_rate_8h + min_entry_spread)
        elif self.current_funding_rate < 0:
            net_rate = abs(self.current_funding_rate) - borrow_rate_8h
            if net_rate >= self.min_entry_spread:
                intents = self._generate_negative_carry_entry(price, now_utc)

        return intents

    def _generate_positive_carry_entry(
        self, price: float, timestamp: datetime.datetime
    ) -> list[OrderIntent]:
        """Generate paired entry intents for positive carry: Buy Spot + Sell Perp."""
        half_notional = self.target_notional / 2.0
        qty = round(half_notional / price, 4)
        if qty <= 0:
            return []

        # Validate liquidation distance before generating orders
        liq_p = self.calculate_liquidation_price(price, OrderSide.SELL)
        liq_dist = self.calculate_liquidation_distance_pct(price, liq_p)
        if liq_dist < self.min_liquidation_buffer:
            raise LiquidationBufferBreachException(
                f"Perp short liquidation distance {liq_dist:.2%} below minimum required {self.min_liquidation_buffer:.2%}"
            )

        intent_spot_id = f"intent_spot_{int(timestamp.timestamp()*1000)}"
        intent_perp_id = f"intent_perp_{int(timestamp.timestamp()*1000)}"

        intent_spot = OrderIntent(
            intent_id=intent_spot_id,
            strategy_id=self.strategy_id,
            exchange=self.exchange,
            symbol=self.spot_symbol,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=qty,
            paired_intent_id=intent_perp_id,
            created_at_utc=timestamp,
        )

        intent_perp = OrderIntent(
            intent_id=intent_perp_id,
            strategy_id=self.strategy_id,
            exchange=self.exchange,
            symbol=self.perp_symbol,
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=qty,
            paired_intent_id=intent_spot_id,
            created_at_utc=timestamp,
        )

        self.active_carry_mode = "POSITIVE"
        return [intent_spot, intent_perp]

    def _generate_negative_carry_entry(
        self, price: float, timestamp: datetime.datetime
    ) -> list[OrderIntent]:
        """Generate paired entry intents for negative carry: Borrow/Sell Spot + Buy Perp."""
        half_notional = self.target_notional / 2.0
        qty = round(half_notional / price, 4)
        if qty <= 0:
            return []

        liq_p = self.calculate_liquidation_price(price, OrderSide.BUY)
        liq_dist = self.calculate_liquidation_distance_pct(price, liq_p)
        if liq_dist < self.min_liquidation_buffer:
            raise LiquidationBufferBreachException(
                f"Perp long liquidation distance {liq_dist:.2%} below minimum required {self.min_liquidation_buffer:.2%}"
            )

        intent_spot_id = f"intent_spot_short_{int(timestamp.timestamp()*1000)}"
        intent_perp_id = f"intent_perp_long_{int(timestamp.timestamp()*1000)}"

        intent_spot = OrderIntent(
            intent_id=intent_spot_id,
            strategy_id=self.strategy_id,
            exchange=self.exchange,
            symbol=self.spot_symbol,
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=qty,
            paired_intent_id=intent_perp_id,
            created_at_utc=timestamp,
        )

        intent_perp = OrderIntent(
            intent_id=intent_perp_id,
            strategy_id=self.strategy_id,
            exchange=self.exchange,
            symbol=self.perp_symbol,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=qty,
            paired_intent_id=intent_spot_id,
            created_at_utc=timestamp,
        )

        self.active_carry_mode = "NEGATIVE"
        return [intent_spot, intent_perp]

    def _generate_exit_intents(self, timestamp: datetime.datetime) -> list[OrderIntent]:
        """Generate closing orders for both spot and perp legs."""
        intents = []
        intent_spot_id = f"exit_spot_{int(timestamp.timestamp()*1000)}"
        intent_perp_id = f"exit_perp_{int(timestamp.timestamp()*1000)}"

        if self.spot_position > 0:
            # Close Long Spot -> Sell Spot
            intents.append(
                OrderIntent(
                    intent_id=intent_spot_id,
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.spot_symbol,
                    side=OrderSide.SELL,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.spot_position),
                    paired_intent_id=intent_perp_id,
                    created_at_utc=timestamp,
                )
            )
        elif self.spot_position < 0:
            # Close Short Spot (Repay borrow) -> Buy Spot
            intents.append(
                OrderIntent(
                    intent_id=intent_spot_id,
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.spot_symbol,
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.spot_position),
                    paired_intent_id=intent_perp_id,
                    created_at_utc=timestamp,
                )
            )

        if self.perp_position < 0:
            # Close Short Perp -> Buy Perp
            intents.append(
                OrderIntent(
                    intent_id=intent_perp_id,
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.perp_symbol,
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.perp_position),
                    paired_intent_id=intent_spot_id,
                    created_at_utc=timestamp,
                )
            )
        elif self.perp_position > 0:
            # Close Long Perp -> Sell Perp
            intents.append(
                OrderIntent(
                    intent_id=intent_perp_id,
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.perp_symbol,
                    side=OrderSide.SELL,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.perp_position),
                    paired_intent_id=intent_spot_id,
                    created_at_utc=timestamp,
                )
            )

        return intents

    def on_fill(self, event: FillEvent) -> None:
        """Update internal position state, entry prices, fees, and delta upon fill."""
        self.accumulated_fees += event.fee_paid

        if event.symbol == self.spot_symbol:
            if event.side == OrderSide.BUY:
                if self.spot_position < 0:
                    # Closing short spot / repaying borrow
                    self.borrowed_spot_qty = max(0.0, self.borrowed_spot_qty - event.filled_qty)
                    self.spot_position += event.filled_qty
                else:
                    # Opening long spot
                    self.spot_position += event.filled_qty
                    self.spot_entry_price = event.filled_price
            else:
                if self.spot_position > 0:
                    # Closing long spot
                    self.spot_position -= event.filled_qty
                else:
                    # Opening short spot / borrowing
                    self.spot_position -= event.filled_qty
                    self.borrowed_spot_qty += event.filled_qty
                    self.spot_entry_price = event.filled_price

        elif event.symbol == self.perp_symbol:
            if event.side == OrderSide.SELL:
                if self.perp_position > 0:
                    # Closing long perp
                    self.perp_position -= event.filled_qty
                else:
                    # Opening short perp
                    self.perp_position -= event.filled_qty
                    self.perp_entry_price = event.filled_price
            else:
                if self.perp_position < 0:
                    # Closing short perp
                    self.perp_position += event.filled_qty
                else:
                    # Opening long perp
                    self.perp_position += event.filled_qty
                    self.perp_entry_price = event.filled_price

        # Update position status
        if abs(self.spot_position) < 1e-6 and abs(self.perp_position) < 1e-6:
            self.is_position_open = False
            self.active_carry_mode = "NONE"
        else:
            self.is_position_open = True

        logger.info(
            f"CashAndCarryStrategy on_fill: spot={self.spot_position:.4f}, perp={self.perp_position:.4f}, "
            f"net_delta={self.calculate_net_delta():.4f}, mode={self.active_carry_mode}"
        )

    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Emergency unwind callback on leg execution failure or desync."""
        logger.warning(
            f"CashAndCarryStrategy received desync alert for {pair_trade_id}: {context}. Unwinding open legs."
        )
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        return self._generate_exit_intents(now_utc)
