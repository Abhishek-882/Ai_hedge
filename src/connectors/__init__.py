"""Exchange Connectors Package for Multi-Agent Funding-Rate Research Swarm.
"""

from src.connectors.base import BaseExchangeConnector
from src.connectors.binance import BinanceConnector
from src.connectors.bitget import BitgetConnector
from src.connectors.bybit import BybitConnector
from src.connectors.delta_india import DeltaIndiaConnector
from src.connectors.paper_mock import PaperMockConnector

__all__ = [
    "BaseExchangeConnector",
    "BinanceConnector",
    "BitgetConnector",
    "BybitConnector",
    "DeltaIndiaConnector",
    "PaperMockConnector",
]
