"""Adversarial stress-testing suite for Milestone 1: Guardrails, Testnet Assertions, and IPC State Machine.
Written by Challenger 1 to empirically challenge all security invariants, edge cases, and rollback mechanics.
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any
import pytest

from src.core.config import AppConfig, ExchangeConfig, RiskConfig
from src.core.constants import (
    AgentPersona,
    HISTORICAL_REGIMES,
    IdeaDirectoryState,
    MAINNET_URL_PATTERNS,
    MemoPosition,
)
from src.core.exceptions import (
    GuardrailException,
    InvalidAgentMemoException,
    InvalidRiskCapsException,
    InvalidStateTransitionException,
    LiveTradingForbiddenException,
    MainnetEndpointDetectedException,
    StateRollbackException,
    ToSComplianceException,
    UnreviewedCodeException,
)
from src.core.guardrails import (
    GuardrailValidator,
    assert_live_switch_locked,
    assert_reviewed_code,
    assert_risk_caps,
    assert_testnet_config,
    assert_testnet_url,
    assert_tos_compliance,
)
from src.ipc.memo import (
    AgentMemo,
    append_memo_to_debate,
    format_memo,
    parse_debate_file,
    parse_memo,
    validate_memo,
)
from src.ipc.state_machine import (
    IdeaStateMachine,
    IdeaStateRecord,
    load_idea_state,
    save_idea_state,
)


class TestAdversarialTestnetGuardrails:
    """Adversarial challenge against assert_testnet_url and assert_testnet_config."""

    @pytest.mark.parametrize(
        "mainnet_url",
        [
            "https://fapi.binance.com",
            "https://api.binance.com/api/v3/ticker",
            "https://api.bybit.com/v5/market/tickers",
            "https://api.kucoin.com",
            "https://api.delta.exchange/v2/tickers",
            "https://api.india.delta.exchange",
            "https://api.okx.com",
            "https://api.coinbase.com",
            "https://api.kraken.com",
            "https://dapi.binance.com",
            "HTTPS://FAPI.BINANCE.COM/FAPI/V1/ORDER",
            "https://FaPi.BiNaNcE.CoM/FaPi/V1/OrDeR",
            "https://fapi.binance.com:443/v1/order",
            "https://api.bybit.com:8443/v5/market",
        ],
    )
    def test_standard_mainnet_urls_strictly_blocked(self, mainnet_url: str):
        """Assert that all standard mainnet endpoints trip MainnetEndpointDetectedException."""
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_url(mainnet_url)

    @pytest.mark.parametrize(
        "query_evasion_url",
        [
            "https://fapi.binance.com/fapi/v1/order?testnet=true",
            "https://fapi.binance.com/v1/depth?mode=sandbox",
            "https://api.bybit.com/v5/order?env=demo",
            "https://api.kucoin.com/api/v1/order?is_testnet=1",
            "https://api.india.delta.exchange/v2/orders?testnet=yes",
            "https://fapi.binance.com/testnet/v1/order",
            "https://api.bybit.com/sandbox/v5/order",
            "https://fapi.binance.com/v1/order#testnet",
            "https://api.bybit.com/v5/market#demo",
            "https://testnet:pass@fapi.binance.com/fapi/v1/order",
            "https://sandbox@api.bybit.com/v5/order",
        ],
    )
    def test_evasion_query_and_path_urls(self, query_evasion_url: str):
        """Challenge: Probe whether query parameters containing 'testnet' or 'sandbox' allow mainnet URLs to evade detection."""
        # Empirically evaluate if the guardrail catches this evasion attempt
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_url(query_evasion_url)

    @pytest.mark.parametrize(
        "legit_testnet_url",
        [
            "https://testnet.binancefuture.com/fapi/v1/order",
            "wss://stream.binancefuture.com/ws",
            "https://api-testnet.bybit.com/v5/market/tickers",
            "wss://stream-testnet.bybit.com/v5/public/linear",
            "https://testnet-api.delta.exchange/v2/tickers",
            "https://api-sandbox.kucoin.com/api/v1/bullet-public",
            "http://127.0.0.1:8080/mock/binance",
            "http://localhost:9000/api",
        ],
    )
    def test_legit_testnet_urls_pass(self, legit_testnet_url: str):
        """Verify that genuine testnet and local mock endpoints are never false-positively rejected."""
        assert_testnet_url(legit_testnet_url)

    def test_app_config_adversarial_injection(self):
        """Test recursive discovery of mainnet URLs hidden inside complex AppConfig structures."""
        exchanges = {
            "binance": ExchangeConfig(
                exchange_id="binance",
                name="Binance",
                rest_url="https://testnet.binancefuture.com",
                ws_url="wss://stream.binancefuture.com/ws",
                is_testnet=True,
            ),
            "bybit": ExchangeConfig(
                exchange_id="bybit",
                name="Bybit",
                rest_url="https://api.bybit.com",  # MAINNET INJECTION
                ws_url="wss://stream-testnet.bybit.com/v5/public/linear",
                is_testnet=True,
            ),
        }
        cfg = AppConfig(
            environment="testnet",
            is_live_armed=False,
            exchanges=exchanges,
            risk=RiskConfig(),
        )
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_config(cfg)

    def test_nested_dict_deep_mainnet_injection(self):
        """Test recursive discovery of mainnet URLs hidden deeply in nested dictionary hierarchies."""
        deep_payload = {
            "level1": {
                "level2": {
                    "level3": [
                        {"endpoint_a": "https://testnet.binancefuture.com"},
                        {"endpoint_b": "https://api.kucoin.com/api/v1/market"},  # MAINNET INJECTION
                    ]
                }
            }
        }
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_config(deep_payload)


class TestAdversarialRiskCaps:
    """Adversarial challenge against risk cap validation and boundaries."""

    @pytest.mark.parametrize(
        "invalid_caps",
        [
            {"max_drawdown_pct": float("nan"), "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},
            {"max_drawdown_pct": float("inf"), "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},
            {"max_drawdown_pct": -float("inf"), "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": -100.0, "leverage_cap": 3.0},
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": 0.0, "leverage_cap": 3.0},
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": 1000.0, "leverage_cap": float("nan")},
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": 1000.0, "leverage_cap": float("inf")},
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": 1000.0, "leverage_cap": 0.9999},  # < 1.0x
            {"max_drawdown_pct": 0.05, "position_size_cap_usd": 1000.0, "leverage_cap": 10.0001}, # > 10.0x
            {"max_drawdown_pct": 0.00099, "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},  # < 0.001 (0.1%)
            {"max_drawdown_pct": 0.5001, "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},   # > 0.50 (50%)
            {"max_drawdown_pct": "not-a-number", "position_size_cap_usd": 1000.0, "leverage_cap": 3.0},
            {},  # Empty dictionary
        ],
    )
    def test_adversarial_risk_caps_rejected(self, invalid_caps: dict[str, Any]):
        """Assert that adversarial and out-of-boundary risk caps are strictly rejected."""
        with pytest.raises(InvalidRiskCapsException):
            assert_risk_caps(invalid_caps)

    def test_nan_position_size_cap_probe(self):
        """Challenge: Probe whether position_size_cap_usd=NaN is caught or bypasses validation."""
        nan_caps = {"max_drawdown_pct": 0.05, "position_size_cap_usd": float("nan"), "leverage_cap": 3.0}
        with pytest.raises(InvalidRiskCapsException):
            assert_risk_caps(nan_caps)

    @pytest.mark.parametrize(
        "valid_boundary_caps",
        [
            {"max_drawdown_pct": 0.001, "position_size_cap_usd": 1.0, "leverage_cap": 1.0},       # Exact lower boundaries
            {"max_drawdown_pct": 0.500, "position_size_cap_usd": 1000000.0, "leverage_cap": 10.0}, # Exact upper boundaries
            {"max_drawdown_pct": "0.05", "position_size_cap_usd": "5000", "leverage_cap": "3"},     # String numeric parse
        ],
    )
    def test_valid_boundary_risk_caps_accepted(self, valid_boundary_caps: dict[str, Any]):
        """Assert that exact boundary risk caps pass cleanly."""
        assert_risk_caps(valid_boundary_caps)


class TestAdversarialToSScreen:
    """Adversarial challenge against ToS and anti-manipulation pattern filter."""

    @pytest.mark.parametrize(
        "prohibited_content",
        [
            "Execute aggressive wash-trading across two subaccounts.",
            "High-frequency quote_stuffing to saturate exchange order queue.",
            "front_running retail market orders via latency arb.",
            "Use predatory toxic-order-flow to force liquidations.",
            "Coordinated market_manipulation to manipulate mark price.",
            "Trigger ddos on rival venue API gateway.",
            "exploit_user stop losses through spread widening.",
        ],
    )
    def test_adversarial_tos_patterns_caught(self, prohibited_content: str):
        """Assert that variations of manipulative tactics are caught."""
        with pytest.raises(ToSComplianceException):
            assert_tos_compliance(prohibited_content)

    @pytest.mark.parametrize(
        "legit_strategy_text",
        [
            "Delta-neutral cash-and-carry funding rate capture.",
            "Statistical mean-reversion of funding rate spreads.",
            "Orderbook depth and volume-weighted average price calculation.",
            "Dual-leg execution with 1500ms desync watchdog protection.",
        ],
    )
    def test_legit_strategy_text_passes_tos(self, legit_strategy_text: str):
        """Assert that legitimate quantitative terms do not trigger false positives."""
        assert_tos_compliance(legit_strategy_text)


class TestAdversarialReviewedCode:
    """Adversarial challenge against reviewed code certifications."""

    @pytest.mark.parametrize("fake_auditor", ["ALPHA", "BETA", "GAMMA", "SWARM", "COMMUNITY", "USER", "ROOT"])
    def test_unauthorized_auditor_rejected(self, fake_auditor: str):
        """Assert that non-DELTA / non-OVERSEER certification is rejected."""
        with pytest.raises(UnreviewedCodeException) as exc_info:
            assert_reviewed_code(
                package_name="external_solver",
                reviewer_agent=fake_auditor,
                review_notes="Security verified and safe for production usage.",
                is_reviewed=True,
            )
        assert "Only DELTA or OVERSEER can certify external code" in str(exc_info.value)

    @pytest.mark.parametrize("short_notes", ["", "   ", "ok", "fine", "approved", "done"])
    def test_insufficient_review_notes_rejected(self, short_notes: str):
        """Assert that terse or empty review notes are rejected."""
        with pytest.raises(UnreviewedCodeException) as exc_info:
            assert_reviewed_code(
                package_name="ccxt",
                reviewer_agent="DELTA",
                review_notes=short_notes,
                is_reviewed=True,
            )
        assert "Meaningful review notes required" in str(exc_info.value)


class TestAdversarialAgentMemo:
    """Adversarial challenge against Agent Memo parsing, signatures, and veto constraints."""

    def test_forged_agent_signature_rejected(self):
        """Assert that a memo where SIGNATURE agent != FROM agent is rejected."""
        memo = AgentMemo(
            memo_id="FORGE-01",
            from_agent="ALPHA",
            to_agent="SWARM",
            re_topic="idea-03 / Gate",
            position="approve",
            evidence="Code is ready",
            signature="BETA — 2026-08-28T15:00:00Z — hash123",  # Forged BETA signature
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "SIGNATURE agent mismatch" in str(exc_info.value)

    @pytest.mark.parametrize("malformed_sig", [
        "ALPHA",
        "ALPHA — 2026-08-28",
        "ALPHA - 2026-08-28",
        "",
        "   ",
    ])
    def test_malformed_signature_format_rejected(self, malformed_sig: str):
        """Assert that signatures not matching `<Agent> — <Timestamp> — <Commit>` are rejected."""
        memo = AgentMemo(
            memo_id="SIG-01",
            from_agent="ALPHA",
            to_agent="SWARM",
            re_topic="idea-03 / Gate",
            position="approve",
            evidence="Evidence verified",
            signature=malformed_sig,
        )
        with pytest.raises(InvalidAgentMemoException):
            validate_memo(memo)

    @pytest.mark.parametrize("empty_failure", ["", "   ", "None", "N/A", "null", "none", "NULL"])
    def test_veto_with_empty_or_dummy_failure_scenario_rejected(self, empty_failure: str):
        """Assert that a veto without genuine failure scenario is rejected."""
        memo = AgentMemo(
            memo_id="VETO-01",
            from_agent="BETA",
            to_agent="SWARM",
            re_topic="idea-03 / Gate",
            position="veto",
            evidence="Evidence",
            failure_scenario=empty_failure,
            remediation="Add watchdog timer",
            signature="BETA — 2026-08-28T15:00:00Z — c0ffee",
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "FAILURE SCENARIO is required" in str(exc_info.value)

    @pytest.mark.parametrize("empty_remed", ["", "   ", "None", "N/A", "null", "none", "NULL"])
    def test_veto_with_empty_or_dummy_remediation_rejected(self, empty_remed: str):
        """Assert that a veto without genuine remediation is rejected."""
        memo = AgentMemo(
            memo_id="VETO-02",
            from_agent="BETA",
            to_agent="SWARM",
            re_topic="idea-03 / Gate",
            position="veto",
            evidence="Evidence",
            failure_scenario="Leg desync occurs during latency spike",
            remediation=empty_remed,
            signature="BETA — 2026-08-28T15:00:00Z — c0ffee",
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "REMEDIATION is required" in str(exc_info.value)


class TestAdversarialStateMachineTransitionsAndRollbacks:
    """Adversarial challenge against 5-state machine transitions, quorums, and DELTA rollback integrity."""

    def test_unauthorized_state_jump_backlog_to_paper_fails_and_rolls_back(self, tmp_path: Path):
        """Assert that attempting to jump directly from /backlog to /paper is blocked and rolled back."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)

        # Initial state is backlog
        initial = load_idea_state(idea_dir)
        assert initial.current_state == IdeaDirectoryState.BACKLOG.value

        # Attempt illegal jump to paper
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.PAPER.value,
                reason="Unauthorized jump to paper trading",
            )
        assert "Idea must pass Gate Decision first" in str(exc_info.value)

        # Verify DELTA rollback restored backlog state intact
        rolled_back = load_idea_state(idea_dir)
        assert rolled_back.current_state == IdeaDirectoryState.BACKLOG.value
        assert rolled_back.gate_verdict != "PASS"

    def test_transition_to_audit_without_risk_caps_fails_and_rolls_back(self, tmp_path: Path):
        """Assert that attempting to transition to /audit without risk caps is blocked and rolled back."""
        idea_dir = tmp_path / "idea-01-carry"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)

        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                risk_caps=None,
            )
        assert "Risk caps missing" in str(exc_info.value)

        # State must remain backlog
        assert load_idea_state(idea_dir).current_state == IdeaDirectoryState.BACKLOG.value

    def test_phase_quorum_bypass_attempts(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that omitting any required agent approval blocks phase transition and triggers rollback."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        # Phase A requires GAMMA + BETA
        m_gamma = AgentMemo("A-1", "GAMMA", "SWARM", "Phase A", "approve", "Formal concepts", "GAMMA — 2026-08-28T15:00:00Z — g1")
        m_alpha = AgentMemo("A-2", "ALPHA", "SWARM", "Phase A", "approve", "Code ready", "ALPHA — 2026-08-28T15:00:00Z — a1")

        # Passing ALPHA + GAMMA (missing BETA) -> MUST fail
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                target_phase="PHASE_A",
                memos=[m_gamma, m_alpha],
            )
        assert "Missing required approvals from ['BETA']" in str(exc_info.value)

        # Phase B requires GAMMA + DELTA + BETA
        m_delta = AgentMemo("B-1", "DELTA", "SWARM", "Phase B", "approve", "Data persisted", "DELTA — 2026-08-28T15:00:00Z — d1")
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                target_phase="PHASE_B",
                memos=[m_gamma, m_delta],  # Missing BETA
            )
        assert "Missing required approvals from ['BETA']" in str(exc_info.value)

        # Phase C requires ALPHA + GAMMA + BETA
        m_beta = AgentMemo("B-2", "BETA", "SWARM", "Phase B", "approve", "Fees audited", "BETA — 2026-08-28T15:00:00Z — b1")
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                target_phase="PHASE_C",
                memos=[m_alpha, m_beta],  # Missing GAMMA
            )
        assert "Missing required approvals from ['GAMMA']" in str(exc_info.value)

        # Phase D requires BETA + ALPHA + DELTA
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                target_phase="PHASE_D",
                memos=[m_alpha, m_delta],  # Missing BETA
            )
        assert "Missing required approvals from ['BETA']" in str(exc_info.value)

    def test_single_veto_fails_gate_decision_and_persists_failure_record(
        self,
        tmp_path: Path,
        valid_risk_caps: dict[str, float],
    ):
        """Assert that even with 3 approvals, a single veto fails the gate and marks gate_verdict as FAIL."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        m_alpha = AgentMemo("G-1", "ALPHA", "SWARM", "Gate", "approve", "Engine operational", "ALPHA — 2026-08-28T15:00:00Z — a1")
        m_gamma = AgentMemo("G-2", "GAMMA", "SWARM", "Gate", "approve", "Statistics verified", "GAMMA — 2026-08-28T15:00:00Z — g1")
        m_delta = AgentMemo("G-3", "DELTA", "SWARM", "Gate", "approve", "Persistence verified", "DELTA — 2026-08-28T15:00:00Z — d1")
        m_beta_veto = AgentMemo(
            memo_id="G-4",
            from_agent="BETA",
            to_agent="SWARM",
            re_topic="Gate",
            position="veto",
            evidence="Taker fee drag in Regime 2 is 0.220% exceeding spread",
            failure_scenario="Drawdown blows through 5% risk cap under extreme basis drift",
            remediation="Increase MVS hurdle to 0.50% before paper trading",
            signature="BETA — 2026-08-28T15:00:00Z — b1",
        )

        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.APPROVED.value,
                memos=[m_alpha, m_gamma, m_delta, m_beta_veto],
            )
        assert "Gate Decision vetoed by BETA" in str(exc_info.value)

        # Gate state must be recorded as FAIL and state cannot move to approved
        state = load_idea_state(idea_dir)
        assert state.gate_verdict == "FAIL"
        assert state.current_state != IdeaDirectoryState.APPROVED.value

    def test_state_record_serialization_integrity(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that IdeaStateRecord roundtrips to markdown without field degradation."""
        record = IdeaStateRecord(
            idea_id="idea-03-cross-exchange",
            current_state=IdeaDirectoryState.APPROVED.value,
            current_phase="GATE",
            signatures=["ALPHA — 2026-08-28 — 1", "BETA — 2026-08-28 — 2"],
            history=[
                {"timestamp_utc": "2026-08-28T14:00:00Z", "from_state": "backlog", "to_state": "audit", "reason": "Intake"},
                {"timestamp_utc": "2026-08-28T15:00:00Z", "from_state": "audit", "to_state": "approved", "reason": "Gate Pass"},
            ],
            risk_caps=valid_risk_caps,
            gate_verdict="PASS",
        )
        md = record.to_markdown()
        recovered = IdeaStateRecord.from_markdown(md, idea_id="idea-03-cross-exchange")

        assert recovered.idea_id == record.idea_id
        assert recovered.current_state == record.current_state
        assert recovered.current_phase == record.current_phase
        assert recovered.gate_verdict == record.gate_verdict
        assert recovered.signatures == record.signatures
        assert recovered.risk_caps["max_drawdown_pct"] == record.risk_caps["max_drawdown_pct"]
        assert len(recovered.history) == len(record.history)
