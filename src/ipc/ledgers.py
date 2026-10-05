"""Ledger hierarchy managers: STATUS.md, MEMORY.md, docs/IDEAS.md, docs/PLAN_CHANGELOG.md.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class StatusBoard:
    """Manages /project/STATUS.md - overwritten/updated each session."""

    def __init__(self, file_path: Path | str = "STATUS.md"):
        self.file_path = Path(file_path)

    def write_status(
        self,
        session_title: str,
        active_ideas_summary: list[dict[str, str]],
        blocked_items: list[str],
        next_actions: list[str],
        needs_human_input: list[str],
        plan_update_proposals: list[str] | None = None,
    ) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        now_utc = datetime.now(timezone.utc).isoformat()

        ideas_table = "| ID | Name | Current State | Phase | Gate Verdict |\n|---|---|---|---|---|\n"
        for item in active_ideas_summary:
            ideas_table += f"| {item.get('id', '')} | {item.get('name', '')} | {item.get('state', '')} | {item.get('phase', '')} | {item.get('verdict', 'PENDING')} |\n"

        blocked_md = "\n".join([f"- 🔴 {b}" for b in blocked_items]) if blocked_items else "- None (all unblocked)"
        actions_md = "\n".join([f"- 🟢 {a}" for a in next_actions]) if next_actions else "- None"
        human_md = "\n".join([f"- ⚠️ {h}" for h in needs_human_input]) if needs_human_input else "- None"
        proposals_md = "\n".join([f"- 💡 {p}" for p in (plan_update_proposals or [])]) if plan_update_proposals else "- None"

        content = (
            f"# SWARM STATUS BOARD — {session_title}\n\n"
            f"**Last Updated (UTC):** `{now_utc}`\n\n"
            f"## 1. Active Strategy Pipeline Status\n\n"
            f"{ideas_table}\n"
            f"## 2. Blocked Items\n\n"
            f"{blocked_md}\n\n"
            f"## 3. Immediate Next Actions\n\n"
            f"{actions_md}\n\n"
            f"## 4. Needs Human Input (Overseer Escalation)\n\n"
            f"{human_md}\n\n"
            f"## 5. Plan Update Proposals\n\n"
            f"{proposals_md}\n"
        )
        self.file_path.write_text(content, encoding="utf-8")


class MemoryLog:
    """Manages /project/MEMORY.md - append-only decision log."""

    def __init__(self, file_path: Path | str = "MEMORY.md"):
        self.file_path = Path(file_path)

    def append_decision(
        self,
        title: str,
        agent: str,
        category: str,
        decision: str,
        rationale: str,
        artifacts: list[str] | None = None,
    ) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        now_utc = datetime.now(timezone.utc).isoformat()
        artifacts_str = ", ".join(artifacts) if artifacts else "N/A"

        entry = (
            f"\n### [{now_utc}] {title}\n"
            f"- **Agent:** `{agent}`\n"
            f"- **Category:** `{category}`\n"
            f"- **Decision:** {decision}\n"
            f"- **Rationale:** {rationale}\n"
            f"- **Referenced Artifacts:** {artifacts_str}\n"
        )

        with open(self.file_path, "a", encoding="utf-8") as f:
            f.write(entry)

    def log_oath_commitment(self, agent: str, session_id: str) -> None:
        """Logs formal oath signing prior to session work."""
        self.append_decision(
            title=f"The Swarm Oath Commitment — Session {session_id}",
            agent=agent,
            category="SWARM_OATH",
            decision="Committed to all 6 Rules of the Swarm Oath: Anti-mocking, Explicit status, Assumption correction, Timeboxing, Subphase commits, Immutable gate bar.",
            rationale="Mandatory protocol compliance before engaging in research or code execution.",
        )


class IdeasRegistry:
    """Manages docs/IDEAS.md - table format backlog registry."""

    def __init__(self, file_path: Path | str = "docs/IDEAS.md"):
        self.file_path = Path(file_path)

    def initialize_if_missing(self) -> None:
        if not self.file_path.exists():
            self.write_registry([])

    def write_registry(self, ideas: list[dict[str, str]]) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        header = (
            "# Strategy Ideas Backlog Registry\n\n"
            "| ID | Strategy Name | Source | Category | Status | Phase | Lead Agent | Target Venues | Priority |\n"
            "|---|---|---|---|---|---|---|---|---|\n"
        )
        rows = ""
        for i in ideas:
            rows += (
                f"| {i.get('id', '')} | {i.get('name', '')} | {i.get('source', '')} | "
                f"{i.get('category', '')} | {i.get('status', 'backlog')} | {i.get('phase', 'Phase A')} | "
                f"{i.get('lead', 'GAMMA')} | {i.get('venues', 'Binance, Bybit')} | {i.get('priority', '1')} |\n"
            )

        content = header + (rows if rows else "| | | | | | | | | |\n")
        self.file_path.write_text(content, encoding="utf-8")


class PlanChangelog:
    """Manages docs/PLAN_CHANGELOG.md - append-only log of plan modifications."""

    def __init__(self, file_path: Path | str = "docs/PLAN_CHANGELOG.md"):
        self.file_path = Path(file_path)

    def append_change(
        self,
        change_title: str,
        tier: str,  # 'Autonomous' or 'Overseer'
        proposer: str,
        cosigner: str,
        change_description: str,
        rationale: str,
    ) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        now_utc = datetime.now(timezone.utc).isoformat()

        entry = (
            f"\n## [{now_utc}] {change_title}\n"
            f"- **Tier:** `{tier}`\n"
            f"- **Proposer:** `{proposer}`\n"
            f"- **Co-signer:** `{cosigner}`\n"
            f"- **Change:** {change_description}\n"
            f"- **Rationale:** {rationale}\n"
        )

        with open(self.file_path, "a", encoding="utf-8") as f:
            f.write(entry)
