"""
E2E test suite specific fixtures and configuration.
"""
import os
import sys
import tempfile
import sqlite3
import shutil
import pytest
import pandas as pd
import numpy as np

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


@pytest.fixture
def temp_project_dir():
    """Provides a fresh isolated project directory structure for E2E tests."""
    temp_dir = tempfile.mkdtemp(prefix="e2e_project_")
    docs_dir = os.path.join(temp_dir, "docs")
    ideas_dir = os.path.join(docs_dir, "ideas")
    os.makedirs(ideas_dir, exist_ok=True)
    
    # Initialize basic ledger files
    with open(os.path.join(temp_dir, "STATUS.md"), "w", encoding="utf-8") as f:
        f.write("# Swarm Session Status\n\n## Active Ideas\n\n## Blocked Items\n\n## Needs Human Input\n")
    with open(os.path.join(temp_dir, "MEMORY.md"), "w", encoding="utf-8") as f:
        f.write("# Swarm Long-Term Memory & Decision Log\n\n")
    with open(os.path.join(docs_dir, "IDEAS.md"), "w", encoding="utf-8") as f:
        f.write("# Backlog Registry\n\n| ID | Name | Source | Category | State | Gate Verdict |\n|---|---|---|---|---|---|\n")
    with open(os.path.join(docs_dir, "PLAN_CHANGELOG.md"), "w", encoding="utf-8") as f:
        f.write("# Swarm Plan Changelog\n\n")

    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def temp_sqlite_db():
    """Provides a temporary SQLite database with all 12 normalized tables and WAL mode."""
    fd, db_path = tempfile.mkstemp(suffix=".db", prefix="e2e_db_")
    os.close(fd)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA foreign_keys = ON;")
    cursor.execute("PRAGMA busy_timeout = 5000;")
    
    ddl_statements = [
        """
        CREATE TABLE IF NOT EXISTS exchange_metadata (
            exchange_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            api_type TEXT NOT NULL,
            rest_testnet_url TEXT NOT NULL,
            ws_testnet_url TEXT NOT NULL,
            rest_mainnet_url TEXT,
            auth_type TEXT NOT NULL,
            maker_fee_default REAL NOT NULL DEFAULT 0.0002,
            taker_fee_default REAL NOT NULL DEFAULT 0.0005,
            rate_limit_req_per_min INTEGER NOT NULL DEFAULT 1200,
            sandbox_operational INTEGER NOT NULL DEFAULT 1,
            requires_paper_fallback INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS instruments (
            symbol TEXT NOT NULL,
            exchange_id TEXT NOT NULL,
            base_asset TEXT NOT NULL,
            quote_asset TEXT NOT NULL,
            contract_type TEXT NOT NULL,
            price_precision INTEGER NOT NULL,
            quantity_precision INTEGER NOT NULL,
            tick_size REAL NOT NULL,
            lot_size REAL NOT NULL,
            min_notional REAL NOT NULL DEFAULT 5.0,
            funding_interval_hours INTEGER NOT NULL DEFAULT 8,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (symbol, exchange_id),
            FOREIGN KEY (exchange_id) REFERENCES exchange_metadata(exchange_id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS funding_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exchange_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            settlement_time_utc TEXT NOT NULL,
            funding_rate REAL NOT NULL,
            funding_rate_annualized REAL NOT NULL,
            mark_price REAL,
            index_price REAL,
            interest_rate REAL DEFAULT 0.0001,
            funding_interval_hours INTEGER NOT NULL DEFAULT 8,
            source TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (symbol, exchange_id) REFERENCES instruments(symbol, exchange_id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS ticker_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exchange_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            last_price REAL NOT NULL,
            mark_price REAL NOT NULL,
            index_price REAL NOT NULL,
            bid1_price REAL NOT NULL,
            ask1_price REAL NOT NULL,
            bid1_qty REAL NOT NULL,
            ask1_qty REAL NOT NULL,
            spread_bps REAL NOT NULL,
            est_funding_rate REAL,
            next_funding_time_ms INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (symbol, exchange_id) REFERENCES instruments(symbol, exchange_id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS orderbook_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exchange_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            bid_depth_top5 REAL NOT NULL,
            ask_depth_top5 REAL NOT NULL,
            bid_depth_top20 REAL NOT NULL,
            ask_depth_top20 REAL NOT NULL,
            spread_bps REAL NOT NULL,
            mid_price REAL NOT NULL,
            raw_bids_json TEXT,
            raw_asks_json TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (symbol, exchange_id) REFERENCES instruments(symbol, exchange_id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS fee_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exchange_id TEXT NOT NULL,
            vip_tier TEXT NOT NULL DEFAULT 'VIP0',
            maker_rate REAL NOT NULL,
            taker_rate REAL NOT NULL,
            bnb_or_native_discount REAL DEFAULT 0.0,
            min_30d_volume_usd REAL DEFAULT 0.0,
            verified_sources_count INTEGER NOT NULL DEFAULT 5,
            verification_source_citations TEXT NOT NULL,
            verified_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (exchange_id) REFERENCES exchange_metadata(exchange_id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS regimes (
            regime_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            start_time_utc TEXT NOT NULL,
            end_time_utc TEXT NOT NULL,
            dominant_market_trend TEXT NOT NULL,
            avg_btc_funding_rate REAL NOT NULL,
            avg_alt_funding_rate REAL NOT NULL,
            spread_opportunity_frequency_pct REAL NOT NULL,
            basis_volatility_daily_pct REAL NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS regime_datapoints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            regime_id TEXT NOT NULL,
            funding_rate_id INTEGER NOT NULL,
            exchange_id TEXT NOT NULL,
            symbol TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            FOREIGN KEY (regime_id) REFERENCES regimes(regime_id) ON DELETE CASCADE,
            FOREIGN KEY (funding_rate_id) REFERENCES funding_rates(id) ON DELETE CASCADE
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS spread_opportunities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp_ms INTEGER NOT NULL,
            settlement_time_utc TEXT NOT NULL,
            symbol TEXT NOT NULL,
            exchange_long TEXT NOT NULL,
            exchange_short TEXT NOT NULL,
            rate_long REAL NOT NULL,
            rate_short REAL NOT NULL,
            gross_spread REAL NOT NULL,
            total_taker_fee_drag REAL NOT NULL,
            est_slippage_drag REAL NOT NULL,
            net_expected_yield REAL NOT NULL,
            passes_mvs_gate INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS kill_switch_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            is_tripped INTEGER NOT NULL DEFAULT 0,
            trip_reason TEXT,
            tripped_by TEXT,
            tripped_at_utc TEXT,
            lock_payload_json TEXT
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            agent_id TEXT NOT NULL,
            details_json TEXT NOT NULL,
            timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """,
        """
        CREATE TABLE IF NOT EXISTS agent_state_audit (
            memo_id TEXT PRIMARY KEY,
            from_agent TEXT NOT NULL,
            to_agent TEXT NOT NULL,
            idea_id TEXT NOT NULL,
            phase TEXT NOT NULL,
            position TEXT NOT NULL,
            signature TEXT NOT NULL,
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """
    ]
    
    for ddl in ddl_statements:
        cursor.execute(ddl)
    
    cursor.execute("INSERT OR IGNORE INTO kill_switch_state (id, is_tripped) VALUES (1, 0);")
    conn.commit()
    conn.close()
    
    yield db_path
    
    if os.path.exists(db_path):
        try:
            os.remove(db_path)
        except OSError:
            pass


