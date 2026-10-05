import { NextRequest, NextResponse } from "next/server";
import { placeBitgetOrder } from "@/lib/bitgetSigner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || "";
    const apiSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || "";
    const passphrase = req.headers.get("x-bitget-passphrase") || process.env.BITGET_PASSPHRASE || "";
    const env = req.headers.get("x-bitget-env") || "live";

    const body = await req.json();
    const { symbol = "BTCUSDT", side = "buy", size = "0.005", orderType = "market", tradeSide = "open" } = body;

    const creds = apiKey && apiSecret && passphrase
      ? { apiKey, apiSecret, passphrase, isDemo: env === "demo" }
      : undefined;

    const receipt = await placeBitgetOrder(
      {
        symbol,
        side,
        size: size.toString(),
        orderType,
        tradeSide,
      },
      creds
    );

    return NextResponse.json(receipt);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to place Bitget order" },
      { status: 500 }
    );
  }
}
