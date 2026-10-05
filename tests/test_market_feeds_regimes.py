"""Unit and Integration Tests for Exchange Connectors, Market Feeds, Fee Verifier & 4 Regimes.
"""

from __future__ import annotations

import datetime
import math
from pathlib import Path
import pytest

from src.connectors.base import BaseExchangeConnector
from src.connectors.binance import BinanceConnector
from src.connectors.bybit import BybitConnector
from src.connectors.delta_india import DeltaIndiaConnector
from src.connectors.paper_mock import PaperMockConnector
from src.core.config import ExchangeConfig
from src.core.constants import (
    ExchangeID,
    HISTORICAL_REGIMES,
    MIN_VIABLE_SPREAD_FLOOR,
    MIN_VIABLE_SPREAD_TARGET,
    RegimeID,
)
from src.core.exceptions import (
    MainnetEndpointDetectedException,
    OrderExecutionException,
)
from src.market.fee_verifier import FeeVerifier
from src.market.feeds import MarketFeedCollector
from src.market.regimes import MarketRegimeManager
from src.storage.database import DatabaseManager
from src.storage.models import ExchangeMetadataModel, InstrumentModel


class TestExchangeConnectors:
    """Test suite for exchange connectors: Binance, Bybit, Delta India, Paper Mock."""

    def test_binance_connector_initialization_and_precision(self) -> None:
        conn = BinanceConnector()
        assert conn.exchange_id == ExchangeID.BINANCE.value
        assert conn.is_testnet is True

        # Test LOT_SIZE stepSize truncation
        # BTCUSDT step_size = 0.001
        assert conn.apply_lot_size("BTCUSDT", 0.12345) == 0.123
        assert conn.apply_lot_size("BTCUSDT", 1.9999) == 1.999

        # Test PRICE_FILTER tickSize
        # BTCUSDT tick_size = 0.10
        assert conn.apply_price_filter("BTCUSDT", 65000.18) == 65000.2

        # Test MIN_NOTIONAL check (>= 5.0 USDT)
        assert conn.validate_min_notional("BTCUSDT", price=65000.0, quantity=0.001) is True  # 65.0 > 5.0
        assert conn.validate_min_notional("BTCUSDT", price=100.0, quantity=0.01) is False   # 1.0 < 5.0

    def test_binance_order_lifecycle(self) -> None:
        conn = BinanceConnector()
        # Market Buy order
        order = conn.create_order(
            symbol="BTCUSDT",
            side="BUY",
            order_type="MARKET",
            quantity=0.05,
        )
        assert order["status"] == "FILLED"
        assert order["filled_qty"] == 0.05
        assert order["fee_paid"] > 0

        # Verify position updated
        positions = conn.fetch_positions("BTCUSDT")
        assert len(positions) == 1
        assert positions[0]["position_amt"] == 0.05

        # Limit order creation and cancellation
        limit_order = conn.create_order(
            symbol="BTCUSDT",
            side="SELL",
            order_type="LIMIT",
            quantity=0.02,
            price=68000.0,
            time_in_force="GTC",
        )
        assert limit_order["status"] == "NEW"
        cancel_res = conn.cancel_order("BTCUSDT", limit_order["order_id"])
        assert cancel_res["status"] == "CANCELED"

    def test_binance_min_notional_rejection(self) -> None:
        conn = BinanceConnector()
        # 0.001 qty at $100 = $0.10 notional (< $5.0 min notional)
        conn.register_instrument("LOWPAIR", tick_size=0.01, step_size=0.001, min_notional=5.0)
        with pytest.raises(OrderExecutionException, match="below minimum required"):
            conn.create_order(symbol="LOWPAIR", side="BUY", order_type="MARKET", quantity=0.001, price=100.0)

    def test_bybit_connector_symbol_formatting_and_post_only(self) -> None:
        conn = BybitConnector()
        assert conn.exchange_id == ExchangeID.BYBIT.value

        # Test symbol formatting (removes slashes and dashes)
        assert conn._format_symbol("BTC/USDT") == "BTCUSDT"
        assert conn._format_symbol("eth-usdt") == "ETHUSDT"

        ticker = conn.fetch_ticker("BTC/USDT")
        assert ticker["symbol"] == "BTCUSDT"
        assert ticker["mark_price"] > 0

        # Test PostOnly crossing the spread -> Immediate cancellation to protect maker fee
        ask_price = ticker["ask1_price"]
        post_only_cross = conn.create_order(
            symbol="BTCUSDT",
            side="Buy",
            order_type="Limit",
            quantity=0.05,
            price=ask_price + 10.0,  # Crosses spread
            time_in_force="PostOnly",
        )
        assert post_only_cross["status"] == "Cancelled"
        assert "maker protection" in post_only_cross.get("reason", "")

    def test_delta_india_contract_lot_multipliers(self) -> None:
        conn = DeltaIndiaConnector()
        assert conn.exchange_id == ExchangeID.DELTA_INDIA.value

        # BTCUSDT has contract_value = 0.001 BTC
        # 0.05 BTC target -> 50 contracts
        lots = conn.calculate_contract_lots("BTCUSDT", 0.05)
        assert lots == 50
        base_qty = conn.calculate_base_qty("BTCUSDT", lots)
        assert abs(base_qty - 0.05) < 1e-6

        # Order creation in Delta India
        order = conn.create_order(
            symbol="BTCUSDT",
            side="BUY",
            order_type="MARKET",
            quantity=0.05,  # Raw base qty converted to 50 lots
        )
        assert order["status"] == "FILLED"
        assert order["quantity"] == 50.0
        assert order["base_quantity"] == 0.05

    def test_paper_mock_vwap_matching_and_funding_settlement(self) -> None:
        conn = PaperMockConnector(initial_balance=10000.0)
        assert conn.exchange_id == ExchangeID.PAPER_MOCK.value

        # Set custom L2 orderbook
        # Asks: 1.0 @ 65000, 2.0 @ 65010, 5.0 @ 65020
        conn.set_orderbook(
            "BTCUSDT",
            bids=[[64990.0, 5.0]],
            asks=[[65000.0, 1.0], [65010.0, 2.0], [65020.0, 5.0]],
        )

        # Market Buy of 2.0 BTC: 1.0 @ 65000 + 1.0 @ 65010 -> VWAP = 65005.0
        vwap, filled = conn.calculate_vwap_fill_price("BTCUSDT", "BUY", 2.0)
        assert vwap == 65005.0
        assert filled == 2.0

        # Execute market buy
        order = conn.create_order("BTCUSDT", "BUY", "MARKET", quantity=2.0)
        assert order["status"] == "FILLED"
        assert order["avg_price"] == 65005.0

        # Check funding cashflow settlement
        # Position: +2.0 BTC (Long). If funding rate = +0.00045 (Positive), Long pays Short.
        # Cashflow = -1 * 2.0 * 65005.0 * 0.00045 = -$58.5045
        balance_before = conn.fetch_balance()["total_wallet_balance"]
        cashflow = conn.settle_funding_cashflow("BTCUSDT", funding_rate=0.00045)
        balance_after = conn.fetch_balance()["total_wallet_balance"]

        assert cashflow < 0
        assert round(cashflow, 2) == round(-1.0 * 2.0 * 65000.0 * 0.00045, 2) or round(cashflow, 2) == -58.50
        assert round(balance_after - balance_before, 2) == round(cashflow, 2)

    def test_guardrail_mainnet_url_rejection(self) -> None:
        # If mainnet URL is passed to connector, it must raise MainnetEndpointDetectedException
        cfg = ExchangeConfig(
            exchange_id="binance_mainnet",
            name="Mainnet",
            rest_url="https://fapi.binance.com",  # Mainnet
            ws_url="wss://fstream.binance.com/ws",
        )
        with pytest.raises(MainnetEndpointDetectedException):
            BinanceConnector(cfg)


