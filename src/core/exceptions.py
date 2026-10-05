"""Custom exception hierarchy for the Funding Rate Research Swarm.
"""


class FundingRateBotException(Exception):
    """Base exception for all Funding Rate Bot errors."""

    def __init__(self, message: str = "", details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}

    def __str__(self) -> str:
        if self.details:
            return f"{self.message} | Details: {self.details}"
        return self.message


# ---------------------------------------------------------------------------
# Guardrail Exceptions
# ---------------------------------------------------------------------------

class GuardrailException(FundingRateBotException):
    """Base exception for runtime safety guardrail violations."""
    pass


class MainnetEndpointDetectedException(GuardrailException):
    """Raised when a non-testnet / mainnet endpoint URL or configuration is detected."""
    pass


class InvalidRiskCapsException(GuardrailException):
    """Raised when risk cap parameters (max_drawdown_pct, position_size_cap_usd, leverage_cap) are invalid or missing."""
    pass


class LiveTradingForbiddenException(GuardrailException):
    """Raised when live trading execution is attempted while the live switch is locked."""
    pass


class ToSComplianceException(GuardrailException):
    """Raised when strategy or trade logic violates ToS or anti-manipulation screens (e.g. spoofing, wash trading)."""
    pass


class UnreviewedCodeException(GuardrailException):
    """Raised when unreviewed third-party code is routed to order/key paths without DELTA review."""
    pass


# ---------------------------------------------------------------------------
# Storage Exceptions
# ---------------------------------------------------------------------------

class StorageException(FundingRateBotException):
    """Base exception for SQLite storage and persistence failures."""
    pass


class DatabaseLockedException(StorageException):
    """Raised when SQLite database exceeds busy timeout and remains locked."""
    pass


class RecordNotFoundException(StorageException):
    """Raised when a queried entity or record does not exist."""
    pass


class SchemaMigrationException(StorageException):
    """Raised when SQLite schema initialization or migration fails."""
    pass


# ---------------------------------------------------------------------------
# IPC & State Machine Exceptions
# ---------------------------------------------------------------------------

class IPCException(FundingRateBotException):
    """Base exception for inter-agent communication and state machine violations."""
    pass


class InvalidAgentMemoException(IPCException):
    """Raised when an Agent Memo fails syntax, required fields, or signature validation."""
    pass


class InvalidStateTransitionException(IPCException):
    """Raised when an unauthorized idea directory transition is attempted."""
    pass


class UnauthorizedAgentException(IPCException):
    """Raised when an agent attempts an action outside its defined mandate/role."""
    pass


class StateRollbackException(IPCException):
    """Raised when DELTA forces a state rollback on unauthorized directory movement."""
    pass


# ---------------------------------------------------------------------------
# Risk & Execution Exceptions
# ---------------------------------------------------------------------------

class RiskException(FundingRateBotException):
    """Base exception for risk checks and watchdog triggers."""
    pass


class KillSwitchLockedException(RiskException):
    """Raised when the kill-switch latch or database state prevents system startup/trading."""
    pass


class LiquidationBufferBreachException(RiskException):
    """Raised when position liquidation distance falls below safety buffer (e.g. <35%)."""
    pass


class MaxDrawdownExceededException(RiskException):
    """Raised when cumulative drawdown exceeds the global or strategy cap."""
    pass


class DesyncWatchdogTimeoutException(RiskException):
    """Raised when execution leg fill gap exceeds the watchdog timeout window."""
    pass


# ---------------------------------------------------------------------------
# Exchange Exceptions
# ---------------------------------------------------------------------------

class ExchangeException(FundingRateBotException):
    """Base exception for exchange connectivity and order routing issues."""
    pass


class ExchangeConnectionException(ExchangeException):
    """Raised when connection to an exchange endpoint fails or times out."""
    pass


class RateLimitExceededException(ExchangeException):
    """Raised when API request rate limits are breached."""
    pass


class OrderExecutionException(ExchangeException):
    """Raised when an order placement, cancel, or modify fails."""
    pass
