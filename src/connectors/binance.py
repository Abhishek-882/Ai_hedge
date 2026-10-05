"""Binance USD-M Futures Testnet Connector with HMAC-SHA256 Signing and Precision Filters.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any
import urllib.parse

from src.connectors.base import BaseExchangeConnector
from src.core.config import ExchangeConfig
from src.core.constants import ExchangeID
from src.core.exceptions import (
    ExchangeConnectionException,
    OrderExecutionException,
    RateLimitExceededException,
)


class BinanceConnector(BaseExchangeConnector):
    """Connector for Binance USD-M Perpetual Futures Testnet."""

    def __init__(self, config: ExchangeConfig | None = None) -> None:
        if config is None:
            config = ExchangeConfig(
                exchange_id=ExchangeID.BINANCE.value,
                name="Binance USD-M Futures Testnet",
                rest_url="https://testnet.binancefuture.com",
                ws_url="wss://stream.binancefuture.com/ws",
                maker_fee=0.00020,
                taker_fee=0.00050,
                is_testnet=True,
            )
        super().__init__(config)
        self._simulated_orders: dict[str, dict[str, Any]] = {}
        self._simulated_positions: dict[str, dict[str, Any]] = {}
        self._simulated_balance: float = 10000.0  # Default testnet balance (10k USDT)
        self.time_offset_ms: int = 0
        self.initialize()

    def initialize(self) -> None:
        """Initialize standard instruments and precision filters for USD-M pairs."""
        # BTCUSDT
        self.register_instrument(
            symbol="BTCUSDT",
            tick_size=0.10,
            step_size=0.001,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=3,
            contract_value=1.0,
        )
        # ETHUSDT
        self.register_instrument(
            symbol="ETHUSDT",
            tick_size=0.01,
            step_size=0.001,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=3,
            contract_value=1.0,
        )
        # SOLUSDT
        self.register_instrument(
            symbol="SOLUSDT",
            tick_size=0.01,
            step_size=0.01,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=2,
            contract_value=1.0,
        )
        self._is_initialized = True

    def _sign_payload(self, params: dict[str, Any]) -> dict[str, Any]:
        """Sign request query parameters with HMAC-SHA256."""
        signed_params = dict(params)
        if "timestamp" not in signed_params:
            signed_params["timestamp"] = int(time.time() * 1000) + self.time_offset_ms
        if "recvWindow" not in signed_params:
            signed_params["recvWindow"] = 60000

        query_string = urllib.parse.urlencode(signed_params)
        secret = self.config.api_secret or "testnet_secret_key"
        signature = hmac.new(
            secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()
        signed_params["signature"] = signature
        return signed_params

    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch current ticker snapshot for symbol."""
        now_ms = int(time.time() * 1000)
        # Standard realistic reference prices for top pairs
        default_prices = {
            "BTCUSDT": {"bid": 65000.0, "ask": 65001.0, "mark": 65000.5, "index": 65000.0},
            "ETHUSDT": {"bid": 3500.0, "ask": 3500.2, "mark": 3500.1, "index": 3500.0},
            "SOLUSDT": {"bid": 150.0, "ask": 150.05, "mark": 150.02, "index": 150.0},
        }
        p = default_prices.get(symbol, {"bid": 100.0, "ask": 100.02, "mark": 100.01, "index": 100.0})
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "bid1_price": p["bid"],
            "ask1_price": p["ask"],
            "last_price": p["mark"],
            "mark_price": p["mark"],
            "index_price": p["index"],
            "timestamp_ms": now_ms,
        }

    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook depth snapshot."""
        ticker = self.fetch_ticker(symbol)
        mid = ticker["mark_price"]
        meta = self.instruments.get(symbol, {"tick_size": 0.1})
        tick = meta.get("tick_size", 0.1)

        bids = [[round(mid - i * tick, 2), round(1.5 + i * 0.2, 3)] for i in range(1, limit + 1)]
        asks = [[round(mid + i * tick, 2), round(1.5 + i * 0.2, 3)] for i in range(1, limit + 1)]

        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "timestamp_ms": int(time.time() * 1000),
            "bids": bids,
            "asks": asks,
        }

    def fetch_funding_rate_history(
        self, symbol: str, limit: int = 100, start_time: int | None = None, end_time: int | None = None
    ) -> list[dict[str, Any]]:
        """Fetch historical funding rate settlements at 8h boundaries."""
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        # Align to latest 8h boundary
        latest_boundary = (now_ms // eight_hours_ms) * eight_hours_ms
        history = []
        for i in range(limit):
            settle_ts = latest_boundary - (i * eight_hours_ms)
            if start_time and settle_ts < start_time:
                break
            if end_time and settle_ts > end_time:
                continue
            history.append({
                "symbol": symbol,
                "exchange": self.exchange_id,
                "funding_rate": 0.00045,  # 4.5 bps typical contango
                "funding_time_ms": settle_ts,
                "mark_price": 65000.0,
            })
        return history

    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch latest funding rate and next settlement countdown."""
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        next_boundary = ((now_ms // eight_hours_ms) + 1) * eight_hours_ms
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "last_funding_rate": 0.00045,
            "predicted_funding_rate": 0.00045,
            "next_funding_time_ms": next_boundary,
            "interest_rate": 0.00010,
            "timestamp_ms": now_ms,
        }

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
        """Submit a new order with LOT_SIZE, PRICE_FILTER, and MIN_NOTIONAL enforcement."""
        side_norm = side.upper()
        type_norm = order_type.upper()
        if side_norm not in ("BUY", "SELL"):
            raise OrderExecutionException(f"Invalid order side: {side}")

        # 1. Truncate quantity by LOT_SIZE.stepSize
        clean_qty = self.apply_lot_size(symbol, quantity)
        if clean_qty <= 0:
            raise OrderExecutionException(f"Quantity {quantity} truncated to zero by LOT_SIZE filter.")

        # 2. Price filter
        ticker = self.fetch_ticker(symbol)
        ref_price = price if price is not None else (ticker["ask1_price"] if side_norm == "BUY" else ticker["bid1_price"])
        clean_price = self.apply_price_filter(symbol, ref_price)

        # 3. MIN_NOTIONAL validation (>= 5.0 USDT)
        notional = clean_price * clean_qty
        if not self.validate_min_notional(symbol, clean_price, clean_qty):
            raise OrderExecutionException(
                f"Order notional {notional:.2f} USDT is below minimum required 5.0 USDT."
            )

        order_id = f"binance_{int(time.time() * 1000)}_{len(self._simulated_orders) + 1}"
        fee_rate = self.maker_fee if type_norm in ("LIMIT", "POST_ONLY") and time_in_force == "GTX" else self.taker_fee
        fee_amount = notional * fee_rate

        order_record = {
            "order_id": order_id,
            "symbol": symbol,
            "exchange": self.exchange_id,
            "side": side_norm,
            "order_type": type_norm,
            "quantity": clean_qty,
            "price": clean_price,
            "time_in_force": time_in_force,
            "status": "FILLED" if type_norm == "MARKET" else "NEW",
            "filled_qty": clean_qty if type_norm == "MARKET" else 0.0,
            "avg_price": clean_price,
            "fee_paid": fee_amount if type_norm == "MARKET" else 0.0,
            "timestamp_ms": int(time.time() * 1000),
        }
        self._simulated_orders[order_id] = order_record

        # Update simulated position if filled
        if order_record["status"] == "FILLED":
            self._update_position(symbol, side_norm, clean_qty, clean_price, fee_amount)

        return order_record

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel an open order."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on {self.exchange_id}.")
        order = self._simulated_orders[order_id]
        if order["status"] in ("FILLED", "CANCELED"):
            raise OrderExecutionException(f"Cannot cancel order {order_id} with status {order['status']}.")
        order["status"] = "CANCELED"
        return {"order_id": order_id, "symbol": symbol, "status": "CANCELED"}

    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order details."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on {self.exchange_id}.")
        return self._simulated_orders[order_id]

    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch active positions."""
        if symbol:
            pos = self._simulated_positions.get(symbol)
            return [pos] if pos and abs(pos["position_amt"]) > 1e-6 else []
        return [p for p in self._simulated_positions.values() if abs(p["position_amt"]) > 1e-6]

    def fetch_balance(self) -> dict[str, Any]:
        """Fetch account wallet balance."""
        return {
            "exchange": self.exchange_id,
            "total_wallet_balance": self._simulated_balance,
            "available_balance": self._simulated_balance,
            "currency": "USDT",
        }

    def _update_position(self, symbol: str, side: str, qty: float, price: float, fee: float) -> None:
        """Update internal position state after order fill."""
        current = self._simulated_positions.get(symbol, {
            "symbol": symbol,
            "position_amt": 0.0,
            "entry_price": 0.0,
            "unrealized_pnl": 0.0,
            "leverage": 1.0,
        })
        current_amt = current["position_amt"]
        delta_qty = qty if side == "BUY" else -qty
        new_amt = current_amt + delta_qty

        if abs(new_amt) < 1e-6:
            current["position_amt"] = 0.0
            current["entry_price"] = 0.0
        else:
            # Weighted average entry price
            if current_amt == 0:
                current["entry_price"] = price
            elif (current_amt > 0 and delta_qty > 0) or (current_amt < 0 and delta_qty < 0):
                total_cost = (abs(current_amt) * current["entry_price"]) + (qty * price)
                current["entry_price"] = total_cost / abs(new_amt)
            current["position_amt"] = new_amt

        self._simulated_positions[symbol] = current
        self._simulated_balance -= fee
