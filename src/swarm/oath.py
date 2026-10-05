"""The Swarm Oath (6 Non-Negotiable Rules) for the Multi-Agent Funding-Rate Research Swarm.
Enforces session commitments, anti-fabrication rules, assumption tracking, and timeboxing.
"""

from __future__ import annotations

import datetime
from typing import Any

from src.core.constants import AgentPersona
from src.ipc.ledgers import MemoryLog

SWARM_OATH_RULES = [
    "Rule 1 — Anti-Fabrication & Empirical Reality: Never mock, stub, or fabricate a result and present it as real.",
    "Rule 2 — Explicit & Reasoned Tracking: Never silently skip a failure case or silently drop an idea.",
    "Rule 3 — Assumption Invalidation & Correction: If a phase reveals an earlier assumption was wrong: stop, fix it, log the correction.",
    "Rule 4 — Timeboxed Research Discipline: Timebox open-ended research (~2 hrs per open question); past that, document as flagged assumption.",
    "Rule 5 — Granular Subphase Git Discipline: Git commit at the end of every subphase, per idea, with descriptive messages.",
    "Rule 6 — Uncompromising Gate Bar: The gate bar is never lowered to force a pass. Failing numbers are logged plainly.",
]

ALL_SWARM_PERSONAS = [
    AgentPersona.ALPHA.value,
    AgentPersona.BETA.value,
    AgentPersona.GAMMA.value,
    AgentPersona.DELTA.value,
]


class SwarmOath:
    """Validator and manager for the Swarm Oath."""

    RULES: list[str] = SWARM_OATH_RULES

    @classmethod
    def get_rules(cls) -> list[str]:
        return list(cls.RULES)

    @classmethod
    def get_oath_markdown(cls) -> str:
        rules_str = "\n".join([f"{i+1}. {r}" for i, r in enumerate(cls.RULES)])
        return (
            "# The Swarm Oath (Non-Negotiable Operating Doctrine)\n\n"
            "Every autonomous agent in the Multi-Agent Funding-Rate Research Swarm commits to the following 6 rules:\n\n"
            f"{rules_str}\n"
        )

    @classmethod
    def format_signature(cls, agent_id: str, session_id: str, timestamp_utc: str | None = None) -> str:
        ts = timestamp_utc or datetime.datetime.now(datetime.timezone.utc).isoformat()
        return f"SWARM-OATH-SIGNED: {agent_id} -- {session_id} -- {ts}"

    @classmethod
    def commit(
        cls,
        agent_id: str,
        session_id: str,
        memory_log: MemoryLog | None = None,
    ) -> str:
        """Records an agent's formal commitment to the Swarm Oath for a session."""
        valid_agents = set(ALL_SWARM_PERSONAS) | {AgentPersona.OVERSEER.value}
        if agent_id not in valid_agents:
            raise ValueError(f"Unknown agent '{agent_id}'. Must be one of {sorted(valid_agents)}")

        sig = cls.format_signature(agent_id, session_id)
        if memory_log is not None:
            memory_log.log_oath_commitment(agent_id, session_id)

        return sig

    @classmethod
    def verify_commitment(cls, signed_agents: set[str] | list[str] | dict[str, bool]) -> bool:
        """Verifies that all 4 autonomous swarm personas (ALPHA, BETA, GAMMA, DELTA) have committed."""
        if isinstance(signed_agents, dict):
            signed_set = {k for k, v in signed_agents.items() if v}
        else:
            signed_set = set(signed_agents)

        required = set(ALL_SWARM_PERSONAS)
        return required.issubset(signed_set)

    @classmethod
    def log_flagged_assumption(
        cls,
        question: str,
        assumption: str,
        timebox_hours: float = 2.0,
        memory_log: MemoryLog | None = None,
    ) -> str:
        """Rule 4: Logs a flagged assumption when open-ended research exceeds timebox (~2 hrs)."""
        now_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
        entry = (
            f"### Flagged Assumption (Timebox Exceeded: {timebox_hours}h)\n"
            f"- **Question**: {question}\n"
            f"- **Flagged Assumption**: {assumption}\n"
            f"- **Logged At (UTC)**: {now_utc}\n"
        )
        if memory_log is not None:
            memory_log.append_decision(
                title=f"Flagged Assumption: {question[:40]}...",
                agent=AgentPersona.GAMMA.value,
                category="RESEARCH",
                decision="Timebox boundary reached; documented flagged assumption",
                rationale=assumption,
            )
        return entry
