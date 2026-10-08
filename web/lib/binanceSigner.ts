import crypto from "crypto";

export const BINANCE_ENDPOINTS = [
  "https://testnet.binancefuture.com",
  "https://demo-fapi.binance.com",
  "https://fapi.binance.com",
];

export const TESTNET_ENDPOINTS = BINANCE_ENDPOINTS;

let activeBaseUrl = BINANCE_ENDPOINTS[0];
let cachedTimeOffsetMs = 0;
let lastSyncTimestamp = 0;

export async function getCalibratedServerOffset(baseUrl: string = activeBaseUrl, forceRefresh = false): Promise<number> {
  const now = Date.now();
  if (!forceRefresh && now - lastSyncTimestamp < 15000 && cachedTimeOffsetMs !== 0) {
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
  const cleanPreferred =
    preferredBaseUrl && preferredBaseUrl !== "auto" && preferredBaseUrl.startsWith("http")
      ? preferredBaseUrl
      : undefined;

  const urlsToTry = cleanPreferred
    ? [cleanPreferred]
    : [
        activeBaseUrl,
        ...BINANCE_ENDPOINTS.filter((u) => u !== activeBaseUrl),
      ];

  let lastError: Error | null = null;

  for (const baseUrl of urlsToTry) {
    try {
      const cleanParams = { ...params };
      if (signed) {
        // Tier 1: Pre-flight calibrated server offset check
        let offset = await getCalibratedServerOffset(baseUrl);

        // Tier 2: Resilient retry loop up to 3 attempts (specifically auto-resolving -1021 timestamp drift)
        let attempt = 0;
        const maxAttempts = 3;
        let lastResData: any = null;

        while (attempt < maxAttempts) {
          attempt++;
          // Calibrate request timestamp with live offset
          cleanParams.timestamp = Date.now() + offset;
          cleanParams.recvWindow = 10000; // 10s safe recv window within Binance constraints

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
          lastResData = data;

          if (res.ok) {
            activeBaseUrl = baseUrl;
            return { data, endpoint: baseUrl };
          }

          // Check for code -1021 (Timestamp outside recvWindow or ahead of server time)
          if (data?.code === -1021 && attempt < maxAttempts) {
            console.warn(`[Binance Time Sync Skew] Code -1021 on ${baseUrl}. Attempt ${attempt}/${maxAttempts}. Force resyncing clock...`);
            offset = await getCalibratedServerOffset(baseUrl, true);
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }

          // If -2015 (Invalid API key or IP), try fallback endpoint if available
          if (data?.code === -2015 && urlsToTry.length > 1) {
            const errMsg = data.msg ? `[${data.code}] ${data.msg}` : `HTTP ${res.status}`;
            lastError = new Error(errMsg);
            break;
          }

          const errMsg = data?.msg ? `[${data.code}] ${data.msg}` : `HTTP ${res.status}`;
          throw new Error(errMsg);
        }

        if (lastResData) {
          throw new Error(lastResData.msg ? `[${lastResData.code}] ${lastResData.msg}` : "Binance request failed");
        }
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

/**
 * Configure leverage on Binance USD-M Futures for a specific trading pair.
 */
export async function setBinanceLeverage(
  apiKey: string,
  apiSecret: string,
  symbol: string,
  leverage: number,
  preferredBaseUrl?: string
): Promise<{ leverage: number; maxNotionalValue: string }> {
  const clampedLeverage = Math.max(1, Math.min(125, Math.round(leverage)));
  const { data } = await signAndFetchBinance(
    apiKey,
    apiSecret,
    "POST",
    "/fapi/v1/leverage",
    { symbol: symbol.toUpperCase(), leverage: clampedLeverage },
    true,
    preferredBaseUrl
  );
  return {
    leverage: data.leverage || clampedLeverage,
    maxNotionalValue: data.maxNotionalValue || "0",
  };
}
