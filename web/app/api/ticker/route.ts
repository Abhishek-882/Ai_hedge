import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [binanceTickerRes, binancePremiumRes] = await Promise.all([
      fetch("https://testnet.binancefuture.com/fapi/v1/ticker/24hr?symbol=BTCUSDT", { cache: "no-store" }),
      fetch("https://testnet.binancefuture.com/fapi/v1/premiumIndex?symbol=BTCUSDT", { cache: "no-store" }),
    ]);

    const tickerData = await binanceTickerRes.json();
    const premiumData = await binancePremiumRes.json();

    const markPrice = parseFloat(premiumData.markPrice || tickerData.lastPrice || "0");
    const binanceFundingRate = parseFloat(premiumData.lastFundingRate || "0.0001");
    const nextFundingTime = parseInt(premiumData.nextFundingTime || "0", 10);

    // Bitget demo benchmark baseline
    const bitgetFundingRate = 0.0002; // +0.02% baseline
    const spreadBps = Math.abs(binanceFundingRate - bitgetFundingRate) * 10000;

    return NextResponse.json({
      success: true,
      symbol: "BTCUSDT",
      markPrice,
      lastPrice: parseFloat(tickerData.lastPrice || "0"),
      high24h: parseFloat(tickerData.highPrice || "0"),
      low24h: parseFloat(tickerData.lowPrice || "0"),
      binanceFundingRate,
      bitgetFundingRate,
      spreadBps: parseFloat(spreadBps.toFixed(2)),
      nextFundingTime,
      serverTime: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
