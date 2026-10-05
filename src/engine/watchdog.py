"""Real-Time Executable Desync Watchdog with 1500ms Lag Monitor and Emergency Market Unwinds.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import logging
import time
from typing import Any

from src.core.constants import DESYNC_WATCHDOG_TIMEOUT_MS
from src.core.exceptions import DesyncWatchdogTimeoutException
from src.engine.interfaces import FillEvent, OrderIntent, OrderSide, OrderType
from src.engine.kill_switch import KillSwitch

logger = logging.getLogger(__name__)


@dataclass
class PairedExecutionTracker:
    pair_id: str
    leg1_intent: dict[str, Any]
    leg2_intent: dict[str, Any]
    leg1_fill: dict[str, Any] | None = None
    leg2_fill: dict[str, Any] | None = None
    dispatched_at: float = field(default_factory=time.time)
    timeout_ms: float = float(DESYNC_WATCHDOG_TIMEOUT_MS)
    status: str = "PENDING_DUAL_SUBMISSION"
    unwind_order_id: str | None = None
    unwind_reason: str | None = None


class DesyncWatchdog:
    """Real-time executable watchdog monitoring dual-leg fill synchronization and triggering sub-500ms unwinds."""

    def __init__(
        self,
        execution_engine: Any | None = None,
        kill_switch: KillSwitch | None = None,
        timeout_ms: float = float(DESYNC_WATCHDOG_TIMEOUT_MS),
    ) -> None:
        self.engine = execution_engine
        self.kill_switch = kill_switch
        self.timeout_ms = timeout_ms
        self.active_pairs: dict[str, PairedExecutionTracker] = {}
        self.history: list[PairedExecutionTracker] = []
        self._async_tasks: list[asyncio.Task] = []

    def register_pair(
        self,
        pair_id: str,
        leg1_intent: dict[str, Any] | OrderIntent,
        leg2_intent: dict[str, Any] | OrderIntent,
    ) -> PairedExecutionTracker:
        """Register a new dual-leg execution pair and launch monitoring timer."""
        l1 = leg1_intent if isinstance(leg1_intent, dict) else {
            "intent_id": leg1_intent.intent_id,
            "exchange": leg1_intent.exchange,
            "symbol": leg1_intent.symbol,
            "side": leg1_intent.side.value if isinstance(leg1_intent.side, OrderSide) else leg1_intent.side,
            "quantity": leg1_intent.quantity,
        }
        l2 = leg2_intent if isinstance(leg2_intent, dict) else {
            "intent_id": leg2_intent.intent_id,
            "exchange": leg2_intent.exchange,
            "symbol": leg2_intent.symbol,
            "side": leg2_intent.side.value if isinstance(leg2_intent.side, OrderSide) else leg2_intent.side,
            "quantity": leg2_intent.quantity,
        }

        tracker = PairedExecutionTracker(
            pair_id=pair_id,
            leg1_intent=l1,
            leg2_intent=l2,
            dispatched_at=time.time(),
            timeout_ms=self.timeout_ms,
            status="PENDING_DUAL_SUBMISSION",
        )
        self.active_pairs[pair_id] = tracker

        # Try to schedule async background task if event loop is running
        try:
            loop = asyncio.get_running_loop()
            task = loop.create_task(self._async_monitor_timeout(pair_id))
            self._async_tasks.append(task)
        except RuntimeError:
            pass  # No running event loop in synchronous test mode

        return tracker

    def on_leg_fill(self, pair_id: str, fill_event: dict[str, Any] | FillEvent) -> str:
        """Process confirmed fill event on one leg of a registered pair."""
        if pair_id not in self.active_pairs:
            return "UNKNOWN_PAIR"

        tracker = self.active_pairs[pair_id]
        fill_dict = fill_event if isinstance(fill_event, dict) else {
            "fill_id": fill_event.fill_id,
            "intent_id": fill_event.intent_id,
            "exchange": fill_event.exchange,
            "symbol": fill_event.symbol,
            "side": fill_event.side.value if isinstance(fill_event.side, OrderSide) else fill_event.side,
            "filled_qty": fill_event.filled_qty,
            "filled_price": fill_event.filled_price,
            "timestamp_utc": fill_event.timestamp_utc,
        }

        intent_id = fill_dict.get("intent_id", "")
        if intent_id == tracker.leg1_intent.get("intent_id"):
            tracker.leg1_fill = fill_dict
            tracker.status = "LEG1_FILLED_LEG2_PENDING" if not tracker.leg2_fill else tracker.status
        elif intent_id == tracker.leg2_intent.get("intent_id"):
            tracker.leg2_fill = fill_dict
            tracker.status = "LEG2_FILLED_LEG1_PENDING" if not tracker.leg1_fill else tracker.status

        # Check if both legs have filled
        if tracker.leg1_fill is not None and tracker.leg2_fill is not None:
            qty1 = float(tracker.leg1_fill.get("filled_qty", 0.0))
            qty2 = float(tracker.leg2_fill.get("filled_qty", 0.0))
            delta_qty = abs(qty1 - qty2)

            if delta_qty <= 1e-6:
                tracker.status = "DUAL_LEG_SYNCED"
                self.history.append(tracker)
                del self.active_pairs[pair_id]
                logger.info(f"Pair {pair_id} successfully synchronized.")
                return "DUAL_LEG_SYNCED"
            else:
                # Asymmetrical partial fill detected
                tracker.status = "PARTIAL_DESYNC"
                self.trigger_emergency_unwind(tracker, reason=f"Asymmetric partial fill: delta={delta_qty:.4f}")
                return "PARTIAL_DESYNC"

        return tracker.status

    def check_timeouts(self, current_time: float | None = None) -> list[str]:
        """Synchronous timeout verification across all active pairs."""
        now = current_time if current_time is not None else time.time()
        timed_out_pairs = []

        for pair_id, tracker in list(self.active_pairs.items()):
            elapsed_ms = (now - tracker.dispatched_at) * 1000.0
            if elapsed_ms >= tracker.timeout_ms:
                if tracker.status != "DUAL_LEG_SYNCED":
                    tracker.status = "TIMEOUT_DESYNC"
                    timed_out_pairs.append(pair_id)
                    self.trigger_emergency_unwind(
                        tracker,
                        reason=f"Leg fill gap exceeded {tracker.timeout_ms:.0f}ms timeout (elapsed {elapsed_ms:.0f}ms)",
                    )

        return timed_out_pairs

    async def _async_monitor_timeout(self, pair_id: str) -> None:
        """Async background task sleeping for timeout duration and triggering unwind if unhedged."""
        tracker = self.active_pairs.get(pair_id)
        if not tracker:
            return

        await asyncio.sleep(tracker.timeout_ms / 1000.0)

        if pair_id in self.active_pairs and tracker.status != "DUAL_LEG_SYNCED":
            tracker.status = "TIMEOUT_DESYNC"
            self.trigger_emergency_unwind(
                tracker,
                reason=f"Execution latency exceeded {tracker.timeout_ms:.0f}ms threshold.",
            )

    def trigger_emergency_unwind(self, tracker: PairedExecutionTracker, reason: str) -> None:
        """Execute immediate sub-500ms emergency market unwind of open orphaned exposure."""
        logger.error(f"🚨 WATCHDOG EMERGENCY UNWIND triggered on {tracker.pair_id}! Reason: {reason}")
        tracker.status = "UNWINDING"
        tracker.unwind_reason = reason

        try:
            # Case 1: Leg 1 filled, Leg 2 pending/failed -> Unwind Leg 1
            if tracker.leg1_fill and not tracker.leg2_fill:
                unwind_side = "SELL" if tracker.leg1_fill["side"] == "BUY" else "BUY"
                if self.engine:
                    self.engine.cancel_order(tracker.leg2_intent["intent_id"])
                    self.engine.submit_emergency_market_unwind(
                        exchange=tracker.leg1_fill["exchange"],
                        symbol=tracker.leg1_fill["symbol"],
                        side=unwind_side,
                        quantity=tracker.leg1_fill["filled_qty"],
                    )
                tracker.status = "UNWOUND_ABORTED"

            # Case 2: Leg 2 filled, Leg 1 pending/failed -> Unwind Leg 2
            elif tracker.leg2_fill and not tracker.leg1_fill:
                unwind_side = "SELL" if tracker.leg2_fill["side"] == "BUY" else "BUY"
                if self.engine:
                    self.engine.cancel_order(tracker.leg1_intent["intent_id"])
                    self.engine.submit_emergency_market_unwind(
                        exchange=tracker.leg2_fill["exchange"],
                        symbol=tracker.leg2_fill["symbol"],
                        side=unwind_side,
                        quantity=tracker.leg2_fill["filled_qty"],
                    )
                tracker.status = "UNWOUND_ABORTED"

            # Case 3: Both filled partially but asymmetrical
            elif tracker.leg1_fill and tracker.leg2_fill:
                qty1 = float(tracker.leg1_fill["filled_qty"])
                qty2 = float(tracker.leg2_fill["filled_qty"])
                delta_qty = qty1 - qty2

                if delta_qty > 0:
                    # Leg 1 has excess long or short
                    unwind_side = "SELL" if tracker.leg1_fill["side"] == "BUY" else "BUY"
                    if self.engine:
                        self.engine.submit_emergency_market_unwind(
                            exchange=tracker.leg1_fill["exchange"],
                            symbol=tracker.leg1_fill["symbol"],
                            side=unwind_side,
                            quantity=delta_qty,
                        )
                elif delta_qty < 0:
                    # Leg 2 has excess
                    unwind_side = "SELL" if tracker.leg2_fill["side"] == "BUY" else "BUY"
                    if self.engine:
                        self.engine.submit_emergency_market_unwind(
                            exchange=tracker.leg2_fill["exchange"],
                            symbol=tracker.leg2_fill["symbol"],
                            side=unwind_side,
                            quantity=abs(delta_qty),
                        )
                tracker.status = "UNWOUND_ABORTED"

            else:
                # Neither leg filled -> Both canceled safely
                if self.engine:
                    self.engine.cancel_order(tracker.leg1_intent["intent_id"])
                    self.engine.cancel_order(tracker.leg2_intent["intent_id"])
                tracker.status = "UNWOUND_ABORTED"

            logger.warning(f"Watchdog successfully neutralized pair {tracker.pair_id}.")

        except Exception as e:
            logger.critical(f"FATAL: Desync unwind execution FAILED for {tracker.pair_id}: {e}")
            tracker.status = "CRITICAL_WATCHDOG_HALT"
            if self.kill_switch:
                self.kill_switch.trip(
                    reason=f"Emergency unwind failure on pair {tracker.pair_id}: {e}",
                    tripped_by="DESYNC_WATCHDOG",
                )

        if tracker.pair_id in self.active_pairs:
            self.history.append(tracker)
            del self.active_pairs[tracker.pair_id]
