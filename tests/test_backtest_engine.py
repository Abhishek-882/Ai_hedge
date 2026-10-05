"""Unit and Integration Tests for Discrete-Event Backtester, Timing Engine, Metrics & Audits.
"""

from __future__ import annotations

import datetime
import numpy as np
import pandas as pd
import pytest

from src.backtest.audit import LookaheadBiasAuditor, OverfittingAuditor
from src.backtest.engine import BacktestResult, FundingBacktester, TradeRecord
from src.backtest.metrics import BacktestMetrics, BacktestMetricsCalculator
from src.backtest.timing import DualLegExecutionTiming, TimingEngine
from src.core.constants import (
    MIN_VIABLE_SPREAD_FLOOR,
    RegimeID,
)
from src.market.regimes import MarketRegimeManager


class TestIdea03TimingEngine:
    """Test suite for Idea 03 High-Fidelity Timing Engine."""

    def test_window_durations_and_holding_time(self) -> None:
        engine = TimingEngine(entry_lead_seconds=480, exit_lag_seconds=90)
        assert engine.total_hold_seconds == 570  # 480 + 90 = 570s (9.5 min)

        settle_dt = datetime.datetime(2026, 8, 28, 8, 0, 0, tzinfo=datetime.timezone.utc)
        timing = engine.simulate_dual_leg_window(settle_dt)

        assert timing.entry_scheduled_utc == datetime.datetime(2026, 8, 28, 7, 52, 0, tzinfo=datetime.timezone.utc)
        assert timing.exit_scheduled_utc == datetime.datetime(2026, 8, 28, 8, 1, 30, tzinfo=datetime.timezone.utc)
        assert timing.held_through_snapshot is True
        assert timing.total_hold_duration_seconds == 570.0

    def test_stochastic_latency_generation(self) -> None:
        engine = TimingEngine()
        rng = np.random.default_rng(42)
        latencies = [engine.generate_fill_latency_ms(rng) for _ in range(100)]
        mean_lat = float(np.mean(latencies))
        assert 50.0 < mean_lat < 250.0  # LogNormal(4.5, 0.5) mean ~ 100-150ms


