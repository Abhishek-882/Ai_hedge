import time
import hmac
import hashlib
import base64
import json
import urllib.parse
import requests

BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU"
BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h"
BINANCE_URL = "https://demo-fapi.binance.com"

BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05"
BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6"
BITGET_PASSPHRASE = "ArbitrageBot2027"
BITGET_URL = "https://api.bitget.com"

def get_binance_time_offset():
    r = requests.get(f"{BINANCE_URL}/fapi/v1/time")
    server_time = r.json()["serverTime"]
    return server_time - int(time.time() * 1000)

def post_binance_order(side, qty=0.005, reduce_only=False):
    offset = get_binance_time_offset()
    ts = int(time.time() * 1000) + offset
    params = {
        "symbol": "BTCUSDT",
        "side": side,
        "type": "MARKET",
        "quantity": f"{qty:.3f}",
        "timestamp": ts,
        "recvWindow": 50000
    }
    if reduce_only:
        params["reduceOnly"] = "true"
    query_str = urllib.parse.urlencode(params)
    signature = hmac.new(BINANCE_SECRET.encode("utf-8"), query_str.encode("utf-8"), hashlib.sha256).hexdigest()
    full_query = f"{query_str}&signature={signature}"
    
    t0 = time.perf_counter()
    r = requests.post(f"{BINANCE_URL}/fapi/v1/order?{full_query}", headers={"X-MBX-APIKEY": BINANCE_KEY})
    elapsed = (time.perf_counter() - t0) * 1000
    return r.status_code, r.json(), elapsed

def post_bitget_order(side, trade_side="open", qty=0.005):
    t_res = requests.get(f"{BITGET_URL}/api/v2/public/time")
    server_time = t_res.json()["data"]["serverTime"]
    timestamp = str(server_time)
    
    pos_side = "long" if ((trade_side == "open" and side == "buy") or (trade_side == "close" and side == "sell")) else "short"
    payload = {
        "category": "USDT-FUTURES",
        "symbol": "BTCUSDT",
        "side": side,
        "orderType": "market",
        "tradeSide": trade_side,
        "posSide": pos_side,
        "qty": f"{qty:.3f}"
    }
    body = json.dumps(payload)
    path = "/api/v3/trade/place-order"
    message = f"{timestamp}POST{path}{body}"
    mac = hmac.new(BITGET_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    sign = base64.b64encode(mac.digest()).decode("utf-8")
    
    headers = {
        "Content-Type": "application/json",
        "ACCESS-KEY": BITGET_KEY,
        "ACCESS-SIGN": sign,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": BITGET_PASSPHRASE,
        "locale": "en-US",
        "paptrading": "1",
        "papertrading": "1"
    }
    
    t0 = time.perf_counter()
    r = requests.post(f"{BITGET_URL}{path}", headers=headers, data=body)
    elapsed = (time.perf_counter() - t0) * 1000
    return r.status_code, r.json(), elapsed

def main():
    print("Testing single Binance order...")
    s_b, j_b, t_b = post_binance_order("BUY", 0.005)
    print(f"Binance BUY order: code={s_b}, RTT={t_b:.1f}ms, orderId={j_b.get('orderId')}")

    print("\nTesting single Bitget order...")
    s_bg, j_bg, t_bg = post_bitget_order("buy", "open", 0.005)
    print(f"Bitget BUY order: code={s_bg}, RTT={t_bg:.1f}ms, orderId={j_bg.get('data', {}).get('orderId')}")

    time.sleep(1)
    print("\nClosing both positions...")
    s_b_c, j_b_c, t_b_c = post_binance_order("SELL", 0.005, reduce_only=True)
    print(f"Binance Close SELL: code={s_b_c}, RTT={t_b_c:.1f}ms, orderId={j_b_c.get('orderId')}")
    s_bg_c, j_bg_c, t_bg_c = post_bitget_order("sell", "close", 0.005)
    print(f"Bitget Close SELL: code={s_bg_c}, RTT={t_bg_c:.1f}ms, orderId={j_bg_c.get('data', {}).get('orderId')}")

if __name__ == "__main__":
    main()
