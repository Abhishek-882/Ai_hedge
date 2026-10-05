"""System-wide quantitative, operational, and structural constants for the Funding Rate Swarm.
"""

from dataclasses import dataclass
from enum import Enum


class AgentPersona(str, Enum):
    ALPHA = "ALPHA"      # The Architect (Velocity Lead / Execution Engine)
    BETA = "BETA"        # The Auditor (Chaos Engineer / Hard Veto)
    GAMMA = "GAMMA"      # The Purist (Quant Researcher / Regimes & Fees)
    DELTA = "DELTA"      # The Warden (DevOps / State & IPC Custodian)
    OVERSEER = "OVERSEER" # Human Overseer (Final Authority)


class IdeaDirectoryState(str, Enum):
    BACKLOG = "backlog"
    AUDIT = "audit"
    APPROVED = "approved"
    PAPER = "paper"
    RESOLVED = "resolved"


class MemoPosition(str, Enum):
    APPROVE = "approve"
    VETO = "veto"
    REQUEST_INFO = "request-info"
    PROPOSE = "propose"


class ExchangeID(str, Enum):
    BINANCE = "binance"
    BYBIT = "bybit"
    BITGET = "bitget"
    DELTA_INDIA = "delta_india"
    KUCOIN = "kucoin"
    PAPER_MOCK = "paper_mock"


class RegimeID(str, Enum):
    REGIME_1 = "REGIME_1"  # Bull Contango
    REGIME_2 = "REGIME_2"  # Bear Backwardation
    REGIME_3 = "REGIME_3"  # Choppy Rangebound
    REGIME_4 = "REGIME_4"  # Structural Dispersion


@dataclass(frozen=True)
class RegimeWindow:
    regime_id: RegimeID
    name: str
    description: str
    start_time_utc: str
    end_time_utc: str
    dominant_market_trend: str
    avg_btc_funding_rate: float
    avg_alt_funding_rate: float
    spread_opportunity_frequency_pct: float
    basis_volatility_daily_pct: float


HISTORICAL_REGIMES: dict[RegimeID, RegimeWindow] = {
    RegimeID.REGIME_1: RegimeWindow(
        regime_id=RegimeID.REGIME_1,
        name="Bull Contango",
        description="Persistent positive funding driven by retail leverage demand",
        start_time_utc="2023-10-15T00:00:00Z",
        end_time_utc="2024-03-31T23:59:59Z",
        dominant_market_trend="STRONG_BULL",
        avg_btc_funding_rate=0.00045,  # +0.045% per 8h
        avg_alt_funding_rate=0.00150,  # +0.150% per 8h
        spread_opportunity_frequency_pct=14.2,
        basis_volatility_daily_pct=0.25,
    ),
    RegimeID.REGIME_2: RegimeWindow(
        regime_id=RegimeID.REGIME_2,
        name="Bear Backwardation",
        description="Negative funding from panic hedging and liquidation cascades",
        start_time_utc="2022-05-08T00:00:00Z",
        end_time_utc="2022-12-31T23:59:59Z",
        dominant_market_trend="STRONG_BEAR",
        avg_btc_funding_rate=-0.00025,  # -0.025% per 8h
        avg_alt_funding_rate=-0.00200,  # -0.200% per 8h
        spread_opportunity_frequency_pct=9.8,
        basis_volatility_daily_pct=1.20,
    ),
    RegimeID.REGIME_3: RegimeWindow(
        regime_id=RegimeID.REGIME_3,
        name="Choppy Rangebound",
        description="Oscillating low-magnitude funding around baseline rate",
        start_time_utc="2023-05-01T00:00:00Z",
        end_time_utc="2023-09-30T23:59:59Z",
        dominant_market_trend="NEUTRAL_CHOP",
        avg_btc_funding_rate=0.00009,   # +0.009% per 8h
        avg_alt_funding_rate=0.00020,   # +0.020% per 8h
        spread_opportunity_frequency_pct=1.2,
        basis_volatility_daily_pct=0.10,
    ),
    RegimeID.REGIME_4: RegimeWindow(
        regime_id=RegimeID.REGIME_4,
        name="Structural Dispersion",
        description="Severe cross-venue rate fragmentation and borrow dislocation",
        start_time_utc="2023-08-20T00:00:00Z",
        end_time_utc="2023-09-10T23:59:59Z",
        dominant_market_trend="HIGH_DISPERSION",
        avg_btc_funding_rate=0.00015,   # +0.015% per 8h
        avg_alt_funding_rate=0.00850,   # +0.850% per 8h
        spread_opportunity_frequency_pct=62.5,
        basis_volatility_daily_pct=2.10,
    ),
}

