"""Runtime safety guardrails and non-negotiable assertions for the Funding Rate Swarm.
"""

from __future__ import annotations

import logging
import math
import re
from typing import Any
from urllib.parse import urlparse

from src.core.config import AppConfig, RiskConfig
from src.core.constants import (
    MAINNET_URL_PATTERNS,
    AgentPersona,
)
from src.core.exceptions import (
    InvalidRiskCapsException,
    LiveTradingForbiddenException,
    MainnetEndpointDetectedException,
    ToSComplianceException,
    UnreviewedCodeException,
)

logger = logging.getLogger(__name__)

# Disallowed keywords and patterns representing illegal/manipulative trading behaviors
PROHIBITED_TOS_PATTERNS = [
    r"\bspoofing\b",
    r"\bwash[\s_-]*trading\b",
    r"\bfront[\s_-]*running\b",
    r"\bmarket[\s_-]*manipulation\b",
    r"\bquote[\s_-]*stuffing\b",
    r"\bexploit[\s_-]*user\b",
    r"\bexploit[\s_-]*vulnerability\b",
    r"\bddos\b",
    r"\btoxic[\s_-]*order[\s_-]*flow\b",
]


def assert_testnet_url(url: str) -> None:
    """Scans URL hostname for mainnet domains/patterns and asserts that it points to a testnet/sandbox.

    Raises:
        MainnetEndpointDetectedException: If any mainnet endpoint pattern is detected.
    """
    if not url or not isinstance(url, str):
        return

    clean_url = url.strip()
    if not clean_url:
        return

    parsed = urlparse(clean_url)
    hostname = parsed.hostname
    if not hostname:
        # Handle scheme-less URLs like "fapi.binance.com/v1" or "fapi.binance.com:443"
        parsed = urlparse("//" + clean_url)
        hostname = parsed.hostname

    if not hostname:
        # Fallback if urlparse couldn't extract hostname
        hostname = clean_url.split("/")[0].split(":")[0].split("?")[0].split("#")[0]

    hostname_lower = hostname.lower()

    for pattern in MAINNET_URL_PATTERNS:
        pat_lower = pattern.lower()
        if hostname_lower == pat_lower or hostname_lower.endswith("." + pat_lower):
            msg = f"CRITICAL GUARDRAIL TRIP: Mainnet endpoint detected in URL: '{url}'"
            logger.critical(msg)
            raise MainnetEndpointDetectedException(
                message=msg,
                details={"url": url, "matched_pattern": pattern, "hostname": hostname_lower},
            )


def assert_testnet_config(config: AppConfig | dict[str, Any]) -> None:
    """Recursively validates that no exchange endpoint or connection parameter references mainnet.

    Raises:
        MainnetEndpointDetectedException: If any mainnet endpoint is found.
    """
    if isinstance(config, AppConfig):
        for ex_id, ex_cfg in config.exchanges.items():
            assert_testnet_url(ex_cfg.rest_url)
            assert_testnet_url(ex_cfg.ws_url)
            if not ex_cfg.is_testnet and not ex_cfg.requires_paper_fallback:
                msg = f"Exchange '{ex_id}' is not configured for testnet or paper simulation."
                raise MainnetEndpointDetectedException(message=msg, details={"exchange_id": ex_id})
    elif isinstance(config, dict):
        def _scan_dict(d: dict[str, Any]) -> None:
            for k, v in d.items():
                if isinstance(v, str):
                    if "url" in k.lower() or "endpoint" in k.lower() or "host" in k.lower():
                        assert_testnet_url(v)
                elif isinstance(v, dict):
                    _scan_dict(v)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, dict):
                            _scan_dict(item)
                        elif isinstance(item, str):
                            assert_testnet_url(item)

        _scan_dict(config)


