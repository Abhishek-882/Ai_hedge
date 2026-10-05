"""Standard Agent Memo format, parser, and validator for inter-agent communication.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from src.core.constants import AgentPersona, MemoPosition
from src.core.exceptions import InvalidAgentMemoException
from src.storage.database import DatabaseManager, get_db
from src.storage.models import AgentStateAuditModel

VALID_AGENTS = {a.value for a in AgentPersona}
VALID_POSITIONS = {p.value for p in MemoPosition}


@dataclass
class AgentMemo:
    memo_id: str
    from_agent: str
    to_agent: str
    re_topic: str
    position: str
    evidence: str
    signature: str
    failure_scenario: str | None = None
    remediation: str | None = None

    def __post_init__(self) -> None:
        self.from_agent = self.from_agent.upper().strip()
        self.to_agent = self.to_agent.upper().strip()
        self.position = self.position.lower().strip()

    def validate(self) -> None:
        validate_memo(self)

    def to_audit_model(self, idea_id: str, phase: str = "general") -> AgentStateAuditModel:
        # Extract git commit and timestamp from signature
        sig_parts = re.split(r"\s+[—–-]+\s+", self.signature)
        commit = sig_parts[-1] if len(sig_parts) >= 3 else "unknown"
        ts = sig_parts[1] if len(sig_parts) >= 2 else datetime.now(timezone.utc).isoformat()
        
        return AgentStateAuditModel(
            memo_id=self.memo_id,
            from_agent=self.from_agent,
            to_agent=self.to_agent,
            idea_id=idea_id,
            phase=phase,
            position=self.position,
            evidence=self.evidence,
            failure_scenario=self.failure_scenario,
            remediation=self.remediation,
            git_commit=commit,
            created_at_utc=ts,
        )


def validate_memo(memo: AgentMemo) -> None:
    """Validates memo structure, agent identities, veto failure scenarios, and signature syntax.

    Raises:
        InvalidAgentMemoException: If any field fails validation.
    """
    if not memo.memo_id or not memo.memo_id.strip():
        raise InvalidAgentMemoException("Memo ID cannot be empty.")

    if memo.from_agent not in VALID_AGENTS:
        raise InvalidAgentMemoException(
            f"Invalid FROM agent '{memo.from_agent}'. Must be one of {sorted(VALID_AGENTS)}"
        )

    # TO agent can be a valid agent, SWARM, or OVERSEER
    allowed_recipients = VALID_AGENTS | {"SWARM", "ALL"}
    if memo.to_agent not in allowed_recipients:
        raise InvalidAgentMemoException(
            f"Invalid TO recipient '{memo.to_agent}'. Must be one of {sorted(allowed_recipients)}"
        )

    if memo.position not in VALID_POSITIONS:
        raise InvalidAgentMemoException(
            f"Invalid POSITION '{memo.position}'. Must be one of {sorted(VALID_POSITIONS)}"
        )

    if not memo.re_topic or not memo.re_topic.strip():
        raise InvalidAgentMemoException("RE topic line cannot be empty.")

    if not memo.evidence or not memo.evidence.strip():
        raise InvalidAgentMemoException("EVIDENCE field is mandatory and cannot be empty.")

    # VETO rules: Failure scenario AND Remediation are mandatory
    if memo.position == MemoPosition.VETO.value:
        if not memo.failure_scenario or not memo.failure_scenario.strip() or memo.failure_scenario.lower() in ("none", "n/a", "null"):
            raise InvalidAgentMemoException(
                "MANDATORY VETO REQUIREMENT: FAILURE SCENARIO is required and cannot be empty when POSITION is veto."
            )
        if not memo.remediation or not memo.remediation.strip() or memo.remediation.lower() in ("none", "n/a", "null"):
            raise InvalidAgentMemoException(
                "MANDATORY VETO REQUIREMENT: REMEDIATION is required and cannot be empty when POSITION is veto."
            )

    # Signature verification: format must be <Agent> — <Timestamp> — <Commit>
    if not memo.signature or not memo.signature.strip():
        raise InvalidAgentMemoException("SIGNATURE cannot be empty.")

    sig_parts = re.split(r"\s+[—–-]+\s+", memo.signature.strip())
    if len(sig_parts) < 3:
        raise InvalidAgentMemoException(
            f"Invalid SIGNATURE format '{memo.signature}'. Expected: '<Agent> — <Timestamp> — <Commit>'"
        )

    sig_agent = sig_parts[0].strip().upper()
    if sig_agent != memo.from_agent:
        raise InvalidAgentMemoException(
            f"SIGNATURE agent mismatch: FROM agent is '{memo.from_agent}' but signature is '{sig_agent}'"
        )


def format_memo(memo: AgentMemo) -> str:
    """Formats an AgentMemo into markdown format matching the 8-field spec."""
    memo.validate()
    failure_scen = memo.failure_scenario if memo.failure_scenario else "N/A"
    remed = memo.remediation if memo.remediation else "N/A"

    return (
        f"## AGENT MEMO #{memo.memo_id}\n"
        f"- FROM: {memo.from_agent}\n"
        f"- TO: {memo.to_agent}\n"
        f"- RE: {memo.re_topic}\n"
        f"- POSITION: {memo.position}\n"
        f"- EVIDENCE: {memo.evidence}\n"
        f"- FAILURE SCENARIO: {failure_scen}\n"
        f"- REMEDIATION: {remed}\n"
        f"- SIGNATURE: {memo.signature}\n"
    )


def parse_memo(memo_text: str) -> AgentMemo:
    """Parses a single markdown memo block into an AgentMemo object.

    Raises:
        InvalidAgentMemoException: If markdown syntax is invalid or fields are missing.
    """
    lines = [line.strip() for line in memo_text.strip().splitlines() if line.strip()]
    if not lines:
        raise InvalidAgentMemoException("Empty memo text.")

    header_match = re.match(r"^##\s+AGENT\s+MEMO\s+#?([A-Za-z0-9_-]+)", lines[0], re.IGNORECASE)
    if not header_match:
        raise InvalidAgentMemoException(f"Missing or invalid memo header: '{lines[0]}'")

    memo_id = header_match.group(1).strip()
    fields: dict[str, str] = {}

    current_key = None
    for line in lines[1:]:
        field_match = re.match(r"^-\s*([A-Za-z\s_]+(?:\([^)]*\))?)\s*:\s*(.*)$", line)
        if field_match:
            raw_key = field_match.group(1).strip().upper()
            val = field_match.group(2).strip()
            # Normalize key using exact or prefix matching
            if raw_key.startswith("FROM"):
                current_key = "FROM"
            elif raw_key.startswith("TO"):
                current_key = "TO"
            elif raw_key == "RE" or raw_key.startswith("RE "):
                current_key = "RE"
            elif raw_key.startswith("POSITION"):
                current_key = "POSITION"
            elif raw_key.startswith("EVIDENCE"):
                current_key = "EVIDENCE"
            elif raw_key.startswith("FAILURE"):
                current_key = "FAILURE SCENARIO"
            elif raw_key.startswith("REMEDIATION"):
                current_key = "REMEDIATION"
            elif raw_key.startswith("SIGNATURE"):
                current_key = "SIGNATURE"
            else:
                current_key = raw_key

            fields[current_key] = val
        elif current_key:
            # Multi-line continuation
            fields[current_key] += " " + line

    required_keys = ["FROM", "TO", "RE", "POSITION", "EVIDENCE", "SIGNATURE"]
    for k in required_keys:
        if k not in fields:
            raise InvalidAgentMemoException(f"Missing mandatory field '{k}' in memo #{memo_id}")

    fail_scen = fields.get("FAILURE SCENARIO")
    if fail_scen and fail_scen.upper() in ("N/A", "NONE", "NULL"):
        fail_scen = None

    remed = fields.get("REMEDIATION")
    if remed and remed.upper() in ("N/A", "NONE", "NULL"):
        remed = None

    memo = AgentMemo(
        memo_id=memo_id,
        from_agent=fields["FROM"],
        to_agent=fields["TO"],
        re_topic=fields["RE"],
        position=fields["POSITION"],
        evidence=fields["EVIDENCE"],
        failure_scenario=fail_scen,
        remediation=remed,
        signature=fields["SIGNATURE"],
    )
    memo.validate()
    return memo


def parse_debate_file(debate_path: Path | str) -> list[AgentMemo]:
    """Parses all Agent Memos contained in a DEBATE.md file."""
    path = Path(debate_path)
    if not path.exists():
        return []

    content = path.read_text(encoding="utf-8")
    blocks = re.split(r"(?=^##\s+AGENT\s+MEMO)", content, flags=re.MULTILINE)
    memos: list[AgentMemo] = []

    for block in blocks:
        block_clean = block.strip()
        if block_clean.startswith("## AGENT MEMO") or block_clean.startswith("## AGENT_MEMO"):
            memos.append(parse_memo(block_clean))

    return memos


def append_memo_to_debate(
    debate_path: Path | str,
    memo: AgentMemo,
    db: DatabaseManager | None = None,
    idea_id: str = "general",
    phase: str = "general",
) -> None:
    """Appends an Agent Memo to the idea's DEBATE.md file and logs it into SQLite agent_state_audit."""
    memo.validate()
    path = Path(debate_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    formatted = format_memo(memo)
    with open(path, "a", encoding="utf-8") as f:
        f.write("\n" + formatted + "\n")

    # Persist to database if provided or default db
    try:
        database = db or get_db()
        database.insert_agent_state_audit(memo.to_audit_model(idea_id=idea_id, phase=phase))
    except Exception as e:
        # SQLite persistence logging
        pass
