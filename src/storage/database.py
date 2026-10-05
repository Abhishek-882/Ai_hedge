"""SQLite database manager with Write-Ahead Logging (WAL) concurrency and normalized CRUD operations.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

from src.core.constants import (
    HISTORICAL_REGIMES,
    SQLITE_BUSY_TIMEOUT_MS,
)
from src.core.exceptions import (
    DatabaseLockedException,
    RecordNotFoundException,
    SchemaMigrationException,
)
from src.storage.models import (
    AgentStateAuditModel,
    AuditLogModel,
    ExchangeMetadataModel,
    FeeScheduleModel,
    FundingRateModel,
    InstrumentModel,
    KillSwitchStateModel,
    OrderbookSnapshotModel,
    RegimeDatapointModel,
    RegimeModel,
    SpreadOpportunityModel,
    TickerSnapshotModel,
)

logger = logging.getLogger(__name__)

DEFAULT_SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class DatabaseManager:
    """Manages SQLite connection lifecycle, WAL mode enforcement, schema migrations, and CRUD operations."""

    def __init__(
        self,
        db_path: str = "funding_rate_swarm.db",
        busy_timeout_ms: int = SQLITE_BUSY_TIMEOUT_MS,
        wal_mode: bool = True,
        foreign_keys: bool = True,
    ):
        self.db_path = db_path
        self.busy_timeout_ms = busy_timeout_ms
        self.wal_mode = wal_mode
        self.foreign_keys = foreign_keys
        self._is_memory = (db_path == ":memory:" or "mode=memory" in db_path or db_path == "")
        self._memory_conn: sqlite3.Connection | None = None

        if not self._is_memory and db_path != "":
            db_dir = Path(db_path).parent
            if db_dir and not db_dir.exists():
                db_dir.mkdir(parents=True, exist_ok=True)

        if self._is_memory:
            self._memory_conn = self._create_connection()

        self.initialize_schema()

    def _create_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(
            self.db_path,
            timeout=self.busy_timeout_ms / 1000.0,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row

        if self.foreign_keys:
            conn.execute("PRAGMA foreign_keys = ON;")

        conn.execute(f"PRAGMA busy_timeout = {self.busy_timeout_ms};")

        if not self._is_memory and self.wal_mode:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache

        return conn

    def get_connection(self) -> sqlite3.Connection:
        """Returns a configured SQLite connection with WAL mode, busy timeout, and row factory."""
        try:
            if self._is_memory and self._memory_conn is not None:
                return self._memory_conn
            return self._create_connection()
        except sqlite3.OperationalError as e:
            if "locked" in str(e).lower():
                raise DatabaseLockedException(f"Database locked on connect: {e}") from e
            raise

    @contextmanager
    def transaction(self) -> Generator[sqlite3.Connection, None, None]:
        """Context manager providing an atomic database transaction."""
        conn = self.get_connection()
        try:
            yield conn
            conn.commit()
        except sqlite3.OperationalError as e:
            conn.rollback()
            if "locked" in str(e).lower():
                raise DatabaseLockedException(f"Transaction failed due to locked DB: {e}") from e
            raise
        except Exception:
            conn.rollback()
            raise
        finally:
            if not self._is_memory:
                conn.close()

    def close(self) -> None:
        """Closes active memory connection if present."""
        if self._memory_conn is not None:
            try:
                self._memory_conn.close()
            except Exception:
                pass
            self._memory_conn = None

    def initialize_schema(self, schema_path: Path | str | None = None) -> None:
        """Initializes database schema from schema.sql and seeds initial regimes & kill-switch record."""
        target_schema_path = Path(schema_path) if schema_path else DEFAULT_SCHEMA_PATH
        if not target_schema_path.exists():
            raise SchemaMigrationException(f"Schema file not found at {target_schema_path}")

        try:
            with open(target_schema_path, "r", encoding="utf-8") as f:
                ddl = f.read()

            with self.transaction() as conn:
                conn.executescript(ddl)

                # Initialize default singleton kill switch record if not present
                conn.execute(
                    """
                    INSERT OR IGNORE INTO kill_switch_state (id, is_tripped, trip_reason, tripped_by, tripped_at_utc, lock_payload_json)
                    VALUES (1, 0, NULL, NULL, NULL, NULL)
                    """
                )

                # Seed 4 Historical Regimes
                for reg_id, reg_info in HISTORICAL_REGIMES.items():
                    conn.execute(
                        """
                        INSERT OR REPLACE INTO regimes (
                            regime_id, name, description, start_time_utc, end_time_utc,
                            dominant_market_trend, avg_btc_funding_rate, avg_alt_funding_rate,
                            spread_opportunity_frequency_pct, basis_volatility_daily_pct
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            reg_info.regime_id.value,
                            reg_info.name,
                            reg_info.description,
                            reg_info.start_time_utc,
                            reg_info.end_time_utc,
                            reg_info.dominant_market_trend,
                            reg_info.avg_btc_funding_rate,
                            reg_info.avg_alt_funding_rate,
                            reg_info.spread_opportunity_frequency_pct,
                            reg_info.basis_volatility_daily_pct,
                        ),
                    )

            logger.info("Database schema initialized successfully.")
        except Exception as e:
            logger.error(f"Schema migration error: {e}")
            raise SchemaMigrationException(f"Failed to execute schema DDL: {e}") from e

    # -----------------------------------------------------------------------
    # Exchange Metadata CRUD
    # -----------------------------------------------------------------------

    def upsert_exchange_metadata(self, exchange: ExchangeMetadataModel) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO exchange_metadata (
                    exchange_id, name, api_type, rest_testnet_url, ws_testnet_url,
                    rest_mainnet_url, auth_type, maker_fee_default, taker_fee_default,
                    rate_limit_req_per_min, sandbox_operational, requires_paper_fallback, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(exchange_id) DO UPDATE SET
                    name = excluded.name,
                    api_type = excluded.api_type,
                    rest_testnet_url = excluded.rest_testnet_url,
                    ws_testnet_url = excluded.ws_testnet_url,
                    rest_mainnet_url = excluded.rest_mainnet_url,
                    auth_type = excluded.auth_type,
                    maker_fee_default = excluded.maker_fee_default,
                    taker_fee_default = excluded.taker_fee_default,
                    rate_limit_req_per_min = excluded.rate_limit_req_per_min,
                    sandbox_operational = excluded.sandbox_operational,
                    requires_paper_fallback = excluded.requires_paper_fallback,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    exchange.exchange_id,
                    exchange.name,
                    exchange.api_type,
                    exchange.rest_testnet_url,
                    exchange.ws_testnet_url,
                    exchange.rest_mainnet_url,
                    exchange.auth_type,
                    exchange.maker_fee_default,
                    exchange.taker_fee_default,
                    exchange.rate_limit_req_per_min,
                    exchange.sandbox_operational,
                    exchange.requires_paper_fallback,
                ),
            )

    def get_exchange_metadata(self, exchange_id: str) -> ExchangeMetadataModel | None:
        with self.transaction() as conn:
            cursor = conn.execute(
                "SELECT * FROM exchange_metadata WHERE exchange_id = ?",
                (exchange_id,),
            )
            row = cursor.fetchone()
            return ExchangeMetadataModel.from_row(dict(row)) if row else None

    def list_exchanges(self) -> list[ExchangeMetadataModel]:
        with self.transaction() as conn:
            cursor = conn.execute("SELECT * FROM exchange_metadata ORDER BY exchange_id")
            return [ExchangeMetadataModel.from_row(dict(row)) for row in cursor.fetchall()]

    # -----------------------------------------------------------------------
    # Instruments CRUD
    # -----------------------------------------------------------------------

    def upsert_instrument(self, inst: InstrumentModel) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO instruments (
                    symbol, exchange_id, base_asset, quote_asset, contract_type,
                    price_precision, quantity_precision, tick_size, lot_size,
                    min_notional, funding_interval_hours, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(symbol, exchange_id) DO UPDATE SET
                    base_asset = excluded.base_asset,
                    quote_asset = excluded.quote_asset,
                    contract_type = excluded.contract_type,
                    price_precision = excluded.price_precision,
                    quantity_precision = excluded.quantity_precision,
                    tick_size = excluded.tick_size,
                    lot_size = excluded.lot_size,
                    min_notional = excluded.min_notional,
                    funding_interval_hours = excluded.funding_interval_hours,
                    is_active = excluded.is_active
                """,
                (
                    inst.symbol,
                    inst.exchange_id,
                    inst.base_asset,
                    inst.quote_asset,
                    inst.contract_type,
                    inst.price_precision,
                    inst.quantity_precision,
                    inst.tick_size,
                    inst.lot_size,
                    inst.min_notional,
                    inst.funding_interval_hours,
                    inst.is_active,
                ),
            )

    def get_instrument(self, symbol: str, exchange_id: str) -> InstrumentModel | None:
        with self.transaction() as conn:
            cursor = conn.execute(
                "SELECT * FROM instruments WHERE symbol = ? AND exchange_id = ?",
                (symbol, exchange_id),
            )
            row = cursor.fetchone()
            return InstrumentModel.from_row(dict(row)) if row else None

    def list_instruments(self, exchange_id: str | None = None) -> list[InstrumentModel]:
        with self.transaction() as conn:
            if exchange_id:
                cursor = conn.execute(
                    "SELECT * FROM instruments WHERE exchange_id = ? AND is_active = 1",
                    (exchange_id,),
                )
            else:
                cursor = conn.execute("SELECT * FROM instruments WHERE is_active = 1")
            return [InstrumentModel.from_row(dict(row)) for row in cursor.fetchall()]

    # -----------------------------------------------------------------------
    # Funding Rates CRUD
    # -----------------------------------------------------------------------

    def insert_funding_rate(self, rate: FundingRateModel) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO funding_rates (
                    exchange_id, symbol, timestamp_ms, settlement_time_utc,
                    funding_rate, funding_rate_annualized, mark_price, index_price,
                    interest_rate, funding_interval_hours, source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rate.exchange_id,
                    rate.symbol,
                    rate.timestamp_ms,
                    rate.settlement_time_utc,
                    rate.funding_rate,
                    rate.funding_rate_annualized,
                    rate.mark_price,
                    rate.index_price,
                    rate.interest_rate,
                    rate.funding_interval_hours,
                    rate.source,
                ),
            )
            return cursor.lastrowid or 0

    def get_latest_funding_rate(self, symbol: str, exchange_id: str) -> FundingRateModel | None:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM funding_rates
                WHERE symbol = ? AND exchange_id = ?
                ORDER BY timestamp_ms DESC LIMIT 1
                """,
                (symbol, exchange_id),
            )
            row = cursor.fetchone()
            return FundingRateModel.from_row(dict(row)) if row else None

    def get_funding_rates(
        self,
        symbol: str,
        exchange_id: str,
        limit: int = 100,
    ) -> list[FundingRateModel]:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM funding_rates
                WHERE symbol = ? AND exchange_id = ?
                ORDER BY timestamp_ms DESC LIMIT ?
                """,
                (symbol, exchange_id, limit),
            )
            return [FundingRateModel.from_row(dict(row)) for row in cursor.fetchall()]

    # -----------------------------------------------------------------------
    # Ticker & Orderbook Snapshots CRUD
    # -----------------------------------------------------------------------

    def insert_ticker_snapshot(self, ticker: TickerSnapshotModel) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO ticker_snapshots (
                    exchange_id, symbol, timestamp_ms, last_price, mark_price,
                    index_price, bid1_price, ask1_price, bid1_qty, ask1_qty,
                    spread_bps, est_funding_rate, next_funding_time_ms
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ticker.exchange_id,
                    ticker.symbol,
                    ticker.timestamp_ms,
                    ticker.last_price,
                    ticker.mark_price,
                    ticker.index_price,
                    ticker.bid1_price,
                    ticker.ask1_price,
                    ticker.bid1_qty,
                    ticker.ask1_qty,
                    ticker.spread_bps,
                    ticker.est_funding_rate,
                    ticker.next_funding_time_ms,
                ),
            )
            return cursor.lastrowid or 0

    def get_latest_ticker(self, symbol: str, exchange_id: str) -> TickerSnapshotModel | None:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM ticker_snapshots
                WHERE symbol = ? AND exchange_id = ?
                ORDER BY timestamp_ms DESC LIMIT 1
                """,
                (symbol, exchange_id),
            )
            row = cursor.fetchone()
            return TickerSnapshotModel.from_row(dict(row)) if row else None

    def insert_orderbook_snapshot(self, ob: OrderbookSnapshotModel) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO orderbook_snapshots (
                    exchange_id, symbol, timestamp_ms, bid_depth_top5, ask_depth_top5,
                    bid_depth_top20, ask_depth_top20, spread_bps, mid_price,
                    raw_bids_json, raw_asks_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ob.exchange_id,
                    ob.symbol,
                    ob.timestamp_ms,
                    ob.bid_depth_top5,
                    ob.ask_depth_top5,
                    ob.bid_depth_top20,
                    ob.ask_depth_top20,
                    ob.spread_bps,
                    ob.mid_price,
                    ob.raw_bids_json,
                    ob.raw_asks_json,
                ),
            )
            return cursor.lastrowid or 0

    # -----------------------------------------------------------------------
    # Fee Schedules CRUD (Phase B Verification)
    # -----------------------------------------------------------------------

    def upsert_fee_schedule(self, fee: FeeScheduleModel) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO fee_schedules (
                    exchange_id, vip_tier, maker_rate, taker_rate, bnb_or_native_discount,
                    min_30d_volume_usd, verified_sources_count, verification_source_citations, verified_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fee.exchange_id,
                    fee.vip_tier,
                    fee.maker_rate,
                    fee.taker_rate,
                    fee.bnb_or_native_discount,
                    fee.min_30d_volume_usd,
                    fee.verified_sources_count,
                    fee.verification_source_citations,
                    fee.verified_at,
                ),
            )
            return cursor.lastrowid or 0

    def get_fee_schedule(self, exchange_id: str, vip_tier: str = "VIP0") -> FeeScheduleModel | None:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                SELECT * FROM fee_schedules
                WHERE exchange_id = ? AND vip_tier = ?
                ORDER BY verified_at DESC LIMIT 1
                """,
                (exchange_id, vip_tier),
            )
            row = cursor.fetchone()
            return FeeScheduleModel.from_row(dict(row)) if row else None

    # -----------------------------------------------------------------------
    # Regimes CRUD
    # -----------------------------------------------------------------------

    def get_regime(self, regime_id: str) -> RegimeModel | None:
        with self.transaction() as conn:
            cursor = conn.execute("SELECT * FROM regimes WHERE regime_id = ?", (regime_id,))
            row = cursor.fetchone()
            return RegimeModel.from_row(dict(row)) if row else None

    def list_regimes(self) -> list[RegimeModel]:
        with self.transaction() as conn:
            cursor = conn.execute("SELECT * FROM regimes ORDER BY regime_id")
            return [RegimeModel.from_row(dict(row)) for row in cursor.fetchall()]

    # -----------------------------------------------------------------------
    # Spread Opportunities CRUD
    # -----------------------------------------------------------------------

    def insert_spread_opportunity(self, opp: SpreadOpportunityModel) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                """
                INSERT INTO spread_opportunities (
                    timestamp_ms, settlement_time_utc, symbol, exchange_long, exchange_short,
                    rate_long, rate_short, gross_spread, total_taker_fee_drag,
                    est_slippage_drag, net_expected_yield, passes_mvs_gate
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    opp.timestamp_ms,
                    opp.settlement_time_utc,
                    opp.symbol,
                    opp.exchange_long,
                    opp.exchange_short,
                    opp.rate_long,
                    opp.rate_short,
                    opp.gross_spread,
                    opp.total_taker_fee_drag,
                    opp.est_slippage_drag,
                    opp.net_expected_yield,
                    opp.passes_mvs_gate,
                ),
            )
            return cursor.lastrowid or 0

    def get_spread_opportunities(
        self,
        min_spread: float = 0.0040,
        only_passing: bool = True,
        limit: int = 100,
    ) -> list[SpreadOpportunityModel]:
        with self.transaction() as conn:
            if only_passing:
                query = """
                    SELECT * FROM spread_opportunities
                    WHERE gross_spread >= ? AND passes_mvs_gate = 1
                    ORDER BY timestamp_ms DESC LIMIT ?
                """
            else:
                query = """
                    SELECT * FROM spread_opportunities
                    WHERE gross_spread >= ?
                    ORDER BY timestamp_ms DESC LIMIT ?
                """
            cursor = conn.execute(query, (min_spread, limit))
            return [SpreadOpportunityModel.from_row(dict(row)) for row in cursor.fetchall()]

    # -----------------------------------------------------------------------
    # Kill-Switch State Persistence
    # -----------------------------------------------------------------------

    def get_kill_switch_state(self) -> KillSwitchStateModel:
        with self.transaction() as conn:
            cursor = conn.execute("SELECT * FROM kill_switch_state WHERE id = 1")
            row = cursor.fetchone()
            if not row:
                return KillSwitchStateModel(id=1, is_tripped=0)
            return KillSwitchStateModel.from_row(dict(row))

    def set_kill_switch_state(
        self,
        is_tripped: bool,
        trip_reason: str | None = None,
        tripped_by: str | None = None,
        lock_payload_json: str | None = None,
    ) -> None:
        now_utc = datetime.now(timezone.utc).isoformat() if is_tripped else None
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT INTO kill_switch_state (id, is_tripped, trip_reason, tripped_by, tripped_at_utc, lock_payload_json)
                VALUES (1, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    is_tripped = excluded.is_tripped,
                    trip_reason = excluded.trip_reason,
                    tripped_by = excluded.tripped_by,
                    tripped_at_utc = excluded.tripped_at_utc,
                    lock_payload_json = excluded.lock_payload_json
                """,
                (
                    1 if is_tripped else 0,
                    trip_reason,
                    tripped_by,
                    now_utc,
                    lock_payload_json,
                ),
            )

    # -----------------------------------------------------------------------
    # Audit & Agent State Logging
    # -----------------------------------------------------------------------

    def insert_audit_log(self, event_type: str, agent_id: str, details_json: str) -> int:
        with self.transaction() as conn:
            cursor = conn.execute(
                "INSERT INTO audit_log (event_type, agent_id, details_json) VALUES (?, ?, ?)",
                (event_type, agent_id, details_json),
            )
            return cursor.lastrowid or 0

    def insert_agent_state_audit(self, memo: AgentStateAuditModel) -> None:
        with self.transaction() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO agent_state_audit (
                    memo_id, from_agent, to_agent, idea_id, phase, position,
                    evidence, failure_scenario, remediation, git_commit, created_at_utc
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    memo.memo_id,
                    memo.from_agent,
                    memo.to_agent,
                    memo.idea_id,
                    memo.phase,
                    memo.position,
                    memo.evidence,
                    memo.failure_scenario,
                    memo.remediation,
                    memo.git_commit,
                    memo.created_at_utc,
                ),
            )

    def get_agent_memos_for_idea(self, idea_id: str) -> list[AgentStateAuditModel]:
        with self.transaction() as conn:
            cursor = conn.execute(
                "SELECT * FROM agent_state_audit WHERE idea_id = ? ORDER BY created_at_utc ASC",
                (idea_id,),
            )
            return [AgentStateAuditModel.from_row(dict(row)) for row in cursor.fetchall()]


_GLOBAL_DB: DatabaseManager | None = None


def get_db(db_path: str = "funding_rate_swarm.db") -> DatabaseManager:
    global _GLOBAL_DB
    if _GLOBAL_DB is None or _GLOBAL_DB.db_path != db_path:
        _GLOBAL_DB = DatabaseManager(db_path=db_path)
    return _GLOBAL_DB