class TestBacktestMetricsCalculator:
    """Test suite for performance ratios, drawdowns, and Gate compliance."""

    def test_metrics_calculation_accuracy(self) -> None:
        # 10 trade returns: 7 wins of +1%, 3 losses of -0.5%
        rets = [0.01, 0.01, -0.005, 0.01, 0.01, -0.005, 0.01, -0.005, 0.01, 0.01]
        metrics = BacktestMetricsCalculator.calculate_metrics(rets, initial_capital=10000.0)

        assert metrics.total_trades == 10
        assert metrics.winning_trades == 7
        assert metrics.losing_trades == 3
        assert metrics.win_rate_pct == 70.0
        assert metrics.net_expectancy_pct > 0.50
        assert metrics.profit_factor > 2.0
        assert metrics.sharpe_ratio > 0.0
        assert metrics.max_drawdown_pct < 5.0

    def test_gate_decision_evaluation_logic(self) -> None:
        # Case 1: Passes gate (3 regimes positive, drawdowns <= 5%)
        regime_metrics_pass = {
            "REGIME_1": {"net_expectancy_pct": 0.35, "max_drawdown_pct": 1.2, "sharpe_ratio": 2.5},
            "REGIME_2": {"net_expectancy_pct": -0.10, "max_drawdown_pct": 2.5, "sharpe_ratio": -0.5},
            "REGIME_3": {"net_expectancy_pct": 0.05, "max_drawdown_pct": 0.8, "sharpe_ratio": 1.1},
            "REGIME_4": {"net_expectancy_pct": 0.85, "max_drawdown_pct": 3.1, "sharpe_ratio": 3.2},
        }
        res_pass = BacktestMetricsCalculator.evaluate_gate_decision(regime_metrics_pass, max_drawdown_cap_pct=5.0)
        assert res_pass["gate_passed"] is True
        assert res_pass["positive_regimes_count"] == 3

        # Case 2: Fails gate (only 1 regime positive)
        regime_metrics_fail_expectancy = {
            "REGIME_1": {"net_expectancy_pct": 0.35, "max_drawdown_pct": 1.2, "sharpe_ratio": 2.5},
            "REGIME_2": {"net_expectancy_pct": -0.10, "max_drawdown_pct": 2.5, "sharpe_ratio": -0.5},
            "REGIME_3": {"net_expectancy_pct": -0.05, "max_drawdown_pct": 0.8, "sharpe_ratio": -0.8},
            "REGIME_4": {"net_expectancy_pct": -0.20, "max_drawdown_pct": 3.1, "sharpe_ratio": -1.2},
        }
        res_fail_exp = BacktestMetricsCalculator.evaluate_gate_decision(regime_metrics_fail_expectancy)
        assert res_fail_exp["gate_passed"] is False
        assert res_fail_exp["passes_expectancy_gate"] is False

        # Case 3: Fails gate on drawdown breach (> 5%)
        regime_metrics_fail_dd = {
            "REGIME_1": {"net_expectancy_pct": 0.35, "max_drawdown_pct": 1.2, "sharpe_ratio": 2.5},
            "REGIME_2": {"net_expectancy_pct": 0.15, "max_drawdown_pct": 6.5, "sharpe_ratio": 1.2},  # DD 6.5% > 5.0%
            "REGIME_3": {"net_expectancy_pct": 0.05, "max_drawdown_pct": 0.8, "sharpe_ratio": 1.1},
            "REGIME_4": {"net_expectancy_pct": 0.85, "max_drawdown_pct": 3.1, "sharpe_ratio": 3.2},
        }
        res_fail_dd = BacktestMetricsCalculator.evaluate_gate_decision(regime_metrics_fail_dd, max_drawdown_cap_pct=5.0)
        assert res_fail_dd["gate_passed"] is False
        assert res_fail_dd["passes_drawdown_gate"] is False
        assert len(res_fail_dd["drawdown_breaches"]) == 1


class TestFundingBacktesterEngine:
    """Test suite for discrete-event backtest simulation with fee drag and slippage."""

    def test_backtest_execution_on_regime_datasets(self) -> None:
        manager = MarketRegimeManager()
        backtester = FundingBacktester(min_spread_hurdle=0.0040)

        # Generate datasets for all 4 regimes
        regime_data = {
            "REGIME_1": manager.generate_regime_dataset(RegimeID.REGIME_1, num_settlements=60, seed=1),
            "REGIME_2": manager.generate_regime_dataset(RegimeID.REGIME_2, num_settlements=60, seed=2),
            "REGIME_3": manager.generate_regime_dataset(RegimeID.REGIME_3, num_settlements=60, seed=3),
            "REGIME_4": manager.generate_regime_dataset(RegimeID.REGIME_4, num_settlements=60, seed=4),
        }

        # Run multi-regime backtest
        results = backtester.run_all_regimes(strategy=None, regime_datasets=regime_data, initial_capital=10000.0)

        assert "regime_results" in results
        assert "gate_evaluation" in results
        assert len(results["regime_results"]) == 4

        # Regime 4 (Structural Dispersion) should generate high positive return
        res_r4 = results["regime_results"]["REGIME_4"]
        assert res_r4.total_trades > 0
        assert res_r4.metrics.final_equity > 10000.0

        # Verify trade accounting on single trade
        trade = res_r4.trades[0]
        assert trade.notional > 0
        assert trade.gross_funding_pnl > 0
        assert trade.fee_drag > 0
        assert trade.slippage_cost > 0

    def test_backtest_mvs_filter_protects_choppy_regime(self) -> None:
        manager = MarketRegimeManager()
        # With MVS filter (spread >= 0.0040)
        backtester_filtered = FundingBacktester(min_spread_hurdle=0.0040)
        df_chop = manager.generate_regime_dataset(RegimeID.REGIME_3, num_settlements=60, seed=42)
        res_filtered = backtester_filtered.run_regime(None, "REGIME_3", df_chop)

        # Choppy regime has low spread, so filter should prevent excessive fee churn
        assert res_filtered.total_trades < 10
        assert res_filtered.metrics.max_drawdown_pct < 2.0


