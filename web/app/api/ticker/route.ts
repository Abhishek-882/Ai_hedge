import { NextRequest, NextResponse } from "next/server";

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

    // 1. Fetch Binance live ticker & premiumIndex in parallel
    const [binanceTickerRes, binancePremiumRes, bitgetTickerRes] = await Promise.allSettled([
      fetch(`https://testnet.binancefuture.com/fapi/v1/ticker/24hr?symbol=${symbol}`, { cache: "no-store" }),
      fetch(`https://testnet.binancefuture.com/fapi/v1/premiumIndex?symbol=${symbol}`, { cache: "no-store" }),
      fetch(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`, { cache: "no-store" }),
    ]);

    let binancePrice = 0;
    let binanceFundingRate = 0.0001;
    let nextFundingTime = 0;
    let high24h = 0;
    let low24h = 0;

    if (binancePremiumRes.status === "fulfilled" && binancePremiumRes.value.ok) {
      try {
        const premiumData = await binancePremiumRes.value.json();
        binancePrice = parseFloat(premiumData.markPrice || "0");
        binanceFundingRate = parseFloat(premiumData.lastFundingRate || "0.0001");
        nextFundingTime = parseInt(premiumData.nextFundingTime || "0", 10);
      } catch {}
    }

    if (binanceTickerRes.status === "fulfilled" && binanceTickerRes.value.ok) {
      try {
        const tickerData = await binanceTickerRes.value.json();
        if (!binancePrice) binancePrice = parseFloat(tickerData.lastPrice || "0");
        high24h = parseFloat(tickerData.highPrice || "0");
        low24h = parseFloat(tickerData.lowPrice || "0");
      } catch {}
    }

    // 2. Extract Bitget ticker & funding rate
    let bitgetPrice = binancePrice;
    let bitgetFundingRate = 0.0002;

    if (bitgetTickerRes.status === "fulfilled" && bitgetTickerRes.value.ok) {
      try {
        const bitgetData = await bitgetTickerRes.value.json();
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

    // If Bitget price was not fetched, approximate close to Binance
    if (bitgetPrice <= 0) {
      bitgetPrice = binancePrice > 0 ? binancePrice * 0.9998 : 0;
    }

    // Calculate delta spread basis in bps
    const spreadBps = parseFloat(((bitgetFundingRate - binanceFundingRate) * 10000).toFixed(2));
    const annualizedYieldPct = parseFloat(((Math.abs(spreadBps) * 3 * 365) / 100).toFixed(2));

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
        high24h,
        low24h,
        nextFundingTime,
        serverTime: Date.now(),
      },
      { headers: noCacheHeaders }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500, headers: noCacheHeaders });
  }
}
