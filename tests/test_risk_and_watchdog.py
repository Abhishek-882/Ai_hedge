"""Comprehensive Test Suite for Pre-Trade Risk Engine, Desync Watchdog, and Dual-Persistence Kill-Switch.
"""

from __future__ import annotations

import datetime
from pathlib import Path
import pytest

from src.connectors.binance import BinanceConnector
from src.connectors.bybit import BybitConnector
from src.connectors.paper_mock import PaperMockConnector
from src.core.config import ExchangeConfig, RiskConfig
from src.core.exceptions import (
    InvalidRiskCapsException,
    KillSwitchLockedException,
    LiquidationBufferBreachException,
    MaxDrawdownExceededException,
    OrderExecutionException,
    RiskException,
)
from src.engine.executor import ExecutionEngine
from src.engine.interfaces import (
    BaseStrategy,
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)
from src.engine.kill_switch import KillSwitch
from src.engine.risk import RiskManager
from src.engine.watchdog import DesyncWatchdog, PairedExecutionTracker
from src.storage.database import DatabaseManager


class TestRiskManager:
    """Test suite for pre-trade risk controls, position limits, leverage caps, and liquidation buffers."""

    def test_capital_floor_enforcement(self) -> None:
        risk = RiskManager()
        # $500 notional < $1,000 capital floor
        intent = OrderIntent(
            intent_id="intent_floor_test",
            strategy_id="idea_03",
            exchange="binance",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=0.005,  # 0.005 BTC @ $65,000 = $325 (< $1,000)
        )
        with pytest.raises(InvalidRiskCapsException, match="minimum capital floor"):
            risk.validate_order_intent(
                intent=intent,
                equity=50000.0,
                active_positions=[],
                market_price=65000.0,
            )

    def test_single_position_ten_percent_equity_cap(self) -> None:
        risk = RiskManager()
        # Equity = $10,000 -> Max allowed per trade is $1,000 (10%)
        # Order of $1,500 breaches 10% cap
        intent = OrderIntent(
            intent_id="intent_sizing_test",
            strategy_id="idea_03",
            exchange="binance",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=0.025,  # 0.025 BTC @ $65,000 = $1,625 (> $1,000)
        )
        with pytest.raises(InvalidRiskCapsException, match="10% single-position risk cap"):
            risk.validate_order_intent(
                intent=intent,
                equity=10000.0,
                active_positions=[],
                market_price=65000.0,
            )

    def test_strategy_specific_leverage_caps(self) -> None:
        risk = RiskManager()
        # Strategy: Idea 01 Cash-and-Carry -> Cap is 1.0x
        assert risk.get_max_leverage_for_strategy("idea_01_cash_and_carry") == 1.0
        # Strategy: Idea 02 Rate Momentum -> Cap is 2.0x
        assert risk.get_max_leverage_for_strategy("idea_02_rate_momentum") == 2.0
        # Strategy: Idea 03 Spread -> Cap is 3.0x
        assert risk.get_max_leverage_for_strategy("idea_03_cross_exchange") == 3.0

        # Attempting 1.5x leverage on cash-and-carry should raise
        intent = OrderIntent(
            intent_id="intent_lev_test",
            strategy_id="idea_01",
            exchange="binance",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=0.02,  # $1,300 on $1,000 equity = 1.3x
        )
        with pytest.raises(InvalidRiskCapsException):
            risk.validate_order_intent(
                intent=intent,
                equity=1000.0,
                active_positions=[],
                market_price=65000.0,
                strategy_type="idea_01_cash_and_carry",
            )

    def test_liquidation_distance_buffer(self) -> None:
        risk = RiskManager()
        # 10x leverage on Long BTC at $65,000 -> Liquidation ~ $58,825 -> Distance ~ 9.5% (< 35% buffer)
        liq_p = risk.calculate_liquidation_price(entry_price=65000.0, leverage=10.0, side=OrderSide.BUY)
        dist = risk.calculate_liquidation_distance_pct(65000.0, liq_p)
        assert dist < 0.35

        # 2x leverage on Long BTC at $65,000 -> Liquidation ~ $32,825 -> Distance ~ 49.5% (> 35% buffer)
        liq_safe = risk.calculate_liquidation_price(entry_price=65000.0, leverage=2.0, side=OrderSide.BUY)
        dist_safe = risk.calculate_liquidation_distance_pct(65000.0, liq_safe)
        assert dist_safe >= 0.35

    def test_drawdown_breach_trips_kill_switch(self, tmp_path: Path, memory_db: DatabaseManager) -> None:
        latch_path = str(tmp_path / "KILL_SWITCH.latch")
        ks = KillSwitch(db=memory_db, latch_path=latch_path)
        risk = RiskManager(kill_switch=ks)

        # 6.0% drawdown from $10,000 peak -> $9,400 current
        with pytest.raises(MaxDrawdownExceededException):
            risk.check_drawdown(current_equity=9400.0, peak_equity=10000.0)

        # Verify kill-switch was tripped in memory_db and latch file
        assert ks.is_locked() is True
        assert Path(latch_path).exists()


