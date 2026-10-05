import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-binance-key") || process.env.BINANCE_TESTNET_API_KEY;
  const apiSecret = req.headers.get("x-binance-secret") || process.env.BINANCE_TESTNET_API_SECRET;
  const preferredUrl = req.headers.get("x-binance-endpoint") || undefined;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ success: false, error: "Missing API credentials" }, { status: 401 });
  }

  try {
    const { data } = await signAndFetchBinance(
      apiKey,
      apiSecret,
      "GET",
      "/fapi/v2/positionRisk",
      { symbol: "BTCUSDT" },
      true,
      preferredUrl
    );
    const positions = (data || [])
      .filter((p: any) => parseFloat(p.positionAmt || "0") !== 0)
      .map((p: any) => ({
        symbol: p.symbol,
        amount: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice),
        markPrice: parseFloat(p.markPrice),
        unrealizedPnl: parseFloat(p.unRealizedProfit),
        liquidationPrice: parseFloat(p.liquidationPrice || "0"),
        leverage: parseInt(p.leverage, 10),
      }));

    return NextResponse.json({ success: true, positions });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