@pytest.fixture
def mock_regime_dataset():
    """Generates synthetic high-fidelity dataset for all 4 regimes."""
    dates_regime1 = pd.date_range("2023-10-15", periods=50, freq="8h", tz="UTC")
    dates_regime2 = pd.date_range("2022-05-08", periods=50, freq="8h", tz="UTC")
    dates_regime3 = pd.date_range("2023-05-01", periods=50, freq="8h", tz="UTC")
    dates_regime4 = pd.date_range("2023-08-20", periods=50, freq="8h", tz="UTC")
    
    def _create_df(dates, mean_rate_a, mean_rate_b, base_price, basis_drift_sigma):
        n = len(dates)
        np.random.seed(42)
        rates_a = np.random.normal(mean_rate_a, 0.0002, n)
        rates_b = np.random.normal(mean_rate_b, 0.0002, n)
        prices_a = base_price + np.cumsum(np.random.normal(0, 10, n))
        prices_b = prices_a + np.random.normal(0, basis_drift_sigma, n)
        return pd.DataFrame({
            "timestamp": dates,
            "rate_binance": rates_a,
            "rate_bybit": rates_b,
            "price_binance": prices_a,
            "price_bybit": prices_b,
            "spread": rates_a - rates_b
        })

    return {
        "REGIME_1": _create_df(dates_regime1, 0.0005, 0.0001, 30000.0, 5.0),    # Bull Contango
        "REGIME_2": _create_df(dates_regime2, -0.0004, -0.0001, 20000.0, 15.0), # Bear Backwardation
        "REGIME_3": _create_df(dates_regime3, 0.0001, 0.0001, 27000.0, 2.0),    # Choppy Rangebound
        "REGIME_4": _create_df(dates_regime4, 0.0055, 0.0005, 10.0, 0.5)        # Structural Dispersion (wide spread)
    }
