# Agent Memory: Bitget UTA API (`/bitget-uta-api`)

**Agent ID:** `AGENT-BG-02`  
**Target Exchange:** Bitget Unified Trading Account (UTA V3) & V2 Classic  
**API Documentation Skill:** `bitget-uta-api` (v1.0.0)  
**Execution Timestamp:** 2026-10-06T21:51:00+05:30  
**Test Mode:** Demo Paper Trading (`paptrading: 1`, `api.bitget.com`)

---

## 1. Credentials & Account Architecture

| Parameter | Configured Value | Status / Evidence |
| :--- | :--- | :--- |
| **API Key** | `bg_2c493eb64032f2b0aea68c1c18d56e05` | Active |
| **API Secret** | `c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6` | Validated HMAC-SHA256 |
| **Passphrase** | `ArbitrageBot2027` | Verified |
| **Account Mode** | `hybrid`, `multi_assets`, `hedge_mode` | Verified via `/api/v3/account/settings` |
| **Active Base URL** | `https://api.bitget.com` with `paptrading: 1` | Verified |
| **Live Verified Equity**| **$4,997.87 USDT** | Verified via `/api/v3/account/assets` |

---

## 2. Root Cause Diagnoses & Critical Findings

### Issue A: `Bitget API Error [40099]: exchange environment is incorrect`
- **Location:** `web/app/page.tsx`, lines 47 & 51.
- **Root Cause:** When `localStorage.getItem("BITGET_ENV")` is empty, the frontend defaults to `"live"`:
  ```typescript
  const bitgetEnv = localStorage.getItem("BITGET_ENV") || "live";
  if (bitgetEnv) headers["x-bitget-env"] = bitgetEnv;
  ```
  This causes the browser to explicitly send `x-bitget-env: live` to `/api/bitget/account`, which overrides the server-side default `DEFAULT_BITGET_ENV = "demo"`. Without `paptrading: 1`, demo keys are rejected by Bitget with `40099`.
- **Resolution:** When the user enters the vault or loads presets with `BITGET_ENV = demo`, `paptrading: 1` is correctly appended, and the error disappears immediately.

---

### Issue B: `Bitget Order Rejected [40762]: The order amount exceeds the balance`
- **Location:** `web/lib/bitgetSigner.ts`, lines 241–255 (`placeBitgetOrder`).
- **Code Inspection:**
  ```typescript
  const baseUrl = "https://api.bitget.com";
  const path = "/api/v2/mix/order/place-order";
  const payload = {
    symbol: params.symbol,
    productType: params.productType || "USDT-FUTURES",
    marginMode: params.marginMode || "crossed",
    marginCoin: params.marginCoin || "USDT",
    size: params.size,
    side: params.side,
    orderType: params.orderType,
    tradeSide: params.tradeSide || "open",
  };
  ```
- **Root Cause:** The account is upgraded to **Unified Trading Account (UTA V3)**. Bitget UTA disables classic Mix `/api/v2/mix/order/place-order` order placement, responding with `40762` (order amount exceeds balance) or `40014` (permission denied) because mix balance is 0 (all equity resides in UTA multi-asset margin).
- **The Correct UTA V3 Endpoint:**
  - **Endpoint:** `POST /api/v3/trade/place-order`
  - **Payload Structure:**
    ```json
    {
      "category": "USDT-FUTURES",
      "symbol": "BTCUSDT",
      "side": "buy",
      "orderType": "market",
      "posSide": "long",
      "tradeSide": "open",
      "qty": "0.005"
    }
    ```
- **Live Empirical Proof:**
  - Executed Open Long: `orderId: 1491403306016591873`, status: `00000 success` in 135.3 ms.
  - Executed Close Long: `orderId: 1491403353890377728`, status: `00000 success` in 131.4 ms.
  - Executed 6 benchmark orders with 100% success rate on Bitget UTA Demo.

---

## 3. Order Fill Latency on Bitget UTA

- **Network Roundtrip (India to Bitget Tokyo API gateway):**
  - Order 1: 259.6 ms (cold TCP)
  - Order 2: 135.3 ms (warm keep-alive)
  - Order 3: 144.6 ms
  - Close 1: 146.8 ms
  - Close 2: 131.4 ms
  - Close 3: 168.7 ms
- **Average Fill Ack:** **164.4 ms**
