"""Unit tests for Agent Memos, 5-State Directory State Machine, Ledgers, and SQLite Storage.
"""

from pathlib import Path
import pytest

from src.core.constants import (
    AgentPersona,
    HISTORICAL_REGIMES,
    IdeaDirectoryState,
    MemoPosition,
    RegimeID,
)
from src.core.exceptions import (
    InvalidAgentMemoException,
    InvalidRiskCapsException,
    InvalidStateTransitionException,
    StateRollbackException,
)
from src.ipc.ledgers import (
    IdeasRegistry,
    MemoryLog,
    PlanChangelog,
    StatusBoard,
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
from src.storage.database import DatabaseManager
from src.storage.models import (
    AgentStateAuditModel,
    ExchangeMetadataModel,
    FeeScheduleModel,
    FundingRateModel,
    InstrumentModel,
    KillSwitchStateModel,
    OrderbookSnapshotModel,
    SpreadOpportunityModel,
    TickerSnapshotModel,
)


class TestAgentMemoSpec:
    """Test suite for Standard Agent Memo formatting, parsing, and validation."""

    def test_valid_approval_memo_validation(self, sample_approve_memo: AgentMemo):
        """Assert that a well-formed approval memo passes validation."""
        sample_approve_memo.validate()
        formatted = format_memo(sample_approve_memo)
        assert "## AGENT MEMO #MEMO-101" in formatted
        assert "- FROM: GAMMA" in formatted
        assert "- POSITION: approve" in formatted

    def test_valid_veto_memo_validation(self, sample_veto_memo: AgentMemo):
        """Assert that a veto memo with failure scenario and remediation passes validation."""
        sample_veto_memo.validate()
        formatted = format_memo(sample_veto_memo)
        assert "- POSITION: veto" in formatted
        assert "FAILURE SCENARIO: Leg 1 fills" in formatted
        assert "REMEDIATION: Implement automatic" in formatted

    def test_veto_without_failure_scenario_raises(self):
        """Assert that a veto without failure scenario is rejected."""
        memo = AgentMemo(
            memo_id="MEMO-201",
            from_agent=AgentPersona.BETA.value,
            to_agent="SWARM",
            re_topic="idea-03 / Phase A / Review",
            position=MemoPosition.VETO.value,
            evidence="Too risky",
            failure_scenario="",  # Empty
            remediation="Fix it",
            signature=f"{AgentPersona.BETA.value} — 2026-08-28T14:30:00Z — c0ffee",
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "FAILURE SCENARIO is required" in str(exc_info.value)

    def test_veto_without_remediation_raises(self):
        """Assert that a veto without remediation is rejected."""
        memo = AgentMemo(
            memo_id="MEMO-202",
            from_agent=AgentPersona.BETA.value,
            to_agent="SWARM",
            re_topic="idea-03 / Phase A / Review",
            position=MemoPosition.VETO.value,
            evidence="Too risky",
            failure_scenario="Orderbook collapses",
            remediation="N/A",  # Invalid
            signature=f"{AgentPersona.BETA.value} — 2026-08-28T14:30:00Z — c0ffee",
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "REMEDIATION is required" in str(exc_info.value)

    def test_signature_agent_mismatch_raises(self):
        """Assert that signature agent differing from FROM header is rejected."""
        memo = AgentMemo(
            memo_id="MEMO-203",
            from_agent=AgentPersona.GAMMA.value,
            to_agent="SWARM",
            re_topic="idea-01 / Phase B / Fees",
            position=MemoPosition.APPROVE.value,
            evidence="Fee schedule verified",
            signature=f"{AgentPersona.ALPHA.value} — 2026-08-28T14:30:00Z — c0ffee",
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "SIGNATURE agent mismatch" in str(exc_info.value)

    def test_invalid_signature_format_raises(self):
        """Assert that malformed signature strings raise exceptions."""
        memo = AgentMemo(
            memo_id="MEMO-204",
            from_agent=AgentPersona.ALPHA.value,
            to_agent="SWARM",
            re_topic="idea-01 / Phase C / Backtest",
            position=MemoPosition.APPROVE.value,
            evidence="Backtest passed",
            signature="ALPHA signed this",  # Missing timestamp and commit
        )
        with pytest.raises(InvalidAgentMemoException) as exc_info:
            validate_memo(memo)
        assert "Invalid SIGNATURE format" in str(exc_info.value)

    def test_memo_parse_roundtrip(self, sample_veto_memo: AgentMemo):
        """Assert that formatting and parsing a memo reproduces identical fields."""
        md_text = format_memo(sample_veto_memo)
        parsed = parse_memo(md_text)
        assert parsed.memo_id == sample_veto_memo.memo_id
        assert parsed.from_agent == sample_veto_memo.from_agent
        assert parsed.position == sample_veto_memo.position
        assert parsed.failure_scenario == sample_veto_memo.failure_scenario
        assert parsed.remediation == sample_veto_memo.remediation

    def test_debate_file_append_and_parse(self, tmp_path: Path, sample_approve_memo: AgentMemo, sample_veto_memo: AgentMemo):
        """Assert that appending memos to DEBATE.md and parsing them recovers all memos in order."""
        debate_file = tmp_path / "DEBATE.md"
        append_memo_to_debate(debate_file, sample_approve_memo)
        append_memo_to_debate(debate_file, sample_veto_memo)

        memos = parse_debate_file(debate_file)
        assert len(memos) == 2
        assert memos[0].memo_id == "MEMO-101"
        assert memos[1].memo_id == "MEMO-102"


class TestIdeaStateMachine:
    """Test suite for 5-State Directory Lifecycle (/backlog -> /audit -> /approved -> /paper -> /resolved)."""

    def test_initial_state_is_backlog(self, tmp_path: Path):
        """Assert that an uninitialized idea directory defaults to backlog state."""
        idea_dir = tmp_path / "idea-01-cash-and-carry"
        state = load_idea_state(idea_dir)
        assert state.current_state == IdeaDirectoryState.BACKLOG.value

    def test_transition_to_audit_requires_risk_caps(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that moving to /audit succeeds with valid risk caps and fails without them."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)

        # Attempt transition without risk caps -> must fail & rollback
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=None)
        assert "Risk caps missing" in str(exc_info.value)
        assert load_idea_state(idea_dir).current_state == IdeaDirectoryState.BACKLOG.value

        # Attempt transition with valid risk caps -> must succeed
        record = sm.transition(
            idea_dir=idea_dir,
            target_state=IdeaDirectoryState.AUDIT.value,
            risk_caps=valid_risk_caps,
            reason="Pre-flight risk checks passed",
        )
        assert record.current_state == IdeaDirectoryState.AUDIT.value
        assert record.risk_caps["max_drawdown_pct"] == 0.05

    def test_phase_a_sign_off_requires_gamma_and_beta(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that Phase A completion requires approvals from both GAMMA and BETA."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        gamma_memo = AgentMemo(
            memo_id="M-1",
            from_agent=AgentPersona.GAMMA.value,
            to_agent="SWARM",
            re_topic="Phase A / Concepts",
            position=MemoPosition.APPROVE.value,
            evidence="Payoff derived",
            signature="GAMMA — 2026-08-28T14:35:00Z — c0ffee",
        )
        beta_memo = AgentMemo(
            memo_id="M-2",
            from_agent=AgentPersona.BETA.value,
            to_agent="SWARM",
            re_topic="Phase A / Review",
            position=MemoPosition.APPROVE.value,
            evidence="Residual risks audited",
            signature="BETA — 2026-08-28T14:36:00Z — c0ffee",
        )

        # Only GAMMA memo -> should fail
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.AUDIT.value,
                target_phase="PHASE_A",
                memos=[gamma_memo],
            )
        assert "Missing required approvals from ['BETA']" in str(exc_info.value)

        # Both GAMMA and BETA memos -> succeeds
        record = sm.transition(
            idea_dir=idea_dir,
            target_state=IdeaDirectoryState.AUDIT.value,
            target_phase="PHASE_A",
            memos=[gamma_memo, beta_memo],
        )
        assert record.current_phase == "PHASE_A"

    def test_gate_decision_unanimous_quorum_and_veto(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that Gate decision requires unanimous 4-agent approval and fails instantly on single veto."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        alpha_m = AgentMemo("G-1", AgentPersona.ALPHA.value, "SWARM", "Gate", MemoPosition.APPROVE.value, "Pass", "ALPHA — 2026-08-28T14:40:00Z — 111")
        gamma_m = AgentMemo("G-2", AgentPersona.GAMMA.value, "SWARM", "Gate", MemoPosition.APPROVE.value, "Pass", "GAMMA — 2026-08-28T14:40:00Z — 222")
        delta_m = AgentMemo("G-3", AgentPersona.DELTA.value, "SWARM", "Gate", MemoPosition.APPROVE.value, "Pass", "DELTA — 2026-08-28T14:40:00Z — 333")
        beta_veto = AgentMemo(
            "G-4",
            AgentPersona.BETA.value,
            "SWARM",
            "Gate",
            MemoPosition.VETO.value,
            "Fee drag underestimated",
            "BETA — 2026-08-28T14:40:00Z — 444",
            failure_scenario="Taker fee is 5.5 bps not 2.0 bps, wiping out net expectancy.",
            remediation="Re-run backtest with 0.210% fee drag.",
        )

        # Veto causes Gate Fail
        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(
                idea_dir=idea_dir,
                target_state=IdeaDirectoryState.APPROVED.value,
                memos=[alpha_m, gamma_m, delta_m, beta_veto],
            )
        assert "Gate Decision vetoed by BETA" in str(exc_info.value)
        assert load_idea_state(idea_dir).gate_verdict == "FAIL"

        # If BETA approves instead -> Gate passes
        beta_approve = AgentMemo("G-4B", AgentPersona.BETA.value, "SWARM", "Gate", MemoPosition.APPROVE.value, "Pass", "BETA — 2026-08-28T14:45:00Z — 444")
        record = sm.transition(
            idea_dir=idea_dir,
            target_state=IdeaDirectoryState.APPROVED.value,
            memos=[alpha_m, gamma_m, delta_m, beta_approve],
        )
        assert record.current_state == IdeaDirectoryState.APPROVED.value
        assert record.gate_verdict == "PASS"

    def test_transition_to_paper_requires_gate_pass(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert that transitioning to /paper is forbidden without Gate pass."""
        idea_dir = tmp_path / "idea-03-cross-exchange"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        with pytest.raises(InvalidStateTransitionException) as exc_info:
            sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.PAPER.value)
        assert "Idea must pass Gate Decision first" in str(exc_info.value)


class TestSQLiteStorageLayer:
    """Test suite for SQLite DatabaseManager, WAL mode, and 12 relational tables."""

    def test_wal_mode_and_connection(self, test_db: DatabaseManager):
        """Assert that WAL mode is engaged and foreign keys are enabled."""
        with test_db.transaction() as conn:
            journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
            assert journal_mode.upper() == "WAL"
            foreign_keys = conn.execute("PRAGMA foreign_keys;").fetchone()[0]
            assert foreign_keys == 1

    def test_12_tables_exist_and_seed_regimes(self, test_db: DatabaseManager):
        """Assert that all 12 tables are created and 4 historical regimes are seeded."""
        with test_db.transaction() as conn:
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            table_names = {t[0] for t in tables}

            expected_tables = {
                "exchange_metadata",
                "instruments",
                "funding_rates",
                "ticker_snapshots",
                "orderbook_snapshots",
                "fee_schedules",
                "regimes",
                "regime_datapoints",
                "spread_opportunities",
                "kill_switch_state",
                "audit_log",
                "agent_state_audit",
            }
            assert expected_tables.issubset(table_names)

        # Verify regimes seeded
        regimes = test_db.list_regimes()
        assert len(regimes) == 4
        reg_ids = {r.regime_id for r in regimes}
        assert reg_ids == {"REGIME_1", "REGIME_2", "REGIME_3", "REGIME_4"}

    def test_exchange_and_instrument_crud(self, test_db: DatabaseManager):
        """Assert that exchange metadata and instrument records can be stored and retrieved."""
        exchange = ExchangeMetadataModel(
            exchange_id="binance",
            name="Binance Futures Testnet",
            api_type="rest_ccxt",
            rest_testnet_url="https://testnet.binancefuture.com",
            ws_testnet_url="wss://stream.binancefuture.com/ws",
            auth_type="hmac_sha256",
        )
        test_db.upsert_exchange_metadata(exchange)
        retrieved_ex = test_db.get_exchange_metadata("binance")
        assert retrieved_ex is not None
        assert retrieved_ex.name == "Binance Futures Testnet"

        instrument = InstrumentModel(
            symbol="BTCUSDT",
            exchange_id="binance",
            base_asset="BTC",
            quote_asset="USDT",
            contract_type="linear_perp",
            price_precision=2,
            quantity_precision=3,
            tick_size=0.1,
            lot_size=0.001,
            min_notional=5.0,
        )
        test_db.upsert_instrument(instrument)
        retrieved_inst = test_db.get_instrument("BTCUSDT", "binance")
        assert retrieved_inst is not None
        assert retrieved_inst.lot_size == 0.001

    def test_funding_rate_and_ticker_snapshots(self, test_db: DatabaseManager):
        """Assert storage and retrieval of funding rates and ticker snapshots."""
        self.test_exchange_and_instrument_crud(test_db)

        fr = FundingRateModel(
            exchange_id="binance",
            symbol="BTCUSDT",
            timestamp_ms=1700000000000,
            settlement_time_utc="2023-11-14T16:00:00Z",
            funding_rate=0.00035,
            funding_rate_annualized=0.38325,
            mark_price=36500.0,
            index_price=36495.0,
        )
        row_id = test_db.insert_funding_rate(fr)
        assert row_id > 0
        latest_fr = test_db.get_latest_funding_rate("BTCUSDT", "binance")
        assert latest_fr is not None
        assert latest_fr.funding_rate == 0.00035

        ticker = TickerSnapshotModel(
            exchange_id="binance",
            symbol="BTCUSDT",
            timestamp_ms=1700000000000,
            last_price=36500.0,
            mark_price=36500.0,
            index_price=36495.0,
            bid1_price=36499.5,
            ask1_price=36500.5,
            bid1_qty=1.5,
            ask1_qty=2.0,
            spread_bps=0.27,
        )
        t_id = test_db.insert_ticker_snapshot(ticker)
        assert t_id > 0
        latest_t = test_db.get_latest_ticker("BTCUSDT", "binance")
        assert latest_t is not None
        assert latest_t.bid1_price == 36499.5

    def test_fee_schedule_phase_b_requirement(self, test_db: DatabaseManager):
        """Assert that Phase B fee schedule with >= 5 citations can be stored and retrieved."""
        self.test_exchange_and_instrument_crud(test_db)

        fee = FeeScheduleModel(
            exchange_id="binance",
            vip_tier="VIP0",
            maker_rate=0.0002,
            taker_rate=0.0005,
            verified_sources_count=5,
            verification_source_citations="1. Official Docs; 2. API /fapi/v1/commissionRate; 3. Coinglass; 4. CCXT; 5. Testnet probe",
            verified_at="2026-08-28T14:00:00Z",
        )
        test_db.upsert_fee_schedule(fee)
        retrieved_fee = test_db.get_fee_schedule("binance", "VIP0")
        assert retrieved_fee is not None
        assert retrieved_fee.verified_sources_count == 5

    def test_spread_opportunity_and_mvs_filter(self, test_db: DatabaseManager):
        """Assert spread opportunity insertion and MVS gate filtering."""
        opp_pass = SpreadOpportunityModel(
            timestamp_ms=1700000000000,
            settlement_time_utc="2023-11-14T16:00:00Z",
            symbol="BTCUSDT",
            exchange_long="bybit",
            exchange_short="binance",
            rate_long=0.0001,
            rate_short=0.0051,
            gross_spread=0.0050,  # 0.50% (50 bps) >= 0.40% (40 bps) MVS
            total_taker_fee_drag=0.0020,
            est_slippage_drag=0.0010,
            net_expected_yield=0.0020,
            passes_mvs_gate=1,
        )
        opp_fail = SpreadOpportunityModel(
            timestamp_ms=1700000000000,
            settlement_time_utc="2023-11-14T16:00:00Z",
            symbol="ETHUSDT",
            exchange_long="bybit",
            exchange_short="binance",
            rate_long=0.0001,
            rate_short=0.0002,
            gross_spread=0.0001,  # 0.10% < 0.40% MVS
            total_taker_fee_drag=0.0020,
            est_slippage_drag=0.0010,
            net_expected_yield=-0.0020,
            passes_mvs_gate=0,
        )
        test_db.insert_spread_opportunity(opp_pass)
        test_db.insert_spread_opportunity(opp_fail)

        passing_opps = test_db.get_spread_opportunities(min_spread=0.0040, only_passing=True)
        assert len(passing_opps) == 1
        assert passing_opps[0].symbol == "BTCUSDT"

    def test_kill_switch_state_persistence(self, test_db: DatabaseManager):
        """Assert that kill-switch state is stored as a singleton and trips correctly."""
        initial = test_db.get_kill_switch_state()
        assert initial.is_tripped == 0

        test_db.set_kill_switch_state(
            is_tripped=True,
            trip_reason="Max drawdown limit 5% breached",
            tripped_by="RISK_ENGINE",
        )
        tripped = test_db.get_kill_switch_state()
        assert tripped.is_tripped == 1
        assert tripped.trip_reason == "Max drawdown limit 5% breached"
        assert tripped.tripped_by == "RISK_ENGINE"


    def test_orderbook_snapshot_crud(self, test_db: DatabaseManager):
        """Assert orderbook depth snapshots can be stored and retrieved."""
        self.test_exchange_and_instrument_crud(test_db)
        ob = OrderbookSnapshotModel(
            exchange_id="binance",
            symbol="BTCUSDT",
            timestamp_ms=1700000000000,
            bid_depth_top5=150000.0,
            ask_depth_top5=145000.0,
            bid_depth_top20=850000.0,
            ask_depth_top20=820000.0,
            spread_bps=0.25,
            mid_price=36500.0,
            raw_bids_json="[[36499.5, 1.5], [36499.0, 2.5]]",
            raw_asks_json="[[36500.5, 2.0], [36501.0, 3.0]]",
        )
        row_id = test_db.insert_orderbook_snapshot(ob)
        assert row_id > 0

    def test_audit_log_and_agent_state_audit_crud(self, test_db: DatabaseManager):
        """Assert that system audit log and agent memo state audit records can be persisted."""
        log_id = test_db.insert_audit_log(
            event_type="GUARDRAIL_PREFLIGHT_PASS",
            agent_id="DELTA",
            details_json='{"status": "ok", "environment": "testnet"}',
        )
        assert log_id > 0

        memo_audit = AgentStateAuditModel(
            memo_id="MEMO-999",
            from_agent="DELTA",
            to_agent="SWARM",
            idea_id="idea-03-cross-exchange-funding",
            phase="Phase B",
            position="approve",
            evidence="Data verified on testnet",
            git_commit="abcdef1",
            created_at_utc="2026-08-28T14:50:00Z",
        )
        test_db.insert_agent_state_audit(memo_audit)
        memos = test_db.get_agent_memos_for_idea("idea-03-cross-exchange-funding")
        assert len(memos) == 1
        assert memos[0].memo_id == "MEMO-999"


class TestLedgersHierarchy:
    """Test suite for project ledgers (STATUS.md, MEMORY.md, IDEAS.md, PLAN_CHANGELOG.md)."""

    def test_status_board_write(self, tmp_path: Path):
        """Assert that StatusBoard writes clean, structured status board markdown."""
        sb = StatusBoard(tmp_path / "STATUS.md")
        sb.write_status(
            session_title="Milestone 1 Test Session",
            active_ideas_summary=[
                {"id": "idea-03", "name": "Cross-Exchange", "state": "backlog", "phase": "Intake", "verdict": "PENDING"}
            ],
            blocked_items=[],
            next_actions=["Run M1 test suite"],
            needs_human_input=[],
        )
        content = (tmp_path / "STATUS.md").read_text(encoding="utf-8")
        assert "# SWARM STATUS BOARD" in content
        assert "idea-03" in content
        assert "Run M1 test suite" in content

    def test_memory_log_append(self, tmp_path: Path):
        """Assert that MemoryLog appends entries without deleting previous logs."""
        mem = MemoryLog(tmp_path / "MEMORY.md")
        mem.log_oath_commitment("DELTA", "Session-1")
        mem.append_decision("Test Decision", "BETA", "AUDIT", "Vetoed parameter", "Too risky")

        content = (tmp_path / "MEMORY.md").read_text(encoding="utf-8")
        assert "The Swarm Oath Commitment" in content
        assert "Test Decision" in content

    def test_plan_changelog_append(self, tmp_path: Path):
        """Assert that PlanChangelog logs modifications with tier and co-signers."""
        pc = PlanChangelog(tmp_path / "PLAN_CHANGELOG.md")
        pc.append_change(
            change_title="Backlog Reorder",
            tier="Autonomous",
            proposer="ALPHA",
            cosigner="BETA",
            change_description="Prioritized Idea 03 over Idea 01",
            rationale="Immediate data availability on testnet",
        )
        content = (tmp_path / "PLAN_CHANGELOG.md").read_text(encoding="utf-8")
        assert "Backlog Reorder" in content
        assert "Autonomous" in content
        assert "ALPHA" in content

    def test_ideas_registry_write(self, tmp_path: Path):
        """Assert that IdeasRegistry formats backlog table properly."""
        reg = IdeasRegistry(tmp_path / "IDEAS.md")
        reg.write_registry([
            {
                "id": "idea-03",
                "name": "Cross-Exchange",
                "source": "user",
                "category": "delta-neutral",
                "status": "backlog",
                "phase": "Phase A",
                "lead": "ALPHA",
                "venues": "Binance, Bybit",
                "priority": "1",
            }
        ])
        content = (tmp_path / "IDEAS.md").read_text(encoding="utf-8")
        assert "# Strategy Ideas Backlog Registry" in content
        assert "idea-03" in content
        assert "Binance, Bybit" in content


class TestPhaseTransitionsBCD:
    """Test suite covering Phase B, C, D handshakes and terminal resolved state."""

    def test_phase_b_handshake_sign_offs(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert Phase B sign-off requires GAMMA + DELTA + BETA."""
        idea_dir = tmp_path / "idea-01"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        m_gamma = AgentMemo("B-1", "GAMMA", "SWARM", "Phase B", "approve", "Data verified", "GAMMA — 2026-08-28T14:00:00Z — c1")
        m_delta = AgentMemo("B-2", "DELTA", "SWARM", "Phase B", "approve", "Ingestion verified", "DELTA — 2026-08-28T14:00:00Z — c2")
        m_beta = AgentMemo("B-3", "BETA", "SWARM", "Phase B", "approve", "Fees audited", "BETA — 2026-08-28T14:00:00Z — c3")

        # Missing BETA -> fails
        with pytest.raises(InvalidStateTransitionException):
            sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, target_phase="PHASE_B", memos=[m_gamma, m_delta])

        # All 3 -> succeeds
        record = sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, target_phase="PHASE_B", memos=[m_gamma, m_delta, m_beta])
        assert record.current_phase == "PHASE_B"

    def test_phase_c_and_d_handshakes(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert Phase C requires ALPHA+GAMMA+BETA and Phase D requires BETA+ALPHA+DELTA."""
        idea_dir = tmp_path / "idea-01"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        # Phase C
        m_alpha = AgentMemo("C-1", "ALPHA", "SWARM", "Phase C", "approve", "Engine built", "ALPHA — 2026-08-28T14:00:00Z — c1")
        m_gamma = AgentMemo("C-2", "GAMMA", "SWARM", "Phase C", "approve", "No lookahead", "GAMMA — 2026-08-28T14:00:00Z — c2")
        m_beta = AgentMemo("C-3", "BETA", "SWARM", "Phase C", "approve", "Stress tested", "BETA — 2026-08-28T14:00:00Z — c3")
        rec_c = sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, target_phase="PHASE_C", memos=[m_alpha, m_gamma, m_beta])
        assert rec_c.current_phase == "PHASE_C"

        # Phase D
        m_delta = AgentMemo("D-1", "DELTA", "SWARM", "Phase D", "approve", "State persisted", "DELTA — 2026-08-28T14:00:00Z — d1")
        rec_d = sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, target_phase="PHASE_D", memos=[m_beta, m_alpha, m_delta])
        assert rec_d.current_phase == "PHASE_D"

    def test_transition_to_resolved_terminal_state(self, tmp_path: Path, valid_risk_caps: dict[str, float]):
        """Assert ideas can be transitioned to /resolved with explicit reason."""
        idea_dir = tmp_path / "idea-02"
        sm = IdeaStateMachine(base_ideas_dir=tmp_path)
        sm.transition(idea_dir=idea_dir, target_state=IdeaDirectoryState.AUDIT.value, risk_caps=valid_risk_caps)

        record = sm.transition(
            idea_dir=idea_dir,
            target_state=IdeaDirectoryState.RESOLVED.value,
            reason="Deferred due to low momentum signal quality in Regime 3",
        )
        assert record.current_state == IdeaDirectoryState.RESOLVED.value
        assert len(record.history) >= 2

