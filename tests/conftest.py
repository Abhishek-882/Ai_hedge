"""Pytest fixtures and configuration for the Funding Rate Bot test suite.
"""

import os
import sys
from pathlib import Path
import pytest

# Ensure project root is on PYTHONPATH
PROJECT_ROOT = Path(__file__).parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from src.core.config import AppConfig, ExchangeConfig, RiskConfig
from src.core.constants import AgentPersona, MemoPosition
from src.ipc.memo import AgentMemo
from src.storage.database import DatabaseManager


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Path:
    """Fixture providing a temporary SQLite database file path."""
    return tmp_path / "test_funding_rate.db"


@pytest.fixture
def test_db(temp_db_path: Path) -> DatabaseManager:
    """Fixture providing an initialized DatabaseManager instance with WAL mode."""
    return DatabaseManager(db_path=str(temp_db_path), busy_timeout_ms=5000)


@pytest.fixture
def memory_db() -> DatabaseManager:
    """Fixture providing an in-memory DatabaseManager instance for fast unit testing."""
    return DatabaseManager(db_path=":memory:", wal_mode=False)


@pytest.fixture
def valid_app_config() -> AppConfig:
    """Fixture providing a valid default AppConfig."""
    return AppConfig.default()


@pytest.fixture
def valid_risk_caps() -> dict[str, float]:
    """Fixture providing valid pre-flight risk caps."""
    return {
        "max_drawdown_pct": 0.05,
        "position_size_cap_usd": 5000.0,
        "leverage_cap": 3.0,
    }


@pytest.fixture
def sample_approve_memo() -> AgentMemo:
    """Fixture providing a valid approval AgentMemo."""
    return AgentMemo(
        memo_id="MEMO-101",
        from_agent=AgentPersona.GAMMA.value,
        to_agent="SWARM",
        re_topic="idea-03-cross-exchange-funding / Phase A / Payoff Proof",
        position=MemoPosition.APPROVE.value,
        evidence="Analytical proof in CONCEPTS.md, verified against Binance & Bybit settlement docs.",
        signature=f"{AgentPersona.GAMMA.value} — 2026-08-28T14:30:00Z — c0ffee1",
    )


@pytest.fixture
def sample_veto_memo() -> AgentMemo:
    """Fixture providing a valid veto AgentMemo with failure scenario and remediation."""
    return AgentMemo(
        memo_id="MEMO-102",
        from_agent=AgentPersona.BETA.value,
        to_agent="SWARM",
        re_topic="idea-03-cross-exchange-funding / Phase D / Desync Timeout",
        position=MemoPosition.VETO.value,
        evidence="Observed 504 Gateway Timeouts on Bybit during volatility spike.",
        failure_scenario="Leg 1 fills on Binance while Leg 2 times out on Bybit, leaving naked directional exposure.",
        remediation="Implement automatic immediate market unwind on Leg 1 if Leg 2 fill is not confirmed within 1500ms.",
        signature=f"{AgentPersona.BETA.value} — 2026-08-28T14:31:00Z — c0ffee2",
    )
