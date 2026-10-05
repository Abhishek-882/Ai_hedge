"""Consensus, Quorum Verification, Adaptive Planning, and Conflict Escalation for the Swarm.
Implements the 4-agent quorum, gate evaluation, 2-tier planning loop, and deadlock escalation.
"""

from __future__ import annotations

import datetime
from typing import Any

from src.core.constants import AgentPersona, MemoPosition
from src.ipc.ledgers import MemoryLog, PlanChangelog, StatusBoard
from src.ipc.memo import AgentMemo

PHASE_QUORUMS = {
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

AUTONOMOUS_TIER_CATEGORIES = {
    "backlog_priority_reorder",
    "add_agent_researched_idea",
    "phase_timebox_adjustment",
    "data_source_endpoint_swap",
}

OVERSEER_TIER_CATEGORIES = {
    "exchange_addition_or_removal",
    "core_stack_change",
    "delete_idea_from_backlog",
    "risk_cap_or_leverage_change",
    "scope_expansion",
    "guardrail_modification",
}


class QuorumVerifier:
    """Verifies signature quorums and evaluates Gate decisions."""

    @classmethod
    def verify_phase_sign_offs(
        cls,
        phase: str,
        approving_agents: set[str] | list[str],
    ) -> tuple[bool, list[str]]:
        """Verifies if the required sign-off quorum is met for a phase."""
        phase_key = phase.upper().replace(" ", "_")
        if phase_key not in PHASE_QUORUMS:
            raise ValueError(f"Unknown pipeline phase '{phase}'")

        required = PHASE_QUORUMS[phase_key]
        approved_set = set(approving_agents)
        missing = sorted(required - approved_set)
        return (len(missing) == 0, missing)

    @classmethod
    def evaluate_gate_decision(
        cls,
        regime_expectancies: dict[str, float],
        worst_case_drawdown_pct: float,
        max_drawdown_cap_pct: float,
        memos: list[AgentMemo],
    ) -> dict[str, Any]:
        """Evaluates formal Gate Decision criteria:
        1. Positive net expectancy in >= 2 of 4 historical regimes.
        2. Worst-case drawdown <= stated max drawdown cap.
        3. Unanimous 4-agent approval (zero vetoes).
        Single veto = Gate Fail. Bar is NEVER lowered.
        """
        # 1. Regimes check: >= 2 positive
        positive_regimes = [
            reg_id for reg_id, exp in regime_expectancies.items() if exp > 0.0
        ]
        regimes_pass = len(positive_regimes) >= 2

        # 2. Drawdown check: worst <= cap
        drawdown_pass = worst_case_drawdown_pct <= max_drawdown_cap_pct

        # 3. Quorum check: Unanimous 4 agents & zero vetoes
        approvals = set()
        vetoes: list[dict[str, str]] = []

        for m in memos:
            m.validate()
            if m.position == MemoPosition.VETO.value:
                vetoes.append({
                    "agent": m.from_agent,
                    "failure_scenario": m.failure_scenario or "Unspecified failure scenario",
                    "remediation": m.remediation or "Unspecified remediation",
                })
            elif m.position == MemoPosition.APPROVE.value:
                approvals.add(m.from_agent)

        gate_quorum_required = PHASE_QUORUMS["GATE"]
        missing_signers = sorted(gate_quorum_required - approvals)
        quorum_pass = (len(missing_signers) == 0) and (len(vetoes) == 0)

        is_gate_pass = regimes_pass and drawdown_pass and quorum_pass

        return {
            "verdict": "PASS" if is_gate_pass else "FAIL",
            "is_passed": is_gate_pass,
            "regimes_summary": {
                "positive_regimes_count": len(positive_regimes),
                "positive_regimes": positive_regimes,
                "passes_regimes_hurdle": regimes_pass,
            },
            "drawdown_summary": {
                "worst_case_drawdown_pct": worst_case_drawdown_pct,
                "max_drawdown_cap_pct": max_drawdown_cap_pct,
                "passes_drawdown_hurdle": drawdown_pass,
            },
            "quorum_summary": {
                "approving_agents": sorted(approvals),
                "missing_signers": missing_signers,
                "vetoes": vetoes,
                "passes_quorum": quorum_pass,
            },
            "evaluated_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }


class AdaptivePlanningLoop:
    """Manages 2-tier plan modifications: Autonomous Tier vs Overseer Tier."""

    def __init__(
        self,
        changelog: PlanChangelog | None = None,
        status_board: StatusBoard | None = None,
    ):
        self.changelog = changelog
        self.status_board = status_board

    def propose_autonomous_change(
        self,
        category: str,
        title: str,
        proposer: str,
        cosigner: str,
        description: str,
        rationale: str,
    ) -> dict[str, Any]:
        """Autonomous Tier: requires 1 proposer + 1 cosigner; writes to PLAN_CHANGELOG.md."""
        if category not in AUTONOMOUS_TIER_CATEGORIES:
            raise ValueError(
                f"Category '{category}' is not an Autonomous Tier action. Must be proposed to Overseer."
            )

        valid_agents = {
            AgentPersona.ALPHA.value,
            AgentPersona.BETA.value,
            AgentPersona.GAMMA.value,
            AgentPersona.DELTA.value,
        }
        if proposer not in valid_agents or cosigner not in valid_agents:
            raise ValueError(f"Proposer and co-signer must be valid swarm agents: {valid_agents}")
        if proposer == cosigner:
            raise ValueError("Autonomous Tier modification requires two distinct agents (proposer != cosigner).")

        if self.changelog is not None:
            self.changelog.append_change(
                change_title=title,
                tier="Autonomous",
                proposer=proposer,
                cosigner=cosigner,
                change_description=description,
                rationale=rationale,
            )

        return {
            "status": "APPROVED",
            "tier": "Autonomous",
            "category": category,
            "title": title,
            "proposer": proposer,
            "cosigner": cosigner,
            "executed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    def propose_overseer_change(
        self,
        category: str,
        title: str,
        proposer: str,
        description: str,
        rationale: str,
    ) -> dict[str, Any]:
        """Overseer Tier: structural changes proposed to Overseer in STATUS.md."""
        if category not in OVERSEER_TIER_CATEGORIES:
            raise ValueError(f"Category '{category}' must be in {OVERSEER_TIER_CATEGORIES}")

        proposal = {
            "status": "PROPOSAL_PENDING_OVERSEER",
            "tier": "Overseer",
            "category": category,
            "title": title,
            "proposer": proposer,
            "description": description,
            "rationale": rationale,
            "proposed_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

        return proposal


class ConflictEscalationProtocol:
    """Handles technical debates and deadlocks (>2 rounds) across agent memos."""

    def __init__(self, status_board: StatusBoard | None = None, memory_log: MemoryLog | None = None):
        self.status_board = status_board
        self.memory_log = memory_log
        self._debate_rounds: dict[str, list[AgentMemo]] = {}

    def record_memo(self, topic_key: str, memo: AgentMemo) -> dict[str, Any]:
        """Records an agent memo and detects deadlock if rounds exceed 2 without consensus."""
        if topic_key not in self._debate_rounds:
            self._debate_rounds[topic_key] = []
        self._debate_rounds[topic_key].append(memo)

        memos = self._debate_rounds[topic_key]
        vetoes = [m for m in memos if m.position == MemoPosition.VETO.value]

        # A deadlock occurs if there are >= 2 conflicting veto/debate rounds on the same topic
        if len(memos) >= 3 and len(vetoes) >= 2:
            return self.declare_deadlock(topic_key, memos)

        return {
            "status": "DEBATING",
            "topic_key": topic_key,
            "rounds_count": len(memos),
            "is_deadlocked": False,
        }

    def declare_deadlock(self, topic_key: str, memos: list[AgentMemo]) -> dict[str, Any]:
        """Declares an unresolved deadlock, logs to STATUS.md under Needs Human Input, and unblocks swarm."""
        positions = [f"- **{m.from_agent}** ({m.position}): {m.evidence} | Veto note: {m.failure_scenario or 'None'}" for m in memos]
        escalation_item = (
            f"DEADLOCK on {topic_key} (>2 debate rounds without consensus):\n" + "\n".join(positions)
        )

        if self.memory_log is not None:
            self.memory_log.append_decision(
                title=f"Conflict Deadlock: {topic_key}",
                agent="SWARM",
                category="IPC_CONSENSUS",
                decision="Deadlock declared after >2 debate rounds; escalated to Overseer",
                rationale=escalation_item,
            )

        return {
            "status": "DEADLOCKED",
            "topic_key": topic_key,
            "rounds_count": len(memos),
            "is_deadlocked": True,
            "escalation_summary": escalation_item,
            "next_action": "Branch swarm to next unblocked backlog idea",
        }


class PaperTradingConsensus:
    """Manages Phase E anomaly votes and triggers emergency pauses on 2-agent agreement."""

    def __init__(self, status_board: StatusBoard | None = None, memory_log: MemoryLog | None = None):
        self.status_board = status_board
        self.memory_log = memory_log
        self._anomaly_votes: dict[str, set[str]] = {}
        self.is_paused = False

    def report_anomaly(
        self,
        idea_id: str,
        reporting_agent: str,
        anomaly_type: str,
        details: str,
    ) -> dict[str, Any]:
        """Records an anomaly observation. If 2 distinct agents agree, triggers automatic pause."""
        if idea_id not in self._anomaly_votes:
            self._anomaly_votes[idea_id] = set()

        self._anomaly_votes[idea_id].add(reporting_agent)
        agreeing_agents = sorted(self._anomaly_votes[idea_id])

        if len(agreeing_agents) >= 2:
            self.is_paused = True
            msg = (
                f"TWO-AGENT ANOMALY CONSENSUS on {idea_id} by {agreeing_agents}: "
                f"{anomaly_type} - {details}. Paper trading automatically paused."
            )
            if self.memory_log is not None:
                self.memory_log.append_decision(
                    title=f"Emergency Paper Trading Pause: {idea_id}",
                    agent="SWARM",
                    category="PHASE_E",
                    decision="Automatic execution halt triggered by 2-agent anomaly agreement",
                    rationale=msg,
                )
            return {
                "status": "EMERGENCY_PAUSE_TRIGGERED",
                "idea_id": idea_id,
                "agreeing_agents": agreeing_agents,
                "is_paused": True,
                "message": msg,
            }

        return {
            "status": "ANOMALY_NOTED",
            "idea_id": idea_id,
            "agreeing_agents": agreeing_agents,
            "is_paused": False,
            "message": f"Anomaly noted by {reporting_agent}. Awaiting second agent verification.",
        }
