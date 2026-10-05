"""5-State Directory State Machine governing strategy lifecycles (/backlog -> /resolved).
"""

from __future__ import annotations

import json
import logging
import re
import shutil
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.core.constants import (
    AgentPersona,
    IdeaDirectoryState,
    MemoPosition,
)
from src.core.exceptions import (
    InvalidStateTransitionException,
    StateRollbackException,
)
from src.core.guardrails import assert_risk_caps, assert_tos_compliance
from src.ipc.memo import AgentMemo, parse_debate_file

logger = logging.getLogger(__name__)

VALID_STATES = {s.value for s in IdeaDirectoryState}

# Required sign-off quorums per phase / state transition
PHASE_SIGN_OFFS = {
    "PHASE_A": {AgentPersona.GAMMA.value, AgentPersona.BETA.value},
    "PHASE_B": {AgentPersona.GAMMA.value, AgentPersona.DELTA.value, AgentPersona.BETA.value},
    "PHASE_C": {AgentPersona.ALPHA.value, AgentPersona.GAMMA.value, AgentPersona.BETA.value},
    "PHASE_D": {AgentPersona.BETA.value, AgentPersona.ALPHA.value, AgentPersona.DELTA.value},
    "GATE": {
        AgentPersona.ALPHA.value,
        AgentPersona.BETA.value,
        AgentPersona.GAMMA.value,
        AgentPersona.DELTA.value,
    },
}


@dataclass
class IdeaStateRecord:
    idea_id: str
    current_state: str = IdeaDirectoryState.BACKLOG.value
    current_phase: str = "INTAKE"
    signatures: list[str] = field(default_factory=list)
    history: list[dict[str, Any]] = field(default_factory=list)
    risk_caps: dict[str, Any] = field(default_factory=dict)
    gate_verdict: str | None = None
    last_updated_utc: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_markdown(self) -> str:
        sigs_md = "\n".join([f"- {s}" for s in self.signatures]) if self.signatures else "- None"
        caps_md = "\n".join([f"- **{k}**: {v}" for k, v in self.risk_caps.items()]) if self.risk_caps else "- None"
        
        hist_md = ""
        for h in self.history:
            hist_md += f"- **{h.get('timestamp_utc', '')}**: {h.get('from_state', '')} -> {h.get('to_state', '')} ({h.get('reason', '')})\n"
        if not hist_md:
            hist_md = "- Initialized"

        return (
            f"# IDEA STATE: {self.idea_id}\n\n"
            f"**Current State:** `{self.current_state}`  \n"
            f"**Current Phase:** `{self.current_phase}`  \n"
            f"**Gate Verdict:** `{self.gate_verdict or 'PENDING'}`  \n"
            f"**Last Updated (UTC):** `{self.last_updated_utc}`  \n\n"
            f"## Risk Caps Intake\n"
            f"{caps_md}\n\n"
            f"## Verified Signatures\n"
            f"{sigs_md}\n\n"
            f"## Transition History\n"
            f"{hist_md}\n"
        )

    @classmethod
    def from_markdown(cls, text: str, idea_id: str = "") -> IdeaStateRecord:
        state_match = re.search(r"\*\*Current State:\*\*\s*`([^`]+)`", text)
        phase_match = re.search(r"\*\*Current Phase:\*\*\s*`([^`]+)`", text)
        gate_match = re.search(r"\*\*Gate Verdict:\*\*\s*`([^`]+)`", text)
        updated_match = re.search(r"\*\*Last Updated \(UTC\):\*\*\s*`([^`]+)`", text)

        state = state_match.group(1).strip() if state_match else IdeaDirectoryState.BACKLOG.value
        phase = phase_match.group(1).strip() if phase_match else "INTAKE"
        gate = gate_match.group(1).strip() if gate_match else None
        updated = updated_match.group(1).strip() if updated_match else datetime.now(timezone.utc).isoformat()

        # Extract signatures
        sigs: list[str] = []
        sigs_section = re.search(r"## Verified Signatures\s*(.*?)(?=##|$)", text, re.DOTALL)
        if sigs_section:
            for line in sigs_section.group(1).splitlines():
                line = line.strip()
                if line.startswith("-") and not line.startswith("- None"):
                    sigs.append(line.lstrip("- ").strip())

        # Extract risk caps
        caps: dict[str, Any] = {}
        caps_section = re.search(r"## Risk Caps Intake\s*(.*?)(?=##|$)", text, re.DOTALL)
        if caps_section:
            for line in caps_section.group(1).splitlines():
                cap_match = re.search(r"\*\*([A-Za-z0-9_-]+)\*\*:\s*([0-9.]+)", line)
                if cap_match:
                    k = cap_match.group(1).strip()
                    val = float(cap_match.group(2).strip())
                    caps[k] = val
        # Extract history
        history: list[dict[str, Any]] = []
        hist_section = re.search(r"## Transition History\s*(.*?)(?=##|$)", text, re.DOTALL)
        if hist_section:
            for line in hist_section.group(1).splitlines():
                line = line.strip()
                if line.startswith("-") and not line.startswith("- Initialized") and not line.startswith("- None"):
                    h_match = re.search(r"\*\*([^*]+)\*\*:\s*([^\s]+)\s*->\s*([^\s(]+)(?:\s*\((.*)\))?", line)
                    if h_match:
                        history.append({
                            "timestamp_utc": h_match.group(1).strip(),
                            "from_state": h_match.group(2).strip(),
                            "to_state": h_match.group(3).strip(),
                            "reason": h_match.group(4).strip() if h_match.group(4) else "",
                        })

        return cls(
            idea_id=idea_id,
            current_state=state,
            current_phase=phase,
            signatures=sigs,
            history=history,
            risk_caps=caps,
            gate_verdict=gate,
            last_updated_utc=updated,
        )


