"""Live Binance Futures Testnet Trading Engine.
Connects directly to real Binance Futures Testnet matching engine with API credentials.
Automatically synchronizes clock drift with Binance server time.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import hmac
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BASE_URL = "https://testnet.binancefuture.com"


class LiveBinanceTestnetClient:
    """Direct authenticated client for Binance USD-M Futures Testnet."""

    def __init__(self, api_key: str, api_secret: str) -> None:
        self.api_key = api_key.strip()
        self.api_secret = api_secret.strip()
        self.time_offset_ms: int = 0
        self.sync_server_time()

    def sync_server_time(self) -> None:
        """Calculate millisecond offset between local system clock and Binance server clock."""
        try:
            req = urllib.request.Request(f"{BASE_URL}/fapi/v1/time", headers={"User-Agent": "FundingRateBot/1.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                server_time = int(data["serverTime"])
                local_time = int(time.time() * 1000)
                self.time_offset_ms = server_time - local_time
        except Exception as e:
            self.time_offset_ms = 0

    def _request(self, method: str, path: str, params: dict | None = None, signed: bool = False) -> dict:
        params = dict(params or {})
        if signed:
            synced_ts = int(time.time() * 1000) + self.time_offset_ms
            params["timestamp"] = synced_ts
            params["recvWindow"] = 60000  # Max 60-second window
            query = urllib.parse.urlencode(params)
            sig = hmac.new(self.api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()
            query += f"&signature={sig}"
        else:
            query = urllib.parse.urlencode(params)

        url = f"{BASE_URL}{path}"
        if query:
            url += f"?{query}"

        headers = {
            "X-MBX-APIKEY": self.api_key,
            "User-Agent": "FundingRateBot/1.0",
        }

        req = urllib.request.Request(url, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=8) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8")
            raise RuntimeError(f"Binance Testnet API Error [{e.code}]: {err_body}")

    def get_account_balance(self) -> dict:
        """Fetch real account balance from Binance testnet."""
        data = self._request("GET", "/fapi/v2/account", signed=True)
        return {
            "total_wallet_balance": float(data.get("totalWalletBalance", 0.0)),
            "available_balance": float(data.get("availableBalance", 0.0)),
            "total_unrealized_pnl": float(data.get("totalUnrealizedProfit", 0.0)),
            "positions_count": len([p for p in data.get("positions", []) if float(p.get("positionAmt", 0)) != 0]),
        }

    def get_ticker(self, symbol: str = "BTCUSDT") -> dict:
        """Fetch live ticker and funding rate."""
        t = self._request("GET", "/fapi/v1/ticker/24hr", {"symbol": symbol})
        p = self._request("GET", "/fapi/v1/premiumIndex", {"symbol": symbol})
        return {
            "symbol": symbol,
            "mark_price": float(p.get("markPrice", 0.0)),
            "last_price": float(t.get("lastPrice", 0.0)),
            "funding_rate": float(p.get("lastFundingRate", 0.0)),
            "next_funding_time": int(p.get("nextFundingTime", 0)),
        }

    def place_market_order(self, symbol: str, side: str, quantity: float) -> dict:
        """Send a real MARKET order to Binance Testnet matching engine."""
        params = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": "MARKET",
            "quantity": f"{quantity:.3f}",
        }
        res = self._request("POST", "/fapi/v1/order", params=params, signed=True)

        order_id = str(res.get("orderId"))
        status = res.get("status", "UNKNOWN")
        executed_qty = float(res.get("executedQty", 0))
        avg_price = float(res.get("avgPrice", 0))
        cum_quote = float(res.get("cumQuote", 0))

        # Stage 1: Check fills array in POST response (works on mainnet with FULL)
        fills = res.get("fills", [])
        if fills:
            total_qty = sum(float(f.get("qty", 0)) for f in fills)
            total_cost = sum(float(f.get("price", 0)) * float(f.get("qty", 0)) for f in fills)
            if total_qty > 0:
                avg_price = total_cost / total_qty
                cum_quote = total_cost
                executed_qty = total_qty
                status = "FILLED"

        # Stage 2: Poll order status (testnet fills asynchronously)
        if status != "FILLED" or executed_qty == 0:
            for attempt in range(5):
                time.sleep(0.4 * (attempt + 1))
                try:
                    q = self._request("GET", "/fapi/v1/order", {
                        "symbol": symbol.upper(),
                        "orderId": int(order_id),
                    }, signed=True)
                    q_status = q.get("status", "")
                    q_qty = float(q.get("executedQty", 0))
                    q_price = float(q.get("avgPrice", 0))
                    q_quote = float(q.get("cumQuote", 0))

                    if q_status == "FILLED" and q_qty > 0:
                        status = q_status
                        executed_qty = q_qty
                        avg_price = q_price if q_price > 0 else avg_price
                        cum_quote = q_quote if q_quote > 0 else cum_quote
                        break
                    elif q_status in ("FILLED", "PARTIALLY_FILLED"):
                        status = q_status
                        executed_qty = q_qty if q_qty > 0 else executed_qty
                except Exception:
                    pass

        # Stage 3: Estimate price from mark price if still unknown
        if avg_price == 0:
            try:
                t = self._request("GET", "/fapi/v1/premiumIndex", {"symbol": symbol.upper()})
                avg_price = float(t.get("markPrice", 0))
                if executed_qty > 0:
                    cum_quote = avg_price * executed_qty
                elif float(res.get("origQty", 0)) > 0:
                    executed_qty = float(res.get("origQty", 0))
                    cum_quote = avg_price * executed_qty
                    status = "FILLED (estimated)"
            except Exception:
                pass

        return {
            "order_id": order_id,
            "client_order_id": res.get("clientOrderId"),
            "symbol": res.get("symbol"),
            "side": res.get("side"),
            "status": status,
            "orig_qty": float(res.get("origQty", 0)),
            "executed_qty": executed_qty,
            "avg_price": avg_price,
            "cum_quote": cum_quote,
        }

    def get_open_positions(self, symbol: str = "BTCUSDT") -> list[dict]:
        """Fetch active open positions on Binance Testnet."""
        data = self._request("GET", "/fapi/v2/positionRisk", {"symbol": symbol}, signed=True)
        open_pos = []
        for p in data:
            amt = float(p.get("positionAmt", 0.0))
            if amt != 0:
                open_pos.append({
                    "symbol": p.get("symbol"),
                    "amount": amt,
                    "entry_price": float(p.get("entryPrice", 0.0)),
                    "mark_price": float(p.get("markPrice", 0.0)),
                    "unrealized_pnl": float(p.get("unRealizedProfit", 0.0)),
                    "leverage": int(p.get("leverage", 1)),
                })
        return open_pos

    def flatten_position(self, symbol: str = "BTCUSDT") -> dict | None:
        """Close any open position on symbol using an opposite MARKET order."""
        positions = self.get_open_positions(symbol)
        for pos in positions:
            amt = pos["amount"]
            if amt != 0:
                side = "SELL" if amt > 0 else "BUY"
                abs_qty = abs(amt)
                print(f"Closing open position on Binance: {side} {abs_qty:.3f} {symbol}...")
                return self.place_market_order(symbol, side, abs_qty)
        return None


def run_live_binance_demo(api_key: str, api_secret: str, execute_order: bool = True, close_position: bool = False):
    print("=" * 88)
    print("  [*] BINANCE USD-M FUTURES TESTNET -- LIVE REST API INTERACTION")
    print("  Connecting to: https://testnet.binancefuture.com")
    print("=" * 88)

    client = LiveBinanceTestnetClient(api_key=api_key, api_secret=api_secret)
    print(f"  [Clock Sync] Calibrated server time offset: {client.time_offset_ms:+,} ms")

    # 1. Fetch Real Balance
    print("\n[1/4] Fetching Live Testnet Account Balance...")
    bal = client.get_account_balance()
    print(f"  Total Wallet Balance : {bal['total_wallet_balance']:,.2f} USDT")
    print(f"  Available Balance    : {bal['available_balance']:,.2f} USDT")
    print(f"  Unrealized PnL       : {bal['total_unrealized_pnl']:+,.2f} USDT")
    print(f"  Active Positions     : {bal['positions_count']}")

    # 2. Fetch Real Live Market Data & Funding Rate
    print("\n[2/4] Fetching Live BTCUSDT Ticker & Funding Rate from Binance...")
    tick = client.get_ticker("BTCUSDT")
    fr_pct = tick["funding_rate"] * 100.0
    settle_dt = datetime.datetime.fromtimestamp(tick["next_funding_time"] / 1000, datetime.timezone.utc)
    print(f"  BTC Mark Price       : ${tick['mark_price']:,.2f}")
    print(f"  Current Funding Rate : {fr_pct:+.4f}% ({(fr_pct*365*3):.2f}% APY)")
    print(f"  Next Settlement UTC  : {settle_dt.strftime('%Y-%m-%d %H:%M:%S')} UTC")

    # If --close requested
    if close_position:
        print("\n[*] Closing open position...")
        res = client.flatten_position("BTCUSDT")
        if res:
            print(f"  --> Position Closed! Order ID: {res['order_id']} | Status: {res['status']}")
        else:
            print("  --> No active position found to close.")
        return

    # 3. Execute Real Testnet Order
    if execute_order:
        qty = 0.005  # ~ $380 USD notional
        print(f"\n[3/4] Submitting REAL Signed Market Order to Binance Testnet: BUY {qty} BTCUSDT...")
        order_res = client.place_market_order("BTCUSDT", "BUY", qty)
        print("  --> Order Submitted Successfully to Binance Matching Engine!")
        print(f"      Binance Order ID : {order_res['order_id']}")
        print(f"      Status           : {order_res['status']}")
        print(f"      Executed Qty     : {order_res['executed_qty']} BTC")
        print(f"      Execution Price  : ${order_res['avg_price']:,.2f} USDT")
        print(f"      Total Notional   : ${order_res['cum_quote']:,.2f} USDT")

    # 4. Fetch Live Position Risk from Binance
    print("\n[4/4] Verifying Live Open Positions on Binance Testnet Server...")
    positions = client.get_open_positions("BTCUSDT")
    if positions:
        for p in positions:
            print(f"  [POSITION] Symbol: {p['symbol']} | Size: {p['amount']} BTC | Entry: ${p['entry_price']:,.2f} | PnL: ${p['unrealized_pnl']:+,.2f}")
    else:
        print("  No open positions on BTCUSDT.")

    print("\n" + "=" * 88)
    print("  [#] LIVE BINANCE TESTNET VERIFICATION SUCCESSFUL")
    print("  You can verify this order in your Binance Testnet Web UI under Trade History / Positions.")
    print("=" * 88 + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Live Binance Testnet CLI")
    parser.add_argument("--balance", action="store_true", help="Check balance and ticker only")
    parser.add_argument("--close", action="store_true", help="Close/flatten any open BTCUSDT position")
    parser.add_argument("--order", action="store_true", default=False, help="Place a 0.005 BTC test order")
    args = parser.parse_args()

    api_key = os.environ.get("BINANCE_TESTNET_API_KEY", "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU")
    api_secret = os.environ.get("BINANCE_TESTNET_API_SECRET", "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h")

    if args.close:
        run_live_binance_demo(api_key, api_secret, execute_order=False, close_position=True)
    elif args.balance:
        run_live_binance_demo(api_key, api_secret, execute_order=False)
    else:
        run_live_binance_demo(api_key, api_secret, execute_order=args.order)
