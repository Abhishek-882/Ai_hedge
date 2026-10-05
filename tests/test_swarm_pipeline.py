"""Unit and integration test suite for Milestone 2: Swarm Protocol, Personas, Oath, Consensus, and Pipeline Handshakes.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any
import pytest

from src.core.constants import (
    AgentPersona,
    IdeaDirectoryState,
    MemoPosition,
    RegimeID,
)
from src.core.exceptions import (
    InvalidAgentMemoException,
    InvalidRiskCapsException,
    InvalidStateTransitionException,
)
from src.ipc.ledgers import MemoryLog, PlanChangelog, StatusBoard
from src.ipc.memo import AgentMemo
from src.ipc.state_machine import IdeaStateMachine, load_idea_state
from src.storage.database import DatabaseManager
from src.swarm.consensus import (
    AUTONOMOUS_TIER_CATEGORIES,
    OVERSEER_TIER_CATEGORIES,
    PHASE_QUORUMS,
    AdaptivePlanningLoop,
    ConflictEscalationProtocol,
    PaperTradingConsensus,
    QuorumVerifier,
)
from src.swarm.oath import (
    ALL_SWARM_PERSONAS,
    SWARM_OATH_RULES,
    SwarmOath,
)
from src.swarm.personas import (
    AgentALPHA,
    AgentBETA,
    AgentDELTA,
    AgentGAMMA,
    HumanOverseer,
)
from src.swarm.pipeline import PipelineOrchestrator


class TestSwarmPersonas:
    """Test suite verifying exact mandates, powers, limits, and memo generation for all personas."""

    def test_alpha_mandate_powers_and_limits(self):
        alpha = AgentALPHA()
        assert alpha.name == "ALPHA"
        assert alpha.title == "The Architect"
        assert alpha.has_power("velocity_lead")
        assert alpha.has_power("build_engine")
        assert alpha.has_limit("cannot_touch_risk_caps")
        assert alpha.has_limit("cannot_self_merge")
        assert alpha.has_limit("cannot_alter_gate_math")

        with pytest.raises(PermissionError, match="forbidden from modifying risk caps"):
            alpha.assert_cannot_modify_risk_caps()

        with pytest.raises(PermissionError, match="forbidden from altering gate math"):
            alpha.assert_cannot_alter_gate_math()

        memo = alpha.create_memo(
            to_agent="SWARM",
            re_topic="idea-03 / Phase C / Engine",
            position=MemoPosition.APPROVE,
            evidence="Vectorized execution loop operational.",
            git_commit="a1b2c3d",
        )
        assert memo.from_agent == "ALPHA"
        assert memo.position == "approve"
        assert "ALPHA — " in memo.signature
        assert "a1b2c3d" in memo.signature

    def test_beta_mandate_powers_and_hard_veto(self):
        beta = AgentBETA()
        assert beta.name == "BETA"
        assert beta.title == "The Auditor"
        assert beta.has_power("hard_veto_gate")
        assert beta.has_power("hard_veto_orders_and_keys")
        assert beta.has_limit("veto_requires_failure_scenario_and_remediation")

        # Valid veto memo
        veto_memo = beta.create_veto_memo(
            to_agent="SWARM",
            re_topic="idea-03 / Gate",
            evidence="Exchange latency spike observed",
            failure_scenario="Leg 1 executes but Leg 2 times out, creating unhedged exposure.",
            remediation="Implement 1500ms watchdog automatic unwind.",
            git_commit="b1b2c3d",
        )
        assert veto_memo.from_agent == "BETA"
        assert veto_memo.position == "veto"
        assert "unhedged exposure" in veto_memo.failure_scenario
        assert "1500ms watchdog" in veto_memo.remediation

        # Invalid veto without remediation
        with pytest.raises(ValueError, match="remediation plan"):
            beta.create_veto_memo(
                to_agent="SWARM",
                re_topic="idea-03 / Gate",
                evidence="Too risky",
                failure_scenario="Orderbook collapsed",
                remediation="",
            )

        # Invalid veto without failure scenario
        with pytest.raises(ValueError, match="failure scenario"):
            beta.create_veto_memo(
                to_agent="SWARM",
                re_topic="idea-03 / Gate",
                evidence="Too risky",
                failure_scenario="",
                remediation="Fix it",
            )

    def test_gamma_mandate_quant_and_rerun_rule(self):
        gamma = AgentGAMMA()
        assert gamma.name == "GAMMA"
        assert gamma.title == "The Purist"
        assert gamma.has_power("mandate_one_backtest_rerun")
        assert gamma.has_power("quant_audit")
        assert gamma.has_limit("second_rerun_escalates_to_overseer")

        # First re-run demand is approved
        res1 = gamma.request_backtest_rerun(idea_id="idea-01", reason="Suspected lookahead bias in fee calculation")
        assert res1["status"] == "APPROVED"
        assert res1["rerun_count"] == 1
        assert res1["escalated"] is False

        # Second re-run demand escalates to Overseer
        res2 = gamma.request_backtest_rerun(idea_id="idea-01", reason="Parameter sensitivity check")
        assert res2["status"] == "ESCALATED_TO_OVERSEER"
        assert res2["rerun_count"] == 2
        assert res2["escalated"] is True
        assert "Escalated directly to Human Overseer" in res2["message"]

    def test_delta_mandate_persistence_and_code_review(self):
        delta = AgentDELTA()
        assert delta.name == "DELTA"
        assert delta.title == "The Warden"
        assert delta.has_power("refuse_state_commit")
        assert delta.has_power("code_security_review")
        assert delta.has_power("live_switch_custody")
        assert delta.has_limit("never_alters_strategy_logic")

        # Valid security certification
        cert = delta.certify_code_security(
            package_name="ccxt",
            notes="Reviewed version 4.1.0 source for testnet endpoint safety and key isolation.",
        )
        assert cert["is_reviewed"] is True
        assert cert["reviewer_agent"] == "DELTA"

        # Invalid certification with empty notes
        with pytest.raises(ValueError, match="Meaningful review notes"):
            delta.certify_code_security("unverified_lib", notes="ok")

    def test_human_overseer_exclusive_powers(self):
        overseer = HumanOverseer()
        assert overseer.name == "OVERSEER"
        assert overseer.title == "The Human Overseer"
        assert overseer.has_power("guardrail_changes")
        assert overseer.has_power("risk_cap_overrides")
        assert overseer.has_power("live_trading_arming")
        assert overseer.has_power("deadlock_final_ruling")

        # Live arming requires valid token
        assert overseer.arm_live_trading("HW-KEY-AUTH-9999") is True
        with pytest.raises(ValueError, match="Valid hardware confirmation token"):
            overseer.arm_live_trading("")

        # Deadlock resolution
        ruling = overseer.resolve_deadlock(topic="Idea 03 Latency Window", ruling="Set holding window to T-8min / T+90s.")
        assert ruling["resolved_by"] == "OVERSEER"
        assert "T-8min" in ruling["ruling"]


class TestSwarmOath:
    """Test suite for the 6 Non-Negotiable Rules of the Swarm Oath."""

    def test_all_six_rules_present(self):
        rules = SwarmOath.get_rules()
        assert len(rules) == 6
        assert "Anti-Fabrication & Empirical Reality" in rules[0]
        assert "Explicit & Reasoned Tracking" in rules[1]
        assert "Assumption Invalidation & Correction" in rules[2]
        assert "Timeboxed Research Discipline" in rules[3]
        assert "Granular Subphase Git Discipline" in rules[4]
        assert "Uncompromising Gate Bar" in rules[5]

    def test_oath_markdown_generation(self):
        md = SwarmOath.get_oath_markdown()
        assert "# The Swarm Oath" in md
        for r in SWARM_OATH_RULES:
            assert r in md

    def test_oath_commitment_logging(self, tmp_path: Path):
        memory_file = tmp_path / "MEMORY.md"
        memory_log = MemoryLog(memory_file)

        sig_alpha = SwarmOath.commit("ALPHA", "session-01", memory_log=memory_log)
        sig_beta = SwarmOath.commit("BETA", "session-01", memory_log=memory_log)
        sig_gamma = SwarmOath.commit("GAMMA", "session-01", memory_log=memory_log)
        sig_delta = SwarmOath.commit("DELTA", "session-01", memory_log=memory_log)

        assert "SWARM-OATH-SIGNED: ALPHA -- session-01" in sig_alpha
        assert "SWARM-OATH-SIGNED: BETA -- session-01" in sig_beta

        content = memory_file.read_text(encoding="utf-8")
        assert "The Swarm Oath Commitment" in content
        assert "- **Agent:** `ALPHA`" in content
        assert "- **Agent:** `BETA`" in content

    def test_oath_quorum_verification(self):
        # 4 agents committed
        commitments_pass = {"ALPHA": True, "BETA": True, "GAMMA": True, "DELTA": True}
        assert SwarmOath.verify_commitment(commitments_pass) is True

        # Missing BETA
        commitments_fail = {"ALPHA": True, "BETA": False, "GAMMA": True, "DELTA": True}
        assert SwarmOath.verify_commitment(commitments_fail) is False

        # Set input
        assert SwarmOath.verify_commitment({"ALPHA", "BETA", "GAMMA", "DELTA"}) is True
        assert SwarmOath.verify_commitment({"ALPHA", "GAMMA", "DELTA"}) is False

    def test_log_flagged_assumption(self, tmp_path: Path):
        memory_file = tmp_path / "MEMORY.md"
        memory_log = MemoryLog(memory_file)

        entry = SwarmOath.log_flagged_assumption(
            question="What is the exact KuCoin sandbox WebSocket ping interval?",
            assumption="Assumed 30s heartbeat timeout based on REST docs.",
            timebox_hours=2.0,
            memory_log=memory_log,
        )
        assert "Flagged Assumption (Timebox Exceeded: 2.0h)" in entry
        assert "KuCoin sandbox WebSocket" in entry

        content = memory_file.read_text(encoding="utf-8")
        assert "Flagged Assumption" in content


class TestConsensusAndQuorum:
    """Test suite for QuorumVerifier, AdaptivePlanningLoop, ConflictEscalationProtocol, and PaperTradingConsensus."""

    def test_phase_quorum_verifications(self):
        # Phase A
        pass_a, missing_a = QuorumVerifier.verify_phase_sign_offs("PHASE_A", ["GAMMA", "BETA"])
        assert pass_a is True
        assert len(missing_a) == 0

        fail_a, missing_a = QuorumVerifier.verify_phase_sign_offs("PHASE_A", ["GAMMA", "ALPHA"])
        assert fail_a is False
        assert missing_a == ["BETA"]

        # Phase B
        pass_b, _ = QuorumVerifier.verify_phase_sign_offs("PHASE_B", ["GAMMA", "DELTA", "BETA"])
        assert pass_b is True

        # Gate
        pass_g, _ = QuorumVerifier.verify_phase_sign_offs("GATE", ["ALPHA", "BETA", "GAMMA", "DELTA"])
        assert pass_g is True

        fail_g, missing_g = QuorumVerifier.verify_phase_sign_offs("GATE", ["ALPHA", "GAMMA", "DELTA"])
        assert fail_g is False
        assert missing_g == ["BETA"]

    def test_gate_decision_evaluation_pass(self):
        regimes = {
            RegimeID.REGIME_1.value: 0.0035,  # Positive (+0.35%)
            RegimeID.REGIME_2.value: -0.0010, # Negative (-0.10%)
            RegimeID.REGIME_3.value: 0.0005,  # Positive (+0.05%)
            RegimeID.REGIME_4.value: 0.0040,  # Positive (+0.40%)
        }
        alpha_m = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "Pass", "ALPHA — 2026-08-28T14:00:00Z — a1")
        beta_m = AgentMemo("G-2", "BETA", "SWARM", "Gate", "approve", "Pass", "BETA — 2026-08-28T14:00:00Z — b1")
        gamma_m = AgentMemo("G-3", "GAMMA", "SWARM", "Gate", "approve", "Pass", "GAMMA — 2026-08-28T14:00:00Z — g1")
        delta_m = AgentMemo("G-4", "DELTA", "SWARM", "Gate", "approve", "Pass", "DELTA — 2026-08-28T14:00:00Z — d1")

        result = QuorumVerifier.evaluate_gate_decision(
            regime_expectancies=regimes,
            worst_case_drawdown_pct=2.8,
            max_drawdown_cap_pct=3.5,
            memos=[alpha_m, beta_m, gamma_m, delta_m],
        )
        assert result["verdict"] == "PASS"
        assert result["is_passed"] is True
        assert result["regimes_summary"]["positive_regimes_count"] == 3
        assert result["drawdown_summary"]["passes_drawdown_hurdle"] is True

    def test_gate_decision_fails_on_single_veto(self):
        regimes = {
            RegimeID.REGIME_1.value: 0.0035,
            RegimeID.REGIME_2.value: 0.0020,
            RegimeID.REGIME_3.value: 0.0015,
            RegimeID.REGIME_4.value: 0.0040,
        }
        alpha_m = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "Pass", "ALPHA — 2026-08-28T14:00:00Z — a1")
        gamma_m = AgentMemo("G-2", "GAMMA", "SWARM", "Gate", "approve", "Pass", "GAMMA — 2026-08-28T14:00:00Z — g1")
        delta_m = AgentMemo("G-3", "DELTA", "SWARM", "Gate", "approve", "Pass", "DELTA — 2026-08-28T14:00:00Z — d1")
        beta_veto = AgentMemo(
            "G-4", "BETA", "SWARM", "Gate", "veto", "Fee drag too high", "BETA — 2026-08-28T14:00:00Z — b1",
            failure_scenario="Drawdown breach in volatile regimes",
            remediation="Increase spread hurdle to 0.50%",
        )

        result = QuorumVerifier.evaluate_gate_decision(
            regime_expectancies=regimes,
            worst_case_drawdown_pct=2.0,
            max_drawdown_cap_pct=3.5,
            memos=[alpha_m, gamma_m, delta_m, beta_veto],
        )
        assert result["verdict"] == "FAIL"
        assert result["is_passed"] is False
        assert len(result["quorum_summary"]["vetoes"]) == 1
        assert result["quorum_summary"]["vetoes"][0]["agent"] == "BETA"

    def test_gate_decision_fails_when_less_than_two_regimes_positive(self):
        regimes = {
            RegimeID.REGIME_1.value: 0.0010,  # Only 1 positive
            RegimeID.REGIME_2.value: -0.0020,
            RegimeID.REGIME_3.value: -0.0005,
            RegimeID.REGIME_4.value: -0.0015,
        }
        alpha_m = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "Pass", "ALPHA — 2026-08-28T14:00:00Z — a1")
        beta_m = AgentMemo("G-2", "BETA", "SWARM", "Gate", "approve", "Pass", "BETA — 2026-08-28T14:00:00Z — b1")
        gamma_m = AgentMemo("G-3", "GAMMA", "SWARM", "Gate", "approve", "Pass", "GAMMA — 2026-08-28T14:00:00Z — g1")
        delta_m = AgentMemo("G-4", "DELTA", "SWARM", "Gate", "approve", "Pass", "DELTA — 2026-08-28T14:00:00Z — d1")

        result = QuorumVerifier.evaluate_gate_decision(
            regime_expectancies=regimes,
            worst_case_drawdown_pct=2.0,
            max_drawdown_cap_pct=3.5,
            memos=[alpha_m, beta_m, gamma_m, delta_m],
        )
        assert result["verdict"] == "FAIL"
        assert result["regimes_summary"]["positive_regimes_count"] == 1
        assert result["regimes_summary"]["passes_regimes_hurdle"] is False

    def test_gate_decision_fails_on_drawdown_breach(self):
        regimes = {
            RegimeID.REGIME_1.value: 0.0035,
            RegimeID.REGIME_2.value: 0.0020,
            RegimeID.REGIME_3.value: 0.0015,
            RegimeID.REGIME_4.value: 0.0040,
        }
        alpha_m = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "Pass", "ALPHA — 2026-08-28T14:00:00Z — a1")
        beta_m = AgentMemo("G-2", "BETA", "SWARM", "Gate", "approve", "Pass", "BETA — 2026-08-28T14:00:00Z — b1")
        gamma_m = AgentMemo("G-3", "GAMMA", "SWARM", "Gate", "approve", "Pass", "GAMMA — 2026-08-28T14:00:00Z — g1")
        delta_m = AgentMemo("G-4", "DELTA", "SWARM", "Gate", "approve", "Pass", "DELTA — 2026-08-28T14:00:00Z — d1")

        result = QuorumVerifier.evaluate_gate_decision(
            regime_expectancies=regimes,
            worst_case_drawdown_pct=4.2,  # Breaches 3.5% cap
            max_drawdown_cap_pct=3.5,
            memos=[alpha_m, beta_m, gamma_m, delta_m],
        )
        assert result["verdict"] == "FAIL"
        assert result["drawdown_summary"]["passes_drawdown_hurdle"] is False

    def test_adaptive_planning_loop_autonomous_and_overseer_tiers(self, tmp_path: Path):
        changelog = PlanChangelog(tmp_path / "PLAN_CHANGELOG.md")
        status_board = StatusBoard(tmp_path / "STATUS.md")
        loop = AdaptivePlanningLoop(changelog=changelog, status_board=status_board)

        # Autonomous Tier change
        res_auto = loop.propose_autonomous_change(
            category="backlog_priority_reorder",
            title="Prioritize Idea 03",
            proposer="ALPHA",
            cosigner="BETA",
            description="Move Cross-Exchange Funding to priority 1",
            rationale="Immediate testnet data availability",
        )
        assert res_auto["status"] == "APPROVED"
        assert (tmp_path / "PLAN_CHANGELOG.md").exists()
        assert "Prioritize Idea 03" in (tmp_path / "PLAN_CHANGELOG.md").read_text(encoding="utf-8")

        # Autonomous Tier fails with same proposer and cosigner
        with pytest.raises(ValueError, match="proposer != cosigner"):
            loop.propose_autonomous_change(
                category="backlog_priority_reorder",
                title="Invalid change",
                proposer="ALPHA",
                cosigner="ALPHA",
                description="Self approval",
                rationale="Invalid",
            )

        # Autonomous Tier fails when attempting Overseer action
        with pytest.raises(ValueError, match="not an Autonomous Tier action"):
            loop.propose_autonomous_change(
                category="exchange_addition_or_removal",
                title="Add Deribit",
                proposer="ALPHA",
                cosigner="BETA",
                description="Add exchange",
                rationale="More spread",
            )

        # Overseer Tier proposal
        res_overseer = loop.propose_overseer_change(
            category="exchange_addition_or_removal",
            title="Proposal: Add OKX Sandbox",
            proposer="GAMMA",
            description="Evaluate OKX perpetual market feeds",
            rationale="High liquidity in structural dispersion regime",
        )
        assert res_overseer["status"] == "PROPOSAL_PENDING_OVERSEER"
        assert res_overseer["tier"] == "Overseer"

    def test_conflict_escalation_protocol(self, tmp_path: Path):
        status_board = StatusBoard(tmp_path / "STATUS.md")
        memory_log = MemoryLog(tmp_path / "MEMORY.md")
        protocol = ConflictEscalationProtocol(status_board=status_board, memory_log=memory_log)

        topic = "idea-03 / Execution Latency"
        m1 = AgentMemo("D-1", "ALPHA", "BETA", topic, "approve", "50ms latency achievable", "ALPHA — 2026-08-28T14:00:00Z — a1")
        m2 = AgentMemo("D-2", "BETA", "ALPHA", topic, "veto", "Observed 450ms lag", "BETA — 2026-08-28T14:01:00Z — b1",
                       failure_scenario="Leg fill lag causes desync", remediation="Add watchdog timer")
        m3 = AgentMemo("D-3", "BETA", "ALPHA", topic, "veto", "Dispute unresolved", "BETA — 2026-08-28T14:02:00Z — b2",
                       failure_scenario="Extreme latency causes liquidation", remediation="Halt strategy")

        r1 = protocol.record_memo(topic, m1)
        assert r1["is_deadlocked"] is False

        r2 = protocol.record_memo(topic, m2)
        assert r2["is_deadlocked"] is False

        # 3rd memo with 2nd veto triggers deadlock escalation
        r3 = protocol.record_memo(topic, m3)
        assert r3["is_deadlocked"] is True
        assert r3["status"] == "DEADLOCKED"
        assert "Branch swarm to next unblocked" in r3["next_action"]

        mem_content = (tmp_path / "MEMORY.md").read_text(encoding="utf-8")
        assert "Conflict Deadlock" in mem_content

    def test_paper_trading_anomaly_consensus(self, tmp_path: Path):
        status_board = StatusBoard(tmp_path / "STATUS.md")
        memory_log = MemoryLog(tmp_path / "MEMORY.md")
        consensus = PaperTradingConsensus(status_board=status_board, memory_log=memory_log)

        # 1 agent reports anomaly -> noted but not paused
        res1 = consensus.report_anomaly(
            idea_id="idea-03",
            reporting_agent="BETA",
            anomaly_type="SLIPPAGE_DIVERGENCE",
            details="Observed 18 bps slippage vs 5 bps expected.",
        )
        assert res1["status"] == "ANOMALY_NOTED"
        assert res1["is_paused"] is False
        assert consensus.is_paused is False

        # 2nd agent reports anomaly -> triggers emergency pause
        res2 = consensus.report_anomaly(
            idea_id="idea-03",
            reporting_agent="GAMMA",
            anomaly_type="STATISTICAL_DRIFT",
            details="KS-test p-value = 0.012 indicates regime shift.",
        )
        assert res2["status"] == "EMERGENCY_PAUSE_TRIGGERED"
        assert res2["is_paused"] is True
        assert consensus.is_paused is True

        mem_content = (tmp_path / "MEMORY.md").read_text(encoding="utf-8")
        assert "Emergency Paper Trading Pause" in mem_content


class TestPipelineOrchestratorIntegration:
    """Full 6-phase handshake integration testing (Phases A -> B -> C -> D -> Gate -> E)."""

    def test_complete_idea03_pipeline_traversal_pass(self, tmp_path: Path, memory_db: DatabaseManager):
        ideas_dir = tmp_path / "docs" / "ideas"
        mem_log = MemoryLog(tmp_path / "MEMORY.md")
        status_board = StatusBoard(tmp_path / "STATUS.md")

        orchestrator = PipelineOrchestrator(
            base_ideas_dir=ideas_dir,
            db_manager=memory_db,
            memory_log=mem_log,
            status_board=status_board,
        )

        idea_id = "idea-03-cross-exchange-funding"
        valid_caps = {"max_drawdown_pct": 0.035, "position_size_cap_usd": 10000.0, "leverage_cap": 3.0}

        # 1. Phase A
        gamma_memo_a = AgentMemo("A-1", "GAMMA", "SWARM", "Phase A / Concepts", "approve", "Payoff proof verified", "GAMMA — 2026-08-28T14:00:00Z — g1")
        beta_memo_a = AgentMemo("A-2", "BETA", "SWARM", "Phase A / Review", "approve", "Residual risks audited", "BETA — 2026-08-28T14:01:00Z — b1")
        res_a = orchestrator.execute_phase_a(
            idea_id=idea_id,
            payoff_formula="Gross = N * (FR_H - FR_L); Net = Gross - Fees - Slippage + DeltaBasis",
            delta_neutrality_proof="Delta_net = Notional_L - Notional_H = 0",
            residual_risks=["Basis risk", "Leg fill latency", "Asymmetric funding interval", "Liquidation cascade"],
            gamma_memo=gamma_memo_a,
            beta_memo=beta_memo_a,
            risk_caps=valid_caps,
        )
        assert res_a["status"] == "PHASE_A_COMPLETE"
        assert Path(res_a["concepts_file"]).exists()

        # 2. Phase B
        gamma_memo_b = AgentMemo("B-1", "GAMMA", "SWARM", "Phase B / Data", "approve", "Binance/Bybit testnet verified", "GAMMA — 2026-08-28T14:10:00Z — g2")
        delta_memo_b = AgentMemo("B-2", "DELTA", "SWARM", "Phase B / Storage", "approve", "Schema & raw tables verified", "DELTA — 2026-08-28T14:11:00Z — d2")
        beta_memo_b = AgentMemo("B-3", "BETA", "SWARM", "Phase B / Fees", "approve", "Fee schedule verified across 5 sources", "BETA — 2026-08-28T14:12:00Z — b2")
        res_b = orchestrator.execute_phase_b(
            idea_id=idea_id,
            venues=["Binance USD-M Testnet", "Bybit V5 Linear Testnet", "KuCoin Paper Mock"],
            fee_schedules={"binance": {"maker_rate": 0.0002, "taker_rate": 0.0005}, "bybit": {"maker_rate": 0.0002, "taker_rate": 0.00055}},
            fee_verification_sources_count=5,
            gamma_memo=gamma_memo_b,
            delta_memo=delta_memo_b,
            beta_memo=beta_memo_b,
        )
        assert res_b["status"] == "PHASE_B_COMPLETE"
        assert Path(res_b["data_file"]).exists()

        # 3. Phase C
        alpha_memo_c = AgentMemo("C-1", "ALPHA", "SWARM", "Phase C / Backtest", "approve", "Backtest engine built & tested", "ALPHA — 2026-08-28T14:20:00Z — a3")
        gamma_memo_c = AgentMemo("C-2", "GAMMA", "SWARM", "Phase C / Audit", "approve", "No lookahead bias detected", "GAMMA — 2026-08-28T14:21:00Z — g3")
        beta_memo_c = AgentMemo("C-3", "BETA", "SWARM", "Phase C / Stress", "approve", "Monte Carlo latency stress passed", "BETA — 2026-08-28T14:22:00Z — b3")
        regime_metrics = {
            RegimeID.REGIME_1.value: {"net_return_pct": 8.5, "sharpe": 2.4, "max_drawdown_pct": 1.2},
            RegimeID.REGIME_2.value: {"net_return_pct": -0.8, "sharpe": -0.2, "max_drawdown_pct": 2.8},
            RegimeID.REGIME_3.value: {"net_return_pct": 2.1, "sharpe": 1.1, "max_drawdown_pct": 1.5},
            RegimeID.REGIME_4.value: {"net_return_pct": 14.2, "sharpe": 3.8, "max_drawdown_pct": 1.9},
        }
        res_c = orchestrator.execute_phase_c(
            idea_id=idea_id,
            regime_metrics=regime_metrics,
            worst_case_drawdown_pct=2.8,
            alpha_memo=alpha_memo_c,
            gamma_memo=gamma_memo_c,
            beta_memo=beta_memo_c,
        )
        assert res_c["status"] == "PHASE_C_COMPLETE"
        assert Path(res_c["backtest_file"]).exists()

        # 4. Phase D
        beta_memo_d = AgentMemo("D-1", "BETA", "SWARM", "Phase D / Risk", "approve", "Risk limits & watchdog verified", "BETA — 2026-08-28T14:30:00Z — b4")
        alpha_memo_d = AgentMemo("D-2", "ALPHA", "SWARM", "Phase D / Logic", "approve", "Executable watchdog implemented", "ALPHA — 2026-08-28T14:31:00Z — a4")
        delta_memo_d = AgentMemo("D-3", "DELTA", "SWARM", "Phase D / Persistence", "approve", "Kill switch state persisted", "DELTA — 2026-08-28T14:32:00Z — d4")
        res_d = orchestrator.execute_phase_d(
            idea_id=idea_id,
            leverage_cap=3.0,
            liquidation_buffer_pct=0.40,
            has_executable_watchdog=True,
            beta_memo=beta_memo_d,
            alpha_memo=alpha_memo_d,
            delta_memo=delta_memo_d,
        )
        assert res_d["status"] == "PHASE_D_COMPLETE"
        assert Path(res_d["risk_file"]).exists()

        # 5. Gate Decision
        alpha_m_g = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "All tests green", "ALPHA — 2026-08-28T14:40:00Z — a5")
        beta_m_g = AgentMemo("G-2", "BETA", "SWARM", "Gate", "approve", "Adversarial tests green", "BETA — 2026-08-28T14:41:00Z — b5")
        gamma_m_g = AgentMemo("G-3", "GAMMA", "SWARM", "Gate", "approve", "Statistical hurdles green", "GAMMA — 2026-08-28T14:42:00Z — g5")
        delta_m_g = AgentMemo("G-4", "DELTA", "SWARM", "Gate", "approve", "Persistence & state green", "DELTA — 2026-08-28T14:43:00Z — d5")

        regime_exp = {
            RegimeID.REGIME_1.value: 0.0035,
            RegimeID.REGIME_2.value: -0.0008,
            RegimeID.REGIME_3.value: 0.0010,
            RegimeID.REGIME_4.value: 0.0065,
        }
        res_gate = orchestrator.execute_gate_decision(
            idea_id=idea_id,
            regime_expectancies=regime_exp,
            worst_case_drawdown_pct=2.8,
            max_drawdown_cap_pct=3.5,
            memos=[alpha_m_g, beta_m_g, gamma_m_g, delta_m_g],
        )
        assert res_gate["verdict"] == "PASS"
        assert res_gate["current_state"] == IdeaDirectoryState.APPROVED.value
        assert Path(res_gate["gate_file"]).exists()

        # 6. Phase E Telemetry
        res_e = orchestrator.execute_phase_e_telemetry(
            idea_id=idea_id,
            slippage_divergence_pct=0.04,
            drift_p_value=0.45,
            reporting_agents=None,
        )
        assert res_e["status"] == "RUNNING"
        assert res_e["is_paused"] is False

        # Verify DB persisted agent audit records
        audit_memos = memory_db.get_agent_memos_for_idea(idea_id)
        assert len(audit_memos) >= 10

    def test_pipeline_phase_b_less_than_five_sources_fails(self, tmp_path: Path):
        orchestrator = PipelineOrchestrator(base_ideas_dir=tmp_path / "docs" / "ideas")
        idea_id = "idea-01-carry"

        m_gamma = AgentMemo("B-1", "GAMMA", "SWARM", "Phase B", "approve", "Verified", "GAMMA — 2026-08-28T14:00:00Z — g1")
        m_delta = AgentMemo("B-2", "DELTA", "SWARM", "Phase B", "approve", "Verified", "DELTA — 2026-08-28T14:00:00Z — d1")
        m_beta = AgentMemo("B-3", "BETA", "SWARM", "Phase B", "approve", "Verified", "BETA — 2026-08-28T14:00:00Z — b1")

        with pytest.raises(ValueError, match="Phase B requires >= 5 verified independent data sources"):
            orchestrator.execute_phase_b(
                idea_id=idea_id,
                venues=["Binance"],
                fee_schedules={"binance": {"maker_rate": 0.0002, "taker_rate": 0.0005}},
                fee_verification_sources_count=4,  # Only 4 sources
                gamma_memo=m_gamma,
                delta_memo=m_delta,
                beta_memo=m_beta,
            )

    def test_pipeline_phase_d_excessive_leverage_fails(self, tmp_path: Path):
        orchestrator = PipelineOrchestrator(base_ideas_dir=tmp_path / "docs" / "ideas")
        idea_id = "idea-02-momentum"

        m_beta = AgentMemo("D-1", "BETA", "SWARM", "Phase D", "approve", "Verified", "BETA — 2026-08-28T14:00:00Z — b1")
        m_alpha = AgentMemo("D-2", "ALPHA", "SWARM", "Phase D", "approve", "Verified", "ALPHA — 2026-08-28T14:00:00Z — a1")
        m_delta = AgentMemo("D-3", "DELTA", "SWARM", "Phase D", "approve", "Verified", "DELTA — 2026-08-28T14:00:00Z — d1")

        with pytest.raises(ValueError, match="maximum leverage cap is 3.0x"):
            orchestrator.execute_phase_d(
                idea_id=idea_id,
                leverage_cap=5.0,  # Excessive
                liquidation_buffer_pct=0.40,
                has_executable_watchdog=True,
                beta_memo=m_beta,
                alpha_memo=m_alpha,
                delta_memo=m_delta,
            )