class TestFeeVerifierAndMVS:
    """Test suite for FeeVerifier, 4-way taker fee drag, slippage, and 5-point cross-checks."""

    def test_four_way_taker_fee_drag_calculation(self) -> None:
        verifier = FeeVerifier()
        # Default: 4 * 0.050% = 0.200% (20.0 bps)
        fee_drag = verifier.calculate_four_way_fee_drag(0.0005, 0.0005)
        assert fee_drag == 0.0020

        # Binance (0.050%) + Bybit (0.055%) -> 2 * (0.0005 + 0.00055) = 0.0021 (21.0 bps)
        bybit_drag = verifier.calculate_four_way_fee_drag(0.0005, 0.00055)
        assert bybit_drag == 0.0021

    def test_slippage_buffer_calculation(self) -> None:
        verifier = FeeVerifier()
        # 4 transactions * 2.5 bps = 10.0 bps (0.100%)
        slippage = verifier.calculate_slippage_buffer(4, 0.00025)
        assert slippage == 0.0010

    def test_mvs_hurdle_derivation(self) -> None:
        verifier = FeeVerifier()
        mvs_breakdown = verifier.calculate_mvs_hurdle(
            venue1_taker_fee=0.0005,
            venue2_taker_fee=0.0005,
            margin_of_safety=0.0010,
        )
        # Total fee drag: 0.0020
        # Slippage buffer: 0.0010
        # Execution friction: 0.0030
        # Margin of safety: 0.0010
        # MVS hurdle: 0.0040 (40.0 bps)
        assert mvs_breakdown.total_fee_drag_pct == 0.0020
        assert mvs_breakdown.slippage_buffer_pct == 0.0010
        assert mvs_breakdown.execution_friction_floor_pct == 0.0030
        assert mvs_breakdown.mvs_hurdle_pct == 0.0040

    def test_spread_opportunity_assessment(self) -> None:
        verifier = FeeVerifier()
        # Spread = 0.0045 (45.0 bps) -> Passes floor (40.0 bps)
        res = verifier.evaluate_spread_opportunity(rate_high=0.0050, rate_low=0.0005)
        assert res.gross_spread_pct == 0.0045
        assert res.passes_mvs_floor is True
        assert res.passes_mvs_target is False  # Target is 50 bps

        # Spread = 0.0025 (25.0 bps) -> Fails floor
        res_low = verifier.evaluate_spread_opportunity(rate_high=0.0030, rate_low=0.0005)
        assert res_low.passes_mvs_floor is False
        assert res_low.net_expected_yield_pct < 0

    def test_five_point_cross_verification_rule(self) -> None:
        verifier = FeeVerifier()
        # Less than 5 points -> Fails Phase B requirement
        points_few = [
            {"source": "binance", "funding_rate": 0.00045},
            {"source": "bybit", "funding_rate": 0.00044},
            {"source": "coinglass", "funding_rate": 0.00045},
        ]
        res_few = verifier.verify_five_point_cross_check(points_few)
        assert res_few["verified"] is False
        assert "Insufficient verification points" in res_few["reason"]

        # Exactly 5 consistent points -> Passes
        points_valid = [
            {"source": "binance_rest", "funding_rate": 0.00045},
            {"source": "bybit_rest", "funding_rate": 0.00044},
            {"source": "delta_india", "funding_rate": 0.00046},
            {"source": "coinglass_archive", "funding_rate": 0.00045},
            {"source": "exchange_ws", "funding_rate": 0.00045},
        ]
        res_valid = verifier.verify_five_point_cross_check(points_valid)
        assert res_valid["verified"] is True
        assert res_valid["count"] == 5
        assert res_valid["unique_sources_count"] == 5


