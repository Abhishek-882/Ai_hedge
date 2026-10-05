"""Pre-Trade Risk Management Engine, Sizing, Leverage Caps, and Liquidation Buffers.
"""

from __future__ import annotations

import logging
from typing import Any

from src.core.config import RiskConfig
from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_MAX_DRAWDOWN_PCT,
    MAX_PER_TRADE_LOSS_PCT,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
)
from src.core.exceptions import (
    InvalidRiskCapsException,
    LiquidationBufferBreachException,
    MaxDrawdownExceededException,
    RiskException,
)
from src.engine.interfaces import OrderIntent, OrderSide
from src.engine.kill_switch import KillSwitch

logger = logging.getLogger(__name__)


class RiskManager:
    """Enforces pre-trade sizing limits, leverage caps, liquidation buffers, and drawdown kill-switches."""

    def __init__(
        self,
        config: RiskConfig | None = None,
        kill_switch: KillSwitch | None = None,
        max_drawdown_limit_pct: float | None = None,
        max_leverage_limit: float | None = None,
        min_liquidation_buffer_pct: float | None = None,
        capital_floor_usd: float | None = None,
    ) -> None:
        self.config = config or RiskConfig()
        self.kill_switch = kill_switch
        self.max_drawdown_pct = (
            max_drawdown_limit_pct
            if max_drawdown_limit_pct is not None
            else self.config.max_drawdown_pct
        )
        self.leverage_cap = (
            max_leverage_limit
            if max_leverage_limit is not None
            else self.config.leverage_cap
        )
        self.max_single_position_pct = 0.10  # 10% of total equity
        self.min_capital_floor_usd = (
            capital_floor_usd
            if capital_floor_usd is not None
            else self.config.capital_floor_usd
        )
        self.min_liquidation_buffer_pct = (
            min_liquidation_buffer_pct
            if min_liquidation_buffer_pct is not None
            else self.config.min_liquidation_buffer_pct
        )
        self.max_per_trade_loss_pct = self.config.max_per_trade_loss_pct

    def get_max_leverage_for_strategy(self, strategy_type: str) -> float:
        """Return statutory leverage limit per strategy class."""
        st = strategy_type.lower()
        if "cash_and_carry" in st or "idea_01" in st:
            return 1.0
        elif "momentum" in st or "tilt" in st or "idea_02" in st:
            return 2.0
        elif "spread" in st or "delta_neutral" in st or "idea_03" in st:
            return 3.0
        return self.leverage_cap

    def calculate_liquidation_price(
        self,
        entry_price: float,
        leverage: float,
        side: OrderSide | str,
        maintenance_margin_rate: float = 0.005,  # 0.50% MMR
    ) -> float:
        """Calculate approximate bankruptcy / liquidation price."""
        if leverage <= 0:
            return 0.0
        side_val = OrderSide(side).value if isinstance(side, (OrderSide, str)) else "BUY"
        if side_val == "BUY":
            liq_p = entry_price * (1.0 - (1.0 / leverage) + maintenance_margin_rate)
            return max(0.0, round(liq_p, 2))
        else:
            liq_p = entry_price * (1.0 + (1.0 / leverage) - maintenance_margin_rate)
            return max(0.0, round(liq_p, 2))

    def calculate_liquidation_distance_pct(self, entry_price: float, liquidation_price: float) -> float:
        """Calculate percentage distance from entry price to liquidation price:
        Distance = |Entry - Liq| / Entry
        """
        if entry_price <= 0:
            return 0.0
        distance = abs(entry_price - liquidation_price) / entry_price
        return round(distance, 4)

    def validate_order_intent(
        self,
        intent: OrderIntent,
        equity: float,
        active_positions: list[dict[str, Any]],
        market_price: float,
        strategy_type: str = "delta_neutral",
    ) -> None:
        """Execute pre-trade risk checks: sizing cap, capital floor, leverage cap, and liquidation distance."""
        if equity <= 0:
            raise RiskException(f"Account equity is zero or negative ({equity:.2f} USD). Cannot trade.")

        # 1. Order Notional calculation
        order_price = intent.limit_price if intent.limit_price and intent.limit_price > 0 else market_price
        order_notional = order_price * intent.quantity

        # 2. Capital Floor check ($1,000 floor per venue)
        if order_notional < self.min_capital_floor_usd - 1e-6:
            raise InvalidRiskCapsException(
                f"Order notional {order_notional:.2f} USD breaches minimum capital floor "
                f"${self.min_capital_floor_usd:.2f} USD."
            )

        # 3. Sizing Cap Check (<= 10% equity per trade leg / pair)
        max_allowed_notional = equity * self.max_single_position_pct
        if order_notional > max_allowed_notional + 1e-6:
            raise InvalidRiskCapsException(
                f"Order notional {order_notional:.2f} USD exceeds 10% single-position risk cap "
                f"({max_allowed_notional:.2f} USD on equity {equity:.2f} USD)."
            )

        # 4. Gross Leverage Cap Check
        existing_notional = sum(abs(float(p.get("position_amt", p.get("size", 0.0)))) * market_price for p in active_positions)
        total_notional_after = existing_notional + order_notional
        effective_leverage = total_notional_after / equity

        strategy_max_leverage = self.get_max_leverage_for_strategy(strategy_type)
        if effective_leverage > strategy_max_leverage + 1e-6:
            raise InvalidRiskCapsException(
                f"Effective leverage {effective_leverage:.2f}x exceeds allowed cap "
                f"{strategy_max_leverage:.1f}x for {strategy_type}."
            )

        # 5. Liquidation Buffer Check (>= 35%)
        effective_order_leverage = order_notional / equity
        assumed_leverage = max(1.0, effective_order_leverage)
        liq_p = self.calculate_liquidation_price(order_price, assumed_leverage, intent.side)
        liq_dist = self.calculate_liquidation_distance_pct(order_price, liq_p)

        if liq_dist < self.min_liquidation_buffer_pct - 1e-6:
            raise LiquidationBufferBreachException(
                f"Liquidation distance {liq_dist*100.0:.2f}% breaches safety buffer "
                f"{self.min_liquidation_buffer_pct*100.0:.1f}%."
            )

    def check_drawdown(self, current_equity: float, peak_equity: float) -> float:
        """Check cumulative portfolio drawdown. If drawdown > 5%, trip kill-switch immediately."""
        if peak_equity <= 0:
            return 0.0

        dd_pct = (peak_equity - current_equity) / peak_equity
        if dd_pct > self.max_drawdown_pct + 1e-6:
            msg = f"Cumulative drawdown {dd_pct*100.0:.2f}% breached global limit {self.max_drawdown_pct*100.0:.1f}%."
            logger.critical(msg)
            if self.kill_switch:
                self.kill_switch.trip(reason=msg, tripped_by="RISK_MANAGER")
            raise MaxDrawdownExceededException(msg)

        return dd_pct
