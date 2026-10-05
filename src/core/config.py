"""Configuration models and loaders for the Funding Rate Research Swarm.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.core.constants import (
    DEFAULT_LEVERAGE_CAP,
    DEFAULT_MAKER_FEE,
    DEFAULT_MAX_DRAWDOWN_PCT,
    DEFAULT_TAKER_FEE,
    KILL_SWITCH_LATCH_FILENAME,
    MAX_PER_TRADE_LOSS_PCT,
    MIN_CAPITAL_FLOOR_USD,
    MIN_LIQUIDATION_BUFFER_PCT,
    SQLITE_BUSY_TIMEOUT_MS,
    TESTNET_URL_DEFAULTS,
)
from src.core.exceptions import MainnetEndpointDetectedException


@dataclass
class ExchangeConfig:
    exchange_id: str
    name: str
    rest_url: str
    ws_url: str
    api_key: str = ""
    api_secret: str = ""
    passphrase: str = ""
    maker_fee: float = DEFAULT_MAKER_FEE
    taker_fee: float = DEFAULT_TAKER_FEE
    rate_limit_req_per_min: int = 1200
    is_testnet: bool = True
    requires_paper_fallback: bool = False


@dataclass
class RiskConfig:
    max_drawdown_pct: float = DEFAULT_MAX_DRAWDOWN_PCT
    leverage_cap: float = DEFAULT_LEVERAGE_CAP
    position_size_cap_usd: float = 5000.0
    min_liquidation_buffer_pct: float = MIN_LIQUIDATION_BUFFER_PCT
    max_per_trade_loss_pct: float = MAX_PER_TRADE_LOSS_PCT
    capital_floor_usd: float = MIN_CAPITAL_FLOOR_USD


@dataclass
class DatabaseConfig:
    db_path: str = "funding_rate_swarm.db"
    wal_mode: bool = True
    busy_timeout_ms: int = SQLITE_BUSY_TIMEOUT_MS
    foreign_keys: bool = True


@dataclass
class AppConfig:
    environment: str = "testnet"
    is_live_armed: bool = False  # Custody with DELTA / Human Overseer; defaults to False
    data_dir: str = "data"
    latch_file_path: str = KILL_SWITCH_LATCH_FILENAME
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    exchanges: dict[str, ExchangeConfig] = field(default_factory=dict)

    @classmethod
    def default(cls) -> AppConfig:
        cfg = cls()
        for ex_id, urls in TESTNET_URL_DEFAULTS.items():
            req_paper = urls.get("requires_paper_fallback", "False").lower() == "true"
            cfg.exchanges[ex_id] = ExchangeConfig(
                exchange_id=ex_id,
                name=ex_id.capitalize(),
                rest_url=urls["rest"],
                ws_url=urls["ws"],
                is_testnet=True,
                requires_paper_fallback=req_paper,
            )
        return cfg

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> AppConfig:
        config = cls.default()
        if "environment" in data:
            config.environment = str(data["environment"]).lower()
        if "is_live_armed" in data:
            config.is_live_armed = bool(data["is_live_armed"])
        if "data_dir" in data:
            config.data_dir = str(data["data_dir"])
        if "latch_file_path" in data:
            config.latch_file_path = str(data["latch_file_path"])

        if "risk" in data and isinstance(data["risk"], dict):
            r = data["risk"]
            config.risk = RiskConfig(
                max_drawdown_pct=float(r.get("max_drawdown_pct", config.risk.max_drawdown_pct)),
                leverage_cap=float(r.get("leverage_cap", config.risk.leverage_cap)),
                position_size_cap_usd=float(r.get("position_size_cap_usd", config.risk.position_size_cap_usd)),
                min_liquidation_buffer_pct=float(r.get("min_liquidation_buffer_pct", config.risk.min_liquidation_buffer_pct)),
                max_per_trade_loss_pct=float(r.get("max_per_trade_loss_pct", config.risk.max_per_trade_loss_pct)),
                capital_floor_usd=float(r.get("capital_floor_usd", config.risk.capital_floor_usd)),
            )

        if "database" in data and isinstance(data["database"], dict):
            d = data["database"]
            config.database = DatabaseConfig(
                db_path=str(d.get("db_path", config.database.db_path)),
                wal_mode=bool(d.get("wal_mode", config.database.wal_mode)),
                busy_timeout_ms=int(d.get("busy_timeout_ms", config.database.busy_timeout_ms)),
                foreign_keys=bool(d.get("foreign_keys", config.database.foreign_keys)),
            )

        if "exchanges" in data and isinstance(data["exchanges"], dict):
            for ex_id, ex_data in data["exchanges"].items():
                if isinstance(ex_data, dict):
                    config.exchanges[ex_id] = ExchangeConfig(
                        exchange_id=ex_id,
                        name=ex_data.get("name", ex_id.capitalize()),
                        rest_url=ex_data.get("rest_url", ""),
                        ws_url=ex_data.get("ws_url", ""),
                        api_key=ex_data.get("api_key", ""),
                        api_secret=ex_data.get("api_secret", ""),
                        passphrase=ex_data.get("passphrase", ""),
                        maker_fee=float(ex_data.get("maker_fee", DEFAULT_MAKER_FEE)),
                        taker_fee=float(ex_data.get("taker_fee", DEFAULT_TAKER_FEE)),
                        rate_limit_req_per_min=int(ex_data.get("rate_limit_req_per_min", 1200)),
                        is_testnet=bool(ex_data.get("is_testnet", True)),
                        requires_paper_fallback=bool(ex_data.get("requires_paper_fallback", False)),
                    )

        return config


# Alias for backward compatibility / readability
SystemConfig = AppConfig
