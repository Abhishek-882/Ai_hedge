"""Strategy-Agnostic Execution Interfaces, Events, and Order Models.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
import datetime
from enum import Enum
from typing import Any


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    IOC = "IOC"
    POST_ONLY = "POST_ONLY"


@dataclass
class MarketEvent:
    exchange: str
    symbol: str
    bid_price: float
    ask_price: float
    timestamp_utc: datetime.datetime
    mark_price: float | None = None
    index_price: float | None = None


@dataclass
class FundingSnapshotEvent:
    exchange: str
    symbol: str
    funding_rate: float
    next_snapshot_utc: datetime.datetime
    predicted_rate: float | None = None
    mark_price: float | None = None


@dataclass
class OrderIntent:
    intent_id: str
    strategy_id: str
    exchange: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    limit_price: float | None = None
    paired_intent_id: str | None = None
    time_in_force: str = "GTC"
    created_at_utc: datetime.datetime | None = None
    is_maker_first: bool = False
    dependent_on_intent_id: str | None = None


@dataclass
class FillEvent:
    fill_id: str
    order_id: str
    intent_id: str
    exchange: str
    symbol: str
    side: OrderSide
    filled_qty: float
    filled_price: float
    fee_paid: float
    fee_asset: str
    timestamp_utc: datetime.datetime


class BaseStrategy(ABC):
    """Abstract Base Class that every quantitative research and execution strategy must implement."""

    def __init__(self, strategy_id: str) -> None:
        self.strategy_id = strategy_id
        self.config: dict[str, Any] = {}
        self.is_initialized: bool = False

    @abstractmethod
    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize strategy parameters, thresholds, risk allocations, and subscriptions."""
        pass

    @abstractmethod
    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Process incoming ticker or depth update and generate order intents."""
        pass

    @abstractmethod
    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Process incoming funding rate snapshot or countdown event."""
        pass

    @abstractmethod
    def on_fill(self, event: FillEvent) -> None:
        """Handle execution fill confirmation and update internal position state."""
        pass

    @abstractmethod
    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Strategy-specific callback when a multi-leg execution desync occurs."""
        pass
