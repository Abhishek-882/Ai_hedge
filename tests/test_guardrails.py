"""Unit tests for Runtime Guardrails, Testnet Assertions, Risk Caps, and Security Screens.
"""

import pytest

from src.core.config import AppConfig, ExchangeConfig, RiskConfig
from src.core.constants import AgentPersona
from src.core.exceptions import (
    InvalidRiskCapsException,
    LiveTradingForbiddenException,
    MainnetEndpointDetectedException,
    ToSComplianceException,
    UnreviewedCodeException,
)
from src.core.guardrails import (
    GuardrailValidator,
    assert_live_switch_locked,
    assert_reviewed_code,
    assert_risk_caps,
    assert_testnet_config,
    assert_testnet_url,
    assert_tos_compliance,
)


class TestTestnetGuardrails:
    """Test suite for Testnet-Only URL and configuration assertions."""

    @pytest.mark.parametrize(
        "valid_url",
        [
            "https://testnet.binancefuture.com",
            "wss://stream.binancefuture.com/ws",
            "https://api-testnet.bybit.com",
            "wss://stream-testnet.bybit.com/v5/public/linear",
            "https://testnet-api.delta.exchange",
            "https://api-sandbox.kucoin.com",
            "http://localhost:8080",
        ],
    )
    def test_valid_testnet_urls_pass(self, valid_url: str):
        """Assert that recognized testnet and sandbox URLs pass without raising exceptions."""
        assert_testnet_url(valid_url)

    @pytest.mark.parametrize(
        "mainnet_url",
        [
            "https://fapi.binance.com",
            "https://api.binance.com/api/v3/ticker",
            "https://api.bybit.com/v5/market/tickers",
            "https://api.kucoin.com",
            "https://api.delta.exchange/v2/tickers",
            "https://api.india.delta.exchange",
            "https://api.okx.com",
            "https://api.coinbase.com",
            "https://api.kraken.com",
            "https://dapi.binance.com",
            "HTTPS://FAPI.BINANCE.COM/FAPI/V1/ORDER",  # Case insensitive
        ],
    )
    def test_mainnet_urls_trip_assertion(self, mainnet_url: str):
        """Assert that known mainnet endpoints raise MainnetEndpointDetectedException."""
        with pytest.raises(MainnetEndpointDetectedException) as exc_info:
            assert_testnet_url(mainnet_url)
        assert "Mainnet endpoint detected" in str(exc_info.value)

    def test_app_config_with_mainnet_trips(self, valid_app_config: AppConfig):
        """Assert that an AppConfig containing a mainnet URL in any exchange fails validation."""
        valid_app_config.exchanges["binance"].rest_url = "https://fapi.binance.com"
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_config(valid_app_config)

    def test_nested_dict_with_mainnet_trips(self):
        """Assert that nested dictionary configs with mainnet endpoints are caught."""
        nested_config = {
            "services": {
                "feed": {
                    "exchange_endpoint": "https://api.bybit.com/v5/order"
                }
            }
        }
        with pytest.raises(MainnetEndpointDetectedException):
            assert_testnet_config(nested_config)


class TestRiskCapIntakeGuardrails:
    """Test suite for Pre-Flight Risk Cap Intake assertion."""

    def test_valid_risk_caps_dict_passes(self, valid_risk_caps: dict[str, float]):
        """Assert that valid risk cap parameters pass."""
        assert_risk_caps(valid_risk_caps)

    def test_valid_risk_config_object_passes(self):
        """Assert that a valid RiskConfig dataclass passes."""
        config = RiskConfig(
            max_drawdown_pct=0.05,
            position_size_cap_usd=3000.0,
            leverage_cap=2.5,
        )
        assert_risk_caps(config)

    @pytest.mark.parametrize(
        "missing_key",
        ["max_drawdown_pct", "position_size_cap_usd", "leverage_cap"],
    )
    def test_missing_required_cap_field_raises(self, valid_risk_caps: dict[str, float], missing_key: str):
        """Assert that omitting any required cap field raises InvalidRiskCapsException."""
        invalid_caps = valid_risk_caps.copy()
        del invalid_caps[missing_key]
        with pytest.raises(InvalidRiskCapsException) as exc_info:
            assert_risk_caps(invalid_caps)
        assert "Missing required risk cap intake fields" in str(exc_info.value)

    @pytest.mark.parametrize(
        "invalid_field,invalid_val",
        [
            ("max_drawdown_pct", 0.0),       # Below min 0.001
            ("max_drawdown_pct", 0.75),      # Above max 0.50
            ("max_drawdown_pct", -0.05),     # Negative
            ("position_size_cap_usd", 0.0),  # Zero size
            ("position_size_cap_usd", -500), # Negative size
            ("leverage_cap", 0.5),           # Below 1.0x
            ("leverage_cap", 25.0),          # Above 10.0x
            ("max_drawdown_pct", "invalid"), # Non-numeric
        ],
    )
    def test_out_of_bounds_risk_caps_raise(
        self,
        valid_risk_caps: dict[str, float],
        invalid_field: str,
        invalid_val: any,
    ):
        """Assert that out-of-bounds or non-numeric risk caps raise InvalidRiskCapsException."""
        invalid_caps = valid_risk_caps.copy()
        invalid_caps[invalid_field] = invalid_val
        with pytest.raises(InvalidRiskCapsException):
            assert_risk_caps(invalid_caps)

    def test_none_caps_raises(self):
        """Assert that passing None raises InvalidRiskCapsException."""
        with pytest.raises(InvalidRiskCapsException):
            assert_risk_caps(None)


