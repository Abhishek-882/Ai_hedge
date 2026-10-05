"""Empirical Stress Test Suite: SQLite Storage Layer, WAL Concurrency, Crash Recovery, and Integrity Constraints.

Author: Challenger 2 (Milestone 1 Empirical Challenge)
Mandate:
1. Multi-threaded concurrent read/write stress under WAL mode.
2. Crash recovery and abrupt disconnect simulation.
3. Singleton constraint on kill_switch_state and schema integrity across all 12 tables.
"""

from __future__ import annotations

import concurrent.futures
import json
import os
import random
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

import pytest

from src.core.constants import HISTORICAL_REGIMES
from src.core.exceptions import DatabaseLockedException, StorageException
from src.storage.database import DatabaseManager
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


# ===========================================================================
# Helper Fixtures & Utilities
# ===========================================================================

def seed_base_metadata(db: DatabaseManager) -> None:
    """Helper to seed base exchange and instrument records."""
    ex_binance = ExchangeMetadataModel(
        exchange_id="binance",
        name="Binance Futures Testnet",
        api_type="rest_ccxt",
        rest_testnet_url="https://testnet.binancefuture.com",
        ws_testnet_url="wss://stream.binancefuture.com/ws",
        auth_type="hmac_sha256",
        maker_fee_default=0.0002,
        taker_fee_default=0.0005,
    )
    ex_bybit = ExchangeMetadataModel(
        exchange_id="bybit",
        name="Bybit Linear Testnet",
        api_type="rest_custom",
        rest_testnet_url="https://api-testnet.bybit.com",
        ws_testnet_url="wss://stream-testnet.bybit.com/v5/public/linear",
        auth_type="bybit_v5",
        maker_fee_default=0.0002,
        taker_fee_default=0.0005,
    )
    db.upsert_exchange_metadata(ex_binance)
    db.upsert_exchange_metadata(ex_bybit)

    inst_btc = InstrumentModel(
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
    inst_eth = InstrumentModel(
        symbol="ETHUSDT",
        exchange_id="binance",
        base_asset="ETH",
        quote_asset="USDT",
        contract_type="linear_perp",
        price_precision=2,
        quantity_precision=3,
        tick_size=0.01,
        lot_size=0.01,
        min_notional=5.0,
    )
    inst_bybit_btc = InstrumentModel(
        symbol="BTCUSDT",
        exchange_id="bybit",
        base_asset="BTC",
        quote_asset="USDT",
        contract_type="linear_perp",
        price_precision=2,
        quantity_precision=3,
        tick_size=0.1,
        lot_size=0.001,
        min_notional=5.0,
    )
    db.upsert_instrument(inst_btc)
    db.upsert_instrument(inst_eth)
    db.upsert_instrument(inst_bybit_btc)


# ===========================================================================
# 1. WAL Concurrency & Multi-Threaded Stress Tests
# ===========================================================================

class TestSQLiteWALConcurrencyStress:
    """Stress tests verifying SQLite multi-threaded read/write concurrency in WAL mode."""

    def test_multithreaded_concurrent_writers(self, tmp_path: Path):
        """Stress: 20 worker threads concurrently write 100 funding rate records each (2,000 total).

        Validates that SQLite WAL mode and busy_timeout handle high write concurrency
        without deadlocks, lost updates, or corruption.
        """
        db_file = tmp_path / "stress_writers.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=10000)
        seed_base_metadata(db)

        num_threads = 20
        records_per_thread = 100
        total_expected = num_threads * records_per_thread
        errors: list[Exception] = []

        def worker(thread_idx: int):
            try:
                for i in range(records_per_thread):
                    ts = 1700000000000 + (thread_idx * 10000) + i
                    rate = FundingRateModel(
                        exchange_id="binance",
                        symbol="BTCUSDT",
                        timestamp_ms=ts,
                        settlement_time_utc="2023-11-14T16:00:00Z",
                        funding_rate=0.0001 + (i * 0.00001),
                        funding_rate_annualized=0.1095,
                        mark_price=36500.0 + i,
                        index_price=36495.0 + i,
                        interest_rate=0.0001,
                        funding_interval_hours=8,
                        source="stress_test",
                    )
                    db.insert_funding_rate(rate)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
        start_time = time.perf_counter()
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        duration = time.perf_counter() - start_time

        assert len(errors) == 0, f"Encountered {len(errors)} thread errors: {errors[:5]}"

        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM funding_rates WHERE source = 'stress_test'")
            count = cursor.fetchone()[0]
            assert count == total_expected, f"Expected {total_expected} records, found {count}"

            cursor = conn.execute("PRAGMA integrity_check;")
            assert cursor.fetchone()[0] == "ok"

        print(f"\n[WAL Stress] {total_expected} concurrent writes across {num_threads} threads completed in {duration:.3f}s ({total_expected/duration:.1f} writes/sec)")

    def test_multithreaded_mixed_readers_and_writers(self, tmp_path: Path):
        """Stress: 10 active writers and 10 active readers running concurrently.

        Verifies non-blocking reader behavior in WAL mode where readers do not block
        writers and writers do not block readers.
        """
        db_file = tmp_path / "stress_mixed.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=10000)
        seed_base_metadata(db)

        num_writers = 10
        num_readers = 10
        write_iterations = 50
        stop_event = threading.Event()
        writer_errors: list[Exception] = []
        reader_errors: list[Exception] = []
        read_counts: list[int] = [0] * num_readers

        def writer(w_idx: int):
            try:
                for i in range(write_iterations):
                    ts = 1700000000000 + (w_idx * 10000) + i
                    ticker = TickerSnapshotModel(
                        exchange_id="binance",
                        symbol="BTCUSDT",
                        timestamp_ms=ts,
                        last_price=36500.0 + (w_idx * 10) + i,
                        mark_price=36500.0 + i,
                        index_price=36495.0,
                        bid1_price=36499.0,
                        ask1_price=36501.0,
                        bid1_qty=1.0,
                        ask1_qty=1.0,
                        spread_bps=0.5,
                    )
                    db.insert_ticker_snapshot(ticker)
                    time.sleep(0.001)
            except Exception as e:
                writer_errors.append(e)

        def reader(r_idx: int):
            try:
                count = 0
                while not stop_event.is_set():
                    ticker = db.get_latest_ticker("BTCUSDT", "binance")
                    if ticker is not None:
                        count += 1
                    rates = db.get_funding_rates("BTCUSDT", "binance", limit=20)
                    count += len(rates)
                    time.sleep(0.002)
                read_counts[r_idx] = count
            except Exception as e:
                reader_errors.append(e)

        writer_threads = [threading.Thread(target=writer, args=(w,)) for w in range(num_writers)]
        reader_threads = [threading.Thread(target=reader, args=(r,)) for r in range(num_readers)]

        for r in reader_threads:
            r.start()
        for w in writer_threads:
            w.start()

        for w in writer_threads:
            w.join()

        stop_event.set()
        for r in reader_threads:
            r.join()

        assert len(writer_errors) == 0, f"Writer errors: {writer_errors}"
        assert len(reader_errors) == 0, f"Reader errors: {reader_errors}"

        total_reads = sum(read_counts)
        assert total_reads > 0, "Readers performed 0 successful read operations"

        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM ticker_snapshots")
            total_writes = cursor.fetchone()[0]
            assert total_writes == num_writers * write_iterations

    def test_high_contention_burst_writes(self, tmp_path: Path):
        """Stress: 50 concurrent threads hammering short atomic transactions simultaneously."""
        db_file = tmp_path / "stress_burst.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=15000)
        seed_base_metadata(db)

        num_threads = 50
        barrier = threading.Barrier(num_threads)
        errors: list[Exception] = []

        def burst_worker(t_id: int):
            barrier.wait()
            try:
                db.insert_audit_log(
                    event_type="BURST_EVENT",
                    agent_id=f"AGENT_{t_id}",
                    details_json=json.dumps({"thread": t_id, "timestamp": time.time()}),
                )
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=burst_worker, args=(i,)) for i in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Encountered errors under 50-thread burst contention: {errors}"
        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM audit_log WHERE event_type = 'BURST_EVENT'")
            count = cursor.fetchone()[0]
            assert count == num_threads

    def test_concurrent_cross_table_transactions(self, tmp_path: Path):
        """Stress: Concurrent multi-table atomic transactions across 10 threads."""
        db_file = tmp_path / "stress_cross_table.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=10000)
        seed_base_metadata(db)

        num_threads = 10
        iterations = 20
        errors: list[Exception] = []

        def cross_table_worker(t_idx: int):
            try:
                for i in range(iterations):
                    ts = 1700000000000 + (t_idx * 1000) + i
                    with db.transaction() as conn:
                        cursor = conn.execute(
                            """
                            INSERT INTO funding_rates (
                                exchange_id, symbol, timestamp_ms, settlement_time_utc,
                                funding_rate, funding_rate_annualized, mark_price, index_price,
                                interest_rate, funding_interval_hours, source
                            ) VALUES ('binance', 'BTCUSDT', ?, '2023-11-14T16:00:00Z', 0.0001, 0.1095, 36500.0, 36495.0, 0.0001, 8, 'cross_worker')
                            """,
                            (ts,),
                        )
                        fr_id = cursor.lastrowid

                        conn.execute(
                            """
                            INSERT INTO regime_datapoints (regime_id, funding_rate_id, exchange_id, symbol, timestamp_ms)
                            VALUES ('REGIME_1', ?, 'binance', 'BTCUSDT', ?)
                            """,
                            (fr_id, ts),
                        )

                        conn.execute(
                            """
                            INSERT INTO audit_log (event_type, agent_id, details_json)
                            VALUES ('CROSS_TX', ?, ?)
                            """,
                            (f"THREAD_{t_idx}", json.dumps({"fr_id": fr_id, "i": i})),
                        )
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=cross_table_worker, args=(t,)) for t in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Cross-table errors: {errors}"
        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM regime_datapoints")
            rd_count = cursor.fetchone()[0]
            assert rd_count == num_threads * iterations

            cursor = conn.execute("PRAGMA foreign_key_check;")
            fk_violations = cursor.fetchall()
            assert len(fk_violations) == 0, f"Foreign key violations detected: {fk_violations}"

    def test_database_locked_exception_on_timeout(self, tmp_path: Path):
        """Stress: Verify DatabaseLockedException is raised when lock cannot be acquired within timeout."""
        db_file = tmp_path / "stress_lock_timeout.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=100)
        seed_base_metadata(db)

        # Connection 1 acquires exclusive lock and holds it
        conn1 = sqlite3.connect(str(db_file), timeout=0.1)
        conn1.execute("BEGIN EXCLUSIVE TRANSACTION;")
        conn1.execute("INSERT INTO audit_log (event_type, agent_id, details_json) VALUES ('LOCK_HELD', 'DELTA', '{}')")

        try:
            # Connection 2 attempts write with 100ms timeout
            with pytest.raises(DatabaseLockedException):
                with db.transaction() as conn2:
                    conn2.execute(
                        "INSERT INTO audit_log (event_type, agent_id, details_json) VALUES ('BLOCKED_TX', 'ALPHA', '{}')"
                    )
        finally:
            conn1.rollback()
            conn1.close()