# ---------------------------------------------------------------------------
# Settlement Timestamps (UTC)
# ---------------------------------------------------------------------------
class SettlementTime:
    HOURS = (0, 8, 16)
    SNAPSHOT_STRINGS = ("00:00:00", "08:00:00", "16:00:00")
    INTERVAL_HOURS = 8


# ---------------------------------------------------------------------------
# Fee Defaults & Minimum Viable Spread (MVS) Hurdles
# ---------------------------------------------------------------------------
DEFAULT_MAKER_FEE: float = 0.00020  # 2.0 bps (0.020%)
DEFAULT_TAKER_FEE: float = 0.00050  # 5.0 bps (0.050%)
BYBIT_TAKER_FEE: float = 0.00055    # 5.5 bps (0.055%)
BITGET_MAKER_FEE: float = 0.00020   # 2.0 bps (0.020%)
BITGET_TAKER_FEE: float = 0.00060   # 6.0 bps (0.060%)
KUCOIN_TAKER_FEE: float = 0.00060   # 6.0 bps (0.060%)

# 4-Way Taker Fee Drag: Entry Leg 1 + Entry Leg 2 + Exit Leg 1 + Exit Leg 2
TOTAL_TAKER_FEE_DRAG: float = 0.00200  # 20.0 bps (0.200%)

# Slippage Buffer: 2.5 bps per leg x 4 transactions
SLIPPAGE_BUFFER: float = 0.00100       # 10.0 bps (0.100%)

# Minimum Viable Spread Hurdles
MIN_VIABLE_SPREAD_FLOOR: float = 0.00400  # 40.0 bps (0.400% per 8h)
MIN_VIABLE_SPREAD_TARGET: float = 0.00500 # 50.0 bps (0.500% per 8h)


# ---------------------------------------------------------------------------
# Risk & Execution Constraints
# ---------------------------------------------------------------------------
DEFAULT_MAX_DRAWDOWN_PCT: float = 0.05       # 5.0% cumulative portfolio drawdown
DEFAULT_MAX_DRAWDOWN_CAP_PCT: float = 0.05   # Alias
DEFAULT_LEVERAGE_CAP: float = 3.0           # 3.0x max leverage
MIN_CAPITAL_FLOOR_USD: float = 1000.0       # $1,000 per venue ($2,000 total)
MIN_LIQUIDATION_BUFFER_PCT: float = 0.35    # >= 35% liquidation distance
DEFAULT_MIN_LIQUIDATION_BUFFER_PCT: float = 0.35 # Alias
MAX_PER_TRADE_LOSS_PCT: float = 0.015       # 1.5% per trade loss limit


# ---------------------------------------------------------------------------
# Timing & Watchdog Constants
# ---------------------------------------------------------------------------
IDEA03_ENTRY_LEAD_SECONDS: int = 480        # T - 8 minutes (480s)
IDEA03_EXIT_LAG_SECONDS: int = 90           # T + 90 seconds
IDEA03_TOTAL_HOLD_SECONDS: int = 570        # 480s + 90s = 570s (9.5 minutes)

DESYNC_WATCHDOG_TIMEOUT_MS: int = 1500      # 1500ms leg fill window before unwind
SQLITE_BUSY_TIMEOUT_MS: int = 5000          # 5000ms SQLite busy timeout
EXCHANGE_DISCONNECT_TIMEOUT_S: int = 30     # 30s heartbeat timeout

KILL_SWITCH_LATCH_FILENAME: str = "KILL_SWITCH.latch"


# ---------------------------------------------------------------------------
# Endpoints (Testnet vs Mainnet reference strings for guardrail scans)
# ---------------------------------------------------------------------------
MAINNET_URL_PATTERNS: tuple[str, ...] = (
    "fapi.binance.com",
    "api.binance.com",
    "api.bybit.com",
    "api.kucoin.com",
    "api.india.delta.exchange",
    "api.delta.exchange",
    "api.okx.com",
    "api.coinbase.com",
    "api.kraken.com",
    "api.gate.io",
    "api.bitget.com",
    "dapi.binance.com",
)

TESTNET_URL_DEFAULTS: dict[str, dict[str, str]] = {
    "binance": {
        "rest": "https://testnet.binancefuture.com",
        "ws": "wss://stream.binancefuture.com/ws",
    },
    "bybit": {
        "rest": "https://api-testnet.bybit.com",
        "ws": "wss://stream-testnet.bybit.com/v5/public/linear",
    },
    "delta_india": {
        "rest": "https://testnet-api.delta.exchange",
        "ws": "wss://testnet-socket.delta.exchange",
    },
    "bitget": {
        "rest": "https://api-demo.bitget.com",
        "ws": "wss://ws-demo.bitget.com/v2/ws/public",
    },
    "kucoin": {
        "rest": "https://api-sandbox.kucoin.com",
        "ws": "wss://sandbox-ws-api.kucoin.com/endpoint",
        "requires_paper_fallback": "True",
    },
}