def load_idea_state(idea_dir: Path | str) -> IdeaStateRecord:
    path = Path(idea_dir)
    state_file = path / "STATE.md"
    idea_id = path.name

    if state_file.exists():
        content = state_file.read_text(encoding="utf-8")
        return IdeaStateRecord.from_markdown(content, idea_id=idea_id)
    return IdeaStateRecord(idea_id=idea_id)


def save_idea_state(idea_dir: Path | str, state: IdeaStateRecord) -> None:
    path = Path(idea_dir)
    path.mkdir(parents=True, exist_ok=True)
    state.last_updated_utc = datetime.now(timezone.utc).isoformat()
    state_file = path / "STATE.md"
    state_file.write_text(state.to_markdown(), encoding="utf-8")


def filter_latest_memos_for_phase(memos: list[AgentMemo], target_phase: str) -> dict[str, AgentMemo]:
    """Filters memos relevant to target_phase from DEBATE.md and returns the latest memo per from_agent.
    Matches phase keywords in memo.re_topic (e.g., 'Phase A', 'PHASE_A', 'Gate', etc.).
    """
    phase_normalized = target_phase.upper().replace("_", " ")  # e.g. "PHASE A", "GATE"
    phase_alt = target_phase.upper()  # e.g. "PHASE_A", "GATE"

    latest_by_agent: dict[str, AgentMemo] = {}
    for m in memos:
        topic_upper = m.re_topic.upper()
        matches = False

        if phase_normalized in topic_upper or phase_alt in topic_upper:
            matches = True
        elif target_phase == "PHASE_A" and "CONCEPT" in topic_upper:
            matches = True
        elif target_phase == "PHASE_B" and ("DATA" in topic_upper or "FEE" in topic_upper):
            matches = True
        elif target_phase == "PHASE_C" and "BACKTEST" in topic_upper:
            matches = True
        elif target_phase == "PHASE_D" and ("RISK" in topic_upper or "WATCHDOG" in topic_upper or "DESYNC" in topic_upper):
            matches = True
        elif target_phase == "GATE" and "GATE" in topic_upper:
            matches = True

        if matches:
            latest_by_agent[m.from_agent] = m

    return latest_by_agent


