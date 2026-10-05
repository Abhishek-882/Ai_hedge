"""Strategy-Agnostic Execution Engine and Order Router.
"""

from __future__ import annotations

import datetime
import logging
import time
from typing import Any

from src.connectors.base import BaseExchangeConnector
from src.core.exceptions import (
    KillSwitchLockedException,
    OrderExecutionException,
    RiskException,
)
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
from src.engine.watchdog import DesyncWatchdog

logger = logging.getLogger(__name__)


class ExecutionEngine:
    """Orchestrates strategy event dispatch, pre-trade risk checks, order routing, and desync protection."""

    def __init__(
        self,
        connectors: dict[str, BaseExchangeConnector] | list[BaseExchangeConnector],
        risk_manager: RiskManager | None = None,
        kill_switch: KillSwitch | None = None,
        watchdog: DesyncWatchdog | None = None,
    ) -> None:
        if isinstance(connectors, list):
            self.connectors = {c.exchange_id: c for c in connectors}
        else:
            self.connectors = connectors

        self.kill_switch = kill_switch or KillSwitch()
        self.risk = risk_manager or RiskManager(kill_switch=self.kill_switch)
        self.watchdog = watchdog or DesyncWatchdog(execution_engine=self, kill_switch=self.kill_switch)
        self.watchdog.engine = self

        self.strategies: dict[str, BaseStrategy] = {}
        self.active_orders: dict[str, dict[str, Any]] = {}
        self.pending_dependent_intents: dict[str, OrderIntent] = {}
        self.unwind_history: list[dict[str, Any]] = []

    def register_strategy(self, strategy: BaseStrategy, config: dict[str, Any] | None = None) -> None:
        """Register and initialize a research strategy."""
        cfg = config or {}
        strategy.initialize(cfg)
        strategy.is_initialized = True
        self.strategies[strategy.strategy_id] = strategy
        logger.info(f"Registered strategy: {strategy.strategy_id}")

    def get_total_equity(self) -> float:
        """Calculate aggregate wallet balance across all connected venues."""
        total = 0.0
        for conn in self.connectors.values():
            try:
                bal = conn.fetch_balance()
                total += float(bal.get("total_wallet_balance", bal.get("available_balance", 0.0)))
            except Exception as e:
                logger.warning(f"Error fetching balance from {conn.exchange_id}: {e}")
        return total if total > 0 else 10000.0

    def get_all_positions(self) -> list[dict[str, Any]]:
        """Fetch all open positions across venues."""
        all_pos = []
        for conn in self.connectors.values():
            try:
                pos_list = conn.fetch_positions()
                all_pos.extend(pos_list)
            except Exception as e:
                logger.warning(f"Error fetching positions from {conn.exchange_id}: {e}")
        return all_pos

    def submit_order_intent(self, intent: OrderIntent, strategy_type: str = "delta_neutral") -> dict[str, Any]:
        """Validate pre-trade risk and route order to target exchange connector."""
        # 1. Assert kill-switch is unlocked
        self.kill_switch.assert_unlocked()

        # 2. Check if this intent is dependent on another intent filling first (Maker-Taker routing)
        if intent.dependent_on_intent_id:
            parent_id = intent.dependent_on_intent_id
            parent_order = self.active_orders.get(parent_id)
            if not parent_order or parent_order.get("status") not in ("FILLED", "Filled"):
                self.pending_dependent_intents[parent_id] = intent
                logger.info(
                    f"Queued dependent taker intent {intent.intent_id} ({intent.exchange} {intent.side.value}) "
                    f"waiting for maker fill on {parent_id}."
                )
                return {
                    "intent_id": intent.intent_id,
                    "status": "QUEUED_DEPENDENT",
                    "dependent_on": parent_id,
                    "exchange": intent.exchange,
                    "symbol": intent.symbol,
                }

        # 3. Check connector availability
        if intent.exchange not in self.connectors:
            raise OrderExecutionException(f"Connector for venue '{intent.exchange}' is not registered.")
        connector = self.connectors[intent.exchange]

        # 3. Market price query
        ticker = connector.fetch_ticker(intent.symbol)
        market_price = float(ticker.get("mark_price", ticker.get("last_price", 100.0)))

        # 4. Pre-trade Risk Validation
        equity = self.get_total_equity()
        positions = self.get_all_positions()
        self.risk.validate_order_intent(
            intent=intent,
            equity=equity,
            active_positions=positions,
            market_price=market_price,
            strategy_type=strategy_type,
        )

        # 5. Route order to connector
        order_res = connector.create_order(
            symbol=intent.symbol,
            side=intent.side.value if isinstance(intent.side, OrderSide) else intent.side,
            order_type=intent.order_type.value if isinstance(intent.order_type, OrderType) else intent.order_type,
            quantity=intent.quantity,
            price=intent.limit_price,
            time_in_force=intent.time_in_force,
        )
        self.active_orders[intent.intent_id] = order_res

        # 6. If filled immediately (e.g. MARKET order), notify strategy and watchdog
        if order_res.get("status") in ("FILLED", "Filled"):
            fill_event = FillEvent(
                fill_id=f"fill_{order_res.get('order_id')}",
                order_id=str(order_res.get("order_id")),
                intent_id=intent.intent_id,
                exchange=intent.exchange,
                symbol=intent.symbol,
                side=intent.side,
                filled_qty=float(order_res.get("filled_qty", intent.quantity)),
                filled_price=float(order_res.get("avg_price", market_price)),
                fee_paid=float(order_res.get("fee_paid", 0.0)),
                fee_asset="USDT",
                timestamp_utc=datetime.datetime.now(datetime.timezone.utc),
            )
            self.process_fill(fill_event)

        return order_res

    def cancel_order(self, intent_id: str) -> dict[str, Any]:
        """Cancel an open order by intent ID."""
        if intent_id not in self.active_orders:
            return {"status": "NOT_FOUND"}
        order = self.active_orders[intent_id]
        exchange = order.get("exchange")
        symbol = order.get("symbol")
        order_id = order.get("order_id")
        if exchange in self.connectors and order_id and symbol:
            try:
                return self.connectors[exchange].cancel_order(symbol, str(order_id))
            except Exception as e:
                logger.warning(f"Error canceling order {order_id} on {exchange}: {e}")
        return {"status": "CANCELED"}

    def submit_emergency_market_unwind(
        self,
        exchange: str,
        symbol: str,
        side: str,
        quantity: float,
    ) -> dict[str, Any]:
        """Submit immediate aggressive market order to unwind naked position."""
        if exchange not in self.connectors:
            raise OrderExecutionException(f"Cannot unwind on unregistered exchange {exchange}.")
        connector = self.connectors[exchange]

        logger.warning(f"Executing Emergency Market Unwind on {exchange} {symbol} {side} {quantity}...")
        res = connector.create_order(
            symbol=symbol,
            side=side,
            order_type="MARKET",
            quantity=quantity,
            time_in_force="IOC",
        )
        self.unwind_history.append({
            "exchange": exchange,
            "symbol": symbol,
            "side": side,
            "quantity": quantity,
            "result": res,
            "timestamp_ms": int(time.time() * 1000),
        })
        return res

    def process_fill(self, fill: FillEvent) -> None:
        """Propagate confirmed fill to active strategies and watchdog."""
        # 1. Update strategies
        for strat in self.strategies.values():
            try:
                strat.on_fill(fill)
            except Exception as e:
                logger.error(f"Strategy {strat.strategy_id} error on_fill: {e}")

        # 2. Update watchdog for paired execution tracking
        for pair_id in list(self.watchdog.active_pairs.keys()):
            self.watchdog.on_leg_fill(pair_id, fill)

        # 3. Check for queued dependent taker intents (Maker-to-Taker execution)
        if fill.intent_id in self.pending_dependent_intents:
            dep_intent = self.pending_dependent_intents.pop(fill.intent_id)
            # Match executed quantity to eliminate partial fill legging risk
            dep_intent.quantity = fill.filled_qty
            dep_intent.dependent_on_intent_id = None
            logger.info(
                f"Maker leg {fill.intent_id} filled ({fill.filled_qty} @ {fill.filled_price}). "
                f"Immediately dispatching dependent taker intent {dep_intent.intent_id} ({dep_intent.exchange} {dep_intent.side.value})!"
            )
            try:
                self.submit_order_intent(dep_intent)
            except Exception as e:
                logger.error(f"Error executing dependent taker intent {dep_intent.intent_id}: {e}")

    def dispatch_market_event(self, event: MarketEvent) -> list[dict[str, Any]]:
        """Dispatch ticker/orderbook update to strategies and execute returned intents."""
        executed = []
        for strat in self.strategies.values():
            try:
                intents = strat.on_market_event(event)
                for intent in intents:
                    res = self.submit_order_intent(intent)
                    executed.append(res)
            except Exception as e:
                logger.error(f"Strategy {strat.strategy_id} error on_market_event: {e}")
        return executed

    def dispatch_funding_snapshot(self, event: FundingSnapshotEvent) -> list[dict[str, Any]]:
        """Dispatch funding rate snapshot event to strategies and route intents."""
        executed = []
        for strat in self.strategies.values():
            try:
                intents = strat.on_funding_snapshot(event)
                # Check for paired execution
                paired_intents = [it for it in intents if it.paired_intent_id]
                if len(paired_intents) >= 2:
                    pair_id = paired_intents[0].paired_intent_id or f"pair_{int(time.time()*1000)}"
                    self.watchdog.register_pair(pair_id, paired_intents[0], paired_intents[1])

                for intent in intents:
                    res = self.submit_order_intent(intent)
                    executed.append(res)
            except Exception as e:
                logger.error(f"Strategy {strat.strategy_id} error on_funding_snapshot: {e}")
        return executed