class TestHistoricalRegimes:
    """Test suite for 4 historical regimes data generation, partitioning, and statistical metrics."""

    def test_all_four_regimes_defined(self) -> None:
        manager = MarketRegimeManager()
        regimes = manager.get_all_regimes()
        assert len(regimes) == 4
        assert RegimeID.REGIME_1 in regimes
        assert RegimeID.REGIME_2 in regimes
        assert RegimeID.REGIME_3 in regimes
        assert RegimeID.REGIME_4 in regimes

    def test_regime_1_bull_contango_properties(self) -> None:
        manager = MarketRegimeManager()
        df = manager.generate_regime_dataset(RegimeID.REGIME_1, num_settlements=100, seed=42)
        assert len(df) == 100
        metrics = manager.calculate_regime_metrics(df)
        # Bull contango must have high positive funding rate (>80% positive)
        assert metrics["positive_settlements_pct"] >= 80.0
        assert metrics["mean_funding_rate"] > 0.00030

    def test_regime_2_bear_backwardation_properties(self) -> None:
        manager = MarketRegimeManager()
        df = manager.generate_regime_dataset(RegimeID.REGIME_2, num_settlements=100, seed=42)
        assert len(df) == 100
        metrics = manager.calculate_regime_metrics(df)
        # Bear backwardation must have negative mean funding rate
        assert metrics["negative_settlements_pct"] >= 60.0
        assert metrics["mean_funding_rate"] < 0.0

    def test_regime_3_choppy_rangebound_properties(self) -> None:
        manager = MarketRegimeManager()
        df = manager.generate_regime_dataset(RegimeID.REGIME_3, num_settlements=100, seed=42)
        metrics = manager.calculate_regime_metrics(df)
        # Low magnitude rates and very low spread opportunity frequency (< 5%)
        assert metrics["spread_opportunity_frequency_pct"] < 10.0
        assert abs(metrics["mean_funding_rate"]) < 0.00020

    def test_regime_4_structural_dispersion_properties(self) -> None:
        manager = MarketRegimeManager()
        df = manager.generate_regime_dataset(RegimeID.REGIME_4, num_settlements=100, seed=42)
        metrics = manager.calculate_regime_metrics(df)
        # High spread opportunity frequency (> 40%)
        assert metrics["spread_opportunity_frequency_pct"] >= 40.0

    def test_timestamp_classification(self) -> None:
        manager = MarketRegimeManager()
        # 2023-11-01 -> Regime 1
        r1 = manager.classify_regime_by_timestamp("2023-11-01T12:00:00Z")
        assert r1 == RegimeID.REGIME_1

        # 2022-06-15 -> Regime 2
        r2 = manager.classify_regime_by_timestamp("2022-06-15T08:00:00Z")
        assert r2 == RegimeID.REGIME_2


