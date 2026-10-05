"""Comprehensive Test Suite for all 5 Research Backlog Strategies.
Verifies Idea 01 (Cash & Carry), Idea 02 (Rate Momentum), Idea 03 (Cross-Exchange),
Idea 04 (ML Prediction), and Idea RS (OU Mean Reversion).
"""

from __future__ import annotations

import datetime
import math
import numpy as np
import pandas as pd
import pytest

from src.backtest.engine import FundingBacktester
from src.connectors.paper_mock import PaperMockConnector
from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_TAKER_FEE,
    MIN_LIQUIDATION_BUFFER_PCT,
    MIN_VIABLE_SPREAD_FLOOR,
)
from src.core.exceptions import LiquidationBufferBreachException
from src.engine.executor import ExecutionEngine
from src.engine.interfaces import (
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)
from src.strategies.idea_01_cash_and_carry import CashAndCarryStrategy
from src.strategies.idea_02_rate_momentum import RateMomentumSizingStrategy
from src.strategies.idea_03_cross_exchange import CrossExchangeFundingStrategy
from src.strategies.idea_04_ml_prediction import MLRatePredictionStrategy
from src.strategies.idea_rs_ou_mean_reversion import OUMeanReversionStrategy


# ==============================================================================
# 1. Idea 01: Spot-Perp Cash-and-Carry Tests
# ==============================================================================
class TestIdea01CashAndCarryStrategy:
    """Test suite for Spot-Perp Cash-and-Carry Strategy."""

    def test_initialization_and_leverage_cap(self) -> None:
        strat = CashAndCarryStrategy()
        strat.initialize({"target_notional": 5000.0, "leverage": 5.0})
        assert strat.is_initialized is True
        assert strat.target_notional == 5000.0
        # Cash & Carry enforces strict 1.0x leverage cap
        assert strat.leverage == 1.0

    def test_positive_carry_entry_intents(self) -> None:
        strat = CashAndCarryStrategy()
        strat.initialize({"target_notional": 2000.0, "min_entry_spread": 0.0003})
        
        now = datetime.datetime.now(datetime.timezone.utc)
        # Funding rate +0.05% (50 bps) > min_entry_spread (30 bps)
        event = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.0005,
            next_snapshot_utc=now,
            mark_price=20000.0,
        )
        intents = strat.on_funding_snapshot(event)
        assert len(intents) == 2
        
        spot_intent = next(i for i in intents if i.symbol == "BTC/USDT")
        perp_intent = next(i for i in intents if i.symbol == "BTCUSDT")
        
        assert spot_intent.side == OrderSide.BUY
        assert perp_intent.side == OrderSide.SELL
        assert spot_intent.paired_intent_id == perp_intent.intent_id
        assert perp_intent.paired_intent_id == spot_intent.intent_id
        assert spot_intent.quantity == pytest.approx(0.05, rel=1e-3)  # $1,000 / $20,000 = 0.05
        assert strat.active_carry_mode == "POSITIVE"

    def test_negative_carry_borrow_friction_hurdle(self) -> None:
        strat = CashAndCarryStrategy()
        # 8% APR -> 8h borrow rate ~ 0.08 / 1095 = 0.000073 (0.73 bps)
        strat.initialize({
            "target_notional": 2000.0,
            "borrow_rate_apr": 0.08,
            "min_entry_spread": 0.0003,
        })
        now = datetime.datetime.now(datetime.timezone.utc)

        # Case 1: FR = -0.01% (10 bps) -> Net after borrow ~ 10 - 0.73 = 9.27 bps < 30 bps -> No trade
        event_small = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=-0.00010,
            next_snapshot_utc=now,
            mark_price=20000.0,
        )
        intents_small = strat.on_funding_snapshot(event_small)
        assert len(intents_small) == 0

        # Case 2: FR = -0.05% (50 bps) -> Net after borrow ~ 50 - 0.73 = 49.27 bps > 30 bps -> Enter Negative Carry
        event_large = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=-0.00050,
            next_snapshot_utc=now,
            mark_price=20000.0,
        )
        intents_large = strat.on_funding_snapshot(event_large)
        assert len(intents_large) == 2
        spot_intent = next(i for i in intents_large if i.symbol == "BTC/USDT")
        perp_intent = next(i for i in intents_large if i.symbol == "BTCUSDT")
        assert spot_intent.side == OrderSide.SELL  # Borrow and Sell Spot
        assert perp_intent.side == OrderSide.BUY   # Buy Perp
        assert strat.active_carry_mode == "NEGATIVE"

    def test_fill_tracking_and_net_delta_neutrality(self) -> None:
        strat = CashAndCarryStrategy()
        strat.initialize({"target_notional": 2000.0})
        now = datetime.datetime.now(datetime.timezone.utc)

        # Fill Spot Buy
        fill_spot = FillEvent(
            fill_id="f1", order_id="o1", intent_id="i1", exchange="binance",
            symbol="BTC/USDT", side=OrderSide.BUY, filled_qty=0.05,
            filled_price=20000.0, fee_paid=1.0, fee_asset="USDT", timestamp_utc=now
        )
        strat.on_fill(fill_spot)
        assert strat.spot_position == 0.05
        assert strat.calculate_net_delta() == 0.05

        # Fill Perp Sell
        fill_perp = FillEvent(
            fill_id="f2", order_id="o2", intent_id="i2", exchange="binance",
            symbol="BTCUSDT", side=OrderSide.SELL, filled_qty=0.05,
            filled_price=20000.0, fee_paid=0.5, fee_asset="USDT", timestamp_utc=now
        )
        strat.on_fill(fill_perp)
        assert strat.perp_position == -0.05
        assert strat.calculate_net_delta() == 0.0  # Perfect Delta Neutrality

    def test_liquidation_distance_buffer_check(self) -> None:
        strat = CashAndCarryStrategy()
        strat.initialize({"leverage": 1.0, "maintenance_margin_rate": 0.005})
        
        # 1.0x leverage short liquidation price is entry * (1 + 1 - 0.005) = entry * 1.995
        entry_price = 30000.0
        liq_p = strat.calculate_liquidation_price(entry_price, OrderSide.SELL)
        dist = strat.calculate_liquidation_distance_pct(entry_price, liq_p)
        assert dist > 0.90  # ~99.5% buffer, well above 35% hurdle


