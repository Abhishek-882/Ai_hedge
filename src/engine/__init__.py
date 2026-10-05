"""Execution Engine, Risk Management, Desync Watchdog & Kill-Switch Package.
"""

from src.engine.executor import ExecutionEngine
from src.engine.interfaces import (
    BaseStrategy,
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)
from src.engine.kill_switch import KillSwitch
from src.engine.risk import RiskManager
from src.engine.watchdog import DesyncWatchdog, PairedExecutionTracker

__all__ = [
    "BaseStrategy",
    "DesyncWatchdog",
    "ExecutionEngine",
    "FillEvent",
    "FundingSnapshotEvent",
    "KillSwitch",
    "MarketEvent",
    "OrderIntent",
    "OrderSide",
    "OrderType",
    "PairedExecutionTracker",
    "RiskManager",
]
