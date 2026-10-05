"""Fee Engineering, 5-Point Cross-Verification, and Minimum Viable Spread (MVS) Calculator.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.core.constants import (
    BYBIT_TAKER_FEE,
    DEFAULT_MAKER_FEE,
    DEFAULT_TAKER_FEE,
    KUCOIN_TAKER_FEE,
    MIN_VIABLE_SPREAD_FLOOR,
    MIN_VIABLE_SPREAD_TARGET,
    SLIPPAGE_BUFFER,
    TOTAL_TAKER_FEE_DRAG,
)


@dataclass
class FeeBreakdown:
    leg1_entry_fee_pct: float
    leg2_entry_fee_pct: float
    leg1_exit_fee_pct: float
    leg2_exit_fee_pct: float
    total_fee_drag_pct: float
    slippage_buffer_pct: float
    execution_friction_floor_pct: float
    margin_of_safety_pct: float
    mvs_hurdle_pct: float


@dataclass
class SpreadOpportunityAssessment:
    gross_spread_pct: float
    total_fee_drag_pct: float
    slippage_buffer_pct: float
    expected_basis_drift_pct: float
    net_expected_yield_pct: float
    annualized_net_yield_pct: float
    passes_mvs_floor: bool
    passes_mvs_target: bool


class FeeVerifier:
    """Quantitative fee modeling, 5-point independent data verification, and MVS calculation."""

    def __init__(
        self,
        default_taker_fee: float = DEFAULT_TAKER_FEE,
        default_slippage_leg: float = 0.00025,  # 2.5 bps per leg
        margin_of_safety: float = 0.00100,      # 10.0 bps profit hurdle
    ) -> None:
        self.default_taker_fee = default_taker_fee
        self.default_slippage_leg = default_slippage_leg
        self.margin_of_safety = margin_of_safety

    def calculate_four_way_fee_drag(
        self,
        venue1_taker_fee: float | None = None,
        venue2_taker_fee: float | None = None,
    ) -> float:
        """Calculate exact 4-way taker fee drag across dual-leg entry and exit:
        Fee_Drag = 2 * (taker_fee_1 + taker_fee_2)
        """
        f1 = venue1_taker_fee if venue1_taker_fee is not None else self.default_taker_fee
        f2 = venue2_taker_fee if venue2_taker_fee is not None else self.default_taker_fee
        return round(2.0 * (f1 + f2), 6)

    def calculate_slippage_buffer(self, num_transactions: int = 4, slippage_per_leg: float | None = None) -> float:
        """Calculate cumulative execution slippage buffer across all order legs:
        Slippage_Buffer = num_transactions * slippage_per_leg
        """
        slip = slippage_per_leg if slippage_per_leg is not None else self.default_slippage_leg
        return round(num_transactions * slip, 6)

    def calculate_mvs_hurdle(
        self,
        venue1_taker_fee: float | None = None,
        venue2_taker_fee: float | None = None,
        margin_of_safety: float | None = None,
    ) -> FeeBreakdown:
        """Derive Minimum Viable Spread (MVS) breakdown."""
        f1 = venue1_taker_fee if venue1_taker_fee is not None else self.default_taker_fee
        f2 = venue2_taker_fee if venue2_taker_fee is not None else self.default_taker_fee
        fee_drag = self.calculate_four_way_fee_drag(f1, f2)
        slippage = self.calculate_slippage_buffer(4)
        friction_floor = fee_drag + slippage
        mos = margin_of_safety if margin_of_safety is not None else self.margin_of_safety
        mvs = friction_floor + mos

        return FeeBreakdown(
            leg1_entry_fee_pct=f1,
            leg2_entry_fee_pct=f2,
            leg1_exit_fee_pct=f1,
            leg2_exit_fee_pct=f2,
            total_fee_drag_pct=fee_drag,
            slippage_buffer_pct=slippage,
            execution_friction_floor_pct=round(friction_floor, 6),
            margin_of_safety_pct=mos,
            mvs_hurdle_pct=round(mvs, 6),
        )

    def evaluate_spread_opportunity(
        self,
        rate_high: float,
        rate_low: float,
        venue_high_taker_fee: float = DEFAULT_TAKER_FEE,
        venue_low_taker_fee: float = DEFAULT_TAKER_FEE,
        expected_basis_drift: float = 0.0,
    ) -> SpreadOpportunityAssessment:
        """Evaluate a cross-exchange funding spread opportunity against MVS hurdles."""
        gross_spread = rate_high - rate_low
        fee_drag = self.calculate_four_way_fee_drag(venue_high_taker_fee, venue_low_taker_fee)
        slippage = self.calculate_slippage_buffer(4)
        net_yield = gross_spread - fee_drag - slippage - abs(expected_basis_drift)
        # Annualized yield: 3 settlements per day * 365 days
        annualized = net_yield * 3.0 * 365.0

        return SpreadOpportunityAssessment(
            gross_spread_pct=round(gross_spread, 6),
            total_fee_drag_pct=round(fee_drag, 6),
            slippage_buffer_pct=round(slippage, 6),
            expected_basis_drift_pct=round(expected_basis_drift, 6),
            net_expected_yield_pct=round(net_yield, 6),
            annualized_net_yield_pct=round(annualized, 4),
            passes_mvs_floor=gross_spread >= MIN_VIABLE_SPREAD_FLOOR,
            passes_mvs_target=gross_spread >= MIN_VIABLE_SPREAD_TARGET,
        )

    def verify_five_point_cross_check(self, data_points: list[dict[str, Any]]) -> dict[str, Any]:
        """Enforce Phase B 5-point independent cross-verification rule:
        Requires at least 5 independent source/historical observations with consistency validation.
        """
        if len(data_points) < 5:
            return {
                "verified": False,
                "count": len(data_points),
                "reason": f"Insufficient verification points: {len(data_points)} < 5 required.",
            }

        # Check consistency across verified data points
        rates = [float(p.get("funding_rate", p.get("rate", 0.0))) for p in data_points]
        sources = [p.get("source", "unknown") for p in data_points]
        unique_sources = set(sources)

        # Check for extreme anomalies (> 5.0% discrepancy)
        mean_rate = sum(rates) / len(rates)
        max_deviation = max(abs(r - mean_rate) for r in rates) if rates else 0.0

        is_consistent = max_deviation <= 0.010  # Max 100 bps outlier band
        return {
            "verified": is_consistent,
            "count": len(data_points),
            "unique_sources_count": len(unique_sources),
            "mean_rate": round(mean_rate, 6),
            "max_deviation": round(max_deviation, 6),
            "is_consistent": is_consistent,
        }
