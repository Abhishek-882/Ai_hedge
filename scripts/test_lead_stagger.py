import time
import hmac
import hashlib
import base64
import json
import urllib.parse
import threading
import requests

BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU"
BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h"
BINANCE_URL = "https://demo-fapi.binance.com"

BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05"
BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6"
BITGET_PASSPHRASE = "ArbitrageBot2027"
BITGET_URL = "https://api.bitget.com"

def get_rtt_estimates():
    t0 = time.perf_counter()
    r = requests.get(f"{BINANCE_URL}/fapi/v1/time")
    b_rtt = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    r_bg = requests.get(f"{BITGET_URL}/api/v2/public/time")
    bg_rtt = (time.perf_counter() - t0) * 1000
    
    bg_server_time = r_bg.json()["data"]["serverTime"]
    bg_offset = int(bg_server_time) - int(time.time() * 1000)
    return b_rtt, bg_rtt, bg_offset

def execute_staggered_hedge(b_rtt, bg_rtt, bg_offset, qty=0.005):
    # Stagger calculation
    rtt_diff = bg_rtt - b_rtt # e.g. 450 - 630 = -180ms
    b_delay = 0.0
    bg_delay = 0.0
    if rtt_diff < 0:
        bg_delay = (-rtt_diff) / 1000.0 # delay Bitget in seconds
    else:
        b_delay = rtt_diff / 1000.0

    print(f"RTTs: Binance={b_rtt:.1f}ms, Bitget={bg_rtt:.1f}ms. Delaying Bitget by {bg_delay*1000:.1f}ms")

    results = {}
    threads = []

    def run_binance():
        if b_delay > 0:
            time.sleep(b_delay)
        t_start = time.perf_counter()
        # time sync
        ts = int(time.time() * 1000)
        params = {
            "symbol": "BTCUSDT",
            "side": "SELL",
            "type": "MARKET",
            "quantity": f"{qty:.3f}",
            "timestamp": ts,
            "recvWindow": 50000
        }
        qs = urllib.parse.urlencode(params)
        sig = hmac.new(BINANCE_SECRET.encode(), qs.encode(), hashlib.sha256).hexdigest()
        r = requests.post(f"{BINANCE_URL}/fapi/v1/order?{qs}&signature={sig}", headers={"X-MBX-APIKEY": BINANCE_KEY})
        t_ack = time.perf_counter()
        results["binance"] = {
            "ack": t_ack,
            "rtt": (t_ack - t_start) * 1000,
            "status": r.status_code,
            "orderId": r.json().get("orderId")
        }

    def run_bitget():
        if bg_delay > 0:
            time.sleep(bg_delay)
        t_start = time.perf_counter()
        ts = str(int(time.time() * 1000) + bg_offset)
        payload = {
            "category": "USDT-FUTURES",
            "symbol": "BTCUSDT",
            "side": "buy",
            "orderType": "market",
            "tradeSide": "open",
            "posSide": "long",
            "qty": f"{qty:.3f}"
        }
        body = json.dumps(payload)
        path = "/api/v3/trade/place-order"
        msg = f"{ts}POST{path}{body}"
        sig = base64.b64encode(hmac.new(BITGET_SECRET.encode(), msg.encode(), hashlib.sha256).digest()).decode()
        h = {
            "Content-Type": "application/json",
            "ACCESS-KEY": BITGET_KEY,
            "ACCESS-SIGN": sig,
            "ACCESS-TIMESTAMP": ts,
            "ACCESS-PASSPHRASE": BITGET_PASSPHRASE,
            "paptrading": "1"
        }
        r = requests.post(f"{BITGET_URL}{path}", headers=h, data=body)
        t_ack = time.perf_counter()
        data_obj = r.json().get("data") or {}
        results["bitget"] = {
            "ack": t_ack,
            "rtt": (t_ack - t_start) * 1000,
            "status": r.status_code,
            "orderId": data_obj.get("orderId")
        }


    t1 = threading.Thread(target=run_binance)
    t2 = threading.Thread(target=run_bitget)
    t1.start()
    t2.start()
    t1.join()
    t2.join()

    delta_ms = abs(results["binance"]["ack"] - results["bitget"]["ack"]) * 1000
    print(f"Results: Binance Order {results['binance']['orderId']} (RTT: {results['binance']['rtt']:.1f}ms)")
    print(f"         Bitget Order  {results['bitget']['orderId']} (RTT: {results['bitget']['rtt']:.1f}ms)")
    print(f" -> EMPIRICAL ARRIVAL GAP (DELTA): {delta_ms:.2f} ms")

    # Cleanup: close positions
    time.sleep(1)
    close_binance = requests.post(
        f"{BINANCE_URL}/fapi/v1/order?symbol=BTCUSDT&side=BUY&type=MARKET&quantity={qty:.3f}&reduceOnly=true&timestamp={int(time.time()*1000)}&recvWindow=50000&signature=" +
        hmac.new(BINANCE_SECRET.encode(), f"symbol=BTCUSDT&side=BUY&type=MARKET&quantity={qty:.3f}&reduceOnly=true&timestamp={int(time.time()*1000)}&recvWindow=50000".encode(), hashlib.sha256).hexdigest(),
        headers={"X-MBX-APIKEY": BINANCE_KEY}
    )
    ts = str(int(time.time() * 1000) + bg_offset)
    close_payload = json.dumps({"category": "USDT-FUTURES", "symbol": "BTCUSDT", "side": "sell", "orderType": "market", "tradeSide": "close", "posSide": "long", "qty": f"{qty:.3f}"})
    close_sig = base64.b64encode(hmac.new(BITGET_SECRET.encode(), f"{ts}POST/api/v3/trade/place-order{close_payload}".encode(), hashlib.sha256).digest()).decode()
    requests.post(f"{BITGET_URL}/api/v3/trade/place-order", headers={"Content-Type": "application/json", "ACCESS-KEY": BITGET_KEY, "ACCESS-SIGN": close_sig, "ACCESS-TIMESTAMP": ts, "ACCESS-PASSPHRASE": BITGET_PASSPHRASE, "paptrading": "1"}, data=close_payload)
    print("Cleanup close executed.")
    return delta_ms

if __name__ == "__main__":
    b_rtt, bg_rtt, bg_offset = get_rtt_estimates()
    execute_staggered_hedge(b_rtt, bg_rtt, bg_offset)

