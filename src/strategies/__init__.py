"""Quantitative Research and Execution Strategies Package.
Exports all 5 core research strategies for the Multi-Agent Funding-Rate Swarm.
"""

from src.strategies.idea_01_cash_and_carry import CashAndCarryStrategy
from src.strategies.idea_02_rate_momentum import RateMomentumSizingStrategy
from src.strategies.idea_03_cross_exchange import CrossExchangeFundingStrategy
from src.strategies.idea_04_ml_prediction import MLRatePredictionStrategy
from src.strategies.idea_rs_ou_mean_reversion import OUMeanReversionStrategy

__all__ = [
    "CashAndCarryStrategy",
    "RateMomentumSizingStrategy",
    "CrossExchangeFundingStrategy",
    "MLRatePredictionStrategy",
    "OUMeanReversionStrategy",
]
