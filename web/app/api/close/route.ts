import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-binance-key") || process.env.BINANCE_TESTNET_API_KEY;
  const apiSecret = req.headers.get("x-binance-secret") || process.env.BINANCE_TESTNET_API_SECRET;
  const preferredUrl = req.headers.get("x-binance-endpoint") || undefined;

  if (!apiKey || !apiSecret) {
    return NextResponse.json({ success: false, error: "Missing API credentials" }, { status: 401 });
  }

  try {
    const symbol = "BTCUSDT";
    const { data, endpoint } = await signAndFetchBinance(
      apiKey,
      apiSecret,
      "GET",
      "/fapi/v2/positionRisk",
      { symbol },
      true,
      preferredUrl
    );
    const openPos = (data || []).find((p: any) => parseFloat(p.positionAmt || "0") !== 0);

    if (!openPos) {
      return NextResponse.json({ success: true, message: "No active position found" });
    }

    const amt = parseFloat(openPos.positionAmt);
    const closeSide = amt > 0 ? "SELL" : "BUY";
    const closeQty = Math.abs(amt);

    const { data: res } = await signAndFetchBinance(
      apiKey,
      apiSecret,
      "POST",
      "/fapi/v1/order",
      {
        symbol,
        side: closeSide,
        type: "MARKET",
        quantity: closeQty.toFixed(3),
      },
      true,
      endpoint
    );

    return NextResponse.json({
      success: true,
      message: `Position closed: ${closeSide} ${closeQty} ${symbol}`,
      orderId: res.orderId,
      status: res.status,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