# ===========================================================================
# 2. Crash Recovery & Abrupt Disconnect Simulation
# ===========================================================================

class TestDatabaseCrashAndRecoveryStress:
    """Stress tests simulating abrupt disconnects, uncommitted transactions, and crash recovery."""

    def test_uncommitted_transaction_abrupt_disconnect_rollback(self, tmp_path: Path):
        """Simulate a client thread starting a transaction, inserting rows, and abruptly dropping connection."""
        db_file = tmp_path / "crash_uncommitted.db"
        db = DatabaseManager(db_path=str(db_file))
        seed_base_metadata(db)

        # Step 1: Open raw connection, begin transaction, insert 100 rows, DO NOT COMMIT
        raw_conn = sqlite3.connect(str(db_file), timeout=5.0)
        raw_conn.execute("PRAGMA foreign_keys = ON;")
        raw_conn.execute("BEGIN EXCLUSIVE TRANSACTION;")
        for i in range(100):
            raw_conn.execute(
                """
                INSERT INTO audit_log (event_type, agent_id, details_json)
                VALUES ('UNCOMMITTED_EVENT', 'ROGUE_PROCESS', '{"status": "crashed"}')
                """
            )
        # Abrupt disconnect: close socket without commit or rollback
        raw_conn.close()

        # Step 2: Open brand new DatabaseManager instance as if restarting application
        recovery_db = DatabaseManager(db_path=str(db_file))
        with recovery_db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM audit_log WHERE event_type = 'UNCOMMITTED_EVENT'")
            count = cursor.fetchone()[0]
            assert count == 0, f"Expected 0 uncommitted rows, but found {count} leaked rows!"

            cursor = conn.execute("PRAGMA integrity_check;")
            assert cursor.fetchone()[0] == "ok"

    def test_wal_checkpoint_and_recovery_after_unclean_shutdown(self, tmp_path: Path):
        """Write 500 committed records into WAL without checkpointing, simulate unclean process kill."""
        db_file = tmp_path / "crash_wal_recovery.db"
        db = DatabaseManager(db_path=str(db_file))
        seed_base_metadata(db)

        # Write 500 committed records
        for i in range(500):
            rate = FundingRateModel(
                exchange_id="binance",
                symbol="BTCUSDT",
                timestamp_ms=1700000000000 + i,
                settlement_time_utc="2023-11-14T16:00:00Z",
                funding_rate=0.0001,
                funding_rate_annualized=0.1095,
                mark_price=36500.0,
                index_price=36495.0,
                source="pre_crash",
            )
            db.insert_funding_rate(rate)

        # Simulate complete crash by destroying db manager instance
        del db

        # Restart system: initialize new DatabaseManager against the same file
        recovered_db = DatabaseManager(db_path=str(db_file))
        with recovered_db.transaction() as conn:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            cursor = conn.execute("SELECT COUNT(*) FROM funding_rates WHERE source = 'pre_crash'")
            count = cursor.fetchone()[0]
            assert count == 500, f"Expected 500 recovered rows, found {count}"

            cursor = conn.execute("PRAGMA quick_check;")
            assert cursor.fetchone()[0] == "ok"

    def test_simulated_process_crash_during_batch_insert(self, tmp_path: Path):
        """Simulate a fatal exception during a batch transaction."""
        db_file = tmp_path / "crash_atomic_batch.db"
        db = DatabaseManager(db_path=str(db_file))
        seed_base_metadata(db)

        # Attempt batch transaction that raises halfway through
        with pytest.raises(RuntimeError, match="Simulated Process Crash / Power Loss"):
            with db.transaction() as conn:
                for i in range(250):
                    conn.execute(
                        """
                        INSERT INTO audit_log (event_type, agent_id, details_json)
                        VALUES ('ATOMIC_BATCH', 'ALPHA', '{"step": 1}')
                        """
                    )
                # Fatal interruption
                raise RuntimeError("Simulated Process Crash / Power Loss")

        # Verify 0 rows persisted from the aborted batch
        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM audit_log WHERE event_type = 'ATOMIC_BATCH'")
            assert cursor.fetchone()[0] == 0

    def test_rapid_connection_drop_loop_integrity(self, tmp_path: Path):
        """Stress: 50 cycles of rapid opening, dirty writes, aborts, and clean commits."""
        db_file = tmp_path / "crash_rapid_cycle.db"
        db = DatabaseManager(db_path=str(db_file))
        seed_base_metadata(db)

        for cycle in range(50):
            if cycle % 2 == 0:
                # Aborted cycle
                try:
                    with db.transaction() as conn:
                        conn.execute(
                            "INSERT INTO audit_log (event_type, agent_id, details_json) VALUES ('ABORT', 'X', '{}')"
                        )
                        raise ValueError("Forced abort")
                except ValueError:
                    pass
            else:
                # Committed cycle
                db.insert_audit_log(
                    event_type="COMMITTED_CYCLE",
                    agent_id="DELTA",
                    details_json=json.dumps({"cycle": cycle}),
                )

        with db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM audit_log WHERE event_type = 'COMMITTED_CYCLE'")
            assert cursor.fetchone()[0] == 25

            cursor = conn.execute("SELECT COUNT(*) FROM audit_log WHERE event_type = 'ABORT'")
            assert cursor.fetchone()[0] == 0

            cursor = conn.execute("PRAGMA integrity_check;")
            assert cursor.fetchone()[0] == "ok"


