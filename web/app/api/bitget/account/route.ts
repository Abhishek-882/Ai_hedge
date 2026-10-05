import { NextRequest, NextResponse } from "next/server";
import { getBitgetAccount } from "@/lib/bitgetSigner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || "";
    const apiSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || "";
    const passphrase = req.headers.get("x-bitget-passphrase") || process.env.BITGET_PASSPHRASE || "";
    const env = req.headers.get("x-bitget-env") || "live";

    const creds = apiKey && apiSecret && passphrase
      ? { apiKey, apiSecret, passphrase, isDemo: env === "demo" }
      : undefined;

    const account = await getBitgetAccount(creds);
    return NextResponse.json(account);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch Bitget account" },
      { status: 500 }
    );
  }
}