# ==============================================================================
# 2. Idea 02: Rate-Momentum Sizing Tests
# ==============================================================================
class TestIdea02RateMomentumStrategy:
    """Test suite for Rate-Momentum Sizing Strategy."""

    def test_initialization_and_leverage_cap(self) -> None:
        strat = RateMomentumSizingStrategy()
        strat.initialize({"base_notional": 3000.0, "gamma": 0.5, "leverage": 4.0})
        assert strat.is_initialized is True
        assert strat.base_notional == 3000.0
        assert strat.gamma == 0.5
        assert strat.leverage == 2.0  # Directional tilt max 2.0x

    def test_z_score_tilt_multiplier_clipping(self) -> None:
        strat = RateMomentumSizingStrategy()
        strat.initialize({"gamma": 0.4})

        # Neutral Z=0 -> Multiplier = 1.0
        assert strat.calculate_tilt_multiplier(z_score=0.0, side=OrderSide.BUY) == 1.0

        # Overcrowded Long (Z = +3.0) -> 1 - 0.4*3 = -0.2 -> Clamped to 0.2 (anti-crowding throttle)
        mult_crowded_long = strat.calculate_tilt_multiplier(z_score=3.0, side=OrderSide.BUY)
        assert mult_crowded_long == 0.2

        # Overcrowded Short (Z = -3.0) -> 1 - 0.4*(-3) = 2.2 -> Clamped to 2.0 (contrarian long boost)
        mult_crowded_short = strat.calculate_tilt_multiplier(z_score=-3.0, side=OrderSide.BUY)
        assert mult_crowded_short == 2.0

        # Short Side: Overcrowded Short (Z = -3.0) -> Clamped to 0.2
        assert strat.calculate_tilt_multiplier(z_score=-3.0, side=OrderSide.SELL) == 0.2

    def test_funding_rate_z_score_calculation(self) -> None:
        strat = RateMomentumSizingStrategy()
        strat.initialize({"z_score_lookback": 10})
        
        # Populate history with varying baseline rates around 10 bps
        history = [0.00010, 0.00012, 0.00009, 0.00011, 0.00010, 0.00013, 0.00008, 0.00010, 0.00011, 0.00010]
        for r in history:
            strat.funding_rate_history.append(r)

        # Rate surges to 50 bps -> Positive Z-score > 2.0
        z = strat.calculate_funding_z_score(current_rate=0.00050)
        assert z > 2.0

    def test_trend_following_signal_generation_with_tilt(self) -> None:
        strat = RateMomentumSizingStrategy()
        strat.initialize({
            "base_notional": 2000.0,
            "gamma": 0.4,
            "fast_ema_period": 3,
            "slow_ema_period": 5,
        })
        now = datetime.datetime.now(datetime.timezone.utc)

        # Feed rising prices to establish bullish EMA crossover
        prices = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0]
        intents = []
        for p in prices:
            event = MarketEvent(
                exchange="binance",
                symbol="BTCUSDT",
                bid_price=p,
                ask_price=p,
                timestamp_utc=now,
            )
            res = strat.on_market_event(event)
            if res:
                intents.extend(res)

        assert len(intents) >= 1
        assert intents[0].side == OrderSide.BUY
        assert intents[0].quantity > 0.0


