"""Quantitative Performance Metrics, Risk Ratios, and Milestone Gate Validator.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import numpy as np
import pandas as pd


@dataclass
class BacktestMetrics:
    initial_capital: float
    final_equity: float
    total_net_pnl: float
    total_return_pct: float
    annualized_return_pct: float
    net_expectancy_pct: float
    max_drawdown_pct: float
    sharpe_ratio: float
    sortino_ratio: float
    win_rate_pct: float
    profit_factor: float
    total_trades: int
    winning_trades: int
    losing_trades: int


class BacktestMetricsCalculator:
    """Computes comprehensive quantitative performance and risk metrics."""

    @staticmethod
    def calculate_metrics(
        trade_returns: list[float] | np.ndarray | pd.Series,
        initial_capital: float = 10000.0,
        risk_free_rate: float = 0.0,
        settlements_per_year: float = 3.0 * 365.0,  # 1095 8h settlements / year
    ) -> BacktestMetrics:
        """Calculate statistical and risk-adjusted metrics from a sequence of trade returns."""
        if isinstance(trade_returns, list):
            rets = np.array(trade_returns, dtype=float)
        elif isinstance(trade_returns, pd.Series):
            rets = trade_returns.to_numpy(dtype=float)
        else:
            rets = np.asarray(trade_returns, dtype=float)

        if len(rets) == 0:
            return BacktestMetrics(
                initial_capital=initial_capital,
                final_equity=initial_capital,
                total_net_pnl=0.0,
                total_return_pct=0.0,
                annualized_return_pct=0.0,
                net_expectancy_pct=0.0,
                max_drawdown_pct=0.0,
                sharpe_ratio=0.0,
                sortino_ratio=0.0,
                win_rate_pct=0.0,
                profit_factor=0.0,
                total_trades=0,
                winning_trades=0,
                losing_trades=0,
            )

        total_trades = len(rets)
        winning_trades = int(np.sum(rets > 0))
        losing_trades = int(np.sum(rets < 0))
        win_rate = (winning_trades / total_trades) * 100.0 if total_trades > 0 else 0.0

        gross_profits = float(np.sum(rets[rets > 0])) if np.any(rets > 0) else 0.0
        gross_losses = float(abs(np.sum(rets[rets < 0]))) if np.any(rets < 0) else 0.0
        profit_factor = (gross_profits / gross_losses) if gross_losses > 1e-9 else (99.0 if gross_profits > 0 else 0.0)

        # Equity Curve and Drawdown calculation
        equity_curve = [initial_capital]
        current_eq = initial_capital
        for r in rets:
            current_eq *= (1.0 + r)
            equity_curve.append(current_eq)

        eq_arr = np.array(equity_curve)
        peak = np.maximum.accumulate(eq_arr)
        drawdowns = (peak - eq_arr) / peak
        max_dd = float(np.max(drawdowns)) * 100.0

        final_equity = eq_arr[-1]
        total_pnl = final_equity - initial_capital
        total_return_pct = ((final_equity - initial_capital) / initial_capital) * 100.0

        # Mean return & Net Expectancy
        mean_ret = float(np.mean(rets))
        std_ret = float(np.std(rets))

        # Annualized Return
        # Holding duration calculation: scale mean return by 1095 periods/year
        annualized_return = mean_ret * settlements_per_year * 100.0

        # Sharpe Ratio (annualized)
        if std_ret > 1e-9:
            sharpe = (mean_ret - risk_free_rate) / std_ret * np.sqrt(settlements_per_year)
        else:
            sharpe = 0.0

        # Sortino Ratio (downside deviation only)
        downside_rets = rets[rets < 0]
        if len(downside_rets) > 0:
            downside_std = float(np.std(downside_rets))
            sortino = (mean_ret - risk_free_rate) / downside_std * np.sqrt(settlements_per_year) if downside_std > 1e-9 else 0.0
        else:
            sortino = sharpe * 1.5 if sharpe > 0 else 0.0

        return BacktestMetrics(
            initial_capital=initial_capital,
            final_equity=round(final_equity, 2),
            total_net_pnl=round(total_pnl, 2),
            total_return_pct=round(total_return_pct, 4),
            annualized_return_pct=round(annualized_return, 4),
            net_expectancy_pct=round(mean_ret * 100.0, 4),
            max_drawdown_pct=round(max_dd, 4),
            sharpe_ratio=round(float(sharpe), 4),
            sortino_ratio=round(float(sortino), 4),
            win_rate_pct=round(win_rate, 2),
            profit_factor=round(float(profit_factor), 4),
            total_trades=total_trades,
            winning_trades=winning_trades,
            losing_trades=losing_trades,
        )

    @staticmethod
    def evaluate_gate_decision(
        regime_metrics: dict[str, BacktestMetrics | dict[str, Any]],
        max_drawdown_cap_pct: float = 5.0,
    ) -> dict[str, Any]:
        """Evaluate strategy across all 4 regimes for Gate Decision approval:
        Rule 1: Positive net expectancy in >= 2 of 4 regimes.
        Rule 2: Max drawdown <= cap in all regimes.
        """
        positive_regimes = []
        dd_breaches = []
        regime_summaries = {}

        for rid, metrics in regime_metrics.items():
            if isinstance(metrics, BacktestMetrics):
                net_exp = metrics.net_expectancy_pct
                max_dd = metrics.max_drawdown_pct
                sharpe = metrics.sharpe_ratio
            else:
                net_exp = float(metrics.get("net_expectancy_pct", metrics.get("net_expectancy", 0.0)))
                max_dd = float(metrics.get("max_drawdown_pct", metrics.get("max_drawdown", 0.0)))
                sharpe = float(metrics.get("sharpe_ratio", 0.0))

            regime_summaries[rid] = {
                "net_expectancy_pct": net_exp,
                "max_drawdown_pct": max_dd,
                "sharpe_ratio": sharpe,
                "is_positive_expectancy": net_exp > 0.0,
                "is_drawdown_compliant": max_dd <= max_drawdown_cap_pct,
            }

            if net_exp > 0.0:
                positive_regimes.append(rid)
            if max_dd > max_drawdown_cap_pct:
                dd_breaches.append((rid, max_dd))

        passes_expectancy = len(positive_regimes) >= 2
        passes_drawdown = len(dd_breaches) == 0
        gate_passed = passes_expectancy and passes_drawdown

        return {
            "gate_passed": gate_passed,
            "positive_regimes_count": len(positive_regimes),
            "positive_regimes": positive_regimes,
            "drawdown_breaches": dd_breaches,
            "passes_expectancy_gate": passes_expectancy,
            "passes_drawdown_gate": passes_drawdown,
            "regime_summaries": regime_summaries,
        }
