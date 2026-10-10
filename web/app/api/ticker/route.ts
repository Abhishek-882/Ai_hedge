import { NextRequest, NextResponse } from "next/server";
import { getFundingMetaForSymbol } from "@/lib/exchangeFundingMeta";
import { getDeterministicNextFundingTime } from "@/lib/settlementTime";

export const dynamic = "force-dynamic";

const noCacheHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Pragma": "no-cache",
  "Expires": "0",
};

export async function GET(req: NextRequest) {
  try {
    const symParam = req.nextUrl.searchParams.get("symbol") || "BTCUSDT";
    const symbol = symParam.trim().toUpperCase();

    // 1. Fetch Binance live production ticker & premiumIndex, Bitget ticker, and Funding Meta in parallel
    const [binanceProdRes, binanceTestRes, bitgetTickerRes, meta] = await Promise.all([
      fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, {
        headers: { "User-Agent": "FundingArbitrage/2.0" },
        cache: "no-store",
      }).catch(() => null),
      fetch(`https://testnet.binancefuture.com/fapi/v1/premiumIndex?symbol=${symbol}`, { cache: "no-store" }).catch(() => null),
      fetch(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`, { cache: "no-store" }).catch(() => null),
      getFundingMetaForSymbol(symbol),
    ]);

    let binancePrice = 0;
    let binanceFundingRate = 0.0001;
    let nextFundingTime = 0;
    let high24h = 0;
    let low24h = 0;

    // Prefer production Binance for real market funding rate
    if (binanceProdRes && binanceProdRes.ok) {
      try {
        const prodData = await binanceProdRes.json();
        binancePrice = parseFloat(prodData.markPrice || "0");
        const rawRate = parseFloat(prodData.lastFundingRate);
        if (!isNaN(rawRate)) binanceFundingRate = rawRate;
        nextFundingTime = parseInt(prodData.nextFundingTime || "0", 10);
      } catch {}
    }

    // Fallback to testnet if production mark price or rate is missing
    if ((!binancePrice || binancePrice === 0) && binanceTestRes && binanceTestRes.ok) {
      try {
        const testData = await binanceTestRes.json();
        if (!binancePrice) binancePrice = parseFloat(testData.markPrice || "0");
        if (binanceFundingRate === 0.0001 && testData.lastFundingRate) {
          const rawRate = parseFloat(testData.lastFundingRate);
          if (!isNaN(rawRate)) binanceFundingRate = rawRate;
        }
        if (!nextFundingTime) nextFundingTime = parseInt(testData.nextFundingTime || "0", 10);
      } catch {}
    }

    // 2. Extract Bitget ticker & funding rate
    let bitgetPrice = binancePrice;
    let bitgetFundingRate = 0.0002;

    if (bitgetTickerRes && bitgetTickerRes.ok) {
      try {
        const bitgetData = await bitgetTickerRes.json();
        if (bitgetData.code === "00000" && Array.isArray(bitgetData.data) && bitgetData.data[0]) {
          const t = bitgetData.data[0];
          const rawBgPrice = parseFloat(t.lastPr || t.markPrice || "0");
          if (rawBgPrice > 0) bitgetPrice = rawBgPrice;
          const rawBgFunding = parseFloat(t.fundingRate || "");
          if (!isNaN(rawBgFunding)) bitgetFundingRate = rawBgFunding;
          const rawBgNextFunding = parseInt(t.nextFundingTime || "0", 10);
          if (rawBgNextFunding > 0 && (!nextFundingTime || nextFundingTime === 0)) {
            nextFundingTime = rawBgNextFunding;
          }
        }
      } catch {}
    }

    // Fallback Bitget next update from indexed funding metadata
    if ((!nextFundingTime || nextFundingTime <= Date.now()) && meta.bitgetNextUpdate && meta.bitgetNextUpdate > Date.now()) {
      nextFundingTime = meta.bitgetNextUpdate;
    }

    // Deterministic fallback using the symbol's exact funding interval
    if (!nextFundingTime || nextFundingTime <= Date.now()) {
      nextFundingTime = getDeterministicNextFundingTime(Date.now(), meta.fundingIntervalHours);
    }

    // If Bitget price was not fetched, fallback to Binance price without artificial divergence
    if (bitgetPrice <= 0) {
      bitgetPrice = binancePrice;
    }

    // Calculate delta spread basis in bps
    const spreadBps = parseFloat(((bitgetFundingRate - binanceFundingRate) * 10000).toFixed(2));
    // Dynamic annualized yield based on real payouts per day
    const annualizedYieldPct = parseFloat(((Math.abs(spreadBps) * 0.01 * meta.payoutsPerDay * 365)).toFixed(2));

    // Calculate cross-exchange mark price divergence
    const priceDiff = parseFloat(Math.abs(binancePrice - bitgetPrice).toFixed(4));
    const priceDivergencePct = binancePrice > 0 ? parseFloat(((priceDiff / binancePrice) * 100).toFixed(4)) : 0;

    return NextResponse.json(
      {
        success: true,
        symbol,
        markPrice: binancePrice,
        binancePrice,
        binanceFundingRate,
        bitgetPrice,
        bitgetFundingRate,
        spreadBps,
        annualizedYieldPct,
        priceDiff,
        priceDivergencePct,
        high24h,
        low24h,
        nextFundingTime,
        fundingIntervalHours: meta.fundingIntervalHours,
        binanceIntervalHours: meta.binanceIntervalHours,
        bitgetIntervalHours: meta.bitgetIntervalHours,
        settlementCycleLabel: meta.settlementCycleLabel,
        payoutsPerDay: meta.payoutsPerDay,
        serverTime: Date.now(),
      },
      { headers: noCacheHeaders }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: noCacheHeaders });
  }
}