class TestDesyncWatchdog:
    """Test suite for Real-Time Desync Watchdog: lag timer, partial fills, auto unwinds, and failure kill-switch."""

    def test_normal_synchronized_fill(self) -> None:
        watchdog = DesyncWatchdog()
        leg1 = {"intent_id": "leg1_01", "exchange": "binance", "symbol": "BTCUSDT", "side": "SELL", "quantity": 0.05}
        leg2 = {"intent_id": "leg2_01", "exchange": "bybit", "symbol": "BTCUSDT", "side": "BUY", "quantity": 0.05}

        tracker = watchdog.register_pair("pair_01", leg1, leg2)
        assert tracker.status == "PENDING_DUAL_SUBMISSION"

        # Leg 1 fills
        s1 = watchdog.on_leg_fill("pair_01", {"intent_id": "leg1_01", "exchange": "binance", "symbol": "BTCUSDT", "side": "SELL", "filled_qty": 0.05, "filled_price": 65000.0})
        assert s1 == "LEG1_FILLED_LEG2_PENDING"

        # Leg 2 fills within timeout
        s2 = watchdog.on_leg_fill("pair_01", {"intent_id": "leg2_01", "exchange": "bybit", "symbol": "BTCUSDT", "side": "BUY", "filled_qty": 0.05, "filled_price": 65000.0})
        assert s2 == "DUAL_LEG_SYNCED"
        assert "pair_01" not in watchdog.active_pairs

    def test_timeout_desync_triggers_emergency_unwind(self) -> None:
        binance_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="binance", name="Binance", rest_url="https://testnet.binancefuture.com", ws_url="wss://stream.binancefuture.com/ws", is_testnet=True)
        )
        bybit_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="bybit", name="Bybit", rest_url="https://api-testnet.bybit.com", ws_url="wss://stream-testnet.bybit.com/v5/public/linear", is_testnet=True)
        )
        engine = ExecutionEngine(connectors=[binance_conn, bybit_conn])
        watchdog = DesyncWatchdog(execution_engine=engine, timeout_ms=1500.0)

        leg1 = {"intent_id": "leg1_timeout", "exchange": "binance", "symbol": "BTCUSDT", "side": "BUY", "quantity": 0.05}
        leg2 = {"intent_id": "leg2_timeout", "exchange": "bybit", "symbol": "BTCUSDT", "side": "SELL", "quantity": 0.05}

        tracker = watchdog.register_pair("pair_timeout", leg1, leg2)

        # Leg 1 fills on Binance
        watchdog.on_leg_fill("pair_timeout", {
            "intent_id": "leg1_timeout",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "side": "BUY",
            "filled_qty": 0.05,
            "filled_price": 65000.0,
        })

        # Leg 2 fails to fill; 1600ms passes -> check_timeouts
        timed_out = watchdog.check_timeouts(current_time=tracker.dispatched_at + 1.6)
        assert "pair_timeout" in timed_out

        # Verify emergency market unwind was executed
        assert tracker.status == "UNWOUND_ABORTED"
        assert len(engine.unwind_history) >= 1
        unwind_record = engine.unwind_history[-1]
        assert unwind_record["exchange"] == "binance"
        assert unwind_record["symbol"] == "BTCUSDT"
        assert unwind_record["side"] == "SELL"  # Counter-trade to unwind Buy
        assert unwind_record["quantity"] == 0.05

    def test_asymmetrical_partial_fill_unwinds_excess(self) -> None:
        binance_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="binance", name="Binance", rest_url="https://testnet.binancefuture.com", ws_url="wss://stream.binancefuture.com/ws", is_testnet=True)
        )
        bybit_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="bybit", name="Bybit", rest_url="https://api-testnet.bybit.com", ws_url="wss://stream-testnet.bybit.com/v5/public/linear", is_testnet=True)
        )
        engine = ExecutionEngine(connectors=[binance_conn, bybit_conn])
        watchdog = DesyncWatchdog(execution_engine=engine)

        leg1 = {"intent_id": "leg1_partial", "exchange": "binance", "symbol": "BTCUSDT", "side": "BUY", "quantity": 0.10}
        leg2 = {"intent_id": "leg2_partial", "exchange": "bybit", "symbol": "BTCUSDT", "side": "SELL", "quantity": 0.10}

        tracker = watchdog.register_pair("pair_partial", leg1, leg2)

        # Leg 1 fills 0.10 BTC
        watchdog.on_leg_fill("pair_partial", {
            "intent_id": "leg1_partial",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "side": "BUY",
            "filled_qty": 0.10,
            "filled_price": 65000.0,
        })

        # Leg 2 fills only 0.03 BTC (0.07 BTC unhedged delta)
        status = watchdog.on_leg_fill("pair_partial", {
            "intent_id": "leg2_partial",
            "exchange": "bybit",
            "symbol": "BTCUSDT",
            "side": "SELL",
            "filled_qty": 0.03,
            "filled_price": 65000.0,
        })
        assert status == "PARTIAL_DESYNC"

        # Verify unwind executed for the 0.07 BTC excess on Leg 1
        assert len(engine.unwind_history) >= 1
        unwind = engine.unwind_history[-1]
        assert unwind["exchange"] == "binance"
        assert unwind["side"] == "SELL"
        assert round(unwind["quantity"], 4) == 0.07


