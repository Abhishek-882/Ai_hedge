"""Swarm Personas and Mandates for the Multi-Agent Funding-Rate Research Swarm.
Defines AgentALPHA, AgentBETA, AgentGAMMA, AgentDELTA, and HumanOverseer with exact powers and limits.
"""

from __future__ import annotations

import datetime
from abc import ABC, abstractmethod
from typing import Any

from src.core.constants import AgentPersona, MemoPosition
from src.ipc.memo import AgentMemo


class SwarmPersona(ABC):
    """Abstract Base Class for all Swarm Personas."""

    def __init__(
        self,
        name: str,
        title: str,
        mandate: str,
        powers: list[str],
        limits: list[str],
    ):
        self.name = name
        self.title = title
        self.mandate = mandate
        self.powers = list(powers)
        self.limits = list(limits)

    def create_memo(
        self,
        to_agent: str,
        re_topic: str,
        position: str | MemoPosition,
        evidence: str,
        failure_scenario: str | None = None,
        remediation: str | None = None,
        git_commit: str = "c0ffee1",
        memo_id: str | None = None,
    ) -> AgentMemo:
        """Constructs a signed AgentMemo conforming to the standard 8-field format."""
        pos_val = position.value if isinstance(position, MemoPosition) else str(position).lower().strip()
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        signature = f"{self.name} — {timestamp} — {git_commit}"
        m_id = memo_id or f"MEMO-{self.name[:3]}-{int(datetime.datetime.now().timestamp())}"

        memo = AgentMemo(
            memo_id=m_id,
            from_agent=self.name,
            to_agent=to_agent,
            re_topic=re_topic,
            position=pos_val,
            evidence=evidence,
            failure_scenario=failure_scenario,
            remediation=remediation,
            signature=signature,
        )
        memo.validate()
        return memo

    def has_power(self, power: str) -> bool:
        return power in self.powers

    def has_limit(self, limit: str) -> bool:
        return limit in self.limits

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} name={self.name} title='{self.title}'>"


class AgentALPHA(SwarmPersona):
    """ALPHA — 'The Architect' (Velocity Driver & Execution Engine Lead).
    Mandate: Software architecture, modular pipeline interfaces, execution engine, rapid prototyping.
    Powers: propose refactor, lead implementation, build engine.
    Limits: cannot touch risk caps, cannot self-merge without BETA/GAMMA, cannot alter gate math.
    """

    def __init__(self):
        super().__init__(
            name=AgentPersona.ALPHA.value,
            title="The Architect",
            mandate=(
                "Software architecture, modular pipeline interfaces, strategy-agnostic execution engine, "
                "rapid backtest prototyping, and throughput optimization."
            ),
            powers=[
                "propose_refactor",
                "lead_implementation",
                "build_engine",
                "velocity_lead",
                "prototype_strategies",
            ],
            limits=[
                "cannot_touch_risk_caps",
                "cannot_self_merge",
                "cannot_alter_gate_math",
                "cannot_merge_without_beta_or_gamma",
            ],
        )

    def assert_cannot_modify_risk_caps(self) -> None:
        raise PermissionError("Agent ALPHA is forbidden from modifying risk caps. Custody belongs to Human Overseer.")

    def assert_cannot_alter_gate_math(self) -> None:
        raise PermissionError("Agent ALPHA is forbidden from altering gate math formulas or thresholds.")


class AgentBETA(SwarmPersona):
    """BETA — 'The Auditor' (Chaos Engineer / Adversarial Analyst).
    Mandate: Adversarial failure-mode analysis, execution risk, fee drag, latency, desync, kill-switches.
    Powers: hard veto over gate decisions, hard veto over orders/keys/state, chaos audit.
    Limits: veto requires structured failure scenario and actionable remediation.
    """

    def __init__(self):
        super().__init__(
            name=AgentPersona.BETA.value,
            title="The Auditor",
            mandate=(
                "Adversarial failure-mode analysis: execution leg desync, partial fills, API rate limits, "
                "exchange maintenance windows, fee drag, latency spikes, and automated kill-switch mechanics."
            ),
            powers=[
                "hard_veto_gate",
                "hard_veto_orders_and_keys",
                "chaos_audit",
                "adversarial_analysis",
                "kill_switch_design",
            ],
            limits=[
                "veto_requires_failure_scenario_and_remediation",
            ],
        )

    def create_veto_memo(
        self,
        to_agent: str,
        re_topic: str,
        evidence: str,
        failure_scenario: str,
        remediation: str,
        git_commit: str = "c0ffee2",
        memo_id: str | None = None,
    ) -> AgentMemo:
        """Creates an adversarial veto memo with mandatory failure scenario and remediation."""
        if not failure_scenario or len(failure_scenario.strip()) < 5:
            raise ValueError("Agent BETA veto requires a non-empty, detailed failure scenario.")
        if not remediation or len(remediation.strip()) < 5:
            raise ValueError("Agent BETA veto requires an actionable remediation plan.")

        return self.create_memo(
            to_agent=to_agent,
            re_topic=re_topic,
            position=MemoPosition.VETO,
            evidence=evidence,
            failure_scenario=failure_scenario,
            remediation=remediation,
            git_commit=git_commit,
            memo_id=memo_id,
        )


