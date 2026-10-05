"""Dual-Persistence Crash-Resistant Kill-Switch (SQLite State + Hard Disk Latch).
"""

from __future__ import annotations

import datetime
import json
import logging
from pathlib import Path
from typing import Any

from src.core.constants import KILL_SWITCH_LATCH_FILENAME
from src.core.exceptions import KillSwitchLockedException
from src.storage.database import DatabaseManager

logger = logging.getLogger(__name__)


class KillSwitch:
    """Crash-resistant kill-switch ensuring atomic state persistence across SQLite and disk latch."""

    def __init__(
        self,
        db: DatabaseManager | None = None,
        db_manager: DatabaseManager | None = None,
        latch_path: str = KILL_SWITCH_LATCH_FILENAME,
    ) -> None:
        self.db = db if db is not None else db_manager
        self.latch_file = Path(latch_path)

    def is_locked(self) -> bool:
        """Check whether the kill-switch is currently engaged in either SQLite or disk latch."""
        # 1. Check physical disk latch
        if self.latch_file.exists():
            return True

        # 2. Check SQLite state persistence
        if self.db is not None:
            try:
                state = self.db.get_kill_switch_state()
                if state and state.is_tripped == 1:
                    return True
            except Exception as e:
                logger.error(f"Error reading kill-switch database state: {e}")
                return True

        return False

    def assert_unlocked(self) -> None:
        """Raise KillSwitchLockedException if the kill-switch is active."""
        if self.is_locked():
            reason = self.get_trip_reason()
            raise KillSwitchLockedException(
                f"Kill-Switch is LOCKED! Startup and trading forbidden until Human Overseer unlocks. Reason: {reason}"
            )

    def get_trip_reason(self) -> str:
        """Retrieve the recorded trip reason from disk latch or SQLite."""
        if self.latch_file.exists():
            try:
                content = self.latch_file.read_text(encoding="utf-8")
                data = json.loads(content)
                return str(data.get("trip_reason", "Disk latch active without reason."))
            except Exception:
                return "Disk latch file present."

        if self.db is not None:
            try:
                state = self.db.get_kill_switch_state()
                if state and state.is_tripped == 1:
                    return state.trip_reason or "SQLite kill switch active."
            except Exception:
                pass

        return "Unknown kill-switch trip reason."

    def trip(
        self,
        reason: str,
        tripped_by: str = "SYSTEM",
        lock_payload: dict[str, Any] | None = None,
    ) -> None:
        """Atomically trip the kill-switch: write disk latch file and commit to SQLite."""
        now_str = datetime.datetime.now(datetime.timezone.utc).isoformat()
        payload = lock_payload or {}

        logger.critical(f"🚨 KILL-SWITCH TRIPPED by {tripped_by}! Reason: {reason}")

        # 1. Write disk latch file
        latch_data = {
            "is_tripped": 1,
            "trip_reason": reason,
            "tripped_by": tripped_by,
            "tripped_at_utc": now_str,
            "lock_payload": payload,
        }
        try:
            self.latch_file.write_text(json.dumps(latch_data, indent=2), encoding="utf-8")
        except Exception as e:
            logger.critical(f"Failed to write disk latch file: {e}")

        # 2. Commit SQLite state
        if self.db is not None:
            try:
                self.db.set_kill_switch_state(
                    is_tripped=True,
                    trip_reason=reason,
                    tripped_by=tripped_by,
                    lock_payload_json=json.dumps(payload),
                )
            except Exception as e:
                logger.critical(f"Failed to commit kill-switch to SQLite: {e}")

    def unlock(self, overseer_token: str) -> bool:
        """Unlock the kill switch. Requires valid Overseer authorization token."""
        if not overseer_token or len(overseer_token.strip()) < 4:
            logger.error("Unlock rejected: invalid or empty Overseer token.")
            return False

        logger.warning(f"🔓 Kill-Switch UNLOCK initiated by token '{overseer_token[:4]}***'")

        # 1. Remove disk latch file
        if self.latch_file.exists():
            try:
                self.latch_file.unlink()
            except Exception as e:
                logger.error(f"Failed to remove disk latch file: {e}")
                return False

        # 2. Reset SQLite state
        if self.db is not None:
            try:
                self.db.set_kill_switch_state(
                    is_tripped=False,
                    trip_reason=None,
                    tripped_by=None,
                    lock_payload_json=None,
                )
            except Exception as e:
                logger.error(f"Failed to reset kill-switch in SQLite: {e}")
                return False

        logger.info("Kill-Switch successfully unlocked and disarmed.")
        return True
