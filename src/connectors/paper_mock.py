"""Simulated Paper Execution Layer Fallback with VWAP Orderbook Matching and Funding Settlement.
"""

from __future__ import annotations

import math
import time
from typing import Any

from src.connectors.base import BaseExchangeConnector
from src.core.config import ExchangeConfig
from src.core.constants import ExchangeID
from src.core.exceptions import (
    OrderExecutionException,
    RiskException,
)


class PaperMockConnector(BaseExchangeConnector):
    """Simulated Paper Execution Layer for offline venues (e.g. KuCoin sandbox) and backtest simulation."""

    def __init__(
        self,
        config: ExchangeConfig | None = None,
        latency_ms: float = 50.0,
        initial_balance: float = 10000.0,
    ) -> None:
        if config is None:
            config = ExchangeConfig(
                exchange_id=ExchangeID.PAPER_MOCK.value,
                name="Simulated Paper Execution Layer",
                rest_url="https://testnet.paper-mock.internal",
                ws_url="wss://testnet.paper-mock.internal/ws",
                maker_fee=0.00020,
                taker_fee=0.00050,
                is_testnet=True,
                requires_paper_fallback=True,
            )
        super().__init__(config)
        self.latency_ms = latency_ms
        self.balance: float = initial_balance
        self.equity: float = initial_balance
        self.orders: dict[str, dict[str, Any]] = {}
        self.positions: dict[str, dict[str, Any]] = {}
        self.funding_rates_cache: dict[str, float] = {}
        self.reference_orderbooks: dict[str, dict[str, Any]] = {}
        self.reference_prices: dict[str, float] = {}
        self.initialize()

    def initialize(self) -> None:
        """Initialize standard instruments for simulated environment."""
        self.register_instrument("BTCUSDT", tick_size=0.1, step_size=0.001, min_notional=5.0, contract_value=1.0)
        self.register_instrument("ETHUSDT", tick_size=0.01, step_size=0.001, min_notional=5.0, contract_value=1.0)
        self.register_instrument("SOLUSDT", tick_size=0.01, step_size=0.01, min_notional=5.0, contract_value=1.0)
        self.reference_prices = {"BTCUSDT": 65000.0, "ETHUSDT": 3500.0, "SOLUSDT": 150.0}
        self.funding_rates_cache = {"BTCUSDT": 0.00045, "ETHUSDT": 0.00030, "SOLUSDT": 0.00050}
        self._is_initialized = True

    def set_reference_price(self, symbol: str, price: float) -> None:
        """Set active reference price for symbol."""
        self.reference_prices[symbol] = price

    def set_funding_rate(self, symbol: str, rate: float) -> None:
        """Set current 8h funding rate for symbol."""
        self.funding_rates_cache[symbol] = rate

    def set_orderbook(self, symbol: str, bids: list[list[float]], asks: list[list[float]]) -> None:
        """Set custom L2 orderbook for VWAP fill calculation."""
        self.reference_orderbooks[symbol] = {
            "bids": bids,
            "asks": asks,
            "timestamp_ms": int(time.time() * 1000),
        }

    def fetch_ticker(self, symbol: str) -> dict[str, Any]:
        """Fetch ticker with mark price and book top."""
        ref_price = self.reference_prices.get(symbol, 65000.0)
        meta = self.instruments.get(symbol, {"tick_size": 0.1})
        tick = meta.get("tick_size", 0.1)
        bid1 = round(ref_price - tick, 2)
        ask1 = round(ref_price + tick, 2)
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "bid1_price": bid1,
            "ask1_price": ask1,
            "last_price": ref_price,
            "mark_price": ref_price,
            "index_price": ref_price,
            "timestamp_ms": int(time.time() * 1000),
        }

    def fetch_orderbook(self, symbol: str, limit: int = 50) -> dict[str, Any]:
        """Fetch L2 orderbook."""
        if symbol in self.reference_orderbooks:
            return self.reference_orderbooks[symbol]

        ticker = self.fetch_ticker(symbol)
        mid = ticker["mark_price"]
        meta = self.instruments.get(symbol, {"tick_size": 0.1})
        tick = meta.get("tick_size", 0.1)
        bids = [[round(mid - i * tick, 2), round(2.0 + i * 0.25, 3)] for i in range(1, limit + 1)]
        asks = [[round(mid + i * tick, 2), round(2.0 + i * 0.25, 3)] for i in range(1, limit + 1)]
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
        """Fetch historical funding rate entries."""
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        latest_boundary = (now_ms // eight_hours_ms) * eight_hours_ms
        rate = self.funding_rates_cache.get(symbol, 0.00045)
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
                "funding_rate": rate,
                "funding_time_ms": settle_ts,
                "mark_price": self.reference_prices.get(symbol, 65000.0),
            })
        return history

    def fetch_current_funding_rate(self, symbol: str) -> dict[str, Any]:
        """Fetch current funding rate."""
        now_ms = int(time.time() * 1000)
        eight_hours_ms = 8 * 3600 * 1000
        next_boundary = ((now_ms // eight_hours_ms) + 1) * eight_hours_ms
        rate = self.funding_rates_cache.get(symbol, 0.00045)
        return {
            "symbol": symbol,
            "exchange": self.exchange_id,
            "last_funding_rate": rate,
            "predicted_funding_rate": rate,
            "next_funding_time_ms": next_boundary,
            "timestamp_ms": now_ms,
        }

    def calculate_vwap_fill_price(self, symbol: str, side: str, quantity: float) -> tuple[float, float]:
        """Walk L2 orderbook to compute realistic VWAP execution price and filled quantity.
        Returns: (vwap_price, executed_qty).
        """
        ob = self.fetch_orderbook(symbol)
        levels = ob["asks"] if side == "BUY" else ob["bids"]
        
        remaining_qty = quantity
        total_cost = 0.0
        filled_qty = 0.0

        for price, size in levels:
            take_qty = min(remaining_qty, size)
            total_cost += take_qty * price
            filled_qty += take_qty
            remaining_qty -= take_qty
            if remaining_qty <= 1e-9:
                break

        if filled_qty <= 0:
            ticker = self.fetch_ticker(symbol)
            fallback_price = ticker["ask1_price"] if side == "BUY" else ticker["bid1_price"]
            return fallback_price, quantity

        vwap = total_cost / filled_qty
        return vwap, filled_qty

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
        """Execute order against simulated L2 orderbook with VWAP matching."""
        side_norm = side.upper()
        type_norm = order_type.upper()
        clean_qty = self.apply_lot_size(symbol, quantity)
        if clean_qty <= 0:
            raise OrderExecutionException(f"Quantity {quantity} truncated to 0 by lot size.")

        ticker = self.fetch_ticker(symbol)
        ref_price = price if price is not None else ticker["mark_price"]
        clean_price = self.apply_price_filter(symbol, ref_price)

        notional = clean_price * clean_qty
        if not self.validate_min_notional(symbol, clean_price, clean_qty):
            raise OrderExecutionException(
                f"Order notional {notional:.2f} is below min notional 5.0."
            )

        order_id = f"paper_{int(time.time() * 1000)}_{len(self.orders) + 1}"
        
        if type_norm == "MARKET":
            fill_price, executed_qty = self.calculate_vwap_fill_price(symbol, side_norm, clean_qty)
            fee_rate = self.taker_fee
            fee_paid = fill_price * executed_qty * fee_rate
            status = "FILLED" if executed_qty >= clean_qty - 1e-6 else "PARTIALLY_FILLED"
        else:
            # Limit order
            fill_price = clean_price
            executed_qty = clean_qty
            fee_rate = self.maker_fee if time_in_force == "PostOnly" else self.taker_fee
            fee_paid = fill_price * executed_qty * fee_rate
            status = "NEW"

        order_record = {
            "order_id": order_id,
            "symbol": symbol,
            "exchange": self.exchange_id,
            "side": side_norm,
            "order_type": type_norm,
            "quantity": clean_qty,
            "price": clean_price,
            "time_in_force": time_in_force,
            "status": status,
            "filled_qty": executed_qty if status in ("FILLED", "PARTIALLY_FILLED") else 0.0,
            "avg_price": fill_price,
            "fee_paid": fee_paid if status in ("FILLED", "PARTIALLY_FILLED") else 0.0,
            "timestamp_ms": int(time.time() * 1000),
            "simulated_latency_ms": self.latency_ms,
        }
        self.orders[order_id] = order_record

        if status in ("FILLED", "PARTIALLY_FILLED"):
            self._update_position(symbol, side_norm, executed_qty, fill_price, fee_paid)

        return order_record

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Cancel order."""
        if order_id not in self.orders:
            raise OrderExecutionException(f"Order {order_id} not found.")
        order = self.orders[order_id]
        if order["status"] in ("FILLED", "CANCELED"):
            raise OrderExecutionException(f"Order {order_id} cannot be canceled in state {order['status']}.")
        order["status"] = "CANCELED"
        return {"order_id": order_id, "symbol": symbol, "status": "CANCELED"}

    def fetch_order_status(self, symbol: str, order_id: str) -> dict[str, Any]:
        """Fetch order details."""
        if order_id not in self.orders:
            raise OrderExecutionException(f"Order {order_id} not found.")
        return self.orders[order_id]

    def fetch_positions(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """Fetch active positions."""
        if symbol:
            pos = self.positions.get(symbol)
            return [pos] if pos and abs(pos["position_amt"]) > 1e-6 else []
        return [p for p in self.positions.values() if abs(p["position_amt"]) > 1e-6]

    def fetch_balance(self) -> dict[str, Any]:
        """Fetch wallet and margin balance."""
        return {
            "exchange": self.exchange_id,
            "total_wallet_balance": self.balance,
            "available_balance": self.balance,
            "currency": "USDT",
        }

    def settle_funding_cashflow(self, symbol: str, funding_rate: float | None = None) -> float:
        """Settle 8-hour funding cash flow on open position at settlement timestamp:
        Delta_Balance = -1 * Position_Size * Mark_Price * Funding_Rate
        Returns realized funding cashflow.
        """
        pos = self.positions.get(symbol)
        if not pos or abs(pos["position_amt"]) < 1e-6:
            return 0.0

        fr = funding_rate if funding_rate is not None else self.funding_rates_cache.get(symbol, 0.00045)
        mark_price = self.reference_prices.get(symbol, pos["entry_price"])
        notional = pos["position_amt"] * mark_price
        cash_flow = -1.0 * notional * fr

        self.balance += cash_flow
        return cash_flow

    def _update_position(self, symbol: str, side: str, qty: float, price: float, fee: float) -> None:
        """Update simulated position."""
        current = self.positions.get(symbol, {
            "symbol": symbol,
            "position_amt": 0.0,
            "entry_price": 0.0,
            "unrealized_pnl": 0.0,
            "leverage": 1.0,
        })
        current_amt = current["position_amt"]
        delta = qty if side == "BUY" else -qty
        new_amt = current_amt + delta

        if abs(new_amt) < 1e-6:
            current["position_amt"] = 0.0
            current["entry_price"] = 0.0
        else:
            if current_amt == 0:
                current["entry_price"] = price
            elif (current_amt > 0 and delta > 0) or (current_amt < 0 and delta < 0):
                total_cost = (abs(current_amt) * current["entry_price"]) + (qty * price)
                current["entry_price"] = total_cost / abs(new_amt)
            current["position_amt"] = new_amt

        self.positions[symbol] = current
        self.balance -= fee
