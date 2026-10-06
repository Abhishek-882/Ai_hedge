import { NextRequest, NextResponse } from "next/server";
import { placeBitgetOrder } from "@/lib/bitgetSigner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const DEFAULT_BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05";
    const DEFAULT_BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
    const DEFAULT_BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE || "ArbitrageBot2026";
    const DEFAULT_BITGET_ENV = "demo";

    const apiKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || DEFAULT_BITGET_KEY;
    const apiSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || DEFAULT_BITGET_SECRET;
    const passphrase = req.headers.get("x-bitget-passphrase") || DEFAULT_BITGET_PASSPHRASE;
    const env = req.headers.get("x-bitget-env") || process.env.BITGET_ENV || DEFAULT_BITGET_ENV;

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
