"""Tests for BitgetConnector, Maker-to-Taker Post-Only Execution, and Settlement Clock Sync.
"""

from __future__ import annotations

import datetime
import pytest

from src.connectors.binance import BinanceConnector
from src.connectors.bitget import BitgetConnector
from src.core.config import ExchangeConfig
from src.core.constants import ExchangeID
from src.engine.executor import ExecutionEngine
from src.engine.interfaces import (
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)
from src.strategies.idea_03_cross_exchange import CrossExchangeFundingStrategy


class TestBitgetConnector:
    """Unit tests for Bitget V2 Futures Testnet connector."""

    def test_bitget_initialization_and_metadata(self):
        conn = BitgetConnector()
        assert conn.exchange_id == "bitget"
        assert conn.is_testnet is True
        assert "BTCUSDT" in conn.instruments
        assert conn.instruments["BTCUSDT"]["step_size"] == 0.001
        assert conn.instruments["BTCUSDT"]["min_notional"] == 5.0

    def test_bitget_ticker_and_orderbook(self):
        conn = BitgetConnector()
        ticker = conn.fetch_ticker("BTCUSDT")
        assert ticker["symbol"] == "BTCUSDT"
        assert ticker["bid1_price"] > 0
        assert ticker["ask1_price"] >= ticker["bid1_price"]

        ob = conn.fetch_orderbook("BTCUSDT", limit=10)
        assert len(ob["bids"]) == 10
        assert len(ob["asks"]) == 10
        assert ob["bids"][0][0] <= ob["asks"][0][0]

    def test_bitget_funding_rates(self):
        conn = BitgetConnector()
        fr = conn.fetch_current_funding_rate("BTCUSDT")
        assert "last_funding_rate" in fr
        assert fr["funding_interval_hours"] == 8

        history = conn.fetch_funding_rate_history("BTCUSDT", limit=5)
        assert len(history) == 5

    def test_bitget_post_only_maker_protection(self):
        conn = BitgetConnector()
        # Post-only buy at price >= ask1 should be rejected/canceled by maker protection
        ticker = conn.fetch_ticker("BTCUSDT")
        bad_price = ticker["ask1_price"] + 100.0
        res = conn.create_order(
            symbol="BTCUSDT",
            side="BUY",
            order_type="LIMIT",
            quantity=0.01,
            price=bad_price,
            time_in_force="PostOnly",
        )
        assert res["status"] == "CANCELED"
        assert "maker protection" in res.get("reason", "").lower()

    def test_bitget_order_and_position_lifecycle(self):
        conn = BitgetConnector()
        res = conn.create_order(
            symbol="BTCUSDT",
            side="BUY",
            order_type="MARKET",
            quantity=0.01,
        )
        assert res["status"] == "FILLED"
        assert res["filled_qty"] == 0.01

        positions = conn.fetch_positions("BTCUSDT")
        assert len(positions) == 1
        assert positions[0]["size"] == 0.01

        bal = conn.fetch_balance()
        assert bal["total_wallet_balance"] < 10000.0  # Fee was deducted


class TestMakerToTakerExecution:
    """Integration tests for sequential Maker-to-Taker Post-Only order execution."""

    def test_maker_taker_sequential_flow(self):
        conn_binance = BinanceConnector()
        conn_bitget = BitgetConnector()
        engine = ExecutionEngine(connectors=[conn_binance, conn_bitget])

        # Step 1: Submit Maker leg on Bitget
        maker_intent = OrderIntent(
            intent_id="intent_maker_bitget_01",
            strategy_id="idea_03_cross_exchange",
            exchange="bitget",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            order_type=OrderType.POST_ONLY,
            quantity=0.02,
            limit_price=64000.0,
            time_in_force="PostOnly",
            is_maker_first=True,
        )

        # Step 2: Dependent Taker leg on Binance (dependent on maker_intent)
        taker_intent = OrderIntent(
            intent_id="intent_taker_binance_01",
            strategy_id="idea_03_cross_exchange",
            exchange="binance",
            symbol="BTCUSDT",
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=0.02,
            dependent_on_intent_id="intent_maker_bitget_01",
        )

        # Submit taker intent first or concurrently: engine should queue it
        taker_res = engine.submit_order_intent(taker_intent)
        assert taker_res["status"] == "QUEUED_DEPENDENT"
        assert "intent_maker_bitget_01" in engine.pending_dependent_intents

        # Submit maker intent
        maker_res = engine.submit_order_intent(maker_intent)
        assert maker_res["status"] in ("FILLED", "NEW")

        # Simulate fill event on Maker leg
        fill_event = FillEvent(
            fill_id="fill_maker_01",
            order_id="bitget_order_01",
            intent_id="intent_maker_bitget_01",
            exchange="bitget",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            filled_qty=0.02,
            filled_price=64000.0,
            fee_paid=0.25,
            fee_asset="USDT",
            timestamp_utc=datetime.datetime.now(datetime.timezone.utc),
        )

        engine.process_fill(fill_event)

        # Dependent taker intent should now be executed on Binance!
        assert "intent_maker_bitget_01" not in engine.pending_dependent_intents
        assert "intent_taker_binance_01" in engine.active_orders
        assert engine.active_orders["intent_taker_binance_01"]["status"] == "FILLED"


