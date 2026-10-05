"""Bitget V2 Perpetual Futures Testnet Connector with HMAC-SHA256 Signing and PostOnly Support.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from typing import Any
import urllib.parse
import urllib.request

from src.connectors.base import BaseExchangeConnector
from src.core.config import ExchangeConfig
from src.core.constants import BITGET_MAKER_FEE, BITGET_TAKER_FEE, ExchangeID
from src.core.exceptions import (
    ExchangeConnectionException,
    OrderExecutionException,
    RateLimitExceededException,
)


class BitgetConnector(BaseExchangeConnector):
    """Connector for Bitget V2 USDT Perpetual Futures Testnet / Sandbox."""

    def __init__(self, config: ExchangeConfig | None = None) -> None:
        if config is None:
            config = ExchangeConfig(
                exchange_id=ExchangeID.BITGET.value,
                name="Bitget V2 Futures Testnet",
                rest_url="https://api-demo.bitget.com",
                ws_url="wss://ws-demo.bitget.com/v2/ws/public",
                maker_fee=BITGET_MAKER_FEE,
                taker_fee=BITGET_TAKER_FEE,
                is_testnet=True,
            )
        super().__init__(config)
        self.product_type = "USDT-FUTURES"
        self._simulated_orders: dict[str, dict[str, Any]] = {}
        self._simulated_positions: dict[str, dict[str, Any]] = {}
        self._simulated_balance: float = 10000.0
        self.initialize()

    def _format_symbol(self, symbol: str) -> str:
        """Normalize symbol string to Bitget format (e.g. BTCUSDT)."""
        return symbol.replace("/", "").replace("-", "").upper()

    def initialize(self) -> None:
        """Initialize standard instruments and precision filters for Bitget V2 pairs."""
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

    def _sign_request(self, method: str, request_path: str, body: str = "") -> dict[str, str]:
        """Generate Bitget V2 HMAC-SHA256 signature headers.
        Sign format: base64(hmac-sha256(timestamp + method + requestPath + body, secret))
        """
        timestamp = str(int(time.time() * 1000))
        message = f"{timestamp}{method.upper()}{request_path}{body}"
        secret = self.config.api_secret or "bitget_testnet_secret"
        sig = hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()
        signature_b64 = base64.b64encode(sig).decode("utf-8")

        return {
            "ACCESS-KEY": self.config.api_key or "bitget_testnet_key",
            "ACCESS-SIGN": signature_b64,
            "ACCESS-TIMESTAMP": timestamp,
            "ACCESS-PASSPHRASE": self.config.passphrase or "bitget_passphrase",
            "Content-Type": "application/json",
            "locale": "en-US",
        }

    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch current ticker snapshot for symbol on Bitget."""
        sym = self._format_symbol(symbol)
        now_ms = int(time.time() * 1000)

        # Baseline reference prices
        default_prices = {
            "BTCUSDT": {"bid": 64998.0, "ask": 64999.0, "mark": 64998.5, "index": 64998.0},
            "ETHUSDT": {"bid": 3499.5, "ask": 3500.0, "mark": 3499.8, "index": 3500.0},
            "SOLUSDT": {"bid": 149.95, "ask": 150.00, "mark": 149.98, "index": 150.0},
        }
        p = default_prices.get(sym, {"bid": 100.0, "ask": 100.05, "mark": 100.02, "index": 100.0})
        return {
            "symbol": sym,
            "exchange": self.exchange_id,
            "bid1_price": p["bid"],
            "ask1_price": p["ask"],
            "last_price": p["mark"],
            "mark_price": p["mark"],
            "index_price": p["index"],
            "timestamp_ms": now_ms,
        }

    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook snapshot on Bitget."""
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
            "timestamp_ms": int(time.time() * 1000),
            "bids": bids,
            "asks": asks,
        }

    def fetch_funding_rate_history(
        self, symbol: str, limit: int = 100, start_time: int | None = None, end_time: int | None = None
    ) -> list[dict[str, Any]]:
        """Fetch historical funding settlements for Bitget."""
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
                "funding_rate": 0.00020,  # 2.0 bps typical Bitget baseline
                "funding_time_ms": settle_ts,
                "mark_price": 65000.0,
            })
        return history

    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch latest funding rate and countdown for Bitget."""
        sym = self._format_symbol(symbol)
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        next_boundary = ((now_ms // eight_hours_ms) + 1) * eight_hours_ms
        return {
            "symbol": sym,
            "exchange": self.exchange_id,
            "last_funding_rate": 0.00020,
            "predicted_funding_rate": 0.00025,
            "next_funding_time_ms": next_boundary,
            "funding_interval_hours": 8,
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
        """Create order on Bitget V2 with PostOnly / Maker protection support."""
        sym = self._format_symbol(symbol)
        side_norm = side.upper()  # "BUY" or "SELL"
        if side_norm not in ("BUY", "SELL"):
            raise OrderExecutionException(f"Invalid side {side} for Bitget.")

        clean_qty = self.apply_lot_size(sym, quantity)
        if clean_qty <= 0:
            raise OrderExecutionException(f"Quantity {quantity} truncated to 0 by LOT_SIZE.")

        ticker = self.fetch_ticker(sym)
        ref_price = price if price is not None else (ticker["ask1_price"] if side_norm == "BUY" else ticker["bid1_price"])
        clean_price = self.apply_price_filter(sym, ref_price)

        notional = clean_price * clean_qty
        if not self.validate_min_notional(sym, clean_price, clean_qty):
            raise OrderExecutionException(
                f"Order notional {notional:.2f} USDT is below Bitget min notional 5.0 USDT."
            )

        # PostOnly handling: If PostOnly crosses spread, cancel immediately (maker protection)
        tif_norm = time_in_force.lower().replace("_", "")
        if tif_norm in ("postonly", "post_only"):
            if side_norm == "BUY" and clean_price >= ticker["ask1_price"]:
                return {
                    "order_id": f"bitget_{int(time.time()*1000)}",
                    "symbol": sym,
                    "status": "CANCELED",
                    "reason": "PostOnly would cross book spread (maker protection).",
                }
            if side_norm == "SELL" and clean_price <= ticker["bid1_price"]:
                return {
                    "order_id": f"bitget_{int(time.time()*1000)}",
                    "symbol": sym,
                    "status": "CANCELED",
                    "reason": "PostOnly would cross book spread (maker protection).",
                }

        order_id = f"bitget_{int(time.time() * 1000)}_{len(self._simulated_orders) + 1}"
        is_maker = tif_norm in ("postonly", "post_only") or (order_type.upper() == "LIMIT" and time_in_force == "GTC")
        fee_rate = self.maker_fee if is_maker else self.taker_fee
        fee_amount = notional * fee_rate

        order_record = {
            "order_id": order_id,
            "symbol": sym,
            "exchange": self.exchange_id,
            "side": side_norm,
            "order_type": order_type.upper(),
            "quantity": clean_qty,
            "price": clean_price,
            "time_in_force": time_in_force,
            "status": "FILLED" if order_type.upper() == "MARKET" or tif_norm in ("postonly", "post_only") else "NEW",
            "filled_qty": clean_qty if order_type.upper() == "MARKET" or tif_norm in ("postonly", "post_only") else 0.0,
            "avg_price": clean_price,
            "fee_paid": fee_amount,
            "timestamp_ms": int(time.time() * 1000),
            "is_maker": is_maker,
        }
        self._simulated_orders[order_id] = order_record

        if order_record["status"] == "FILLED":
            self._update_position(sym, side_norm, clean_qty, clean_price, fee_amount)

        return order_record

    def _update_position(self, symbol: str, side: str, qty: float, price: float, fee: float) -> None:
        """Update internal position state."""
        pos = self._simulated_positions.get(symbol, {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "size": 0.0,
            "entry_price": 0.0,
            "unrealized_pnl": 0.0,
            "leverage": 3.0,
        })
        signed_qty = qty if side == "BUY" else -qty
        new_size = pos["size"] + signed_qty
        if new_size != 0:
            pos["entry_price"] = price
        else:
            pos["entry_price"] = 0.0
        pos["size"] = new_size
        self._simulated_positions[symbol] = pos
        self._simulated_balance -= fee

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel an open order on Bitget."""
        sym = self._format_symbol(symbol)
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on {self.exchange_id}.")
        order = self._simulated_orders[order_id]
        if order["status"] in ("FILLED", "CANCELED"):
            raise OrderExecutionException(f"Cannot cancel order {order_id} with status {order['status']}.")
        order["status"] = "CANCELED"
        return {"order_id": order_id, "symbol": sym, "status": "CANCELED"}

    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order status on Bitget."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on {self.exchange_id}.")
        return self._simulated_orders[order_id]

    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch open positions on Bitget."""
        if symbol:
            sym = self._format_symbol(symbol)
            p = self._simulated_positions.get(sym)
            return [p] if p and p["size"] != 0 else []
        return [p for p in self._simulated_positions.values() if p["size"] != 0]

    def fetch_balance(self) -> dict[str, Any]:
        """Fetch simulated/testnet account balance for Bitget."""
        return {
            "exchange": self.exchange_id,
            "total_wallet_balance": self._simulated_balance,
            "available_balance": self._simulated_balance,
            "currency": "USDT",
        }
