"""Data models and schemas for SQLite storage tables.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class ExchangeMetadataModel:
    exchange_id: str
    name: str
    api_type: str
    rest_testnet_url: str
    ws_testnet_url: str
    rest_mainnet_url: str | None = None
    auth_type: str = "hmac_sha256"
    maker_fee_default: float = 0.0002
    taker_fee_default: float = 0.0005
    rate_limit_req_per_min: int = 1200
    sandbox_operational: int = 1
    requires_paper_fallback: int = 0
    created_at: str | None = None
    updated_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> ExchangeMetadataModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(*row)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class InstrumentModel:
    symbol: str
    exchange_id: str
    base_asset: str
    quote_asset: str
    contract_type: str
    price_precision: int
    quantity_precision: int
    tick_size: float
    lot_size: float
    min_notional: float = 5.0
    funding_interval_hours: int = 8
    is_active: int = 1
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> InstrumentModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(*row)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FundingRateModel:
    exchange_id: str
    symbol: str
    timestamp_ms: int
    settlement_time_utc: str
    funding_rate: float
    funding_rate_annualized: float
    mark_price: float | None = None
    index_price: float | None = None
    interest_rate: float = 0.0001
    funding_interval_hours: int = 8
    source: str = "rest_snapshot"
    id: int | None = None
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> FundingRateModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            exchange_id=row[1],
            symbol=row[2],
            timestamp_ms=row[3],
            settlement_time_utc=row[4],
            funding_rate=row[5],
            funding_rate_annualized=row[6],
            mark_price=row[7],
            index_price=row[8],
            interest_rate=row[9],
            funding_interval_hours=row[10],
            source=row[11],
            created_at=row[12],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class TickerSnapshotModel:
    exchange_id: str
    symbol: str
    timestamp_ms: int
    last_price: float
    mark_price: float
    index_price: float
    bid1_price: float
    ask1_price: float
    bid1_qty: float
    ask1_qty: float
    spread_bps: float
    est_funding_rate: float | None = None
    next_funding_time_ms: int | None = None
    id: int | None = None
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> TickerSnapshotModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            exchange_id=row[1],
            symbol=row[2],
            timestamp_ms=row[3],
            last_price=row[4],
            mark_price=row[5],
            index_price=row[6],
            bid1_price=row[7],
            ask1_price=row[8],
            bid1_qty=row[9],
            ask1_qty=row[10],
            spread_bps=row[11],
            est_funding_rate=row[12],
            next_funding_time_ms=row[13],
            created_at=row[14],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class OrderbookSnapshotModel:
    exchange_id: str
    symbol: str
    timestamp_ms: int
    bid_depth_top5: float
    ask_depth_top5: float
    bid_depth_top20: float
    ask_depth_top20: float
    spread_bps: float
    mid_price: float
    raw_bids_json: str | None = None
    raw_asks_json: str | None = None
    id: int | None = None
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> OrderbookSnapshotModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            exchange_id=row[1],
            symbol=row[2],
            timestamp_ms=row[3],
            bid_depth_top5=row[4],
            ask_depth_top5=row[5],
            bid_depth_top20=row[6],
            ask_depth_top20=row[7],
            spread_bps=row[8],
            mid_price=row[9],
            raw_bids_json=row[10],
            raw_asks_json=row[11],
            created_at=row[12],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FeeScheduleModel:
    exchange_id: str
    vip_tier: str
    maker_rate: float
    taker_rate: float
    verification_source_citations: str
    verified_at: str
    bnb_or_native_discount: float = 0.0
    min_30d_volume_usd: float = 0.0
    verified_sources_count: int = 5
    id: int | None = None
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> FeeScheduleModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            exchange_id=row[1],
            vip_tier=row[2],
            maker_rate=row[3],
            taker_rate=row[4],
            bnb_or_native_discount=row[5],
            min_30d_volume_usd=row[6],
            verified_sources_count=row[7],
            verification_source_citations=row[8],
            verified_at=row[9],
            created_at=row[10],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RegimeModel:
    regime_id: str
    name: str
    description: str
    start_time_utc: str
    end_time_utc: str
    dominant_market_trend: str
    avg_btc_funding_rate: float
    avg_alt_funding_rate: float
    spread_opportunity_frequency_pct: float
    basis_volatility_daily_pct: float
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> RegimeModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(*row)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RegimeDatapointModel:
    regime_id: str
    funding_rate_id: int
    exchange_id: str
    symbol: str
    timestamp_ms: int
    id: int | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> RegimeDatapointModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            regime_id=row[1],
            funding_rate_id=row[2],
            exchange_id=row[3],
            symbol=row[4],
            timestamp_ms=row[5],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SpreadOpportunityModel:
    timestamp_ms: int
    settlement_time_utc: str
    symbol: str
    exchange_long: str
    exchange_short: str
    rate_long: float
    rate_short: float
    gross_spread: float
    total_taker_fee_drag: float
    est_slippage_drag: float
    net_expected_yield: float
    passes_mvs_gate: int
    id: int | None = None
    created_at: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> SpreadOpportunityModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            timestamp_ms=row[1],
            settlement_time_utc=row[2],
            symbol=row[3],
            exchange_long=row[4],
            exchange_short=row[5],
            rate_long=row[6],
            rate_short=row[7],
            gross_spread=row[8],
            total_taker_fee_drag=row[9],
            est_slippage_drag=row[10],
            net_expected_yield=row[11],
            passes_mvs_gate=row[12],
            created_at=row[13],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class KillSwitchStateModel:
    id: int = 1
    is_tripped: int = 0
    trip_reason: str | None = None
    tripped_by: str | None = None
    tripped_at_utc: str | None = None
    lock_payload_json: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> KillSwitchStateModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(*row)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AuditLogModel:
    event_type: str
    agent_id: str
    details_json: str
    timestamp_utc: str | None = None
    id: int | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> AuditLogModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            id=row[0],
            event_type=row[1],
            agent_id=row[2],
            details_json=row[3],
            timestamp_utc=row[4],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class AgentStateAuditModel:
    memo_id: str
    from_agent: str
    to_agent: str
    idea_id: str
    phase: str
    position: str
    evidence: str
    git_commit: str
    created_at_utc: str
    failure_scenario: str | None = None
    remediation: str | None = None

    @classmethod
    def from_row(cls, row: dict[str, Any] | tuple) -> AgentStateAuditModel:
        if isinstance(row, dict):
            return cls(**row)
        return cls(
            memo_id=row[0],
            from_agent=row[1],
            to_agent=row[2],
            idea_id=row[3],
            phase=row[4],
            position=row[5],
            evidence=row[6],
            failure_scenario=row[7],
            remediation=row[8],
            git_commit=row[9],
            created_at_utc=row[10],
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