class TestSettlementClockSync:
    """Tests for settlement clock synchronization across venues in Idea 03."""

    def test_clock_desync_blocks_entry(self):
        strat = CrossExchangeFundingStrategy()
        strat.initialize({"venue_a": "binance", "venue_b": "bitget", "min_spread_hurdle": 0.0020})

        now = datetime.datetime(2026, 10, 1, 7, 55, 0, tzinfo=datetime.timezone.utc)

        # Venue A settles at 08:00 UTC (4-hour cycle)
        event_a = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.0050,
            next_snapshot_utc=datetime.datetime(2026, 10, 1, 8, 0, 0, tzinfo=datetime.timezone.utc),
        )
        # Venue B settles at 16:00 UTC (8-hour cycle) -> Desync!
        event_b = FundingSnapshotEvent(
            exchange="bitget",
            symbol="BTCUSDT",
            funding_rate=0.0010,
            next_snapshot_utc=datetime.datetime(2026, 10, 1, 16, 0, 0, tzinfo=datetime.timezone.utc),
        )

        strat.on_funding_snapshot(event_a)
        strat.on_funding_snapshot(event_b)

        assert strat.clock_desync_detected is True

        # Now market event in entry window: entry must be blocked!
        mkt_event = MarketEvent(
            exchange="binance",
            symbol="BTCUSDT",
            bid_price=65000.0,
            ask_price=65001.0,
            timestamp_utc=now,
        )
        intents = strat.on_market_event(mkt_event)
        assert len(intents) == 0  # Blocked!

    def test_synchronized_clocks_allow_entry(self):
        strat = CrossExchangeFundingStrategy()
        strat.initialize({"venue_a": "binance", "venue_b": "bitget", "min_spread_hurdle": 0.0020})

        now = datetime.datetime(2026, 10, 1, 7, 55, 0, tzinfo=datetime.timezone.utc)

        # Both venues settle at 08:00 UTC
        event_a = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.0050,
            next_snapshot_utc=datetime.datetime(2026, 10, 1, 8, 0, 0, tzinfo=datetime.timezone.utc),
        )
        event_b = FundingSnapshotEvent(
            exchange="bitget",
            symbol="BTCUSDT",
            funding_rate=0.0010,
            next_snapshot_utc=datetime.datetime(2026, 10, 1, 8, 0, 0, tzinfo=datetime.timezone.utc),
        )

        strat.on_funding_snapshot(event_a)
        strat.on_funding_snapshot(event_b)

        assert strat.clock_desync_detected is False

        # Set prices on both venues
        strat.on_market_event(MarketEvent(
            exchange="bitget", symbol="BTCUSDT", bid_price=65000.0, ask_price=65001.0, timestamp_utc=now
        ))
        intents = strat.on_market_event(MarketEvent(
            exchange="binance", symbol="BTCUSDT", bid_price=65000.0, ask_price=65001.0, timestamp_utc=now
        ))

        assert len(intents) == 2
        assert intents[0].exchange in ("binance", "bitget")
        assert intents[1].exchange in ("binance", "bitget")
