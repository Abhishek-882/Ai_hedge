import time
import hmac
import hashlib
import base64
import json
import requests

API_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05"
API_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6"
PASSPHRASE = "ArbitrageBot2027"
BASE_URL = "https://api.bitget.com"

def get_bitget_headers(method, path_and_query, body=""):
    # sync time
    t_res = requests.get(f"{BASE_URL}/api/v2/public/time")
    server_time = t_res.json()["data"]["serverTime"]
    timestamp = str(server_time)
    
    clean_path = path_and_query
    query_str = ""
    if "?" in path_and_query:
        clean_path, query_str = path_and_query.split("?", 1)
        
    query_part = f"?{query_str}" if query_str else ""
    message = f"{timestamp}{method.upper()}{clean_path}{query_part}{body}"
    mac = hmac.new(API_SECRET.encode("utf-8"), message.encode("utf-8"), hashlib.sha256)
    sign = base64.b64encode(mac.digest()).decode("utf-8")
    
    return {
        "Content-Type": "application/json",
        "ACCESS-KEY": API_KEY,
        "ACCESS-SIGN": sign,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": PASSPHRASE,
        "locale": "en-US",
        "paptrading": "1",
        "papertrading": "1"
    }

def main():
    print("--- 1. Testing GET /api/v3/account/assets ---")
    h1 = get_bitget_headers("GET", "/api/v3/account/assets")
    r1 = requests.get(f"{BASE_URL}/api/v3/account/assets", headers=h1)
    print(r1.status_code, r1.text[:300])

    print("\n--- 2. Testing GET /api/v3/position/current-position?category=USDT-FUTURES&symbol=BTCUSDT ---")
    h2 = get_bitget_headers("GET", "/api/v3/position/current-position?category=USDT-FUTURES&symbol=BTCUSDT")
    r2 = requests.get(f"{BASE_URL}/api/v3/position/current-position?category=USDT-FUTURES&symbol=BTCUSDT", headers=h2)
    print(r2.status_code, r2.text)

    print("\n--- 3. Testing POST /api/v3/trade/place-order (Open Long 0.005) ---")
    payload = {
        "category": "USDT-FUTURES",
        "symbol": "BTCUSDT",
        "side": "buy",
        "orderType": "market",
        "tradeSide": "open",
        "posSide": "long",
        "qty": "0.005"
    }
    body = json.dumps(payload)
    h3 = get_bitget_headers("POST", "/api/v3/trade/place-order", body)
    r3 = requests.post(f"{BASE_URL}/api/v3/trade/place-order", headers=h3, data=body)
    print(r3.status_code, r3.text)

    time.sleep(1)
    print("\n--- 4. Checking Position After Order ---")
    h4 = get_bitget_headers("GET", "/api/v3/position/current-position?category=USDT-FUTURES&symbol=BTCUSDT")
    r4 = requests.get(f"{BASE_URL}/api/v3/position/current-position?category=USDT-FUTURES&symbol=BTCUSDT", headers=h4)
    print(r4.status_code, r4.text)

    time.sleep(1)
    print("\n--- 5. Closing Position (Close Long 0.005) ---")
    close_payload = {
        "category": "USDT-FUTURES",
        "symbol": "BTCUSDT",
        "side": "sell",
        "orderType": "market",
        "tradeSide": "close",
        "posSide": "long",
        "qty": "0.005"
    }
    close_body = json.dumps(close_payload)
    h5 = get_bitget_headers("POST", "/api/v3/trade/place-order", close_body)
    r5 = requests.post(f"{BASE_URL}/api/v3/trade/place-order", headers=h5, data=close_body)
    print(r5.status_code, r5.text)

if __name__ == "__main__":
    main()

