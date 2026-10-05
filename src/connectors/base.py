"""Abstract Base Exchange Connector Interface for Funding Rate Arbitrage Bot.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from typing import Any

from src.core.config import ExchangeConfig
from src.core.constants import ExchangeID
from src.core.guardrails import assert_testnet_url
from src.core.exceptions import (
    ExchangeException,
    OrderExecutionException,
    RateLimitExceededException,
)


class BaseExchangeConnector(ABC):
    """Abstract base class defining interface contracts for all exchange venues."""

    def __init__(self, config: ExchangeConfig) -> None:
        self.config = config
        self.exchange_id = config.exchange_id
        self.name = config.name
        self.is_testnet = config.is_testnet
        self.requires_paper_fallback = config.requires_paper_fallback
        self.maker_fee = config.maker_fee
        self.taker_fee = config.taker_fee
        self.instruments: dict[str, dict[str, Any]] = {}
        self._is_initialized = False

        # Guardrail check: assert testnet URLs
        self.validate_guardrails()

    @property
    def rest_url(self) -> str:
        return self.config.rest_url

    @property
    def ws_url(self) -> str:
        return self.config.ws_url

    def validate_guardrails(self) -> None:
        """Validate that the connector is configured with valid testnet endpoints."""
        if self.config.rest_url:
            assert_testnet_url(self.config.rest_url)
        if self.config.ws_url:
            assert_testnet_url(self.config.ws_url)

    @abstractmethod
    def initialize(self) -> None:
        """Load exchange metadata, instruments info, and precision filters."""
        pass

    @abstractmethod
    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch current ticker snapshot (bid1, ask1, last, mark, index, timestamp)."""
        pass

    @abstractmethod
    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook snapshot (bids, asks, timestamp)."""
        pass

    @abstractmethod
    def fetch_funding_rate_history(
        self, symbol: str, limit: int = 100, start_time: int | None = None, end_time: int | None = None
    ) -> list[dict[str, Any]]:
        """Fetch historical funding rate settlement entries."""
        pass

    @abstractmethod
    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch latest / predicted funding rate and next settlement timestamp."""
        pass

    def fetch_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Alias for fetch_current_funding_rate."""
        return self.fetch_current_funding_rate(symbol)

    @abstractmethod
    def create_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float,
        price: float | None = None,
        time_in_force: str = "GTC",
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit a new order."""
        pass

    @abstractmethod
    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel an open order."""
        pass

    @abstractmethod
    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order details and execution state."""
        pass

    @abstractmethod
    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch active perpetual positions."""
        pass

    @abstractmethod
    def fetch_balance(self) -> dict[str, Any]:
        """Fetch account wallet and margin balance."""
        pass

    # ---------------------------------------------------------------------------
    # Precision & Sizing Utilities
    # ---------------------------------------------------------------------------

    def register_instrument(
        self,
        symbol: str,
        tick_size: float = 0.1,
        step_size: float = 0.001,
        min_notional: float = 5.0,
        price_precision: int = 2,
        quantity_precision: int = 3,
        contract_value: float = 1.0,
    ) -> None:
        """Register or update precision rules for a symbol."""
        self.instruments[symbol] = {
            "tick_size": tick_size,
            "step_size": step_size,
            "min_notional": min_notional,
            "price_precision": price_precision,
            "quantity_precision": quantity_precision,
            "contract_value": contract_value,
        }

    def apply_lot_size(self, symbol: str, quantity: float) -> float:
        """Truncate order quantity according to LOT_SIZE.stepSize rules."""
        meta = self.instruments.get(symbol, {})
        step_size = meta.get("step_size", 0.001)
        precision = meta.get("quantity_precision", 3)
        if step_size <= 0:
            return round(quantity, precision)
        factor = round(1.0 / step_size, 8) if step_size < 1 else 1.0 / step_size
        truncated = math.floor(round(quantity * factor, 8)) / factor
        return round(truncated, precision)

    def apply_price_filter(self, symbol: str, price: float) -> float:
        """Format price according to PRICE_FILTER.tickSize rules."""
        meta = self.instruments.get(symbol, {})
        tick_size = meta.get("tick_size", 0.1)
        precision = meta.get("price_precision", 2)
        if tick_size <= 0:
            return round(price, precision)
        factor = round(1.0 / tick_size, 8) if tick_size < 1 else 1.0 / tick_size
        rounded = round(price * factor) / factor
        return round(rounded, precision)

    def validate_min_notional(self, symbol: str, price: float, quantity: float) -> bool:
        """Validate that price * quantity >= MIN_NOTIONAL."""
        meta = self.instruments.get(symbol, {})
        min_notional = meta.get("min_notional", 5.0)
        return (price * quantity) >= min_notional

    def get_contract_multiplier(self, symbol: str) -> float:
        """Get the lot / contract multiplier (e.g. 1 / contract_value for Delta)."""
        meta = self.instruments.get(symbol, {})
        return float(meta.get("contract_value", 1.0))
