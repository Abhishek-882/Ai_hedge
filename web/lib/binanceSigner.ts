import crypto from "crypto";

export const TESTNET_ENDPOINTS = [
  "https://testnet.binancefuture.com",
  "https://demo-fapi.binance.com",
];

let activeBaseUrl = TESTNET_ENDPOINTS[0];
let cachedTimeOffsetMs = 0;
let lastSyncTimestamp = 0;

export async function getCalibratedServerOffset(baseUrl: string = activeBaseUrl): Promise<number> {
  const now = Date.now();
  if (now - lastSyncTimestamp < 30000 && cachedTimeOffsetMs !== 0) {
    return cachedTimeOffsetMs;
  }
  try {
    const res = await fetch(`${baseUrl}/fapi/v1/time`, { cache: "no-store" });
    const data = await res.json();
    if (data.serverTime) {
      cachedTimeOffsetMs = Number(data.serverTime) - now;
      lastSyncTimestamp = now;
      activeBaseUrl = baseUrl;
    }
  } catch (err) {
    console.error(`Failed to sync time on ${baseUrl}:`, err);
  }
  return cachedTimeOffsetMs;
}

export async function signAndFetchBinance(
  apiKey: string,
  apiSecret: string,
  method: string,
  path: string,
  params: Record<string, string | number> = {},
  signed = true,
  preferredBaseUrl?: string
): Promise<{ data: any; endpoint: string }> {
  const urlsToTry = preferredBaseUrl
    ? [preferredBaseUrl, ...TESTNET_ENDPOINTS.filter((u) => u !== preferredBaseUrl)]
    : [activeBaseUrl, ...TESTNET_ENDPOINTS.filter((u) => u !== activeBaseUrl)];

  let lastError: Error | null = null;

  for (const baseUrl of urlsToTry) {
    try {
      const cleanParams = { ...params };
      if (signed) {
        const offset = await getCalibratedServerOffset(baseUrl);
        cleanParams.timestamp = Date.now() + offset;
        cleanParams.recvWindow = 60000;

        const queryString = new URLSearchParams(
          Object.entries(cleanParams).map(([k, v]) => [k, String(v)])
        ).toString();

        const signature = crypto
          .createHmac("sha256", apiSecret)
          .update(queryString)
          .digest("hex");

        const fullUrl = `${baseUrl}${path}?${queryString}&signature=${signature}`;
        const res = await fetch(fullUrl, {
          method: method.toUpperCase(),
          headers: {
            "X-MBX-APIKEY": apiKey,
            "User-Agent": "FundingRateBot-NextJS/1.0",
          },
          cache: "no-store",
        });

        const data = await res.json();
        if (!res.ok) {
          const errMsg = data.msg ? `[${data.code}] ${data.msg}` : `HTTP ${res.status}`;
          if (data.code === -2015 && urlsToTry.length > 1) {
            lastError = new Error(errMsg);
            continue;
          }
          throw new Error(errMsg);
        }
        activeBaseUrl = baseUrl;
        return { data, endpoint: baseUrl };
      } else {
        const queryString = new URLSearchParams(
          Object.entries(cleanParams).map(([k, v]) => [k, String(v)])
        ).toString();
        const fullUrl = queryString ? `${baseUrl}${path}?${queryString}` : `${baseUrl}${path}`;
        const res = await fetch(fullUrl, {
          method: method.toUpperCase(),
          headers: {
            "User-Agent": "FundingRateBot-NextJS/1.0",
          },
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.msg || `HTTP ${res.status}`);
        }
        activeBaseUrl = baseUrl;
        return { data, endpoint: baseUrl };
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to communicate with Binance Testnet");
}
