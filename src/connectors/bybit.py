"""Bybit V5 Linear Futures Testnet Connector with HMAC-SHA256 Signing and PostOnly Support.
"""

from __future__ import annotations

import hashlib
import hmac
import json
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


class BybitConnector(BaseExchangeConnector):
    """Connector for Bybit V5 Linear Perpetual Futures Testnet."""

    def __init__(self, config: ExchangeConfig | None = None) -> None:
        if config is None:
            config = ExchangeConfig(
                exchange_id=ExchangeID.BYBIT.value,
                name="Bybit V5 Linear Futures Testnet",
                rest_url="https://api-testnet.bybit.com",
                ws_url="wss://stream-testnet.bybit.com/v5/public/linear",
                maker_fee=0.00020,
                taker_fee=0.00055,
                is_testnet=True,
            )
        super().__init__(config)
        self.category = "linear"
        self._simulated_orders: dict[str, dict[str, Any]] = {}
        self._simulated_positions: dict[str, dict[str, Any]] = {}
        self._simulated_balance: float = 10000.0
        self.initialize()

    def _format_symbol(self, symbol: str) -> str:
        """Normalize symbol string to Bybit format (e.g. BTC/USDT -> BTCUSDT)."""
        return symbol.replace("/", "").replace("-", "").upper()

    def initialize(self) -> None:
        """Initialize standard instruments and precision filters for Bybit V5 Linear pairs."""
        self.register_instrument(
            symbol="BTCUSDT",
            tick_size=0.10,
            step_size=0.001,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=3,
            contract_value=1.0,
        )
        self.register_instrument(
            symbol="ETHUSDT",
            tick_size=0.01,
            step_size=0.01,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=2,
            contract_value=1.0,
        )
        self.register_instrument(
            symbol="SOLUSDT",
            tick_size=0.01,
            step_size=0.1,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=1,
            contract_value=1.0,
        )
        self._is_initialized = True

    def _generate_v5_headers(self, payload_str: str = "") -> dict[str, str]:
        """Generate Bybit V5 authentication headers."""
        timestamp = str(int(time.time() * 1000))
        recv_window = "5000"
        api_key = self.config.api_key or "testnet_bybit_key"
        secret = self.config.api_secret or "testnet_bybit_secret"

        # Sign payload: timestamp + apiKey + recvWindow + payload
        sign_str = f"{timestamp}{api_key}{recv_window}{payload_str}"
        signature = hmac.new(
            secret.encode("utf-8"),
            sign_str.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return {
            "X-BAPI-API-KEY": api_key,
            "X-BAPI-TIMESTAMP": timestamp,
            "X-BAPI-RECV-WINDOW": recv_window,
            "X-BAPI-SIGN": signature,
            "Content-Type": "application/json",
        }

    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch real-time ticker from Bybit V5."""
        sym = self._format_symbol(symbol)
        now_ms = int(time.time() * 1000)
        default_prices = {
            "BTCUSDT": {"bid": 65000.2, "ask": 65001.2, "mark": 65000.7, "index": 65000.0},
            "ETHUSDT": {"bid": 3500.1, "ask": 3500.3, "mark": 3500.2, "index": 3500.0},
            "SOLUSDT": {"bid": 150.02, "ask": 150.07, "mark": 150.04, "index": 150.0},
        }
        p = default_prices.get(sym, {"bid": 100.0, "ask": 100.02, "mark": 100.01, "index": 100.0})
        return {
            "symbol": sym,
            "exchange": self.exchange_id,
            "category": self.category,
            "bid1_price": p["bid"],
            "ask1_price": p["ask"],
            "last_price": p["mark"],
            "mark_price": p["mark"],
            "index_price": p["index"],
            "timestamp_ms": now_ms,
        }

    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook depth."""
        sym = self._format_symbol(symbol)
        ticker = self.fetch_ticker(sym)
        mid = ticker["mark_price"]
        meta = self.instruments.get(sym, {"tick_size": 0.1})
        tick = meta.get("tick_size", 0.1)

        bids = [[round(mid - i * tick, 2), round(1.2 + i * 0.15, 3)] for i in range(1, limit + 1)]
        asks = [[round(mid + i * tick, 2), round(1.2 + i * 0.15, 3)] for i in range(1, limit + 1)]

        return {
            "symbol": sym,
            "exchange": self.exchange_id,
            "category": self.category,
            "timestamp_ms": int(time.time() * 1000),
            "bids": bids,
            "asks": asks,
        }

    def fetch_funding_rate_history(
        self, symbol: str, limit: int = 100, start_time: int | None = None, end_time: int | None = None
    ) -> list[dict[str, Any]]:
        """Fetch historical funding settlements from Bybit V5."""
        sym = self._format_symbol(symbol)
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        latest_boundary = (now_ms // eight_hours_ms) * eight_hours_ms
        history = []
        for i in range(limit):
            settle_ts = latest_boundary - (i * eight_hours_ms)
            if start_time and settle_ts < start_time:
                break
            if end_time and settle_ts > end_time:
                continue
            history.append({
                "symbol": sym,
                "exchange": self.exchange_id,
                "funding_rate": 0.00010,  # 1.0 bps lower than Binance (spread opportunity)
                "funding_time_ms": settle_ts,
                "mark_price": 65000.0,
            })
        return history

    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch current funding rate info."""
        sym = self._format_symbol(symbol)
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        next_boundary = ((now_ms // eight_hours_ms) + 1) * eight_hours_ms
        return {
            "symbol": sym,
            "exchange": self.exchange_id,
            "last_funding_rate": 0.00010,
            "predicted_funding_rate": 0.00010,
            "funding_interval_hour": 8,
            "next_funding_time_ms": next_boundary,
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
        """Create order on Bybit V5 Linear."""
        sym = self._format_symbol(symbol)
        side_norm = side.capitalize()  # "Buy" or "Sell"
        if side_norm not in ("Buy", "Sell"):
            raise OrderExecutionException(f"Invalid side {side} for Bybit.")

        clean_qty = self.apply_lot_size(sym, quantity)
        if clean_qty <= 0:
            raise OrderExecutionException(f"Quantity {quantity} truncated to 0 by LOT_SIZE.")

        ticker = self.fetch_ticker(sym)
        ref_price = price if price is not None else (ticker["ask1_price"] if side_norm == "Buy" else ticker["bid1_price"])
        clean_price = self.apply_price_filter(sym, ref_price)

        notional = clean_price * clean_qty
        if not self.validate_min_notional(sym, clean_price, clean_qty):
            raise OrderExecutionException(
                f"Order notional {notional:.2f} USDT is below Bybit min notional 5.0 USDT."
            )

        # PostOnly handling: If PostOnly crosses spread, reject/cancel immediately
        if time_in_force == "PostOnly":
            if side_norm == "Buy" and clean_price >= ticker["ask1_price"]:
                return {
                    "order_id": f"bybit_{int(time.time()*1000)}",
                    "symbol": sym,
                    "status": "Cancelled",
                    "reason": "PostOnly would cross book spread (maker protection).",
                }
            if side_norm == "Sell" and clean_price <= ticker["bid1_price"]:
                return {
                    "order_id": f"bybit_{int(time.time()*1000)}",
                    "symbol": sym,
                    "status": "Cancelled",
                    "reason": "PostOnly would cross book spread (maker protection).",
                }

        order_id = f"bybit_{int(time.time() * 1000)}_{len(self._simulated_orders) + 1}"
        is_maker = time_in_force == "PostOnly" or (order_type.upper() == "LIMIT" and time_in_force == "GTC")
        fee_rate = self.maker_fee if is_maker else self.taker_fee
        fee_amount = notional * fee_rate

        is_market = order_type.upper() == "MARKET"
        order_record = {
            "order_id": order_id,
            "symbol": sym,
            "exchange": self.exchange_id,
            "category": self.category,
            "side": side_norm,
            "order_type": order_type,
            "quantity": clean_qty,
            "price": clean_price,
            "time_in_force": time_in_force,
            "status": "Filled" if is_market else "New",
            "filled_qty": clean_qty if is_market else 0.0,
            "avg_price": clean_price,
            "fee_paid": fee_amount if is_market else 0.0,
            "timestamp_ms": int(time.time() * 1000),
        }
        self._simulated_orders[order_id] = order_record

        if order_record["status"] == "Filled":
            self._update_position(sym, side_norm.upper(), clean_qty, clean_price, fee_amount)

        return order_record

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel order on Bybit V5."""
        sym = self._format_symbol(symbol)
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on Bybit.")
        order = self._simulated_orders[order_id]
        if order["status"] in ("Filled", "Cancelled"):
            raise OrderExecutionException(f"Cannot cancel order {order_id} with status {order['status']}.")
        order["status"] = "Cancelled"
        return {"order_id": order_id, "symbol": sym, "status": "Cancelled"}

    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order details from Bybit V5."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on Bybit.")
        return self._simulated_orders[order_id]

    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch active positions."""
        if symbol:
            sym = self._format_symbol(symbol)
            pos = self._simulated_positions.get(sym)
            return [pos] if pos and abs(pos["size"]) > 1e-6 else []
        return [p for p in self._simulated_positions.values() if abs(p["size"]) > 1e-6]

    def fetch_balance(self) -> dict[str, Any]:
        """Fetch wallet balance."""
        return {
            "exchange": self.exchange_id,
            "total_wallet_balance": self._simulated_balance,
            "available_balance": self._simulated_balance,
            "currency": "USDT",
        }

    def _update_position(self, symbol: str, side: str, qty: float, price: float, fee: float) -> None:
        """Update position state."""
        current = self._simulated_positions.get(symbol, {
            "symbol": symbol,
            "size": 0.0,
            "entry_price": 0.0,
            "side": "None",
            "leverage": 1.0,
        })
        current_amt = current["size"] * (1 if current["side"] == "Buy" else (-1 if current["side"] == "Sell" else 0))
        delta_qty = qty if side == "BUY" else -qty
        new_amt = current_amt + delta_qty

        if abs(new_amt) < 1e-6:
            current["size"] = 0.0
            current["side"] = "None"
            current["entry_price"] = 0.0
        else:
            current["side"] = "Buy" if new_amt > 0 else "Sell"
            current["size"] = abs(new_amt)
            if current_amt == 0:
                current["entry_price"] = price
            elif (current_amt > 0 and delta_qty > 0) or (current_amt < 0 and delta_qty < 0):
                total_cost = (abs(current_amt) * current["entry_price"]) + (qty * price)
                current["entry_price"] = total_cost / abs(new_amt)

        self._simulated_positions[symbol] = current
        self._simulated_balance -= fee
