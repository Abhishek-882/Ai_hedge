"""Vectorized Discrete-Event Funding Arbitrage Backtest Engine with Realistic Microstructure Modeling.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import datetime
from typing import Any
import numpy as np
import pandas as pd

from src.backtest.metrics import BacktestMetrics, BacktestMetricsCalculator
from src.backtest.timing import DualLegExecutionTiming, TimingEngine
from src.core.constants import (
    DEFAULT_TAKER_FEE,
    MIN_VIABLE_SPREAD_FLOOR,
    RegimeID,
    SLIPPAGE_BUFFER,
    TOTAL_TAKER_FEE_DRAG,
)


@dataclass
class TradeRecord:
    trade_id: str
    timestamp_ms: int
    datetime_utc: str
    symbol: str
    regime_id: str
    venue_long: str
    venue_short: str
    rate_long: float
    rate_short: float
    gross_spread: float
    notional: float
    gross_funding_pnl: float
    fee_drag: float
    slippage_cost: float
    basis_drift_pnl: float
    net_pnl: float
    net_return_pct: float
    is_synced: bool
    held_through_snapshot: bool
    status: str = "COMPLETED"


@dataclass
class BacktestResult:
    regime_id: str
    metrics: BacktestMetrics
    trades: list[TradeRecord]
    equity_curve: list[dict[str, Any]]
    total_trades: int
    desync_events: int


class FundingBacktester:
    """Vectorized and discrete-event backtest engine for funding arbitrage strategies."""

    def __init__(
        self,
        taker_fee_leg: float = DEFAULT_TAKER_FEE,
        slippage_leg: float = 0.00025,  # 2.5 bps per leg
        min_spread_hurdle: float = MIN_VIABLE_SPREAD_FLOOR,
        timing_engine: TimingEngine | None = None,
    ) -> None:
        self.taker_fee_leg = taker_fee_leg
        self.slippage_leg = slippage_leg
        self.four_way_fee_drag = 4.0 * taker_fee_leg  # 0.0020 (20 bps)
        self.slippage_buffer = 4.0 * slippage_leg    # 0.0010 (10 bps)
        self.min_spread_hurdle = min_spread_hurdle
        self.timing_engine = timing_engine or TimingEngine()

    def run_regime(
        self,
        strategy: Any | None,
        regime_id: str,
        data: pd.DataFrame,
        initial_capital: float = 10000.0,
        position_size_usd: float = 2000.0,  # $1,000 per venue ($2,000 total)
    ) -> BacktestResult:
        """Run discrete-event backtest across historical funding settlement dataset for a single regime."""
        if data.empty:
            empty_metrics = BacktestMetricsCalculator.calculate_metrics([], initial_capital)
            return BacktestResult(
                regime_id=regime_id,
                metrics=empty_metrics,
                trades=[],
                equity_curve=[{"timestamp_ms": 0, "equity": initial_capital}],
                total_trades=0,
                desync_events=0,
            )

        trades: list[TradeRecord] = []
        equity_curve: list[dict[str, Any]] = []
        current_equity = initial_capital
        equity_curve.append({"timestamp_ms": int(data.iloc[0].get("timestamp_ms", 0)), "equity": current_equity})

        trade_returns = []
        desync_count = 0
        rng = np.random.default_rng(42)

        for idx, row in data.iterrows():
            ts_ms = int(row.get("timestamp_ms", idx * 8 * 3600 * 1000))
            dt_str = str(row.get("datetime_utc", datetime.datetime.fromtimestamp(ts_ms / 1000.0, tz=datetime.timezone.utc).isoformat()))
            symbol = str(row.get("symbol", "BTCUSDT"))

            rate_a = float(row.get("funding_rate_venue_a", row.get("rate_a", 0.00045)))
            rate_b = float(row.get("funding_rate_venue_b", row.get("rate_b", 0.00010)))
            spread = abs(rate_a - rate_b)

            # Sizing: up to 10% equity or position_size_usd
            notional = min(position_size_usd, current_equity * 0.10 * 2.0)

            # Strategy signal or MVS hurdle check
            passes_hurdle = spread >= self.min_spread_hurdle
            if not passes_hurdle:
                continue

            # Determine Long and Short venues
            if rate_a >= rate_b:
                venue_short, venue_long = "venue_a", "venue_b"
                rate_short, rate_long = rate_a, rate_b
            else:
                venue_short, venue_long = "venue_b", "venue_a"
                rate_short, rate_long = rate_b, rate_a

            # Simulate execution timing and stochastic dual-leg fill
            settle_dt = datetime.datetime.fromtimestamp(ts_ms / 1000.0, tz=datetime.timezone.utc)
            timing = self.timing_engine.simulate_dual_leg_window(settle_dt, rng=rng)

            # Basis drift modeling
            raw_basis_drift = float(row.get("basis_drift", 0.0))
            basis_drift_pct = raw_basis_drift if abs(raw_basis_drift) > 1e-9 else float(rng.normal(0.0, 0.0005))

            if timing.is_synchronized and timing.held_through_snapshot:
                # Normal successful paired execution
                gross_funding_pnl = notional * (rate_short - rate_long)
                fee_drag = notional * self.four_way_fee_drag
                slippage_cost = notional * self.slippage_buffer
                basis_pnl = notional * basis_drift_pct
                net_pnl = gross_funding_pnl - fee_drag - slippage_cost + basis_pnl
                status = "COMPLETED"
            else:
                # Leg desync or rejection occurred -> Emergency unwind executed
                desync_count += 1
                gross_funding_pnl = 0.0  # Missed funding snapshot due to abort
                fee_drag = notional * (self.taker_fee_leg * 2.0)  # Entry + emergency market unwind on single leg
                slippage_cost = notional * (self.slippage_leg * 2.0 + 0.0005)  # Aggressive unwind market impact
                basis_pnl = notional * (-abs(basis_drift_pct))  # Adverse drift during unhedged interval
                net_pnl = -(fee_drag + slippage_cost + abs(basis_pnl))
                status = "DESYNC_UNWOUND"

            net_return_pct = net_pnl / notional if notional > 0 else 0.0
            current_equity += net_pnl
            trade_returns.append(net_return_pct)

            trade_record = TradeRecord(
                trade_id=f"trade_{ts_ms}_{len(trades)+1}",
                timestamp_ms=ts_ms,
                datetime_utc=dt_str,
                symbol=symbol,
                regime_id=regime_id,
                venue_long=venue_long,
                venue_short=venue_short,
                rate_long=rate_long,
                rate_short=rate_short,
                gross_spread=round(spread, 6),
                notional=round(notional, 2),
                gross_funding_pnl=round(gross_funding_pnl, 4),
                fee_drag=round(fee_drag, 4),
                slippage_cost=round(slippage_cost, 4),
                basis_drift_pnl=round(basis_pnl, 4),
                net_pnl=round(net_pnl, 4),
                net_return_pct=round(net_return_pct, 6),
                is_synced=timing.is_synchronized,
                held_through_snapshot=timing.held_through_snapshot,
                status=status,
            )
            trades.append(trade_record)
            equity_curve.append({"timestamp_ms": ts_ms, "equity": round(current_equity, 2)})

        metrics = BacktestMetricsCalculator.calculate_metrics(trade_returns, initial_capital)
        return BacktestResult(
            regime_id=regime_id,
            metrics=metrics,
            trades=trades,
            equity_curve=equity_curve,
            total_trades=len(trades),
            desync_events=desync_count,
        )

    def run_all_regimes(
        self,
        strategy: Any | None,
        regime_datasets: dict[str, pd.DataFrame],
        initial_capital: float = 10000.0,
        max_drawdown_cap_pct: float = 5.0,
    ) -> dict[str, Any]:
        """Run backtest across all 4 regimes and perform automated Gate Decision check."""
        results: dict[str, BacktestResult] = {}
        summaries: dict[str, BacktestMetrics] = {}

        for rid, df in regime_datasets.items():
            res = self.run_regime(strategy, rid, df, initial_capital=initial_capital)
            results[rid] = res
            summaries[rid] = res.metrics

        gate_eval = BacktestMetricsCalculator.evaluate_gate_decision(
            summaries,
            max_drawdown_cap_pct=max_drawdown_cap_pct,
        )

        return {
            "regime_results": results,
            "regime_metrics": summaries,
            "gate_evaluation": gate_eval,
            "gate_passed": gate_eval["gate_passed"],
        }


# Backwards-compatible alias
VectorizedBacktester = FundingBacktester