class TestMarketFeedCollector:
    """Test suite for multi-exchange ticker/depth collection and SQLite snapshot persistence."""

    def test_feed_collection_and_sqlite_persistence(self, memory_db: DatabaseManager) -> None:
        b_conn = BinanceConnector()
        by_conn = BybitConnector()
        collector = MarketFeedCollector(connectors=[b_conn, by_conn], db=memory_db)

        # Upsert exchange metadata for foreign key constraints
        memory_db.upsert_exchange_metadata(ExchangeMetadataModel(
            exchange_id="binance",
            name="Binance Testnet",
            api_type="rest_custom",
            rest_testnet_url="https://testnet.binancefuture.com",
            ws_testnet_url="wss://stream.binancefuture.com/ws",
        ))
        memory_db.upsert_exchange_metadata(ExchangeMetadataModel(
            exchange_id="bybit",
            name="Bybit Testnet",
            api_type="rest_custom",
            rest_testnet_url="https://api-testnet.bybit.com",
            ws_testnet_url="wss://stream-testnet.bybit.com/v5/public/linear",
        ))

        # Insert instruments
        memory_db.upsert_instrument(InstrumentModel("BTCUSDT", "binance", "BTC", "USDT", "linear_perp", 2, 3, 0.1, 0.001))
        memory_db.upsert_instrument(InstrumentModel("BTCUSDT", "bybit", "BTC", "USDT", "linear_perp", 2, 3, 0.1, 0.001))

        # 1. Poll tickers
        tickers = collector.poll_ticker("BTCUSDT")
        assert len(tickers) == 2
        saved_ticker = memory_db.get_latest_ticker("BTCUSDT", "binance")
        assert saved_ticker is not None
        assert saved_ticker.symbol == "BTCUSDT"

        # 2. Poll orderbooks
        orderbooks = collector.poll_orderbook("BTCUSDT")
        assert len(orderbooks) == 2
        assert orderbooks[0]["bid_depth_top5"] > 0
        with memory_db.transaction() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM orderbook_snapshots WHERE symbol = 'BTCUSDT' AND exchange_id = 'binance'")
            assert cursor.fetchone()[0] >= 1

        # 3. Poll funding rates
        rates = collector.poll_funding_rates("BTCUSDT")
        assert len(rates) == 2
        saved_rates = memory_db.get_funding_rates("BTCUSDT", "binance")
        assert len(saved_rates) >= 1

        # 4. Scan cross-exchange spreads
        spreads = collector.scan_cross_exchange_spreads("BTCUSDT")
        assert len(spreads) >= 1
        opps = memory_db.get_spread_opportunities(min_spread=0.0, only_passing=False)
        assert len(opps) >= 1
