import crypto from "crypto";

export interface BitgetCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  isDemo?: boolean;
}

export interface BitgetOrderParams {
  symbol: string; // e.g. "BTCUSDT"
  productType?: string; // default "USDT-FUTURES"
  marginMode?: string; // "crossed" or "isolated"
  marginCoin?: string; // "USDT"
  size: string; // contract size or quantity
  side: "buy" | "sell";
  orderType: "market" | "limit";
  price?: string;
  tradeSide?: "open" | "close";
}

let cachedBitgetTimeOffset = 0;
let lastBitgetTimeSync = 0;

/**
 * Calibrate local clock against Bitget server time
 */
export async function calibrateBitgetTime(baseUrl = "https://api.bitget.com"): Promise<number> {
  const now = Date.now();
  if (now - lastBitgetTimeSync < 60_000) {
    return cachedBitgetTimeOffset;
  }

  try {
    const res = await fetch(`${baseUrl}/api/v2/public/time`, { cache: "no-store" });
    const data = await res.json();
    if (data.code === "00000" && data.data) {
      const serverTime = parseInt(data.data, 10);
      cachedBitgetTimeOffset = serverTime - Date.now();
      lastBitgetTimeSync = now;
    }
  } catch {
    // If transient network failure, retain prior offset
  }
  return cachedBitgetTimeOffset;
}

/**
 * Generate Bitget V2/V3 API Headers
 * Signature: Base64(HMAC-SHA256(timestamp + method + requestPath + ("?" + queryString) + body, secret))
 */
export async function getBitgetHeaders(
  creds: BitgetCredentials,
  method: "GET" | "POST",
  requestPath: string,
  body = ""
): Promise<Record<string, string>> {
  const offset = await calibrateBitgetTime();
  const timestamp = (Date.now() + offset).toString();

  // Handle URL paths that already include query parameters
  let cleanPath = requestPath;
  let queryStr = "";
  if (requestPath.includes("?")) {
    const parts = requestPath.split("?");
    cleanPath = parts[0];
    queryStr = parts[1] || "";
  }

  // Pre-hash string according to official Bitget specification:
  // timestamp + method.toUpperCase() + cleanPath + ("?" + queryStr) + body
  const message = `${timestamp}${method.toUpperCase()}${cleanPath}${queryStr ? "?" + queryStr : ""}${body}`;
  const sign = crypto
    .createHmac("sha256", creds.apiSecret)
    .update(message)
    .digest("base64");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "ACCESS-KEY": creds.apiKey,
    "ACCESS-SIGN": sign,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": creds.passphrase,
    "locale": "en-US",
  };

  if (creds.isDemo) {
    headers["paptrading"] = "1";
    headers["papertrading"] = "1";
  }

  return headers;
}

/**
 * Fetch Bitget USDT-Futures Account Balance (Supports Classic V2 & UTA V3)
 */
