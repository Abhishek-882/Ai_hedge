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
    const { data, endpoint } = await signAndFetchBinance(
      apiKey,
      apiSecret,
      "GET",
      "/fapi/v2/account",
      {},
      true,
      preferredUrl
    );

    const totalWalletBalance = parseFloat(data.totalWalletBalance || "0");
    const availableBalance = parseFloat(data.availableBalance || "0");
    const totalUnrealizedProfit = parseFloat(data.totalUnrealizedProfit || "0");

    const positions = (data.positions || [])
      .filter((p: any) => parseFloat(p.positionAmt || "0") !== 0)
      .map((p: any) => ({
        symbol: p.symbol,
        amount: parseFloat(p.positionAmt),
        entryPrice: parseFloat(p.entryPrice),
        unrealizedPnl: parseFloat(p.unrealizedProfit),
        leverage: parseInt(p.leverage, 10),
      }));

    return NextResponse.json({
      success: true,
      endpoint,
      totalWalletBalance,
      availableBalance,
      totalUnrealizedProfit,
      positionsCount: positions.length,
      positions,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
