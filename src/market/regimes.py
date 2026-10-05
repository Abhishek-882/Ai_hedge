"""Market Regimes Data Partitioners, Statistical Profilers, and Synthetic Dataset Generators.
"""

from __future__ import annotations

import datetime
from typing import Any
import numpy as np
import pandas as pd

from src.core.constants import (
    HISTORICAL_REGIMES,
    RegimeID,
    RegimeWindow,
    SettlementTime,
)


class MarketRegimeManager:
    """Manages 4 historical market regimes, data partitioning, and statistical distribution profiling."""

    def __init__(self) -> None:
        self.regimes: dict[RegimeID, RegimeWindow] = HISTORICAL_REGIMES

    def get_regime_window(self, regime_id: RegimeID | str) -> RegimeWindow:
        """Fetch regime window metadata."""
        rid = RegimeID(regime_id) if isinstance(regime_id, str) else regime_id
        if rid not in self.regimes:
            raise ValueError(f"Unknown regime ID: {regime_id}")
        return self.regimes[rid]

    def get_all_regimes(self) -> dict[RegimeID, RegimeWindow]:
        """Return all 4 defined regimes."""
        return dict(self.regimes)

    def classify_regime_by_timestamp(self, ts: str | datetime.datetime) -> RegimeID | None:
        """Classify a given UTC timestamp into one of the historical regimes."""
        if isinstance(ts, str):
            dt = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        else:
            dt = ts if ts.tzinfo else ts.replace(tzinfo=datetime.timezone.utc)

        for rid, window in self.regimes.items():
            start_dt = datetime.datetime.fromisoformat(window.start_time_utc.replace("Z", "+00:00"))
            end_dt = datetime.datetime.fromisoformat(window.end_time_utc.replace("Z", "+00:00"))
            if start_dt <= dt <= end_dt:
                return rid
        return None

    def generate_regime_dataset(
        self,
        regime_id: RegimeID | str,
        symbol: str = "BTCUSDT",
        num_settlements: int = 150,
        seed: int = 42,
    ) -> pd.DataFrame:
        """Generate high-fidelity deterministic market dataset with prices, dual-venue funding rates, and spreads."""
        rid = RegimeID(regime_id) if isinstance(regime_id, str) else regime_id
        window = self.get_regime_window(rid)
        rng = np.random.default_rng(seed)

        start_dt = datetime.datetime.fromisoformat(window.start_time_utc.replace("Z", "+00:00"))
        records = []
        base_price = 30000.0 if rid == RegimeID.REGIME_2 else (60000.0 if rid == RegimeID.REGIME_1 else 40000.0)

        for i in range(num_settlements):
            # 8h settlement timestamps
            settle_dt = start_dt + datetime.timedelta(hours=8 * i)
            ts_ms = int(settle_dt.timestamp() * 1000)

            if rid == RegimeID.REGIME_1:
                # Bull Contango: Positive rates, high mean (+0.045%), >88% positive settlements
                venue_a_rate = rng.normal(loc=0.00045, scale=0.00015)
                # Spread to Venue B (sometimes wide > 0.0040 on alt/retail imbalance)
                spread = rng.choice([0.00010, 0.00025, 0.00045, 0.00060], p=[0.50, 0.35, 0.10, 0.05])
                venue_b_rate = venue_a_rate - spread
                price_drift = rng.normal(loc=0.002, scale=0.01)
                basis_drift = rng.normal(loc=0.0001, scale=0.0005)

            elif rid == RegimeID.REGIME_2:
                # Bear Backwardation: Negative rates, mean -0.025%, >65% negative
                venue_a_rate = rng.normal(loc=-0.00025, scale=0.00020)
                spread = rng.choice([0.00015, 0.00030, 0.00050], p=[0.60, 0.30, 0.10])
                venue_b_rate = venue_a_rate + spread
                price_drift = rng.normal(loc=-0.003, scale=0.015)
                basis_drift = rng.normal(loc=-0.0002, scale=0.0015)

            elif rid == RegimeID.REGIME_3:
                # Choppy Rangebound: Tight oscillation around +0.009%, low spread (<0.0005)
                venue_a_rate = rng.normal(loc=0.00009, scale=0.00005)
                spread = rng.normal(loc=0.00002, scale=0.00003)
                venue_b_rate = venue_a_rate - spread
                price_drift = rng.normal(loc=0.0, scale=0.005)
                basis_drift = rng.normal(loc=0.0, scale=0.0003)

            else:
                # Structural Dispersion: Wide cross-venue divergence, spread freq > 60%
                venue_a_rate = rng.choice([0.00250, -0.00180, 0.00150, 0.00080])
                spread = rng.uniform(0.0045, 0.0120) * rng.choice([1, -1])
                venue_b_rate = venue_a_rate - spread
                price_drift = rng.normal(loc=0.0, scale=0.020)
                basis_drift = rng.normal(loc=0.0, scale=0.0025)

            base_price = max(100.0, base_price * (1.0 + price_drift))
            price_venue_a = base_price
            price_venue_b = base_price * (1.0 + basis_drift)

            records.append({
                "timestamp_ms": ts_ms,
                "datetime_utc": settle_dt.isoformat(),
                "regime_id": rid.value,
                "symbol": symbol,
                "price_venue_a": round(price_venue_a, 2),
                "price_venue_b": round(price_venue_b, 2),
                "funding_rate_venue_a": round(float(venue_a_rate), 6),
                "funding_rate_venue_b": round(float(venue_b_rate), 6),
                "funding_spread": round(float(abs(venue_a_rate - venue_b_rate)), 6),
                "basis_drift": round(float(basis_drift), 6),
            })

        return pd.DataFrame(records)

    def partition_dataframe_by_regime(
        self,
        df: pd.DataFrame,
        timestamp_col: str = "timestamp_ms",
    ) -> dict[RegimeID, pd.DataFrame]:
        """Partition a continuous DataFrame into subsets corresponding to the 4 historical regimes."""
        partitions: dict[RegimeID, pd.DataFrame] = {}

        for rid, window in self.regimes.items():
            start_dt = datetime.datetime.fromisoformat(window.start_time_utc.replace("Z", "+00:00"))
            end_dt = datetime.datetime.fromisoformat(window.end_time_utc.replace("Z", "+00:00"))
            start_ms = int(start_dt.timestamp() * 1000)
            end_ms = int(end_dt.timestamp() * 1000)

            if timestamp_col in df.columns:
                sub_df = df[(df[timestamp_col] >= start_ms) & (df[timestamp_col] <= end_ms)].copy()
                partitions[rid] = sub_df
            elif "regime_id" in df.columns:
                sub_df = df[df["regime_id"] == rid.value].copy()
                partitions[rid] = sub_df
            else:
                partitions[rid] = pd.DataFrame()

        return partitions

    def calculate_regime_metrics(
        self,
        df: pd.DataFrame,
        funding_col: str = "funding_rate_venue_a",
        spread_col: str = "funding_spread",
        mvs_hurdle: float = 0.0040,
    ) -> dict[str, Any]:
        """Compute statistical regime distribution metrics."""
        if df.empty or funding_col not in df.columns:
            return {
                "count": 0,
                "mean_funding_rate": 0.0,
                "std_funding_rate": 0.0,
                "positive_settlements_pct": 0.0,
                "negative_settlements_pct": 0.0,
                "spread_opportunity_frequency_pct": 0.0,
            }

        rates = df[funding_col].values
        count = len(rates)
        mean_rate = float(np.mean(rates))
        std_rate = float(np.std(rates))
        pos_count = int(np.sum(rates > 0))
        neg_count = int(np.sum(rates < 0))

        spread_freq = 0.0
        if spread_col in df.columns:
            spreads = df[spread_col].values
            spread_freq = float(np.mean(spreads >= mvs_hurdle) * 100.0)

        return {
            "count": count,
            "mean_funding_rate": round(mean_rate, 6),
            "std_funding_rate": round(std_rate, 6),
            "positive_settlements_pct": round((pos_count / count) * 100.0, 2),
            "negative_settlements_pct": round((neg_count / count) * 100.0, 2),
            "spread_opportunity_frequency_pct": round(spread_freq, 2),
        }
