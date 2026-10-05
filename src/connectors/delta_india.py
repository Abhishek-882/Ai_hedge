"""Delta India Testnet Connector with FIU-compliant Lot Multiplier and Contract Value Sizing.
"""

from __future__ import annotations

import math
import time
from typing import Any

from src.connectors.base import BaseExchangeConnector
from src.core.config import ExchangeConfig
from src.core.constants import ExchangeID
from src.core.exceptions import (
    ExchangeConnectionException,
    OrderExecutionException,
    RateLimitExceededException,
)


class DeltaIndiaConnector(BaseExchangeConnector):
    """Connector for Delta Exchange India Testnet (FIU-compliant)."""

    def __init__(self, config: ExchangeConfig | None = None) -> None:
        if config is None:
            config = ExchangeConfig(
                exchange_id=ExchangeID.DELTA_INDIA.value,
                name="Delta Exchange India Testnet",
                rest_url="https://testnet-api.delta.exchange",
                ws_url="wss://testnet-socket.delta.exchange",
                maker_fee=0.00020,
                taker_fee=0.00050,
                is_testnet=True,
            )
        super().__init__(config)
        self._simulated_orders: dict[str, dict[str, Any]] = {}
        self._simulated_positions: dict[str, dict[str, Any]] = {}
        self._simulated_balance: float = 10000.0
        self.initialize()

    def initialize(self) -> None:
        """Initialize standard instruments with contract_value lot multipliers."""
        # BTCUSD / BTCUSDT: 1 contract = 0.001 BTC
        self.register_instrument(
            symbol="BTCUSDT",
            tick_size=0.50,
            step_size=1.0,  # Contracts are integers
            min_notional=5.0,
            price_precision=2,
            quantity_precision=0,  # Integer contract lots
            contract_value=0.001,  # 1 contract = 0.001 BTC
        )
        # ETHUSDT: 1 contract = 0.01 ETH
        self.register_instrument(
            symbol="ETHUSDT",
            tick_size=0.05,
            step_size=1.0,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=0,
            contract_value=0.01,
        )
        # SOLUSDT: 1 contract = 0.1 SOL
        self.register_instrument(
            symbol="SOLUSDT",
            tick_size=0.01,
            step_size=1.0,
            min_notional=5.0,
            price_precision=2,
            quantity_precision=0,
            contract_value=0.1,
        )
        self._is_initialized = True

    def calculate_contract_lots(self, symbol: str, target_base_qty: float) -> int:
        """Map target underlying base asset quantity (e.g. 0.05 BTC) to integer contract lots."""
        meta = self.instruments.get(symbol, {})
        contract_val = float(meta.get("contract_value", 1.0))
        if contract_val <= 0:
            return int(round(target_base_qty))
        lots = round(target_base_qty / contract_val)
        return max(1, int(lots))

    def calculate_base_qty(self, symbol: str, contract_lots: int | float) -> float:
        """Convert integer contract lots to underlying base asset quantity."""
        meta = self.instruments.get(symbol, {})
        contract_val = float(meta.get("contract_value", 1.0))
        return round(float(contract_lots) * contract_val, 6)

    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch ticker snapshot from Delta India."""
        now_ms = int(time.time() * 1000)
        default_prices = {
            "BTCUSDT": {"bid": 65000.0, "ask": 65001.5, "mark": 65000.8, "index": 65000.0},
            "ETHUSDT": {"bid": 3500.0, "ask": 3500.25, "mark": 3500.1, "index": 3500.0},
            "SOLUSDT": {"bid": 150.0, "ask": 150.06, "mark": 150.03, "index": 150.0},
        }
        p = default_prices.get(symbol, {"bid": 100.0, "ask": 100.05, "mark": 100.02, "index": 100.0})
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "bid1_price": p["bid"],
            "ask1_price": p["ask"],
            "last_price": p["mark"],
            "mark_price": p["mark"],
            "index_price": p["index"],
            "contract_value": self.get_contract_multiplier(symbol),
            "timestamp_ms": now_ms,
        }

    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook snapshot."""
        ticker = self.fetch_ticker(symbol)
        mid = ticker["mark_price"]
        meta = self.instruments.get(symbol, {"tick_size": 0.5})
        tick = meta.get("tick_size", 0.5)

        bids = [[round(mid - i * tick, 2), int(100 + i * 15)] for i in range(1, limit + 1)]
        asks = [[round(mid + i * tick, 2), int(100 + i * 15)] for i in range(1, limit + 1)]

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
        """Fetch historical funding rate settlements."""
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
                "symbol": symbol,
                "exchange": self.exchange_id,
                "funding_rate": 0.00035,
                "funding_time_ms": settle_ts,
                "mark_price": 65000.0,
            })
        return history

    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch current funding rate."""
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        next_boundary = ((now_ms // eight_hours_ms) + 1) * eight_hours_ms
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "last_funding_rate": 0.00035,
            "predicted_funding_rate": 0.00035,
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
        """Submit order with Delta contract lot conversion."""
        side_norm = side.upper()
        if side_norm not in ("BUY", "SELL"):
            raise OrderExecutionException(f"Invalid side {side} for Delta India.")

        # Quantity can be passed either as raw contracts or as base quantity
        # If float and quantity < 1.0 (e.g. 0.05 BTC), convert to contract lots
        meta = self.instruments.get(symbol, {})
        contract_val = float(meta.get("contract_value", 1.0))

        if quantity < 1.0 and contract_val < 1.0:
            lots = self.calculate_contract_lots(symbol, quantity)
        else:
            lots = int(round(quantity))

        if lots <= 0:
            raise OrderExecutionException(f"Contract lots {lots} must be positive.")

        base_qty = self.calculate_base_qty(symbol, lots)
        ticker = self.fetch_ticker(symbol)
        ref_price = price if price is not None else (ticker["ask1_price"] if side_norm == "BUY" else ticker["bid1_price"])
        clean_price = self.apply_price_filter(symbol, ref_price)

        notional = clean_price * base_qty
        if not self.validate_min_notional(symbol, clean_price, base_qty):
            raise OrderExecutionException(
                f"Order notional {notional:.2f} USD is below Delta min notional 5.0 USD."
            )

        order_id = f"delta_{int(time.time() * 1000)}_{len(self._simulated_orders) + 1}"
        fee_rate = self.maker_fee if order_type.upper() in ("LIMIT", "POST_ONLY") else self.taker_fee
        fee_amount = notional * fee_rate

        is_market = order_type.upper() == "MARKET"
        order_record = {
            "order_id": order_id,
            "symbol": symbol,
            "exchange": self.exchange_id,
            "side": side_norm,
            "order_type": order_type.upper(),
            "quantity": float(lots),  # In lots
            "base_quantity": base_qty,
            "price": clean_price,
            "time_in_force": time_in_force,
            "status": "FILLED" if is_market else "NEW",
            "filled_qty": float(lots) if is_market else 0.0,
            "avg_price": clean_price,
            "fee_paid": fee_amount if is_market else 0.0,
            "timestamp_ms": int(time.time() * 1000),
        }
        self._simulated_orders[order_id] = order_record

        if order_record["status"] == "FILLED":
            self._update_position(symbol, side_norm, base_qty, clean_price, fee_amount)

        return order_record

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel order on Delta India."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on Delta India.")
        order = self._simulated_orders[order_id]
        if order["status"] in ("FILLED", "CANCELED"):
            raise OrderExecutionException(f"Cannot cancel order {order_id} with status {order['status']}.")
        order["status"] = "CANCELED"
        return {"order_id": order_id, "symbol": symbol, "status": "CANCELED"}

    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order details."""
        if order_id not in self._simulated_orders:
            raise OrderExecutionException(f"Order {order_id} not found on Delta India.")
        return self._simulated_orders[order_id]

    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch positions."""
        if symbol:
            pos = self._simulated_positions.get(symbol)
            return [pos] if pos and abs(pos["size"]) > 1e-6 else []
        return [p for p in self._simulated_positions.values() if abs(p["size"]) > 1e-6]

    def fetch_balance(self) -> dict[str, Any]:
        """Fetch balance."""
        return {
            "exchange": self.exchange_id,
            "total_wallet_balance": self._simulated_balance,
            "available_balance": self._simulated_balance,
            "currency": "USDT",
        }

    def _update_position(self, symbol: str, side: str, base_qty: float, price: float, fee: float) -> None:
        """Update internal position state."""
        current = self._simulated_positions.get(symbol, {
            "symbol": symbol,
            "size": 0.0,
            "entry_price": 0.0,
            "leverage": 1.0,
        })
        current_amt = current["size"]
        delta = base_qty if side == "BUY" else -base_qty
        new_amt = current_amt + delta

        if abs(new_amt) < 1e-6:
            current["size"] = 0.0
            current["entry_price"] = 0.0
        else:
            if current_amt == 0:
                current["entry_price"] = price
            elif (current_amt > 0 and delta > 0) or (current_amt < 0 and delta < 0):
                total_cost = (abs(current_amt) * current["entry_price"]) + (base_qty * price)
                current["entry_price"] = total_cost / abs(new_amt)
            current["size"] = new_amt

        self._simulated_positions[symbol] = current
        self._simulated_balance -= fee
