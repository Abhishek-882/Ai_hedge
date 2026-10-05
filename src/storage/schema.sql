-- SQLite Schema for Multi-Agent Funding-Rate Research Swarm
-- 12 Normalized Tables with Foreign Key Constraints & Performance Indices

-- 1. Exchange Metadata Table
CREATE TABLE IF NOT EXISTS exchange_metadata (
    exchange_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_type TEXT NOT NULL, -- 'rest_ccxt', 'rest_custom', 'ws'
    rest_testnet_url TEXT NOT NULL,
    ws_testnet_url TEXT NOT NULL,
    rest_mainnet_url TEXT,
    auth_type TEXT NOT NULL, -- 'hmac_sha256', 'bybit_v5', 'kucoin_v2'
    maker_fee_default REAL NOT NULL DEFAULT 0.0002,
    taker_fee_default REAL NOT NULL DEFAULT 0.0005,
    rate_limit_req_per_min INTEGER NOT NULL DEFAULT 1200,
    sandbox_operational INTEGER NOT NULL DEFAULT 1,
    requires_paper_fallback INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Instruments / Symbol Metadata Table
CREATE TABLE IF NOT EXISTS instruments (
    symbol TEXT NOT NULL,
    exchange_id TEXT NOT NULL,
    base_asset TEXT NOT NULL,
    quote_asset TEXT NOT NULL,
    contract_type TEXT NOT NULL, -- 'linear_perp', 'inverse_perp', 'spot'
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

-- 3. Funding Rates Historical & Real-Time Snapshot Table
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
    source TEXT NOT NULL, -- 'rest_snapshot', 'ws_stream', 'historical_backfill'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol, exchange_id) REFERENCES instruments(symbol, exchange_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_funding_rates_lookup 
ON funding_rates(exchange_id, symbol, timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_funding_rates_settlement 
ON funding_rates(settlement_time_utc, symbol);

-- 4. Ticker Snapshots Table
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

CREATE INDEX IF NOT EXISTS idx_ticker_lookup 
ON ticker_snapshots(exchange_id, symbol, timestamp_ms);

-- 5. Orderbook Depth Snapshots Table
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

CREATE INDEX IF NOT EXISTS idx_orderbook_lookup 
ON orderbook_snapshots(exchange_id, symbol, timestamp_ms);

-- 6. Verified Fee Schedules Table (Phase B Requirement)
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

-- 7. Backtesting Regimes Definition Table
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

-- 8. Regime Datapoint Mappings Table
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

CREATE INDEX IF NOT EXISTS idx_regime_dp_lookup 
ON regime_datapoints(regime_id, symbol, timestamp_ms);

-- 9. Cross-Exchange Spread Opportunities Table (Pre-filtered)
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
    passes_mvs_gate INTEGER NOT NULL, -- 1 if gross_spread >= 0.0040 else 0
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_spread_opp_time 
ON spread_opportunities(settlement_time_utc, symbol);

-- 10. Kill-Switch State Persistence Table (Singleton)
CREATE TABLE IF NOT EXISTS kill_switch_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    is_tripped INTEGER NOT NULL DEFAULT 0,
    trip_reason TEXT,
    tripped_by TEXT,
    tripped_at_utc TEXT,
    lock_payload_json TEXT
);

-- 11. Audit & Swarm Event Log Table
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    details_json TEXT NOT NULL,
    timestamp_utc TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event 
ON audit_log(event_type, agent_id);

-- 12. Agent State Audit Log Table (IPC Memo Audit)
CREATE TABLE IF NOT EXISTS agent_state_audit (
    memo_id TEXT PRIMARY KEY,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    idea_id TEXT NOT NULL,
    phase TEXT NOT NULL,
    position TEXT NOT NULL,
    evidence TEXT NOT NULL,
    failure_scenario TEXT,
    remediation TEXT,
    git_commit TEXT NOT NULL,
    created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_state_audit_idea 
ON agent_state_audit(idea_id, phase);