class AgentGAMMA(SwarmPersona):
    """GAMMA — 'The Purist' (Quant Researcher & Statistical Rigor Lead).
    Mandate: Statistical validity, lookahead bias audits, 4 historical regimes, fee verification (>=5 sources).
    Powers: mandate one backtest re-run per idea, quant audit, lead research slot.
    Limits: cannot alter gate thresholds; second re-run demand escalates to Overseer.
    """

    def __init__(self):
        super().__init__(
            name=AgentPersona.GAMMA.value,
            title="The Purist",
            mandate=(
                "Statistical rigor and empirical validity: lookahead bias audits, survivorship bias checks, "
                "historical regime segmentation (4 regimes), fee-schedule validation (>=5 sources), and bounded research slot."
            ),
            powers=[
                "mandate_one_backtest_rerun",
                "quant_audit",
                "research_slot_lead",
                "statistical_drift_monitor",
                "fee_verification_lead",
            ],
            limits=[
                "cannot_change_gate_thresholds",
                "second_rerun_escalates_to_overseer",
            ],
        )
        self._rerun_counts: dict[str, int] = {}

    def request_backtest_rerun(self, idea_id: str, reason: str) -> dict[str, Any]:
        """Evaluates a backtest re-run demand under the 1 re-run rule."""
        current_count = self._rerun_counts.get(idea_id, 0)
        if current_count == 0:
            self._rerun_counts[idea_id] = 1
            return {
                "status": "APPROVED",
                "idea_id": idea_id,
                "rerun_count": 1,
                "reason": reason,
                "escalated": False,
                "message": f"First backtest re-run granted for idea {idea_id} by GAMMA.",
            }
        else:
            self._rerun_counts[idea_id] = current_count + 1
            return {
                "status": "ESCALATED_TO_OVERSEER",
                "idea_id": idea_id,
                "rerun_count": self._rerun_counts[idea_id],
                "reason": reason,
                "escalated": True,
                "message": (
                    f"Second backtest re-run demanded for idea {idea_id} by GAMMA. "
                    "Escalated directly to Human Overseer for binding ruling."
                ),
            }


class AgentDELTA(SwarmPersona):
    """DELTA — 'The Warden' (DevOps, Persistence & State Machine Custodian).
    Mandate: SQLite schema, state recovery across restarts, IPC state machine enforcement, git hygiene, 3rd-party code review, custody of live switch.
    Powers: refuse state commit, enforce directory transitions, 3rd-party code security reviews, live switch custody.
    Limits: never alters trading strategy or quant modeling logic.
    """

    def __init__(self):
        super().__init__(
            name=AgentPersona.DELTA.value,
            title="The Warden",
            mandate=(
                "SQLite persistence schema, state recovery across restarts, structured logging and telemetry, "
                "the file-based IPC state machine, git tree hygiene, third-party code security reviews, and custody of the live trading switch."
            ),
            powers=[
                "refuse_state_commit",
                "enforce_directory_machine",
                "code_security_review",
                "rollback_unauthorized_state",
                "live_switch_custody",
            ],
            limits=[
                "never_alters_strategy_logic",
            ],
        )

    def certify_code_security(self, package_name: str, notes: str) -> dict[str, Any]:
        """Certifies an external dependency or script for safe integration."""
        if not notes or len(notes.strip()) < 10:
            raise ValueError(f"Meaningful review notes required for certifying '{package_name}'.")
        return {
            "package_name": package_name,
            "reviewer_agent": self.name,
            "is_reviewed": True,
            "review_notes": notes,
            "certified_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }


class HumanOverseer(SwarmPersona):
    """Human Overseer — Final Authority.
    Mandate: Exclusive non-delegable authority over guardrails, risk caps, exchange/stack changes, live arming, and deadlocks.
    Powers: guardrail changes, risk cap overrides, stack changes, idea deletion, live arming, deadlock rulings.
    Limits: none (highest governance tier).
    """

    def __init__(self):
        super().__init__(
            name=AgentPersona.OVERSEER.value,
            title="The Human Overseer",
            mandate="Ultimate governance authority over safety guardrails, live trading arming, capital caps, and escalated deadlocks.",
            powers=[
                "guardrail_changes",
                "risk_cap_overrides",
                "exchange_or_stack_changes",
                "idea_deletion",
                "live_trading_arming",
                "deadlock_final_ruling",
            ],
            limits=[],
        )

    def arm_live_trading(self, hardware_confirmation_token: str) -> bool:
        """Authorizes live trading switch toggle with explicit confirmation."""
        if not hardware_confirmation_token or len(hardware_confirmation_token) < 8:
            raise ValueError("Valid hardware confirmation token required to arm live trading.")
        return True

    def resolve_deadlock(self, topic: str, ruling: str) -> dict[str, Any]:
        """Issues a binding resolution on an escalated deadlock."""
        return {
            "topic": topic,
            "ruling": ruling,
            "resolved_by": self.name,
            "resolved_at_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