# ===========================================================================
# 3. Singleton Constraints & Schema Integrity Across All 12 Tables
# ===========================================================================

class TestSchemaIntegrityAndSingletonStress:
    """Stress tests verifying singleton constraints on kill_switch_state and full relational integrity."""

    def test_kill_switch_singleton_check_constraint(self, test_db: DatabaseManager):
        """Empirically test that kill_switch_state rejects any row where id != 1."""
        with test_db.transaction() as conn:
            # Test id = 2
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO kill_switch_state (id, is_tripped, trip_reason) VALUES (2, 1, 'Illegal row')"
                )

            # Test id = 0
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO kill_switch_state (id, is_tripped, trip_reason) VALUES (0, 1, 'Zero id')"
                )

            # Test id = -1
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO kill_switch_state (id, is_tripped, trip_reason) VALUES (-1, 1, 'Negative id')"
                )

    def test_kill_switch_singleton_single_row_retention(self, test_db: DatabaseManager):
        """Assert that regardless of how many times set_kill_switch_state is called, exactly 1 row exists."""
        for i in range(20):
            test_db.set_kill_switch_state(
                is_tripped=(i % 2 == 1),
                trip_reason=f"Trip state #{i}",
                tripped_by=f"AGENT_{i}",
                lock_payload_json=json.dumps({"step": i}),
            )

        with test_db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM kill_switch_state")
            count = cursor.fetchone()[0]
            assert count == 1, f"Expected exactly 1 singleton row, found {count}"

            cursor = conn.execute("SELECT * FROM kill_switch_state WHERE id = 1")
            row = dict(cursor.fetchone())
            assert row["id"] == 1
            assert row["trip_reason"] == "Trip state #19"
            assert row["tripped_by"] == "AGENT_19"

    def test_kill_switch_concurrent_contention(self, tmp_path: Path):
        """Stress: 20 threads simultaneously tripping and checking kill_switch_state."""
        db_file = tmp_path / "stress_kill_switch.db"
        db = DatabaseManager(db_path=str(db_file), busy_timeout_ms=10000)

        num_threads = 20
        errors: list[Exception] = []

        def worker(t_id: int):
            try:
                for i in range(10):
                    db.set_kill_switch_state(
                        is_tripped=(i % 2 == 1),
                        trip_reason=f"Concurrent trip by thread {t_id} step {i}",
                        tripped_by=f"THREAD_{t_id}",
                    )
                    state = db.get_kill_switch_state()
                    assert state.id == 1
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(t,)) for t in range(num_threads)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert len(errors) == 0, f"Kill switch contention errors: {errors}"
        with db.transaction() as conn:
            assert conn.execute("SELECT COUNT(*) FROM kill_switch_state").fetchone()[0] == 1

    def test_all_12_tables_not_null_constraints(self, test_db: DatabaseManager):
        """Empirically verify that every table in the schema enforces NOT NULL on required columns."""
        with test_db.transaction() as conn:
            # 1. exchange_metadata
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO exchange_metadata (exchange_id, name) VALUES ('ex1', NULL)")

            # 2. instruments
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO instruments (symbol, exchange_id, base_asset) VALUES ('S1', 'binance', NULL)")

            # 3. funding_rates
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO funding_rates (exchange_id, symbol, timestamp_ms, funding_rate) VALUES ('binance', 'BTCUSDT', NULL, 0.001)"
                )

            # 4. ticker_snapshots
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO ticker_snapshots (exchange_id, symbol, timestamp_ms, last_price) VALUES ('binance', 'BTCUSDT', 100, NULL)"
                )

            # 5. orderbook_snapshots
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO orderbook_snapshots (exchange_id, symbol, timestamp_ms, bid_depth_top5) VALUES ('binance', 'BTCUSDT', 100, NULL)"
                )

            # 6. fee_schedules
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO fee_schedules (exchange_id, maker_rate, taker_rate, verified_at) VALUES ('binance', NULL, 0.0005, '2026-08-28')"
                )

            # 7. regimes
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO regimes (regime_id, name, description, start_time_utc) VALUES ('R_NEW', NULL, 'desc', '2023')"
                )

            # 8. regime_datapoints
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO regime_datapoints (regime_id, funding_rate_id, exchange_id, symbol, timestamp_ms) VALUES (NULL, 1, 'b', 's', 1)"
                )

            # 9. spread_opportunities
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO spread_opportunities (timestamp_ms, symbol, exchange_long, exchange_short, gross_spread) VALUES (1, NULL, 'b1', 'b2', 0.005)"
                )

            # 10. kill_switch_state (is_tripped is NOT NULL DEFAULT 0)
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO kill_switch_state (id, is_tripped) VALUES (1, NULL)")

            # 11. audit_log
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute("INSERT INTO audit_log (event_type, agent_id, details_json) VALUES (NULL, 'A', '{}')")

            # 12. agent_state_audit
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO agent_state_audit (memo_id, from_agent, to_agent, idea_id, phase, position, evidence, git_commit, created_at_utc) VALUES ('M1', NULL, 'B', 'I1', 'A', 'approve', 'ev', 'c1', 'now')"
                )

    def test_foreign_key_enforcement_on_child_tables(self, test_db: DatabaseManager):
        """Empirically test that inserting orphaned child records raises FOREIGN KEY constraint failure."""
        with test_db.transaction() as conn:
            # 1. instruments referencing non-existent exchange
            with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY constraint failed"):
                conn.execute(
                    """
                    INSERT INTO instruments (
                        symbol, exchange_id, base_asset, quote_asset, contract_type,
                        price_precision, quantity_precision, tick_size, lot_size
                    ) VALUES ('BTCUSDT', 'NON_EXISTENT_EXCHANGE', 'BTC', 'USDT', 'linear_perp', 2, 3, 0.1, 0.001)
                    """
                )

            # 2. funding_rates referencing non-existent (symbol, exchange_id)
            with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY constraint failed"):
                conn.execute(
                    """
                    INSERT INTO funding_rates (
                        exchange_id, symbol, timestamp_ms, settlement_time_utc,
                        funding_rate, funding_rate_annualized, source
                    ) VALUES ('binance', 'UNLISTED_TOKEN', 1700000000000, '2023-11-14T16:00:00Z', 0.0001, 0.1, 'test')
                    """
                )

            # 3. fee_schedules referencing non-existent exchange
            with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY constraint failed"):
                conn.execute(
                    """
                    INSERT INTO fee_schedules (
                        exchange_id, maker_rate, taker_rate, verification_source_citations, verified_at
                    ) VALUES ('UNKNOWN_EXCHANGE', 0.0002, 0.0005, 'Citation', '2026-08-28')
                    """
                )

            # 4. regime_datapoints referencing non-existent regime_id
            with pytest.raises(sqlite3.IntegrityError, match="FOREIGN KEY constraint failed"):
                conn.execute(
                    """
                    INSERT INTO regime_datapoints (
                        regime_id, funding_rate_id, exchange_id, symbol, timestamp_ms
                    ) VALUES ('NON_EXISTENT_REGIME', 1, 'binance', 'BTCUSDT', 1700000000000)
                    """
                )

    def test_cascading_deletions_across_relational_hierarchy(self, test_db: DatabaseManager):
        """Empirically test ON DELETE CASCADE behavior when parent records are removed."""
        seed_base_metadata(test_db)

        with test_db.transaction() as conn:
            c1 = conn.execute(
                """
                INSERT INTO funding_rates (
                    exchange_id, symbol, timestamp_ms, settlement_time_utc,
                    funding_rate, funding_rate_annualized, source
                ) VALUES ('binance', 'BTCUSDT', 1700000000000, '2023-11-14T16:00:00Z', 0.0001, 0.1, 'test')
                """
            )
            fr_id = c1.lastrowid

            conn.execute(
                """
                INSERT INTO ticker_snapshots (
                    exchange_id, symbol, timestamp_ms, last_price, mark_price, index_price,
                    bid1_price, ask1_price, bid1_qty, ask1_qty, spread_bps
                ) VALUES ('binance', 'BTCUSDT', 1700000000000, 36500.0, 36500.0, 36495.0, 36499.0, 36501.0, 1.0, 1.0, 0.5)
                """
            )

            conn.execute(
                """
                INSERT INTO orderbook_snapshots (
                    exchange_id, symbol, timestamp_ms, bid_depth_top5, ask_depth_top5,
                    bid_depth_top20, ask_depth_top20, spread_bps, mid_price
                ) VALUES ('binance', 'BTCUSDT', 1700000000000, 100.0, 100.0, 500.0, 500.0, 0.5, 36500.0)
                """
            )

            conn.execute(
                """
                INSERT INTO fee_schedules (
                    exchange_id, maker_rate, taker_rate, verification_source_citations, verified_at
                ) VALUES ('binance', 0.0002, 0.0005, '5 sources', '2026-08-28T14:00:00Z')
                """
            )

            conn.execute(
                """
                INSERT INTO regime_datapoints (
                    regime_id, funding_rate_id, exchange_id, symbol, timestamp_ms
                ) VALUES ('REGIME_1', ?, 'binance', 'BTCUSDT', 1700000000000)
                """,
                (fr_id,),
            )

        # Verify child records exist
        with test_db.transaction() as conn:
            assert conn.execute("SELECT COUNT(*) FROM instruments WHERE exchange_id = 'binance'").fetchone()[0] == 2
            assert conn.execute("SELECT COUNT(*) FROM funding_rates WHERE exchange_id = 'binance'").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM ticker_snapshots WHERE exchange_id = 'binance'").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM orderbook_snapshots WHERE exchange_id = 'binance'").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM fee_schedules WHERE exchange_id = 'binance'").fetchone()[0] == 1
            assert conn.execute("SELECT COUNT(*) FROM regime_datapoints WHERE exchange_id = 'binance'").fetchone()[0] == 1

        # Delete parent exchange 'binance'
        with test_db.transaction() as conn:
            conn.execute("DELETE FROM exchange_metadata WHERE exchange_id = 'binance'")

        # Verify all children were automatically deleted by cascade
        with test_db.transaction() as conn:
            assert conn.execute("SELECT COUNT(*) FROM instruments WHERE exchange_id = 'binance'").fetchone()[0] == 0
            assert conn.execute("SELECT COUNT(*) FROM funding_rates WHERE exchange_id = 'binance'").fetchone()[0] == 0
            assert conn.execute("SELECT COUNT(*) FROM ticker_snapshots WHERE exchange_id = 'binance'").fetchone()[0] == 0
            assert conn.execute("SELECT COUNT(*) FROM orderbook_snapshots WHERE exchange_id = 'binance'").fetchone()[0] == 0
            assert conn.execute("SELECT COUNT(*) FROM fee_schedules WHERE exchange_id = 'binance'").fetchone()[0] == 0
            assert conn.execute("SELECT COUNT(*) FROM regime_datapoints WHERE exchange_id = 'binance'").fetchone()[0] == 0

            # Verify integrity
            cursor = conn.execute("PRAGMA integrity_check;")
            assert cursor.fetchone()[0] == "ok"
            cursor = conn.execute("PRAGMA foreign_key_check;")
            assert len(cursor.fetchall()) == 0

    def test_primary_key_and_unique_constraint_enforcement(self, test_db: DatabaseManager):
        """Assert duplicate primary keys fail with IntegrityError when using raw INSERT."""
        seed_base_metadata(test_db)

        with test_db.transaction() as conn:
            # Duplicate exchange_id
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO exchange_metadata (
                        exchange_id, name, api_type, rest_testnet_url, ws_testnet_url, auth_type
                    ) VALUES ('binance', 'Duplicate Binance', 'rest_ccxt', 'https://test', 'wss://test', 'hmac')
                    """
                )

            # Duplicate (symbol, exchange_id)
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO instruments (
                        symbol, exchange_id, base_asset, quote_asset, contract_type,
                        price_precision, quantity_precision, tick_size, lot_size
                    ) VALUES ('BTCUSDT', 'binance', 'BTC', 'USDT', 'linear_perp', 2, 3, 0.1, 0.001)
                    """
                )

            # Duplicate memo_id
            conn.execute(
                """
                INSERT INTO agent_state_audit (
                    memo_id, from_agent, to_agent, idea_id, phase, position, evidence, git_commit, created_at_utc
                ) VALUES ('MEMO-001', 'ALPHA', 'BETA', 'idea-01', 'A', 'approve', 'ev', 'c1', '2026-08-28')
                """
            )
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    """
                    INSERT INTO agent_state_audit (
                        memo_id, from_agent, to_agent, idea_id, phase, position, evidence, git_commit, created_at_utc
                    ) VALUES ('MEMO-001', 'GAMMA', 'DELTA', 'idea-01', 'A', 'veto', 'ev2', 'c2', '2026-08-28')
                    """
                )

    def test_schema_initialization_idempotency(self, tmp_path: Path):
        """Stress: Call initialize_schema 10 times consecutively on populated database to ensure zero data loss."""
        db_file = tmp_path / "idempotent_schema.db"
        db = DatabaseManager(db_path=str(db_file))
        seed_base_metadata(db)

        # Insert test audit log
        db.insert_audit_log("TEST_EVENT", "GAMMA", '{"key": "value"}')

        # Run initialize_schema repeatedly
        for _ in range(10):
            db.initialize_schema()

        # Check that records and regimes are untouched
        with db.transaction() as conn:
            assert conn.execute("SELECT COUNT(*) FROM regimes").fetchone()[0] == 4
            assert conn.execute("SELECT COUNT(*) FROM exchange_metadata").fetchone()[0] == 2
            assert conn.execute("SELECT COUNT(*) FROM instruments").fetchone()[0] == 3
            assert conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0] == 1
            assert conn.execute("PRAGMA integrity_check;").fetchone()[0] == "ok"