class TestLookaheadAndOverfittingAudits:
    """Test suite for lookahead bias detector, purged group CV, and parameter stability."""

    def test_lookahead_bias_detection(self) -> None:
        auditor = LookaheadBiasAuditor()
        # Clean sorted dataset
        df_clean = pd.DataFrame({
            "timestamp_ms": [1000, 2000, 3000, 4000, 5000],
            "feature_1": [1.0, 2.0, 3.0, 4.0, 5.0],
            "target": [2.0, 3.0, 5.0, 7.0, 11.0],
        })
        audit_clean = auditor.audit_features(df_clean, ["feature_1"], "target")
        assert audit_clean["passed"] is True

        # Unsorted dataset -> Fails
        df_unsorted = pd.DataFrame({
            "timestamp_ms": [3000, 1000, 4000, 2000],
            "feature_1": [1, 2, 3, 4],
            "target": [2, 3, 4, 5],
        })
        audit_unsorted = auditor.audit_features(df_unsorted, ["feature_1"], "target")
        assert audit_unsorted["passed"] is False

    def test_train_test_embargo_verification(self) -> None:
        auditor = LookaheadBiasAuditor()
        t0 = 1700000000000
        eight_hours_ms = 8 * 3600 * 1000

        # Valid separation with 8h embargo
        train_df = pd.DataFrame({"timestamp_ms": [t0, t0 + 1000, t0 + 2000]})
        test_df = pd.DataFrame({"timestamp_ms": [t0 + 2000 + eight_hours_ms + 1000]})

        res = auditor.verify_no_future_leakage(train_df, test_df, embargo_hours=8.0)
        assert res["passed"] is True
        assert res["embargo_compliant"] is True

        # Invalid: test starts immediately after train without embargo
        test_df_no_embargo = pd.DataFrame({"timestamp_ms": [t0 + 2500]})
        res_fail = auditor.verify_no_future_leakage(train_df, test_df_no_embargo, embargo_hours=8.0)
        assert res_fail["passed"] is False

    def test_purged_group_time_series_splits(self) -> None:
        auditor = LookaheadBiasAuditor()
        # 100 time points separated by 8 hours
        t0 = 1700000000000
        eight_hours_ms = 8 * 3600 * 1000
        df = pd.DataFrame({"timestamp_ms": [t0 + i * eight_hours_ms for i in range(100)]})

        splits = auditor.purged_group_time_series_split(df, n_splits=4, embargo_hours=8.0)
        assert len(splits) == 4
        for train_idx, test_idx in splits:
            max_train_ts = df.iloc[train_idx]["timestamp_ms"].max()
            min_test_ts = df.iloc[test_idx]["timestamp_ms"].min()
            # Ensure 8h embargo between train and test
            assert min_test_ts >= max_train_ts + eight_hours_ms

    def test_parameter_sensitivity_audit(self) -> None:
        auditor = OverfittingAuditor()

        def sample_runner(params: dict) -> float:
            # Stable quadratic function around optimal threshold 0.0040
            thresh = params.get("threshold", 0.0040)
            return 10.0 - (thresh - 0.0040) ** 2 * 1000.0

        audit = auditor.audit_parameter_sensitivity(
            runner_fn=sample_runner,
            base_params={"threshold": 0.0040},
            param_grid={"threshold": [0.0036, 0.0038, 0.0040, 0.0042, 0.0044]},
        )
        assert audit["passed"] is True
        assert audit["base_metric"] == 10.0
