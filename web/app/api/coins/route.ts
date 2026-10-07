import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CoinArbitrageOpportunity {
  symbol: string;
  baseAsset: string;
  binanceRate: number;
  bitgetRate: number;
  spreadBps: number;
  annualizedApr: number;
  binanceMarkPrice: number;
  bitgetMarkPrice: number;
  direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET";
  volume24h: number;
  nextFundingTime: number;
}

let cachedCoins: CoinArbitrageOpportunity[] = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 10_000; // 10 second in-memory cache

export async function GET() {
  const now = Date.now();
  if (cachedCoins.length > 0 && now - lastFetchTime < CACHE_TTL_MS) {
    return NextResponse.json({
      success: true,
      count: cachedCoins.length,
      cached: true,
      coins: cachedCoins,
      updatedAt: lastFetchTime,
    });
  }

  try {
    const [binanceRes, bitgetRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
        headers: { "User-Agent": "FundingArbitrage/2.0" },
        cache: "no-store",
      }).catch(async () => {
        // Fallback to testnet if production blocks egress
        return fetch("https://testnet.binancefuture.com/fapi/v1/premiumIndex", { cache: "no-store" });
      }),
      fetch("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", {
        headers: { "User-Agent": "FundingArbitrage/2.0" },
        cache: "no-store",
      }),
    ]);

    const binanceData: any[] = await binanceRes.json().catch(() => []);
    const bitgetRaw = await bitgetRes.json().catch(() => ({}));
    const bitgetData: any[] = bitgetRaw?.data || [];

    // Map Bitget by symbol
    const bitgetMap = new Map<string, any>();
    for (const item of bitgetData) {
      if (item.symbol && item.symbol.endsWith("USDT")) {
        bitgetMap.set(item.symbol, item);
      }
    }

    const opportunities: CoinArbitrageOpportunity[] = [];

    for (const bn of binanceData) {
      const sym = bn.symbol;
      if (!sym || !sym.endsWith("USDT")) continue;

      const bg = bitgetMap.get(sym);
      const bnRate = parseFloat(bn.lastFundingRate || "0");
      const bgRate = bg ? parseFloat(bg.fundingRate || "0") : 0.0001; // default baseline

      const bnMark = parseFloat(bn.markPrice || "0");
      const bgMark = bg ? parseFloat(bg.markPrice || bg.lastPr || "0") : bnMark;

      const spreadBps = parseFloat((Math.abs(bnRate - bgRate) * 10000).toFixed(2));
      // 3 funding intervals per day * 365 days = 1095 intervals/year
      const annualizedApr = parseFloat((spreadBps * 0.01 * 3 * 365).toFixed(2));

      const direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET" =
        bnRate >= bgRate ? "SHORT_BINANCE_LONG_BITGET" : "LONG_BINANCE_SHORT_BITGET";

      const vol24h = bg ? parseFloat(bg.quoteVolume || bg.usdtVolume || "0") : 0;
      const baseAsset = sym.replace("USDT", "");

      opportunities.push({
        symbol: sym,
        baseAsset,
        binanceRate: parseFloat((bnRate * 100).toFixed(4)), // as %
        bitgetRate: parseFloat((bgRate * 100).toFixed(4)), // as %
        spreadBps,
        annualizedApr,
        binanceMarkPrice: bnMark,
        bitgetMarkPrice: bgMark > 0 ? bgMark : bnMark,
        direction,
        volume24h: Math.round(vol24h),
        nextFundingTime: parseInt(bn.nextFundingTime || "0", 10),
      });
    }

    // Sort opportunities by highest spread BPS descending
    opportunities.sort((a, b) => b.spreadBps - a.spreadBps);

    cachedCoins = opportunities;
    lastFetchTime = now;

    return NextResponse.json({
      success: true,
      count: opportunities.length,
      cached: false,
      coins: opportunities,
      updatedAt: now,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message,
      count: cachedCoins.length,
      coins: cachedCoins,
    }, { status: 500 });
  }
}
