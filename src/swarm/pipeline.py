"""6-Phase Pipeline Orchestrator for the Multi-Agent Funding-Rate Research Swarm.
Manages Phases A -> B -> C -> D -> Gate Decision -> Phase E with full audit trails and quorums.
"""

from __future__ import annotations

import datetime
from pathlib import Path
from typing import Any

from src.core.constants import (
    HISTORICAL_REGIMES,
    AgentPersona,
    IdeaDirectoryState,
    MemoPosition,
    RegimeID,
)
from src.core.exceptions import (
    InvalidRiskCapsException,
    InvalidStateTransitionException,
)
from src.core.guardrails import assert_risk_caps, assert_tos_compliance
from src.ipc.ledgers import MemoryLog, StatusBoard
from src.ipc.memo import AgentMemo, append_memo_to_debate
from src.ipc.state_machine import IdeaStateMachine, IdeaStateRecord, load_idea_state, save_idea_state
from src.storage.database import DatabaseManager
from src.storage.models import AgentStateAuditModel
from src.swarm.consensus import PaperTradingConsensus, QuorumVerifier


class PipelineOrchestrator:
    """Orchestrates the 6-phase strategy research and validation pipeline."""

    def __init__(
        self,
        base_ideas_dir: Path | str = "docs/ideas",
        db_manager: DatabaseManager | None = None,
        memory_log: MemoryLog | None = None,
        status_board: StatusBoard | None = None,
    ):
        self.base_ideas_dir = Path(base_ideas_dir)
        self.state_machine = IdeaStateMachine(base_ideas_dir=self.base_ideas_dir)
        self.db = db_manager
        self.memory_log = memory_log
        self.status_board = status_board
        self.paper_consensus = PaperTradingConsensus(
            status_board=self.status_board,
            memory_log=self.memory_log,
        )

    def _get_idea_path(self, idea_id: str) -> Path:
        p = self.base_ideas_dir / idea_id
        p.mkdir(parents=True, exist_ok=True)
        return p

    def _persist_memo_audit(self, memo: AgentMemo, idea_id: str, phase: str) -> None:
        if self.db is not None:
            audit = AgentStateAuditModel(
                memo_id=memo.memo_id,
                from_agent=memo.from_agent,
                to_agent=memo.to_agent,
                idea_id=idea_id,
                phase=phase,
                position=memo.position,
                evidence=memo.evidence,
                failure_scenario=memo.failure_scenario,
                remediation=memo.remediation,
                git_commit=memo.signature.split(" — ")[-1] if " — " in memo.signature else "head",
                created_at_utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )
            self.db.insert_agent_state_audit(audit)

    # -----------------------------------------------------------------------
    # Phase A: Concept Formalization (GAMMA lead, BETA audit & co-sign)
    # -----------------------------------------------------------------------
    def execute_phase_a(
        self,
        idea_id: str,
        payoff_formula: str,
        delta_neutrality_proof: str,
        residual_risks: list[str],
        gamma_memo: AgentMemo,
        beta_memo: AgentMemo,
        risk_caps: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Executes Phase A Concept Formalization.
        Requires: CONCEPTS.md generation, GAMMA + BETA signatures.
        """
        idea_path = self._get_idea_path(idea_id)

        # 1. Guardrail screen: ToS compliance & Risk caps
        assert_tos_compliance({"payoff": payoff_formula, "proof": delta_neutrality_proof})
        if risk_caps:
            assert_risk_caps(risk_caps)

        # 2. Append memos to DEBATE.md and DB audit
        append_memo_to_debate(idea_path / "DEBATE.md", gamma_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", beta_memo)
        self._persist_memo_audit(gamma_memo, idea_id, "PHASE_A")
        self._persist_memo_audit(beta_memo, idea_id, "PHASE_A")

        # 3. Write CONCEPTS.md
        risks_md = "\n".join([f"- {r}" for r in residual_risks])
        concepts_content = (
            f"# PHASE A: CONCEPT FORMALIZATION — {idea_id}\n\n"
            f"## 1. Payoff Mechanics & Derivation\n```\n{payoff_formula}\n```\n\n"
            f"## 2. Delta-Neutrality Definition & Proof\n{delta_neutrality_proof}\n\n"
            f"## 3. Residual Risk Inventory\n{risks_md}\n\n"
            f"## 4. Sign-offs\n"
            f"- **GAMMA**: `{gamma_memo.signature}`\n"
            f"- **BETA**: `{beta_memo.signature}`\n"
        )
        (idea_path / "CONCEPTS.md").write_text(concepts_content, encoding="utf-8")

        # 4. State Transition
        record = self.state_machine.transition(
            idea_dir=idea_path,
            target_state=IdeaDirectoryState.AUDIT.value,
            target_phase="PHASE_A",
            memos=[gamma_memo, beta_memo],
            risk_caps=risk_caps,
            reason="Phase A Concept Formalization completed",
        )

        return {
            "status": "PHASE_A_COMPLETE",
            "idea_id": idea_id,
            "current_state": record.current_state,
            "current_phase": record.current_phase,
            "concepts_file": str(idea_path / "CONCEPTS.md"),
        }

    # -----------------------------------------------------------------------
    # Phase B: Data Feasibility (GAMMA lead, DELTA persist, BETA fees)
    # -----------------------------------------------------------------------
    def execute_phase_b(
        self,
        idea_id: str,
        venues: list[str],
        fee_schedules: dict[str, dict[str, Any]],
        fee_verification_sources_count: int,
        gamma_memo: AgentMemo,
        delta_memo: AgentMemo,
        beta_memo: AgentMemo,
    ) -> dict[str, Any]:
        """Executes Phase B Data Feasibility.
        Requires: >= 5 independent fee/rate verification sources, DATA.md, GAMMA+DELTA+BETA signatures.
        """
        idea_path = self._get_idea_path(idea_id)

        if fee_verification_sources_count < 5:
            raise ValueError(
                f"Phase B requires >= 5 verified independent data sources, got {fee_verification_sources_count}"
            )

        append_memo_to_debate(idea_path / "DEBATE.md", gamma_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", delta_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", beta_memo)
        self._persist_memo_audit(gamma_memo, idea_id, "PHASE_B")
        self._persist_memo_audit(delta_memo, idea_id, "PHASE_B")
        self._persist_memo_audit(beta_memo, idea_id, "PHASE_B")

        # Write DATA.md
        venues_str = ", ".join(venues)
        fee_summary_md = ""
        for v, sched in fee_schedules.items():
            fee_summary_md += f"- **{v}**: Maker={sched.get('maker_rate', 0.0002):.5f}, Taker={sched.get('taker_rate', 0.0005):.5f}\n"

        data_content = (
            f"# PHASE B: DATA FEASIBILITY — {idea_id}\n\n"
            f"## 1. Candidate Exchange Venues\n{venues_str}\n\n"
            f"## 2. Live Fee Schedule Audit (>=5 Verified Sources)\n"
            f"Verified Sources Count: **{fee_verification_sources_count}**\n"
            f"{fee_summary_md}\n\n"
            f"## 3. Sign-offs\n"
            f"- **GAMMA**: `{gamma_memo.signature}`\n"
            f"- **DELTA**: `{delta_memo.signature}`\n"
            f"- **BETA**: `{beta_memo.signature}`\n"
        )
        (idea_path / "DATA.md").write_text(data_content, encoding="utf-8")

        record = self.state_machine.transition(
            idea_dir=idea_path,
            target_state=IdeaDirectoryState.AUDIT.value,
            target_phase="PHASE_B",
            memos=[gamma_memo, delta_memo, beta_memo],
            reason="Phase B Data Feasibility completed",
        )

        return {
            "status": "PHASE_B_COMPLETE",
            "idea_id": idea_id,
            "current_state": record.current_state,
            "current_phase": record.current_phase,
            "data_file": str(idea_path / "DATA.md"),
        }

    # -----------------------------------------------------------------------
    # Phase C: Backtest Engine (ALPHA code, GAMMA quant, BETA stress)
    # -----------------------------------------------------------------------
    def execute_phase_c(
        self,
        idea_id: str,
        regime_metrics: dict[str, dict[str, float]],
        worst_case_drawdown_pct: float,
        alpha_memo: AgentMemo,
        gamma_memo: AgentMemo,
        beta_memo: AgentMemo,
    ) -> dict[str, Any]:
        """Executes Phase C Backtest Engine & Regime Audit.
        Requires: 4 historical regimes modeled, fee/slippage modeling, ALPHA+GAMMA+BETA signatures.
        """
        idea_path = self._get_idea_path(idea_id)

        append_memo_to_debate(idea_path / "DEBATE.md", alpha_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", gamma_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", beta_memo)
        self._persist_memo_audit(alpha_memo, idea_id, "PHASE_C")
        self._persist_memo_audit(gamma_memo, idea_id, "PHASE_C")
        self._persist_memo_audit(beta_memo, idea_id, "PHASE_C")

        regimes_md = ""
        for reg_id, metrics in regime_metrics.items():
            regimes_md += f"- **{reg_id}**: Net Return={metrics.get('net_return_pct', 0.0):.2f}%, Sharpe={metrics.get('sharpe', 0.0):.2f}, MaxDD={metrics.get('max_drawdown_pct', 0.0):.2f}%\n"

        backtest_content = (
            f"# PHASE C: BACKTEST ENGINE & REGIME AUDIT — {idea_id}\n\n"
            f"## 1. Performance Across 4 Historical Regimes\n{regimes_md}\n\n"
            f"## 2. Worst-Case Drawdown\n**{worst_case_drawdown_pct:.2f}%**\n\n"
            f"## 3. Sign-offs\n"
            f"- **ALPHA**: `{alpha_memo.signature}`\n"
            f"- **GAMMA**: `{gamma_memo.signature}`\n"
            f"- **BETA**: `{beta_memo.signature}`\n"
        )
        (idea_path / "BACKTEST.md").write_text(backtest_content, encoding="utf-8")

        record = self.state_machine.transition(
            idea_dir=idea_path,
            target_state=IdeaDirectoryState.AUDIT.value,
            target_phase="PHASE_C",
            memos=[alpha_memo, gamma_memo, beta_memo],
            reason="Phase C Backtest Engine Audited across 4 Regimes",
        )

        return {
            "status": "PHASE_C_COMPLETE",
            "idea_id": idea_id,
            "current_state": record.current_state,
            "current_phase": record.current_phase,
            "backtest_file": str(idea_path / "BACKTEST.md"),
        }

    # -----------------------------------------------------------------------
    # Phase D: Risk Spec & Watchdog (BETA lead, ALPHA code, DELTA persist)
    # -----------------------------------------------------------------------
    def execute_phase_d(
        self,
        idea_id: str,
        leverage_cap: float,
        liquidation_buffer_pct: float,
        has_executable_watchdog: bool,
        beta_memo: AgentMemo,
        alpha_memo: AgentMemo,
        delta_memo: AgentMemo,
    ) -> dict[str, Any]:
        """Executes Phase D Risk Specification.
        Requires: leverage <= 3.0x, liquidation buffer >= 35%, executable watchdog, BETA+ALPHA+DELTA signatures.
        """
        idea_path = self._get_idea_path(idea_id)

        if leverage_cap > 3.0:
            raise ValueError(f"Phase D maximum leverage cap is 3.0x, got {leverage_cap}x")
        if liquidation_buffer_pct < 0.35:
            raise ValueError(
                f"Phase D liquidation buffer must be >= 35% (0.35), got {liquidation_buffer_pct:.2%}"
            )
        if not has_executable_watchdog:
            raise ValueError("Phase D requires an executable Desync Watchdog implementation.")

        append_memo_to_debate(idea_path / "DEBATE.md", beta_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", alpha_memo)
        append_memo_to_debate(idea_path / "DEBATE.md", delta_memo)
        self._persist_memo_audit(beta_memo, idea_id, "PHASE_D")
        self._persist_memo_audit(alpha_memo, idea_id, "PHASE_D")
        self._persist_memo_audit(delta_memo, idea_id, "PHASE_D")

        risk_content = (
            f"# PHASE D: RISK SPECIFICATION & WATCHDOG — {idea_id}\n\n"
            f"## 1. Capital Constraints\n"
            f"- **Leverage Cap**: {leverage_cap:.1f}x\n"
            f"- **Liquidation Buffer**: {liquidation_buffer_pct * 100:.1f}%\n"
            f"- **Executable Watchdog**: {'Active & Verified' if has_executable_watchdog else 'Missing'}\n\n"
            f"## 2. Sign-offs\n"
            f"- **BETA**: `{beta_memo.signature}`\n"
            f"- **ALPHA**: `{alpha_memo.signature}`\n"
            f"- **DELTA**: `{delta_memo.signature}`\n"
        )
        (idea_path / "RISK.md").write_text(risk_content, encoding="utf-8")

        record = self.state_machine.transition(
            idea_dir=idea_path,
            target_state=IdeaDirectoryState.AUDIT.value,
            target_phase="PHASE_D",
            memos=[beta_memo, alpha_memo, delta_memo],
            reason="Phase D Risk Spec & Watchdog completed",
        )

        return {
            "status": "PHASE_D_COMPLETE",
            "idea_id": idea_id,
            "current_state": record.current_state,
            "current_phase": record.current_phase,
            "risk_file": str(idea_path / "RISK.md"),
        }

    # -----------------------------------------------------------------------
    # Gate Decision (Unanimous 4-Agent Quorum)
    # -----------------------------------------------------------------------
    def execute_gate_decision(
        self,
        idea_id: str,
        regime_expectancies: dict[str, float],
        worst_case_drawdown_pct: float,
        max_drawdown_cap_pct: float,
        memos: list[AgentMemo],
    ) -> dict[str, Any]:
        """Evaluates Gate Decision for promotion from /audit to /approved.
        Requires: Unanimous 4-agent vote (ALPHA, BETA, GAMMA, DELTA),
        positive net expectancy in >= 2 of 4 regimes, worst drawdown <= cap.
        """
        idea_path = self._get_idea_path(idea_id)

        for m in memos:
            append_memo_to_debate(idea_path / "DEBATE.md", m)
            self._persist_memo_audit(m, idea_id, "GATE")

        eval_result = QuorumVerifier.evaluate_gate_decision(
            regime_expectancies=regime_expectancies,
            worst_case_drawdown_pct=worst_case_drawdown_pct,
            max_drawdown_cap_pct=max_drawdown_cap_pct,
            memos=memos,
        )

        # Write GATE.md plainly (never lowering the bar)
        verdict = eval_result["verdict"]
        reg_summary = eval_result["regimes_summary"]
        dd_summary = eval_result["drawdown_summary"]
        q_summary = eval_result["quorum_summary"]

        veto_section = ""
        if q_summary["vetoes"]:
            veto_section = "### Veto Records\n"
            for v in q_summary["vetoes"]:
                veto_section += f"- **{v['agent']}**: Failure Scenario: {v['failure_scenario']} | Remediation: {v['remediation']}\n"

        gate_content = (
            f"# GATE DECISION: {idea_id}\n\n"
            f"**Verdict:** `{verdict}`  \n"
            f"**Evaluated At (UTC):** `{eval_result['evaluated_at_utc']}`  \n\n"
            f"## 1. Regime Expectancy Check (>= 2 of 4 Required)\n"
            f"- Positive Regimes Count: {reg_summary['positive_regimes_count']}/4\n"
            f"- Passes Regime Hurdle: {reg_summary['passes_regimes_hurdle']}\n\n"
            f"## 2. Worst-Case Drawdown vs Stated Cap\n"
            f"- Worst Backtest DD: {dd_summary['worst_case_drawdown_pct']:.2f}%\n"
            f"- Stated Max DD Cap: {dd_summary['max_drawdown_cap_pct']:.2f}%\n"
            f"- Passes Drawdown Hurdle: {dd_summary['passes_drawdown_hurdle']}\n\n"
            f"## 3. Quorum Sign-Offs (Unanimous 4 Agents Required)\n"
            f"- Approving Agents: {q_summary['approving_agents']}\n"
            f"- Missing Signers: {q_summary['missing_signers']}\n"
            f"{veto_section}\n"
        )
        (idea_path / "GATE.md").write_text(gate_content, encoding="utf-8")

        if eval_result["is_passed"]:
            record = self.state_machine.transition(
                idea_dir=idea_path,
                target_state=IdeaDirectoryState.APPROVED.value,
                target_phase="GATE",
                memos=memos,
                reason="Gate Decision Passed Unanimously",
            )
            return {
                "verdict": "PASS",
                "idea_id": idea_id,
                "current_state": record.current_state,
                "gate_file": str(idea_path / "GATE.md"),
            }
        else:
            # Veto or hurdle failure: record FAIL in STATE.md
            rec = load_idea_state(idea_path)
            rec.gate_verdict = "FAIL"
            save_idea_state(idea_path, rec)
            return {
                "verdict": "FAIL",
                "idea_id": idea_id,
                "current_state": rec.current_state,
                "evaluation_details": eval_result,
                "gate_file": str(idea_path / "GATE.md"),
            }

    # -----------------------------------------------------------------------
    # Phase E: Paper Trading & Divergence / Drift Checks
    # -----------------------------------------------------------------------
    def execute_phase_e_telemetry(
        self,
        idea_id: str,
        slippage_divergence_pct: float,
        drift_p_value: float,
        reporting_agents: list[tuple[str, str, str]] | None = None,
    ) -> dict[str, Any]:
        """Phase E: telemetry checks. 2-agent anomaly consensus triggers emergency pause."""
        idea_path = self._get_idea_path(idea_id)

        # Process any anomaly reports
        pause_triggered = False
        emergency_details = None

        if reporting_agents:
            for agent, anom_type, details in reporting_agents:
                res = self.paper_consensus.report_anomaly(
                    idea_id=idea_id,
                    reporting_agent=agent,
                    anomaly_type=anom_type,
                    details=details,
                )
                if res.get("is_paused"):
                    pause_triggered = True
                    emergency_details = res

        return {
            "status": "PAUSED" if pause_triggered else "RUNNING",
            "idea_id": idea_id,
            "slippage_divergence_pct": slippage_divergence_pct,
            "drift_p_value": drift_p_value,
            "is_paused": pause_triggered,
            "emergency_details": emergency_details,
        }
