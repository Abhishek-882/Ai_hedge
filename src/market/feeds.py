"""Market Feed Collectors, Depth Aggregation, and Cross-Exchange Spread Scanner.
"""

from __future__ import annotations

import datetime
import json
import logging
import time
from typing import Any

from src.connectors.base import BaseExchangeConnector
from src.core.constants import MIN_VIABLE_SPREAD_FLOOR
from src.market.fee_verifier import FeeVerifier
from src.storage.database import DatabaseManager
from src.storage.models import (
    FundingRateModel,
    OrderbookSnapshotModel,
    SpreadOpportunityModel,
    TickerSnapshotModel,
)

logger = logging.getLogger(__name__)


class MarketFeedCollector:
    """Collects multi-exchange tickers, L2 depth snapshots, and funding rates with SQLite persistence."""

    def __init__(
        self,
        connectors: dict[str, BaseExchangeConnector] | list[BaseExchangeConnector],
        db: DatabaseManager | None = None,
        fee_verifier: FeeVerifier | None = None,
    ) -> None:
        if isinstance(connectors, list):
            self.connectors = {c.exchange_id: c for c in connectors}
        else:
            self.connectors = connectors
        self.db = db
        self.fee_verifier = fee_verifier or FeeVerifier()

    def poll_ticker(self, symbol: str, exchange_id: str | None = None) -> list[dict[str, Any]]:
        """Poll ticker snapshots from exchange connectors and persist to SQLite."""
        targets = [self.connectors[exchange_id]] if exchange_id else list(self.connectors.values())
        results = []

        for conn in targets:
            try:
                ticker = conn.fetch_ticker(symbol)
                bid1 = float(ticker.get("bid1_price", 0.0))
                ask1 = float(ticker.get("ask1_price", 0.0))
                mid = (bid1 + ask1) / 2.0 if (bid1 + ask1) > 0 else float(ticker.get("mark_price", 0.0))
                spread_bps = ((ask1 - bid1) / mid) * 10000.0 if mid > 0 else 0.0

                now_ms = int(ticker.get("timestamp_ms", time.time() * 1000))
                mark_p = float(ticker.get("mark_price", mid))
                index_p = float(ticker.get("index_price", mid))
                last_p = float(ticker.get("last_price", mid))

                snapshot_data = {
                    "exchange_id": conn.exchange_id,
                    "symbol": symbol,
                    "timestamp_ms": now_ms,
                    "last_price": last_p,
                    "mark_price": mark_p,
                    "index_price": index_p,
                    "bid1_price": bid1,
                    "ask1_price": ask1,
                    "bid1_qty": float(ticker.get("bid1_qty", 1.0)),
                    "ask1_qty": float(ticker.get("ask1_qty", 1.0)),
                    "spread_bps": round(spread_bps, 4),
                    "est_funding_rate": float(ticker.get("est_funding_rate", 0.00045)),
                    "next_funding_time_ms": int(ticker.get("next_funding_time_ms", now_ms + 8 * 3600 * 1000)),
                }

                if self.db:
                    model = TickerSnapshotModel(**snapshot_data)
                    self.db.insert_ticker_snapshot(model)

                results.append(snapshot_data)
            except Exception as e:
                logger.warning(f"Error polling ticker from {conn.exchange_id} for {symbol}: {e}")

        return results

    def poll_orderbook(self, symbol: str, limit: int = 50, exchange_id: str | None = None) -> list[dict[str, Any]]:
        """Poll L2 orderbook, calculate top 5 and top 20 liquidity depths, and persist."""
        targets = [self.connectors[exchange_id]] if exchange_id else list(self.connectors.values())
        results = []

        for conn in targets:
            try:
                ob = conn.fetch_orderbook(symbol, limit=limit)
                bids = ob.get("bids", [])
                asks = ob.get("asks", [])
                now_ms = int(ob.get("timestamp_ms", time.time() * 1000))

                bid_top5 = sum(p * q for p, q in bids[:5]) if bids else 0.0
                ask_top5 = sum(p * q for p, q in asks[:5]) if asks else 0.0
                bid_top20 = sum(p * q for p, q in bids[:20]) if bids else 0.0
                ask_top20 = sum(p * q for p, q in asks[:20]) if asks else 0.0

                best_bid = bids[0][0] if bids else 0.0
                best_ask = asks[0][0] if asks else 0.0
                mid = (best_bid + best_ask) / 2.0 if (best_bid + best_ask) > 0 else 1.0
                spread_bps = ((best_ask - best_bid) / mid) * 10000.0 if mid > 0 else 0.0

                snapshot_data = {
                    "exchange_id": conn.exchange_id,
                    "symbol": symbol,
                    "timestamp_ms": now_ms,
                    "bid_depth_top5": round(bid_top5, 2),
                    "ask_depth_top5": round(ask_top5, 2),
                    "bid_depth_top20": round(bid_top20, 2),
                    "ask_depth_top20": round(ask_top20, 2),
                    "spread_bps": round(spread_bps, 4),
                    "mid_price": round(mid, 2),
                    "raw_bids_json": json.dumps(bids[:10]),
                    "raw_asks_json": json.dumps(asks[:10]),
                }

                if self.db:
                    model = OrderbookSnapshotModel(**snapshot_data)
                    self.db.insert_orderbook_snapshot(model)

                results.append(snapshot_data)
            except Exception as e:
                logger.warning(f"Error polling orderbook from {conn.exchange_id} for {symbol}: {e}")

        return results

    def poll_funding_rates(self, symbol: str, exchange_id: str | None = None) -> list[dict[str, Any]]:
        """Poll latest funding rate, calculate annualized rate, and persist."""
        targets = [self.connectors[exchange_id]] if exchange_id else list(self.connectors.values())
        results = []

        for conn in targets:
            try:
                fr_info = conn.fetch_current_funding_rate(symbol)
                rate = float(fr_info.get("last_funding_rate", 0.00045))
                now_ms = int(fr_info.get("timestamp_ms", time.time() * 1000))
                next_ts = int(fr_info.get("next_funding_time_ms", now_ms + 8 * 3600 * 1000))
                settle_dt = datetime.datetime.fromtimestamp(next_ts / 1000.0, tz=datetime.timezone.utc)
                settle_str = settle_dt.strftime("%Y-%m-%d %H:%M:%S")

                annualized = rate * 3.0 * 365.0  # 8h funding rate -> APR

                data = {
                    "exchange_id": conn.exchange_id,
                    "symbol": symbol,
                    "timestamp_ms": now_ms,
                    "settlement_time_utc": settle_str,
                    "funding_rate": round(rate, 6),
                    "funding_rate_annualized": round(annualized, 4),
                    "mark_price": float(fr_info.get("mark_price", 65000.0)),
                    "index_price": float(fr_info.get("index_price", 65000.0)),
                    "interest_rate": float(fr_info.get("interest_rate", 0.00010)),
                    "funding_interval_hours": int(fr_info.get("funding_interval_hour", 8)),
                    "source": "rest_snapshot",
                }

                if self.db:
                    model = FundingRateModel(**data)
                    self.db.insert_funding_rate(model)

                results.append(data)
            except Exception as e:
                logger.warning(f"Error polling funding rate from {conn.exchange_id} for {symbol}: {e}")

        return results

    def scan_cross_exchange_spreads(self, symbol: str = "BTCUSDT") -> list[dict[str, Any]]:
        """Compare current funding rates across all connected venues and identify arbitrage opportunities."""
        rates = self.poll_funding_rates(symbol)
        if len(rates) < 2:
            return []

        opportunities = []
        now_ms = int(time.time() * 1000)
        settle_str = rates[0]["settlement_time_utc"]

        # Pairwise comparison
        for i in range(len(rates)):
            for j in range(i + 1, len(rates)):
                r1 = rates[i]
                r2 = rates[j]

                # Determine High funding vs Low funding venue
                if r1["funding_rate"] >= r2["funding_rate"]:
                    high_r, low_r = r1, r2
                else:
                    high_r, low_r = r2, r1

                assessment = self.fee_verifier.evaluate_spread_opportunity(
                    rate_high=high_r["funding_rate"],
                    rate_low=low_r["funding_rate"],
                )

                opp_data = {
                    "timestamp_ms": now_ms,
                    "settlement_time_utc": settle_str,
                    "symbol": symbol,
                    "exchange_long": low_r["exchange_id"],   # Long on low/negative funding venue
                    "exchange_short": high_r["exchange_id"], # Short on high funding venue
                    "rate_long": low_r["funding_rate"],
                    "rate_short": high_r["funding_rate"],
                    "gross_spread": assessment.gross_spread_pct,
                    "total_taker_fee_drag": assessment.total_fee_drag_pct,
                    "est_slippage_drag": assessment.slippage_buffer_pct,
                    "net_expected_yield": assessment.net_expected_yield_pct,
                    "passes_mvs_gate": 1 if assessment.passes_mvs_floor else 0,
                }

                if self.db:
                    model = SpreadOpportunityModel(**opp_data)
                    self.db.insert_spread_opportunity(model)

                opportunities.append(opp_data)

        return opportunities

    def sync_all_market_data(self, symbol: str = "BTCUSDT") -> dict[str, Any]:
        """Execute complete market data synchronization cycle."""
        tickers = self.poll_ticker(symbol)
        orderbooks = self.poll_orderbook(symbol)
        rates = self.poll_funding_rates(symbol)
        spreads = self.scan_cross_exchange_spreads(symbol)

        return {
            "symbol": symbol,
            "tickers_collected": len(tickers),
            "orderbooks_collected": len(orderbooks),
            "funding_rates_collected": len(rates),
            "spread_opportunities_found": len(spreads),
            "timestamp_ms": int(time.time() * 1000),
        }