# ==============================================================================
# 3. Idea 03: Cross-Exchange Funding Spread Capture Tests
# ==============================================================================
class TestIdea03CrossExchangeStrategy:
    """Test suite for Cross-Exchange Funding Spread Capture Strategy."""

    def test_initialization_and_parameters(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({
            "venue_a": "binance",
            "venue_b": "bybit",
            "target_notional": 4000.0,
            "min_spread_hurdle": 0.0040,
            "leverage": 3.0,
        })
        assert strat.is_initialized is True
        assert strat.min_spread_hurdle == 0.0040
        assert strat.leverage == 3.0

    def test_spread_calculation_and_routing(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({})
        
        strat.rate_venue_a = 0.0055  # Binance 55 bps
        strat.rate_venue_b = 0.0005  # Bybit 5 bps
        spread, v_short, v_long = strat.calculate_spread()
        
        assert spread == pytest.approx(0.0050)
        assert v_short == "binance"
        assert v_long == "bybit"

    def test_inverted_funding_routing(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({})

        # Case: Binance negative (-30 bps), Bybit positive (+20 bps)
        strat.rate_venue_a = -0.0030
        strat.rate_venue_b = 0.0020
        spread, v_short, v_long = strat.calculate_spread()

        assert spread == pytest.approx(0.0050)
        assert v_short == "bybit"    # Bybit is higher rate (+20 bps) -> Short
        assert v_long == "binance"   # Binance is lower rate (-30 bps) -> Long

    def test_entry_window_timing_and_paired_intents(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({
            "target_notional": 2000.0,
            "min_spread_hurdle": 0.0040,
            "entry_lead_seconds": 480,  # 8 min lead
        })
        
        strat.rate_venue_a = 0.0060
        strat.rate_venue_b = 0.0010
        strat.price_venue_a = 20000.0
        strat.price_venue_b = 20000.0

        # Current time: 07:55:00 UTC (5 minutes before 08:00 settlement -> within 8 min window)
        now_entry = datetime.datetime(2026, 8, 28, 7, 55, 0, tzinfo=datetime.timezone.utc)
        event = MarketEvent(
            exchange="binance",
            symbol="BTCUSDT",
            bid_price=20000.0,
            ask_price=20000.0,
            timestamp_utc=now_entry,
        )
        intents = strat.on_market_event(event)

        assert len(intents) == 2
        intent_short = next(i for i in intents if i.exchange == "binance")
        intent_long = next(i for i in intents if i.exchange == "bybit")

        assert intent_short.side == OrderSide.SELL
        assert intent_long.side == OrderSide.BUY
        assert intent_short.quantity == pytest.approx(0.05, rel=1e-3)  # $1,000 / $20,000
        assert intent_long.quantity == pytest.approx(0.05, rel=1e-3)
        assert intent_short.paired_intent_id == intent_long.intent_id

    def test_exit_window_dispatch_after_settlement(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({"exit_lag_seconds": 90})
        
        # Simulate open position
        strat.is_position_open = True
        strat.venue_short = "binance"
        strat.venue_long = "bybit"
        strat.qty_short = 0.05
        strat.qty_long = 0.05
        strat.entry_price_short = 20000.0
        strat.entry_price_long = 20000.0
        strat.price_venue_a = 20000.0
        strat.price_venue_b = 20000.0
        strat.target_settlement_utc = datetime.datetime(2026, 8, 28, 8, 0, 0, tzinfo=datetime.timezone.utc)

        # Time at 08:01:40 UTC (100 seconds post settlement -> exceeds 90s lag)
        now_exit = datetime.datetime(2026, 8, 28, 8, 1, 40, tzinfo=datetime.timezone.utc)
        event = MarketEvent(
            exchange="binance",
            symbol="BTCUSDT",
            bid_price=20000.0,
            ask_price=20000.0,
            timestamp_utc=now_exit,
        )
        exit_intents = strat.on_market_event(event)

        assert len(exit_intents) == 2
        close_short = next(i for i in exit_intents if i.exchange == "binance")
        close_long = next(i for i in exit_intents if i.exchange == "bybit")

        assert close_short.side == OrderSide.BUY   # Close Short -> Buy
        assert close_long.side == OrderSide.SELL  # Close Long -> Sell

    def test_basis_drift_stop_loss_trigger(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({"max_basis_drift_pct": 0.0150})
        
        strat.is_position_open = True
        strat.venue_short = "binance"
        strat.venue_long = "bybit"
        strat.qty_short = 0.05
        strat.qty_long = 0.05
        strat.entry_price_short = 20000.0
        strat.entry_price_long = 20000.0

        # Price on Binance jumps 2.0% while Bybit stays flat -> Basis drift blowout
        strat.price_venue_a = 20400.0  # Binance +2%
        strat.price_venue_b = 20000.0  # Bybit 0%
        
        drift = strat.calculate_basis_drift_pct()
        assert abs(drift) >= 0.0150  # 2% > 1.5% stop loss

        now = datetime.datetime(2026, 8, 28, 7, 56, 0, tzinfo=datetime.timezone.utc)
        event = MarketEvent(exchange="binance", symbol="BTCUSDT", bid_price=20400.0, ask_price=20400.0, timestamp_utc=now)
        exit_intents = strat.on_market_event(event)
        assert len(exit_intents) == 2  # Stop loss emergency exit triggered

    def test_desync_alert_emergency_unwind(self) -> None:
        strat = CrossExchangeFundingStrategy()
        strat.initialize({})
        
        # Short leg filled on Binance, long leg failed on Bybit
        strat.venue_short = "binance"
        strat.qty_short = 0.05
        strat.qty_long = 0.0

        unwind_orders = strat.on_desync_alert("pair_123", {"reason": "LEG2_TIMEOUT"})
        assert len(unwind_orders) == 1
        assert unwind_orders[0].exchange == "binance"
        assert unwind_orders[0].side == OrderSide.BUY
        assert unwind_orders[0].quantity == 0.05


# ==============================================================================
# 4. Idea 04: ML-Augmented Rate Prediction Tests
# ==============================================================================
class TestIdea04MLPredictionStrategy:
    """Test suite for ML-Augmented Rate Prediction Strategy."""

    def test_initialization_and_leverage(self) -> None:
        strat = MLRatePredictionStrategy()
        strat.initialize({"target_notional": 2000.0, "prediction_alpha_threshold": 0.0004, "leverage": 2.0})
        assert strat.is_initialized is True
        assert strat.prediction_alpha_threshold == 0.0004
        assert strat.leverage == 2.0

    def test_orderbook_imbalance_formula(self) -> None:
        strat = MLRatePredictionStrategy()
        # Bid 150, Ask 50 -> (150 - 50) / 200 = 0.50
        obi = strat.calculate_orderbook_imbalance(bid_vol=150.0, ask_vol=50.0)
        assert obi == pytest.approx(0.50)

    def test_basis_velocity_and_acceleration(self) -> None:
        strat = MLRatePredictionStrategy()
        # t0: Basis = 10 (Perp 20010, Spot 20000)
        v0, a0 = strat.calculate_basis_velocity_and_acceleration(perp_price=20010.0, spot_price=20000.0)
        # t1: Basis = 15 (Perp 20015, Spot 20000) -> Vel = 5
        v1, a1 = strat.calculate_basis_velocity_and_acceleration(perp_price=20015.0, spot_price=20000.0)
        assert v1 == 5.0
        # t2: Basis = 25 (Perp 20025, Spot 20000) -> Vel = 10 -> Accel = 10 - 5 = 5
        v2, a2 = strat.calculate_basis_velocity_and_acceleration(perp_price=20025.0, spot_price=20000.0)
        assert v2 == 10.0
        assert a2 == 5.0

    def test_open_interest_momentum(self) -> None:
        strat = MLRatePredictionStrategy()
        strat.calculate_oi_momentum(1000000.0)
        mom = strat.calculate_oi_momentum(1200000.0)  # +20%
        assert mom == pytest.approx(0.20)

    def test_predict_funding_rate_and_alpha_trigger(self) -> None:
        strat = MLRatePredictionStrategy()
        strat.initialize({"prediction_alpha_threshold": 0.0003})
        strat.current_funding_rate = 0.00010

        features = strat.extract_features(bid_vol=200.0, ask_vol=50.0, current_oi=1500000.0)
        pred = strat.predict_funding_rate(features)
        assert pred > strat.current_funding_rate


# ==============================================================================
# 5. Idea RS: OU Mean-Reversion Spread Tests
# ==============================================================================
class TestIdeaRSOUMeanReversionStrategy:
    """Test suite for Bounded OU Mean-Reversion Spread Strategy."""

    def test_initialization_and_leverage(self) -> None:
        strat = OUMeanReversionStrategy()
        strat.initialize({"entry_z_score": 2.0, "exit_z_score": 0.5, "leverage": 3.0})
        assert strat.is_initialized is True
        assert strat.entry_z_score == 2.0
        assert strat.exit_z_score == 0.5
        assert strat.leverage == 3.0

    def test_ou_parameter_fitting_and_half_life(self) -> None:
        strat = OUMeanReversionStrategy()
        # Synthetic mean-reverting series around mu = 0.0010
        np.random.seed(42)
        spreads = [0.0010]
        theta_true = 0.5
        for _ in range(50):
            next_val = spreads[-1] + theta_true * (0.0010 - spreads[-1]) + np.random.normal(0, 0.00005)
            spreads.append(next_val)

        fit = strat.fit_ou_parameters(spreads, dt_hours=8.0)
        assert fit["theta"] > 0.0
        assert fit["mu"] == pytest.approx(0.0010, abs=0.0005)
        assert fit["half_life_hours"] > 0.0

    def test_ou_entry_and_exit_z_score_signals(self) -> None:
        strat = OUMeanReversionStrategy()
        strat.initialize({"entry_z_score": 2.0, "exit_z_score": 0.5})
        strat.price_venue_a = 20000.0
        strat.price_venue_b = 20000.0
        strat.mu = 0.00010
        strat.sigma_eq = 0.00020
        strat.is_ou_calibrated = True

        now = datetime.datetime.now(datetime.timezone.utc)

        # Case 1: Spread surges to 0.00060 -> Z = (0.00060 - 0.00010) / 0.00020 = 2.5 >= 2.0
        # Trigger: Short Spread (Short Venue A, Long Venue B)
        event_entry = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.00060,
            next_snapshot_utc=now,
        )
        strat.rate_venue_a = 0.00060
        strat.rate_venue_b = 0.00000
        intents = strat.on_funding_snapshot(event_entry)

        assert len(intents) == 2
        intent_a = next(i for i in intents if i.exchange == "binance")
        intent_b = next(i for i in intents if i.exchange == "bybit")
        assert intent_a.side == OrderSide.SELL
        assert intent_b.side == OrderSide.BUY
        assert strat.position_direction == -1

        # Simulate Fill
        strat.on_fill(FillEvent("f1", "o1", "i1", "binance", "BTCUSDT", OrderSide.SELL, 0.05, 20000.0, 0.5, "USDT", now))
        strat.on_fill(FillEvent("f2", "o2", "i2", "bybit", "BTCUSDT", OrderSide.BUY, 0.05, 20000.0, 0.5, "USDT", now))
        assert strat.is_position_open is True

        # Case 2: Spread reverts back to 0.00012 -> Z = (0.00012 - 0.00010) / 0.00020 = 0.1 <= 0.5
        # Trigger: Exit position
        strat.rate_venue_a = 0.00012
        strat.rate_venue_b = 0.00000
        event_exit = FundingSnapshotEvent(
            exchange="binance",
            symbol="BTCUSDT",
            funding_rate=0.00012,
            next_snapshot_utc=now,
        )
        exit_intents = strat.on_funding_snapshot(event_exit)
        assert len(exit_intents) == 2
        close_a = next(i for i in exit_intents if i.exchange == "binance")
        close_b = next(i for i in exit_intents if i.exchange == "bybit")
        assert close_a.side == OrderSide.BUY   # Close Short A -> Buy
        assert close_b.side == OrderSide.SELL  # Close Long B -> Sell


# ==============================================================================
# 6. Strategy Integration & Backtest Tests
# ==============================================================================
class TestStrategyEngineIntegration:
    """Test suite for strategy registration and backtester integration."""

    def test_execution_engine_registers_all_five_strategies(self) -> None:
        from src.core.config import ExchangeConfig
        cfg_binance = ExchangeConfig(
            exchange_id="binance",
            name="Binance Futures",
            rest_url="https://testnet.binancefuture.com",
            ws_url="wss://stream.binancefuture.com",
        )
        cfg_bybit = ExchangeConfig(
            exchange_id="bybit",
            name="Bybit Linear",
            rest_url="https://api-testnet.bybit.com",
            ws_url="wss://stream-testnet.bybit.com",
        )
        conn_binance = PaperMockConnector(cfg_binance)
        conn_bybit = PaperMockConnector(cfg_bybit)
        engine = ExecutionEngine([conn_binance, conn_bybit])

        s1 = CashAndCarryStrategy()
        s2 = RateMomentumSizingStrategy()
        s3 = CrossExchangeFundingStrategy()
        s4 = MLRatePredictionStrategy()
        s5 = OUMeanReversionStrategy()

        for s in [s1, s2, s3, s4, s5]:
            engine.register_strategy(s)

        assert len(engine.strategies) == 5
        assert "idea_01_cash_and_carry" in engine.strategies
        assert "idea_02_rate_momentum" in engine.strategies
        assert "idea_03_cross_exchange" in engine.strategies
        assert "idea_04_ml_prediction" in engine.strategies
        assert "idea_rs_ou_mean_reversion" in engine.strategies

    def test_backtester_runs_with_cross_exchange_strategy(self) -> None:
        backtester = FundingBacktester(min_spread_hurdle=0.0040)
        strat = CrossExchangeFundingStrategy()
        strat.initialize({})

        # Create synthetic regime dataframe
        timestamps = [1700000000000 + i * 8 * 3600 * 1000 for i in range(10)]
        df = pd.DataFrame({
            "timestamp_ms": timestamps,
            "symbol": ["BTCUSDT"] * 10,
            "rate_a": [0.0055, 0.0060, 0.0010, 0.0050, 0.0070, 0.0005, 0.0045, 0.0060, 0.0010, 0.0050],
            "rate_b": [0.0005, 0.0010, 0.0008, 0.0005, 0.0010, 0.0004, 0.0005, 0.0010, 0.0009, 0.0005],
            "basis_drift": [0.0001, -0.0002, 0.0001, 0.0003, -0.0001, 0.0002, 0.0001, -0.0001, 0.0002, 0.0001],
        })

        result = backtester.run_regime(strat, "REGIME_1", df, initial_capital=10000.0)
        assert result.total_trades > 0
        assert result.metrics.total_trades == result.total_trades
        assert len(result.equity_curve) > 0
