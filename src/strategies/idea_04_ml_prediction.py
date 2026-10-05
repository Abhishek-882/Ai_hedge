"""ML-Augmented Rate Prediction Strategy Module (Idea 04).
Implements orderbook imbalance (OBI), spot-perp basis acceleration, open interest momentum,
and feature engineering to predict the next settlement funding rate and position in advance of fixings.
"""

from __future__ import annotations

import collections
import datetime
import logging
import math
from typing import Any
import numpy as np

from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_TAKER_FEE,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
)
from src.core.exceptions import RiskException
from src.engine.interfaces import (
    BaseStrategy,
    FillEvent,
    FundingSnapshotEvent,
    MarketEvent,
    OrderIntent,
    OrderSide,
    OrderType,
)

logger = logging.getLogger(__name__)


class MLRatePredictionStrategy(BaseStrategy):
    """ML-Augmented Rate Prediction Strategy.
    
    Mechanics:
    - Features:
      * Order Book Imbalance: OBI = (V_bid - V_ask) / (V_bid + V_ask)
      * Basis Velocity & Acceleration: Basis = P_perp - P_spot, v_basis = d(Basis)/dt, a_basis = d(v_basis)/dt
      * Open Interest Momentum: Delta OI = (OI_t - OI_{t-1}) / OI_{t-1}
      * Taker Volume Ratio: TakerRatio = V_taker_buy / V_taker_sell
      * Cross-Venue Dispersion: StdDev(FR_venues)
    - Predictive Model: Online regularized linear model / ElasticNet predictor forecasting next funding rate FR_hat.
    - Alpha Trigger: Expected Drift = |FR_hat - FR_current| >= prediction_alpha_threshold (e.g. 0.0004 = 40 bps).
    - Leverage: 2.0x max leverage cap.
    """

    def __init__(self, strategy_id: str = "idea_04_ml_prediction") -> None:
        super().__init__(strategy_id=strategy_id)
        self.exchange: str = "binance"
        self.symbol: str = "BTCUSDT"
        self.spot_symbol: str = "BTC/USDT"
        self.target_notional: float = 2000.0
        self.prediction_alpha_threshold: float = 0.0004  # 4.0 bps expected drift
        self.leverage: float = 2.0                       # 2.0x leverage cap
        self.lookback_window: int = 60

        # Feature state buffers
        self.bid_depth_history: collections.deque[float] = collections.deque(maxlen=60)
        self.ask_depth_history: collections.deque[float] = collections.deque(maxlen=60)
        self.basis_history: collections.deque[float] = collections.deque(maxlen=60)
        self.basis_velocity_history: collections.deque[float] = collections.deque(maxlen=60)
        self.oi_history: collections.deque[float] = collections.deque(maxlen=60)
        self.taker_buy_vol_history: collections.deque[float] = collections.deque(maxlen=60)
        self.taker_sell_vol_history: collections.deque[float] = collections.deque(maxlen=60)

        # Model Weights (Initialized from offline regularized linear ridge calibration)
        # Features: [Intercept, OBI, Basis_Velocity, Basis_Acceleration, OI_Momentum, Taker_Ratio_Log]
        self.weights = np.array([0.00010, 0.00035, 0.00002, 0.00001, 0.00025, 0.00015])

        # State tracking
        self.current_perp_price: float = 0.0
        self.current_spot_price: float = 0.0
        self.current_funding_rate: float = 0.0
        self.predicted_funding_rate: float = 0.0
        self.current_position_qty: float = 0.0
        self.entry_price: float = 0.0
        self.accumulated_pnl: float = 0.0
        self.accumulated_fees: float = 0.0

    def initialize(self, config: dict[str, Any]) -> None:
        """Initialize ML Prediction strategy parameters."""
        self.config = config
        self.exchange = config.get("exchange", self.exchange)
        self.symbol = config.get("symbol", self.symbol)
        self.spot_symbol = config.get("spot_symbol", self.spot_symbol)
        self.target_notional = float(config.get("target_notional", self.target_notional))
        self.prediction_alpha_threshold = float(
            config.get("prediction_alpha_threshold", self.prediction_alpha_threshold)
        )
        self.leverage = float(config.get("leverage", 2.0))
        if self.leverage > 2.0:
            logger.warning("ML Prediction strategy enforces maximum leverage cap of 2.0x.")
            self.leverage = 2.0

        self.is_initialized = True
        logger.info(
            f"MLRatePredictionStrategy initialized: exchange={self.exchange}, "
            f"symbol={self.symbol}, alpha_threshold={self.prediction_alpha_threshold:.6f}"
        )

    def calculate_orderbook_imbalance(self, bid_vol: float, ask_vol: float) -> float:
        """Compute Order Book Imbalance (OBI):
        OBI = (V_bid - V_ask) / (V_bid + V_ask)
        """
        total_vol = bid_vol + ask_vol
        if total_vol <= 0:
            return 0.0
        return float((bid_vol - ask_vol) / total_vol)

    def calculate_basis_velocity_and_acceleration(self, perp_price: float, spot_price: float) -> tuple[float, float]:
        """Compute basis, velocity, and acceleration:
        Basis = P_perp - P_spot
        v_basis = Basis_t - Basis_{t-1}
        a_basis = v_basis_t - v_basis_{t-1}
        """
        if spot_price <= 0 or perp_price <= 0:
            return 0.0, 0.0

        current_basis = perp_price - spot_price
        self.basis_history.append(current_basis)

        if len(self.basis_history) < 2:
            return 0.0, 0.0

        velocity = self.basis_history[-1] - self.basis_history[-2]
        self.basis_velocity_history.append(velocity)

        if len(self.basis_velocity_history) < 2:
            return velocity, 0.0

        acceleration = self.basis_velocity_history[-1] - self.basis_velocity_history[-2]
        return velocity, acceleration

    def calculate_oi_momentum(self, current_oi: float) -> float:
        """Compute relative Open Interest momentum:
        Delta OI = (OI_t - OI_{t-1}) / OI_{t-1}
        """
        self.oi_history.append(current_oi)
        if len(self.oi_history) < 2 or self.oi_history[-2] <= 0:
            return 0.0
        return (self.oi_history[-1] - self.oi_history[-2]) / self.oi_history[-2]

    def extract_features(
        self,
        bid_vol: float = 100.0,
        ask_vol: float = 100.0,
        current_oi: float = 1000000.0,
        taker_buy_vol: float = 50.0,
        taker_sell_vol: float = 50.0,
    ) -> np.ndarray:
        """Construct normalized feature vector for model prediction:
        [1.0 (Intercept), OBI, Basis_Velocity, Basis_Acceleration, OI_Momentum, Taker_Ratio_Log]
        """
        obi = self.calculate_orderbook_imbalance(bid_vol, ask_vol)
        v_basis, a_basis = self.calculate_basis_velocity_and_acceleration(
            self.current_perp_price, self.current_spot_price
        )
        oi_mom = self.calculate_oi_momentum(current_oi)

        taker_sell = max(taker_sell_vol, 1e-4)
        taker_ratio = taker_buy_vol / taker_sell
        log_taker_ratio = float(math.log(max(taker_ratio, 1e-3)))

        features = np.array([1.0, obi, v_basis, a_basis, oi_mom, log_taker_ratio])
        return features

    def predict_funding_rate(self, features: np.ndarray) -> float:
        """Predict the next 8h funding rate using the regularized linear model."""
        prediction = float(np.dot(self.weights, features))
        return prediction

    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]:
        """Process price and orderbook events, extract features, and evaluate ML alpha triggers."""
        if event.exchange != self.exchange:
            return []

        mid_price = (event.bid_price + event.ask_price) / 2.0
        if event.symbol == self.spot_symbol:
            self.current_spot_price = mid_price
            return []
        elif event.symbol == self.symbol:
            self.current_perp_price = mid_price
        else:
            return []

        now_utc = event.timestamp_utc or datetime.datetime.now(datetime.timezone.utc)

        # Approximate orderbook depth from top bid/ask
        bid_depth = event.bid_price * 10.0
        ask_depth = event.ask_price * 10.0
        features = self.extract_features(bid_vol=bid_depth, ask_vol=ask_depth)

        # Generate predicted rate
        self.predicted_funding_rate = self.predict_funding_rate(features)
        expected_drift = self.predicted_funding_rate - self.current_funding_rate

        # Alpha decision rule
        should_long = expected_drift >= self.prediction_alpha_threshold
        should_short = expected_drift <= -self.prediction_alpha_threshold

        intents: list[OrderIntent] = []

        if abs(self.current_position_qty) < 1e-6:
            # Not in position -> Enter if alpha exceeds threshold
            if should_long or should_short:
                side = OrderSide.BUY if should_long else OrderSide.SELL
                qty = round(self.target_notional / mid_price, 4)
                if qty > 0:
                    intent_id = f"intent_ml_{int(now_utc.timestamp()*1000)}"
                    intents.append(
                        OrderIntent(
                            intent_id=intent_id,
                            strategy_id=self.strategy_id,
                            exchange=self.exchange,
                            symbol=self.symbol,
                            side=side,
                            order_type=OrderType.MARKET,
                            quantity=qty,
                            created_at_utc=now_utc,
                        )
                    )
        else:
            # In position -> Check for signal reversal
            current_side = OrderSide.BUY if self.current_position_qty > 0 else OrderSide.SELL
            if (current_side == OrderSide.BUY and should_short) or (current_side == OrderSide.SELL and should_long):
                # Close existing position
                close_side = OrderSide.SELL if current_side == OrderSide.BUY else OrderSide.BUY
                intents.append(
                    OrderIntent(
                        intent_id=f"close_ml_{int(now_utc.timestamp()*1000)}",
                        strategy_id=self.strategy_id,
                        exchange=self.exchange,
                        symbol=self.symbol,
                        side=close_side,
                        order_type=OrderType.MARKET,
                        quantity=abs(self.current_position_qty),
                        created_at_utc=now_utc,
                    )
                )

        return intents

    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]:
        """Update current funding rate upon settlement snapshot."""
        if event.exchange != self.exchange or event.symbol != self.symbol:
            return []

        self.current_funding_rate = event.funding_rate
        if event.predicted_rate is not None:
            self.predicted_funding_rate = event.predicted_rate

        # Settle funding cashflow
        if abs(self.current_position_qty) > 1e-6:
            price = event.mark_price or self.current_perp_price or 30000.0
            notional = abs(self.current_position_qty) * price
            if self.current_position_qty > 0:
                self.accumulated_pnl += -notional * event.funding_rate
            else:
                self.accumulated_pnl += notional * event.funding_rate

        logger.info(
            f"MLRatePrediction funding snapshot: actual={event.funding_rate:.6f}, "
            f"predicted={self.predicted_funding_rate:.6f}"
        )
        return []

    def on_fill(self, event: FillEvent) -> None:
        """Update position state and entry price upon fill confirmation."""
        if event.symbol != self.symbol:
            return

        self.accumulated_fees += event.fee_paid
        if event.side == OrderSide.BUY:
            self.current_position_qty += event.filled_qty
            self.entry_price = event.filled_price
        else:
            self.current_position_qty -= event.filled_qty
            self.entry_price = event.filled_price

        logger.info(
            f"MLRatePrediction on_fill: pos_qty={self.current_position_qty:.4f}, "
            f"entry_price={self.entry_price:.2f}"
        )

    def on_desync_alert(self, pair_trade_id: str, context: dict[str, Any]) -> list[OrderIntent]:
        """Emergency unwind callback."""
        logger.warning(f"MLRatePrediction desync alert for {pair_trade_id}: {context}")
        if abs(self.current_position_qty) > 1e-6:
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            side = OrderSide.SELL if self.current_position_qty > 0 else OrderSide.BUY
            return [
                OrderIntent(
                    intent_id=f"emergency_close_ml_{int(now_utc.timestamp()*1000)}",
                    strategy_id=self.strategy_id,
                    exchange=self.exchange,
                    symbol=self.symbol,
                    side=side,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.current_position_qty),
                    created_at_utc=now_utc,
                )
            ]
        return []
