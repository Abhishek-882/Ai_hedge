"""Cross-Exchange Funding Spread Capture Strategy Module (Idea 03).
Implements dual-leg dollar-matched routing across two venues with T-8min entry and T+90s exit,
inverted funding handling, basis drift monitoring, and executable desync emergency unwinds.
"""

from __future__ import annotations

import datetime
import logging
import math
from typing import Any

from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_TAKER_FEE,
    IDEA03_ENTRY_LEAD_SECONDS,
    IDEA03_EXIT_LAG_SECONDS,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
    MIN_VIABLE_SPREAD_FLOOR,
    SettlementTime,
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


class CrossExchangeFundingStrategy(BaseStrategy):
    """Cross-Exchange Funding Spread Capture Strategy.
    
    Mechanics:
    - Identifies funding rate dispersion across two venues: Spread = |FR_A - FR_B|.
    - Hurdle: Spread >= min_spread_hurdle (default 0.0040 = 40 bps per 8h).
    - Long Leg: Established on Venue with lower rate (FR_L).
    - Short Leg: Established on Venue with higher rate (FR_H).
    - Dollar-Matched Notional: N_L = Q_L * P_L = N_H = Q_H * P_H = target_notional / 2.
    - Timing Window: Entry at T - 8min (480s pre-settlement), Exit at T + 90s post-settlement.
    - Basis Drift: Real-time tracking of (P_L,t / P_L,0) - (P_H,t / P_H,0). Emergency exit if |Delta Basis| > max_drift.
    - Desync Protection: Strategy-level emergency unwind generation upon watchdog trigger.
    """

    def __init__(self, strategy_id: str = "idea_03_cross_exchange") -> None:
        super().__init__(strategy_id=strategy_id)
        self.venue_a: str = "binance"
        self.venue_b: str = "bybit"
        self.symbol: str = "BTCUSDT"
        self.target_notional: float = 2000.0  # $1,000 per leg ($2,000 total)
        self.min_spread_hurdle: float = MIN_VIABLE_SPREAD_FLOOR  # 0.0040 (40 bps)
        self.entry_lead_seconds: int = IDEA03_ENTRY_LEAD_SECONDS  # 480s (8 min)
        self.exit_lag_seconds: int = IDEA03_EXIT_LAG_SECONDS      # 90s
        self.max_basis_drift_pct: float = 0.0150                  # 1.50% basis drift stop loss
        self.leverage: float = DEFAULT_LEVERAGE_CAP               # 3.0x cap

        # Market & Rate state
        self.rate_venue_a: float = 0.0
        self.rate_venue_b: float = 0.0
        self.price_venue_a: float = 0.0
        self.price_venue_b: float = 0.0
        self.last_snapshot_time_a: datetime.datetime | None = None
        self.last_snapshot_time_b: datetime.datetime | None = None

        # Active Trade state
        self.is_position_open: bool = False
        self.venue_long: str = ""
        self.venue_short: str = ""
        self.qty_long: float = 0.0
        self.qty_short: float = 0.0
        self.entry_price_long: float = 0.0
        self.entry_price_short: float = 0.0
        self.target_settlement_utc: datetime.datetime | None = None
        self.has_held_through_snapshot: bool = False
        self.accumulated_pnl: float = 0.0
        self.accumulated_fees: float = 0.0
        self.execution_mode: str = "parallel_market"  # "parallel_market" or "maker_taker"
        self.maker_venue: str = "bitget"
        self.clock_desync_detected: bool = False
        self.interval_hours_a: int = 8
        self.interval_hours_b: int = 8

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize Cross-Exchange strategy parameters."""
        self.config = config
        self.venue_a = config.get("venue_a", self.venue_a)
        self.venue_b = config.get("venue_b", self.venue_b)
        self.symbol = config.get("symbol", self.symbol)
        self.target_notional = float(config.get("target_notional", self.target_notional))
        self.min_spread_hurdle = float(config.get("min_spread_hurdle", self.min_spread_hurdle))
        self.entry_lead_seconds = int(config.get("entry_lead_seconds", self.entry_lead_seconds))
        self.exit_lag_seconds = int(config.get("exit_lag_seconds", self.exit_lag_seconds))
        self.max_basis_drift_pct = float(config.get("max_basis_drift_pct", self.max_basis_drift_pct))
        self.execution_mode = str(config.get("execution_mode", self.execution_mode))
        self.maker_venue = str(config.get("maker_venue", self.maker_venue))
        self.leverage = float(config.get("leverage", DEFAULT_LEVERAGE_CAP))
        if self.leverage > 3.0:
            logger.warning("Cross-Exchange strategy enforces maximum leverage cap of 3.0x.")
            self.leverage = 3.0

        self.is_initialized = True
        logger.info(
            f"CrossExchangeFundingStrategy initialized: venue_a={self.venue_a}, "
            f"venue_b={self.venue_b}, symbol={self.symbol}, hurdle={self.min_spread_hurdle:.4f}"
        )

    def calculate_spread(self) -> tuple[float, str, str]:
        """Calculate funding spread and determine Long vs Short routing venues.
        
        Returns:
            (spread, venue_short, venue_long)
        """
        spread = abs(self.rate_venue_a - self.rate_venue_b)
        if self.rate_venue_a >= self.rate_venue_b:
            return spread, self.venue_a, self.venue_b
        else:
            return spread, self.venue_b, self.venue_a

    def calculate_basis_drift_pct(self) -> float:
        """Calculate current basis drift between the two positions since entry:
        Delta Basis = (P_L,t - P_L,0)/P_L,0 - (P_H,t - P_H,0)/P_H,0
        """
        if not self.is_position_open or self.entry_price_long <= 0 or self.entry_price_short <= 0:
            return 0.0

        curr_p_long = self.price_venue_a if self.venue_long == self.venue_a else self.price_venue_b
        curr_p_short = self.price_venue_a if self.venue_short == self.venue_a else self.price_venue_b

        if curr_p_long <= 0 or curr_p_short <= 0:
            return 0.0

        ret_long = (curr_p_long - self.entry_price_long) / self.entry_price_long
        ret_short = (curr_p_short - self.entry_price_short) / self.entry_price_short
        return float(ret_long - ret_short)

    def _get_next_settlement_time(self, now: datetime.datetime) -> datetime.datetime:
        """Compute next 8h funding settlement timestamp (00:00, 08:00, 16:00 UTC)."""
        hour = now.hour
        if hour < 8:
            next_hour = 8
            next_day = now.date()
        elif hour < 16:
            next_hour = 16
            next_day = now.date()
        else:
            next_hour = 0
            next_day = now.date() + datetime.timedelta(days=1)

        return datetime.datetime(
            next_day.year, next_day.month, next_day.day,
            next_hour, 0, 0, tzinfo=datetime.timezone.utc
        )

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Process price updates, monitor basis drift, and execute scheduled exit window orders."""
        if event.exchange == self.venue_a and event.symbol == self.symbol:
            self.price_venue_a = (event.bid_price + event.ask_price) / 2.0
        elif event.exchange == self.venue_b and event.symbol == self.symbol:
            self.price_venue_b = (event.bid_price + event.ask_price) / 2.0
        else:
            return []

        now_utc = event.timestamp_utc or datetime.datetime.now(datetime.timezone.utc)

        # 1. If position is open, check basis drift stop loss and exit timing window
        if self.is_position_open:
            # Check Basis Drift stop-loss
            basis_drift = self.calculate_basis_drift_pct()
            if abs(basis_drift) >= self.max_basis_drift_pct:
                logger.warning(
                    f"Basis drift stop-loss triggered: {basis_drift:.2%} >= {self.max_basis_drift_pct:.2%}. Unwinding."
                )
                return self._generate_exit_intents(now_utc)

            # Check if settlement snapshot has passed and exit lag has elapsed (T + 90s)
            if self.target_settlement_utc is not None:
                if now_utc >= self.target_settlement_utc:
                    self.has_held_through_snapshot = True
                    seconds_since_settlement = (now_utc - self.target_settlement_utc).total_seconds()
                    if seconds_since_settlement >= self.exit_lag_seconds:
                        logger.info(
                            f"Settlement window elapsed ({seconds_since_settlement:.1f}s >= {self.exit_lag_seconds}s). Dispatching exit."
                        )
                        return self._generate_exit_intents(now_utc)

            return []

        # 2. If position is NOT open, check if we are in the T - 8min entry window
        if self.clock_desync_detected:
            logger.debug("Entry skipped: settlement clock desync detected across venues.")
            return []

        next_settle = self._get_next_settlement_time(now_utc)
        time_to_settle = (next_settle - now_utc).total_seconds()

        # Entry window condition: within entry_lead_seconds (e.g. <= 480s and > 0s)
        if 0 < time_to_settle <= self.entry_lead_seconds:
            spread, v_short, v_long = self.calculate_spread()
            if spread >= self.min_spread_hurdle:
                logger.info(
                    f"Entry opportunity detected: Spread={spread:.4f} >= {self.min_spread_hurdle:.4f}. "
                    f"Short={v_short}, Long={v_long}, TimeToSettle={time_to_settle:.1f}s"
                )
                return self._generate_entry_intents(v_short, v_long, next_settle, now_utc)

        return []

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Update venue funding rate and process snapshot settlement."""
        if event.exchange == self.venue_a and event.symbol == self.symbol:
            self.rate_venue_a = event.funding_rate
            self.last_snapshot_time_a = event.next_snapshot_utc
        elif event.exchange == self.venue_b and event.symbol == self.symbol:
            self.rate_venue_b = event.funding_rate
            self.last_snapshot_time_b = event.next_snapshot_utc

        # Check settlement interval synchronicity across both venues
        if self.last_snapshot_time_a and self.last_snapshot_time_b:
            diff_sec = abs((self.last_snapshot_time_a - self.last_snapshot_time_b).total_seconds())
            if diff_sec > 600:
                self.clock_desync_detected = True
                logger.warning(
                    f"Settlement clock desync detected: Venue A ({self.venue_a}) settle={self.last_snapshot_time_a} "
                    f"vs Venue B ({self.venue_b}) settle={self.last_snapshot_time_b} (diff={diff_sec:.0f}s). Entry blocked."
                )
            else:
                self.clock_desync_detected = False

        # Settle funding cashflows if position is active and held through snapshot
        if self.is_position_open:
            self.has_held_through_snapshot = True
            # Short leg receives FR_H, Long leg pays FR_L (or receives if FR_L < 0)
            rate_short = self.rate_venue_a if self.venue_short == self.venue_a else self.rate_venue_b
            rate_long = self.rate_venue_a if self.venue_long == self.venue_a else self.rate_venue_b
            p_short = self.price_venue_a if self.venue_short == self.venue_a else self.price_venue_b
            p_long = self.price_venue_a if self.venue_long == self.venue_a else self.price_venue_b

            gross_short_funding = self.qty_short * p_short * rate_short
            gross_long_funding = -self.qty_long * p_long * rate_long
            net_funding = gross_short_funding + gross_long_funding
            self.accumulated_pnl += net_funding
            logger.info(
                f"Settled funding cashflow: Short({self.venue_short})={gross_short_funding:.2f}, "
                f"Long({self.venue_long})={gross_long_funding:.2f}, Net={net_funding:.2f}"
            )

        return []

    def _generate_entry_intents(
        self, venue_short: str, venue_long: str, settle_time: datetime.datetime, timestamp: datetime.datetime
    ) -> list[OrderIntent]:
        """Generate paired dollar-matched entry intents: Short Venue H + Long Venue L."""
        p_short = self.price_venue_a if venue_short == self.venue_a else self.price_venue_b
        p_long = self.price_venue_a if venue_long == self.venue_a else self.price_venue_b

        if p_short <= 0 or p_long <= 0:
            return []

        leg_notional = self.target_notional / 2.0  # e.g. $1,000 per leg
        qty_short = round(leg_notional / p_short, 4)
        qty_long = round(leg_notional / p_long, 4)

        if qty_short <= 0 or qty_long <= 0:
            return []

        ts_ms = int(timestamp.timestamp() * 1000)
        intent_short_id = f"intent_short_{venue_short}_{ts_ms}"
        intent_long_id = f"intent_long_{venue_long}_{ts_ms}"

        intent_short = OrderIntent(
            intent_id=intent_short_id,
            strategy_id=self.strategy_id,
            exchange=venue_short,
            symbol=self.symbol,
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=qty_short,
            paired_intent_id=intent_long_id,
            created_at_utc=timestamp,
        )

        intent_long = OrderIntent(
            intent_id=intent_long_id,
            strategy_id=self.strategy_id,
            exchange=venue_long,
            symbol=self.symbol,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=qty_long,
            paired_intent_id=intent_short_id,
            created_at_utc=timestamp,
        )

        if self.execution_mode == "maker_taker":
            # Configure passive Post-Only Maker on maker_venue, with active Taker dependent on fill
            if venue_short == self.maker_venue:
                intent_short.order_type = OrderType.POST_ONLY
                intent_short.limit_price = p_short
                intent_short.time_in_force = "PostOnly"
                intent_short.is_maker_first = True
                intent_long.order_type = OrderType.MARKET
                intent_long.dependent_on_intent_id = intent_short_id
            else:
                intent_long.order_type = OrderType.POST_ONLY
                intent_long.limit_price = p_long
                intent_long.time_in_force = "PostOnly"
                intent_long.is_maker_first = True
                intent_short.order_type = OrderType.MARKET
                intent_short.dependent_on_intent_id = intent_long_id

        self.venue_short = venue_short
        self.venue_long = venue_long
        self.target_settlement_utc = settle_time
        self.has_held_through_snapshot = False

        return [intent_short, intent_long]

    def _generate_exit_intents(self, timestamp: datetime.datetime) -> list[OrderIntent]:
        """Generate closing orders for both short and long legs."""
        if not self.is_position_open:
            return []

        ts_ms = int(timestamp.timestamp() * 1000)
        intent_close_short_id = f"close_short_{self.venue_short}_{ts_ms}"
        intent_close_long_id = f"close_long_{self.venue_long}_{ts_ms}"

        # Close Short -> Buy on venue_short
        intent_close_short = OrderIntent(
            intent_id=intent_close_short_id,
            strategy_id=self.strategy_id,
            exchange=self.venue_short,
            symbol=self.symbol,
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=self.qty_short,
            paired_intent_id=intent_close_long_id,
            created_at_utc=timestamp,
        )

        # Close Long -> Sell on venue_long
        intent_close_long = OrderIntent(
            intent_id=intent_close_long_id,
            strategy_id=self.strategy_id,
            exchange=self.venue_long,
            symbol=self.symbol,
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=self.qty_long,
            paired_intent_id=intent_close_short_id,
            created_at_utc=timestamp,
        )

        return [intent_close_short, intent_close_long]

    def on_fill(self, event: FillEvent) -> None:
        """Update trade state, positions, and entry prices upon fill confirmation."""
        self.accumulated_fees += event.fee_paid

        if event.exchange == self.venue_short:
            if event.side == OrderSide.SELL:
                # Opened short leg
                self.qty_short = event.filled_qty
                self.entry_price_short = event.filled_price
            elif event.side == OrderSide.BUY:
                # Closed short leg
                self.qty_short = max(0.0, self.qty_short - event.filled_qty)

        elif event.exchange == self.venue_long:
            if event.side == OrderSide.BUY:
                # Opened long leg
                self.qty_long = event.filled_qty
                self.entry_price_long = event.filled_price
            elif event.side == OrderSide.SELL:
                # Closed long leg
                self.qty_long = max(0.0, self.qty_long - event.filled_qty)

        # Check position state
        if self.qty_short > 0 or self.qty_long > 0:
            self.is_position_open = True
        else:
            self.is_position_open = False
            self.target_settlement_utc = None
            self.has_held_through_snapshot = False

        logger.info(
            f"CrossExchange on_fill: ex={event.exchange}, side={event.side}, qty={event.filled_qty}, "
            f"price={event.filled_price}, open_state={self.is_position_open}"
        )

    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Emergency unwind callback on leg execution failure or desync."""
        logger.warning(f"CrossExchange received desync alert for {pair_trade_id}: {context}. Unwinding open leg.")
        now_utc = datetime.datetime.now(datetime.timezone.utc)
        ts_ms = int(now_utc.timestamp() * 1000)
        unwind_intents: list[OrderIntent] = []

        # If only short leg is open, close it
        if self.qty_short > 0:
            unwind_intents.append(
                OrderIntent(
                    intent_id=f"emergency_unwind_short_{ts_ms}",
                    strategy_id=self.strategy_id,
                    exchange=self.venue_short,
                    symbol=self.symbol,
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    quantity=self.qty_short,
                    created_at_utc=now_utc,
                )
            )

        # If only long leg is open, close it
        if self.qty_long > 0:
            unwind_intents.append(
                OrderIntent(
                    intent_id=f"emergency_unwind_long_{ts_ms}",
                    strategy_id=self.strategy_id,
                    exchange=self.venue_long,
                    symbol=self.symbol,
                    side=OrderSide.SELL,
                    order_type=OrderType.MARKET,
                    quantity=self.qty_long,
                    created_at_utc=now_utc,
                )
            )

        return unwind_intents
