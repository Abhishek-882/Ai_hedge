"""Backtesting, Idea 03 Timing Engine, Metrics & Lookahead Audit Package.
"""

from src.backtest.audit import LookaheadBiasAuditor, OverfittingAuditor
from src.backtest.engine import BacktestResult, FundingBacktester, TradeRecord
from src.backtest.metrics import BacktestMetrics, BacktestMetricsCalculator
from src.backtest.timing import DualLegExecutionTiming, TimingEngine

__all__ = [
    "BacktestMetrics",
    "BacktestMetricsCalculator",
    "BacktestResult",
    "DualLegExecutionTiming",
    "FundingBacktester",
    "LookaheadBiasAuditor",
    "OverfittingAuditor",
    "TimingEngine",
    "TradeRecord",
]