def assert_risk_caps(caps: dict[str, Any] | RiskConfig) -> None:
    """Pre-flight risk cap intake assertion.
    Every idea must carry max_drawdown_pct, position_size_cap_usd, and leverage_cap before entering /audit.

    Raises:
        InvalidRiskCapsException: If any cap is missing, None, non-finite (NaN, inf), or out of safe bounds.
    """
    if caps is None:
        raise InvalidRiskCapsException("Risk caps payload cannot be None.")

    if isinstance(caps, RiskConfig):
        max_dd = caps.max_drawdown_pct
        pos_cap = caps.position_size_cap_usd
        lev_cap = caps.leverage_cap
    elif isinstance(caps, dict):
        required_fields = ["max_drawdown_pct", "position_size_cap_usd", "leverage_cap"]
        missing = [f for f in required_fields if f not in caps or caps[f] is None]
        if missing:
            raise InvalidRiskCapsException(
                f"Missing required risk cap intake fields: {missing}",
                details={"missing_fields": missing},
            )

        try:
            max_dd = float(caps["max_drawdown_pct"])
            pos_cap = float(caps["position_size_cap_usd"])
            lev_cap = float(caps["leverage_cap"])
        except (ValueError, TypeError) as e:
            raise InvalidRiskCapsException(
                f"Risk cap fields must be numeric: {e}",
                details={"raw_caps": caps},
            ) from e
    else:
        raise InvalidRiskCapsException(f"Unsupported risk caps format: {type(caps)}")

    # Non-finite validation (NaN, Inf, -Inf)
    for name, val in [("max_drawdown_pct", max_dd), ("position_size_cap_usd", pos_cap), ("leverage_cap", lev_cap)]:
        if math.isnan(val) or math.isinf(val) or not math.isfinite(val):
            raise InvalidRiskCapsException(
                f"{name} must be a finite number, got {val}",
                details={name: val},
            )

    # Range and safety boundary validation
    if not (0.001 <= max_dd <= 0.50):
        raise InvalidRiskCapsException(
            f"max_drawdown_pct must be between 0.1% (0.001) and 50% (0.50), got {max_dd}",
            details={"max_drawdown_pct": max_dd},
        )

    if pos_cap <= 0.0:
        raise InvalidRiskCapsException(
            f"position_size_cap_usd must be positive, got {pos_cap}",
            details={"position_size_cap_usd": pos_cap},
        )

    if not (1.0 <= lev_cap <= 10.0):
        raise InvalidRiskCapsException(
            f"leverage_cap must be between 1.0x and 10.0x, got {lev_cap}",
            details={"leverage_cap": lev_cap},
        )


def assert_live_switch_locked(is_live: bool) -> None:
    """Verifies that the 'Arm for live trading' switch remains locked (False).
    Custody belongs to Agent DELTA / Human Overseer. Agents cannot enable live trading.

    Raises:
        LiveTradingForbiddenException: If is_live is True.
    """
    if is_live:
        msg = (
            "CRITICAL SECURITY GUARDRAIL: Live trading switch is engaged or requested. "
            "Autonomous swarm execution is restricted to Testnet and Paper simulation only."
        )
        logger.critical(msg)
        raise LiveTradingForbiddenException(message=msg)


def assert_tos_compliance(content: dict[str, Any] | str) -> None:
    """Compliance and legality screen against predatory or exchange ToS-violating mechanics.

    Raises:
        ToSComplianceException: If prohibited patterns or terms are found in strategy description/logic.
    """
    text = ""
    if isinstance(content, str):
        text = content
    elif isinstance(content, dict):
        text = " ".join(str(v) for v in content.values())

    for pattern in PROHIBITED_TOS_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            msg = f"ToS & Compliance Screen Failed: Prohibited behavior pattern detected: '{match.group(0)}'"
            logger.error(msg)
            raise ToSComplianceException(
                message=msg,
                details={"matched_pattern": pattern, "match": match.group(0)},
            )


def assert_reviewed_code(
    package_name: str,
    reviewer_agent: str,
    review_notes: str,
    is_reviewed: bool = False,
) -> None:
    """Reviewed-Code Assertion (DELTA-owned).
    Any 3rd-party package or external code pulled must be reviewed and certified by DELTA
    before wiring into order or key paths.

    Raises:
        UnreviewedCodeException: If unreviewed code is passed without DELTA certification.
    """
    if not is_reviewed:
        msg = f"Reviewed-Code Guardrail: Package '{package_name}' has not been security-certified."
        logger.error(msg)
        raise UnreviewedCodeException(
            message=msg,
            details={"package_name": package_name, "is_reviewed": False},
        )

    if reviewer_agent != AgentPersona.DELTA.value and reviewer_agent != AgentPersona.OVERSEER.value:
        msg = f"Reviewed-Code Guardrail: Only DELTA or OVERSEER can certify external code, got '{reviewer_agent}'."
        logger.error(msg)
        raise UnreviewedCodeException(
            message=msg,
            details={"package_name": package_name, "reviewer_agent": reviewer_agent},
        )

    if not review_notes or len(review_notes.strip()) < 10:
        msg = f"Reviewed-Code Guardrail: Meaningful review notes required for '{package_name}'."
        raise UnreviewedCodeException(
            message=msg,
            details={"package_name": package_name, "review_notes": review_notes},
        )


class GuardrailValidator:
    """Unified runtime validator interface for pre-flight and execution checks."""

    @staticmethod
    def validate_preflight(config: AppConfig) -> None:
        assert_testnet_config(config)
        assert_risk_caps(config.risk)
        assert_live_switch_locked(config.is_live_armed)

    @staticmethod
    def validate_idea_intake(idea_metadata: dict[str, Any]) -> None:
        assert_tos_compliance(idea_metadata)
        assert_risk_caps(idea_metadata)