class TestKillSwitchDualPersistence:
    """Test suite for dual persistence: SQLite state, KILL_SWITCH.latch file, restart blocking, and unlock."""

    def test_dual_persistence_and_restart_blocking(self, tmp_path: Path, memory_db: DatabaseManager) -> None:
        latch_path = str(tmp_path / "KILL_SWITCH.latch")
        ks = KillSwitch(db=memory_db, latch_path=latch_path)
        assert ks.is_locked() is False
        ks.assert_unlocked()

        # Trip kill-switch
        ks.trip(reason="5.0% Max Drawdown Breached", tripped_by="BETA_AUDITOR")
        assert ks.is_locked() is True
        assert Path(latch_path).exists()

        # Verify assertion raises
        with pytest.raises(KillSwitchLockedException, match="Kill-Switch is LOCKED"):
            ks.assert_unlocked()

        # Simulate process reboot with fresh KillSwitch object reading existing latch and DB
        reboot_ks = KillSwitch(db=memory_db, latch_path=latch_path)
        assert reboot_ks.is_locked() is True
        with pytest.raises(KillSwitchLockedException):
            reboot_ks.assert_unlocked()

        # Manual unlock with Overseer token
        assert reboot_ks.unlock(overseer_token="HUMAN_OVERSEER_SECRET_KEY") is True
        assert reboot_ks.is_locked() is False
        assert not Path(latch_path).exists()
        reboot_ks.assert_unlocked()


class SampleTestStrategy(BaseStrategy):
    """Test mock strategy implementation."""

    def initialize(self, config: dict) -> None:
        self.config = config

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        return []

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        # Return paired execution intents
        pair_id = "test_pair_101"
        intent1 = OrderIntent(
            intent_id="strat_leg1",
            strategy_id=self.strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=0.02,
            paired_intent_id=pair_id,
        )
        intent2 = OrderIntent(
            intent_id="strat_leg2",
            strategy_id=self.strategy_id,
            exchange="bybit",
            symbol="BTCUSDT",
            side=OrderSide.SELL,
            order_type=OrderType.MARKET,
            quantity=0.02,
            paired_intent_id=pair_id,
        )
        return [intent1, intent2]

    def on_fill(self, event: FillEvent) -> None:
        pass

    def on_desync_alert(self, pair_trade_id: str, context: dict) -> list[OrderIntent]:
        return []


class TestExecutionEngineIntegration:
    """Test suite for Execution Engine orchestrating strategies, risk checks, routing and watchdog."""

    def test_full_execution_flow_with_paired_intents(self, tmp_path: Path, memory_db: DatabaseManager) -> None:
        binance_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="binance", name="Binance", rest_url="https://testnet.binancefuture.com", ws_url="wss://stream.binancefuture.com/ws", is_testnet=True),
            initial_balance=50000.0,
        )
        bybit_conn = PaperMockConnector(
            config=ExchangeConfig(exchange_id="bybit", name="Bybit", rest_url="https://api-testnet.bybit.com", ws_url="wss://stream-testnet.bybit.com/v5/public/linear", is_testnet=True),
            initial_balance=50000.0,
        )

        latch_path = str(tmp_path / "KILL_SWITCH.latch")
        ks = KillSwitch(db=memory_db, latch_path=latch_path)
        risk = RiskManager(kill_switch=ks)
        engine = ExecutionEngine(connectors=[binance_conn, bybit_conn], risk_manager=risk, kill_switch=ks)

        strat = SampleTestStrategy(strategy_id="idea_03_test")
        engine.register_strategy(strat)

        snapshot_event = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.00050,
            next_snapshot_utc=datetime.datetime.now(datetime.timezone.utc),
        )

        executed = engine.dispatch_funding_snapshot(snapshot_event)
        assert len(executed) == 2
        assert executed[0]["status"] in ("FILLED", "Filled")
        assert executed[1]["status"] in ("FILLED", "Filled")