class IdeaStateMachine:
    """Controls directory transitions (/backlog -> /audit -> /approved -> /paper -> /resolved)
    and enforces signature verification and automatic DELTA rollbacks.
    """

    def __init__(self, base_ideas_dir: Path | str = "docs/ideas"):
        self.base_ideas_dir = Path(base_ideas_dir)

    def transition(
        self,
        idea_dir: Path | str,
        target_state: str,
        target_phase: str | None = None,
        memos: list[AgentMemo] | None = None,
        risk_caps: dict[str, Any] | None = None,
        reason: str = "",
    ) -> IdeaStateRecord:
        """Executes a state transition with strict signature and guardrail verification.
        Rolls back automatically on failure.

        Raises:
            InvalidStateTransitionException: If preconditions or signatures fail.
            StateRollbackException: If an unauthorized movement requires hard reset.
        """
        path = Path(idea_dir)
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)

        target_state = target_state.lower().strip()
        if target_state not in VALID_STATES:
            raise InvalidStateTransitionException(f"Invalid target state '{target_state}'")

        current_record = load_idea_state(path)
        from_state = current_record.current_state
        backup_record = IdeaStateRecord(**asdict(current_record))

        # Check memos from DEBATE.md if not passed
        is_direct_memos = memos is not None
        active_memos = memos if is_direct_memos else parse_debate_file(path / "DEBATE.md")

        try:
            # Validate all active memos for syntax and signature integrity
            for m in active_memos:
                m.validate()

            # 1. Transition: ANY -> AUDIT
            if target_state == IdeaDirectoryState.AUDIT.value:
                caps_to_check = risk_caps or current_record.risk_caps
                if not caps_to_check:
                    raise InvalidStateTransitionException(
                        "Cannot transition to /audit: Risk caps missing (max_drawdown_pct, position_size_cap_usd, leverage_cap required)."
                    )
                assert_risk_caps(caps_to_check)
                current_record.risk_caps = caps_to_check

            # 2. Transition: AUDIT subphase completion checks
            if target_phase in PHASE_SIGN_OFFS:
                required_agents = PHASE_SIGN_OFFS[target_phase]
                if is_direct_memos:
                    latest_phase_memos = {m.from_agent: m for m in active_memos}
                else:
                    latest_phase_memos = filter_latest_memos_for_phase(active_memos, target_phase)

                approving_agents = set()
                for agent, m in latest_phase_memos.items():
                    if m.position == MemoPosition.VETO.value:
                        raise InvalidStateTransitionException(
                            f"Phase {target_phase} blocked by VETO from {m.from_agent}: {m.failure_scenario}"
                        )
                    if m.position == MemoPosition.APPROVE.value:
                        approving_agents.add(m.from_agent)

                missing_approvals = required_agents - approving_agents
                if missing_approvals:
                    raise InvalidStateTransitionException(
                        f"Cannot complete {target_phase}: Missing required approvals from {sorted(missing_approvals)}"
                    )

            # 3. Transition: AUDIT -> APPROVED (Gate Pass)
            if target_state == IdeaDirectoryState.APPROVED.value:
                gate_agents = PHASE_SIGN_OFFS["GATE"]
                if is_direct_memos:
                    latest_gate_memos = {m.from_agent: m for m in active_memos}
                else:
                    latest_gate_memos = filter_latest_memos_for_phase(active_memos, "GATE")

                approving_agents = set()
                for agent, m in latest_gate_memos.items():
                    if m.position == MemoPosition.VETO.value:
                        # Veto fails the gate immediately
                        backup_record.gate_verdict = "FAIL"
                        backup_record.history.append({
                            "from_state": from_state,
                            "to_state": from_state,
                            "phase": "GATE",
                            "reason": f"Gate failed due to VETO from {m.from_agent}: {m.failure_scenario}",
                            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                        })
                        save_idea_state(path, backup_record)
                        raise InvalidStateTransitionException(
                            f"Gate Decision vetoed by {m.from_agent}: {m.failure_scenario}"
                        )
                    if m.position == MemoPosition.APPROVE.value:
                        approving_agents.add(m.from_agent)

                missing_gate_approvals = gate_agents - approving_agents
                if missing_gate_approvals:
                    raise InvalidStateTransitionException(
                        f"Gate requires unanimous 4-agent approval. Missing: {sorted(missing_gate_approvals)}"
                    )
                current_record.gate_verdict = "PASS"

            # 4. Transition: APPROVED -> PAPER
            if target_state == IdeaDirectoryState.PAPER.value:
                if from_state != IdeaDirectoryState.APPROVED.value and current_record.gate_verdict != "PASS":
                    raise InvalidStateTransitionException(
                        "Cannot transition to /paper: Idea must pass Gate Decision first."
                    )

            # Record signatures from approved memos
            for m in active_memos:
                if m.position == MemoPosition.APPROVE.value:
                    if m.signature not in current_record.signatures:
                        current_record.signatures.append(m.signature)

            # Update state record
            current_record.current_state = target_state
            if target_phase:
                current_record.current_phase = target_phase

            current_record.history.append({
                "from_state": from_state,
                "to_state": target_state,
                "phase": target_phase or current_record.current_phase,
                "reason": reason or f"Transitioned to {target_state}",
                "timestamp_utc": datetime.now(timezone.utc).isoformat(),
            })

            save_idea_state(path, current_record)
            logger.info(f"Idea {current_record.idea_id} transitioned successfully: {from_state} -> {target_state}")
            return current_record

        except Exception as e:
            # DELTA Rollback
            logger.error(f"DELTA ROLLBACK TRIGGERED for {current_record.idea_id}: {e}")
            save_idea_state(path, backup_record)
            if isinstance(e, InvalidStateTransitionException):
                raise
            raise StateRollbackException(f"State transition aborted and rolled back by DELTA: {e}") from e