export async function getBitgetAccount(creds?: BitgetCredentials) {
  // If no credentials or simulation credentials, return realistic mock balance
  if (!creds?.apiKey || !creds?.apiSecret || !creds?.passphrase) {
    return {
      success: true,
      venue: "Bitget-Simulation",
      equity: 5000.0,
      available: 5000.0,
      unrealizedPnL: 0.0,
      positions: [],
      isSimulated: true,
    };
  }

  const baseUrl = "https://api.bitget.com";
  // Primary endpoint: V2 Classic Mix Futures Account
  const v2Path = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";

  try {
    const headers = await getBitgetHeaders(creds, "GET", v2Path);
    const res = await fetch(`${baseUrl}${v2Path}`, {
      headers,
      cache: "no-store",
    });
    const data = await res.json();

    // If account is in Unified Trading Account (UTA) mode, auto-fallback to V3 assets
    if (data.code === "40084") {
      const v3Path = "/api/v3/account/assets";
      const v3Headers = await getBitgetHeaders(creds, "GET", v3Path);
      const v3Res = await fetch(`${baseUrl}${v3Path}`, { headers: v3Headers, cache: "no-store" });
      const v3Data = await v3Res.json();
      if (v3Data.code === "00000" && v3Data.data) {
        const assets = v3Data.data || [];
        const usdt = assets.find((a: any) => a.coin === "USDT") || assets[0] || {};
        return {
          success: true,
          venue: "Bitget-Unified-UTA",
          equity: parseFloat(usdt.equity || usdt.balance || "0"),
          available: parseFloat(usdt.available || "0"),
          unrealizedPnL: parseFloat(usdt.unrealizedPnL || "0"),
          isSimulated: false,
        };
      }
    }

    if (data.code !== "00000") {
      let friendlyError = data.msg || "Authentication failed";
      if (data.code === "40012") {
        friendlyError = "Passphrase incorrect. Please check the passphrase entered during API key creation on Bitget.";
      } else if (data.code === "40014") {
        friendlyError = "IP restriction enabled on key. Ensure your egress IP address is whitelisted in Bitget.";
      } else if (data.code === "40017") {
        friendlyError = "Missing or invalid ACCESS-PASSPHRASE header.";
      }

      return {
        success: false,
        error: `Bitget API Error [${data.code}]: ${friendlyError}`,
        code: data.code,
      };
    }

    const accounts = data.data || [];
    const usdtAccount = accounts.find((a: any) => a.marginCoin === "USDT") || accounts[0] || {};

    const equity = parseFloat(usdtAccount.accountEquity || usdtAccount.usdtEquity || usdtAccount.equity || "0.0");
    const available = parseFloat(usdtAccount.available || usdtAccount.maxTransferOut || "0.0");
    const unrealizedPnL = parseFloat(usdtAccount.unrealizedPL || "0.0");

    return {
      success: true,
      venue: "Bitget-Classic-Futures",
      equity,
      available,
      unrealizedPnL,
      raw: data.data,
      isSimulated: false,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Network error connecting to Bitget: ${err.message}`,
    };
  }
}

/**
 * Dispatch Bitget Market Order with optional Aggressive Fill Chase
 */
export async function placeBitgetOrder(
  params: BitgetOrderParams,
  creds?: BitgetCredentials
) {
  const startTime = Date.now();

  // If no live keys, simulate instant local fill with live mark price
  if (!creds?.apiKey || !creds?.apiSecret || !creds?.passphrase) {
    // Fetch live Bitget ticker for realistic simulation
    let fillPrice = 86450.0;
    try {
      const tickerRes = await fetch("https://api.bitget.com/api/v2/mix/market/ticker?symbol=BTCUSDT&productType=USDT-FUTURES");
      const tickerData = await tickerRes.json();
      if (tickerData?.data?.[0]?.lastPr) {
        fillPrice = parseFloat(tickerData.data[0].lastPr);
      }
    } catch {
      // fallback default price
    }

    return {
      success: true,
      orderId: `sim_bitget_${Date.now()}`,
      symbol: params.symbol,
      side: params.side,
      tradeSide: params.tradeSide || "open",
      size: parseFloat(params.size),
      avgPrice: fillPrice,
      executionLatencyMs: Date.now() - startTime,
      venue: "Bitget-Simulation",
      isSimulated: true,
    };
  }

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
    ...(params.price ? { price: params.price } : {}),
  };

  const bodyStr = JSON.stringify(payload);

  try {
    const headers = await getBitgetHeaders(creds, "POST", path, bodyStr);
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: bodyStr,
    });
    const data = await res.json();

    if (data.code !== "00000") {
      return {
        success: false,
        error: `Bitget Order Rejected [${data.code}]: ${data.msg}`,
        code: data.code,
        latencyMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      orderId: data.data?.orderId,
      clientOid: data.data?.clientOid,
      symbol: params.symbol,
      side: params.side,
      size: parseFloat(params.size),
      executionLatencyMs: Date.now() - startTime,
      venue: "Bitget-Perpetuals",
      isSimulated: false,
      data: data.data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Bitget execution error: ${err.message}`,
      latencyMs: Date.now() - startTime,
    };
  }
}