class TestLiveTradingSwitchGuardrails:
    """Test suite for 'Arm for live trading' switch lockout."""

    def test_live_switch_locked_by_default(self):
        """Assert that is_live=False passes without error."""
        assert_live_switch_locked(is_live=False)

    def test_live_switch_armed_raises(self):
        """Assert that attempting is_live=True raises LiveTradingForbiddenException."""
        with pytest.raises(LiveTradingForbiddenException) as exc_info:
            assert_live_switch_locked(is_live=True)
        assert "Live trading switch is engaged" in str(exc_info.value)


class TestToSComplianceGuardrails:
    """Test suite for ToS and Anti-Manipulation screen."""

    def test_clean_strategy_passes(self):
        """Assert that compliant strategy descriptions pass."""
        clean_strategy = {
            "name": "Cross-Exchange Funding Spread Capture",
            "description": "Exploits divergence in 8h perpetual funding rates between Binance and Bybit via delta-neutral execution.",
        }
        assert_tos_compliance(clean_strategy)

    @pytest.mark.parametrize(
        "prohibited_term",
        [
            "High-frequency spoofing on illiquid books",
            "Wash trading across paired sub-accounts",
            "Front-running incoming retail market orders",
            "Market manipulation to artificially inflate index price",
            "Quote stuffing to choke exchange matching engine",
            "Exploit user margin liquidations via toxic order flow",
            "Execute ddos attack against exchange gateway",
        ],
    )
    def test_prohibited_mechanics_raise_tos_exception(self, prohibited_term: str):
        """Assert that strategies mentioning manipulative or predatory tactics are rejected."""
        with pytest.raises(ToSComplianceException) as exc_info:
            assert_tos_compliance(prohibited_term)
        assert "ToS & Compliance Screen Failed" in str(exc_info.value)


class TestReviewedCodeGuardrails:
    """Test suite for DELTA-owned Reviewed-Code Assertion."""

    def test_valid_delta_review_passes(self):
        """Assert that a certified review by Agent DELTA passes."""
        assert_reviewed_code(
            package_name="ccxt",
            reviewer_agent=AgentPersona.DELTA.value,
            review_notes="Verified official PyPI release signature. Security audited order routing and rate limiter.",
            is_reviewed=True,
        )

    def test_unreviewed_code_raises(self):
        """Assert that unreviewed code raises UnreviewedCodeException."""
        with pytest.raises(UnreviewedCodeException) as exc_info:
            assert_reviewed_code(
                package_name="custom_fast_router",
                reviewer_agent=AgentPersona.DELTA.value,
                review_notes="Pending audit",
                is_reviewed=False,
            )
        assert "has not been security-certified" in str(exc_info.value)

    def test_non_delta_reviewer_raises(self):
        """Assert that certification by unauthorized agents (e.g. ALPHA, BETA) is rejected."""
        with pytest.raises(UnreviewedCodeException) as exc_info:
            assert_reviewed_code(
                package_name="fast_ccxt",
                reviewer_agent=AgentPersona.ALPHA.value,
                review_notes="Looks good and runs very fast in backtests.",
                is_reviewed=True,
            )
        assert "Only DELTA or OVERSEER can certify external code" in str(exc_info.value)

    def test_empty_review_notes_raises(self):
        """Assert that insufficient review notes raise UnreviewedCodeException."""
        with pytest.raises(UnreviewedCodeException) as exc_info:
            assert_reviewed_code(
                package_name="ccxt",
                reviewer_agent=AgentPersona.DELTA.value,
                review_notes="ok",  # Too short
                is_reviewed=True,
            )
        assert "Meaningful review notes required" in str(exc_info.value)


class TestGuardrailValidator:
    """Test suite for unified GuardrailValidator."""

    def test_validate_preflight_success(self, valid_app_config: AppConfig):
        """Assert that a fully valid AppConfig passes pre-flight checks."""
        GuardrailValidator.validate_preflight(valid_app_config)

    def test_validate_idea_intake_success(self, valid_risk_caps: dict[str, float]):
        """Assert that a compliant idea with valid risk caps passes intake validation."""
        idea_payload = {
            "name": "Spot-Perp Carry",
            "description": "Standard cash-and-carry delta neutral trade",
            **valid_risk_caps,
        }
        GuardrailValidator.validate_idea_intake(idea_payload)
