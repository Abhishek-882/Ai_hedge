"""High-Fidelity Idea 03 Timing Engine with Stochastic Dual-Leg Fill Latencies.
"""

from __future__ import annotations

from dataclasses import dataclass
import datetime
import numpy as np

from src.core.constants import (
    IDEA03_ENTRY_LEAD_SECONDS,
    IDEA03_EXIT_LAG_SECONDS,
    IDEA03_TOTAL_HOLD_SECONDS,
)


@dataclass
class DualLegExecutionTiming:
    scheduled_settlement_utc: datetime.datetime
    entry_scheduled_utc: datetime.datetime
    exit_scheduled_utc: datetime.datetime
    leg1_fill_latency_ms: float
    leg2_fill_latency_ms: float
    leg_fill_skew_ms: float
    leg1_filled: bool
    leg2_filled: bool
    is_synchronized: bool
    held_through_snapshot: bool
    total_hold_duration_seconds: float


class TimingEngine:
    """Models precise T-8min entry and T+90s exit windows and stochastic leg fill delays."""

    def __init__(
        self,
        entry_lead_seconds: int = IDEA03_ENTRY_LEAD_SECONDS,
        exit_lag_seconds: int = IDEA03_EXIT_LAG_SECONDS,
        mu_lognormal: float = 4.5,
        sigma_lognormal: float = 0.5,
        stochastic_failure_rate: float = 0.02,
    ) -> None:
        self.entry_lead_seconds = entry_lead_seconds
        self.exit_lag_seconds = exit_lag_seconds
        self.total_hold_seconds = entry_lead_seconds + exit_lag_seconds
        self.mu = mu_lognormal
        self.sigma = sigma_lognormal
        self.failure_rate = stochastic_failure_rate

    def generate_fill_latency_ms(self, rng: np.random.Generator | None = None) -> float:
        """Sample network round-trip fill latency from LogNormal(mu, sigma) in milliseconds."""
        gen = rng or np.random.default_rng()
        latency = gen.lognormal(mean=self.mu, sigma=self.sigma)
        return round(float(latency), 2)

    def simulate_dual_leg_window(
        self,
        settlement_dt: datetime.datetime,
        rng: np.random.Generator | None = None,
    ) -> DualLegExecutionTiming:
        """Simulate single settlement window timing, dual-leg submission latencies, and fill sync."""
        gen = rng or np.random.default_rng()

        entry_scheduled = settlement_dt - datetime.timedelta(seconds=self.entry_lead_seconds)
        exit_scheduled = settlement_dt + datetime.timedelta(seconds=self.exit_lag_seconds)

        leg1_latency = self.generate_fill_latency_ms(gen)
        leg2_latency = self.generate_fill_latency_ms(gen)
        skew_ms = abs(leg1_latency - leg2_latency)

        # Stochastic leg rejection / failure check
        leg1_fail = gen.random() < self.failure_rate
        leg2_fail = gen.random() < self.failure_rate

        leg1_filled = not leg1_fail
        leg2_filled = not leg2_fail
        is_synced = leg1_filled and leg2_filled and (skew_ms < 1500.0)

        # A trade is held through snapshot if entry is before snapshot and exit is after snapshot
        held_through = entry_scheduled < settlement_dt < exit_scheduled

        return DualLegExecutionTiming(
            scheduled_settlement_utc=settlement_dt,
            entry_scheduled_utc=entry_scheduled,
            exit_scheduled_utc=exit_scheduled,
            leg1_fill_latency_ms=leg1_latency,
            leg2_fill_latency_ms=leg2_latency,
            leg_fill_skew_ms=round(skew_ms, 2),
            leg1_filled=leg1_filled,
            leg2_filled=leg2_filled,
            is_synchronized=is_synced,
            held_through_snapshot=held_through,
            total_hold_duration_seconds=float(self.total_hold_seconds),
        )

    def is_within_entry_window(self, current_dt: datetime.datetime, next_settlement_dt: datetime.datetime) -> bool:
        """Check if current timestamp is within T-8min entry trigger window."""
        seconds_to_settlement = (next_settlement_dt - current_dt).total_seconds()
        # Trigger when within [T-8min, T-8min + 30s]
        return 0 <= (self.entry_lead_seconds - seconds_to_settlement) <= 30

    def is_within_exit_window(self, current_dt: datetime.datetime, prev_settlement_dt: datetime.datetime) -> bool:
        """Check if current timestamp is within T+90s exit window."""
        seconds_since_settlement = (current_dt - prev_settlement_dt).total_seconds()
        return seconds_since_settlement >= self.exit_lag_seconds
