import { NextRequest, NextResponse } from "next/server";
import { getBitgetAccount } from "@/lib/bitgetSigner";
import { logServerEvent } from "@/lib/logger";

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

    if (account.success) {
      logServerEvent("INFO", "BITGET", `Account synced (${account.venue}). Equity: $${account.equity}`);
    } else {
      logServerEvent("ERROR", "BITGET", `Account error: ${account.error}`);
    }

    return NextResponse.json(account, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (err: any) {
    logServerEvent("ERROR", "BITGET", `Unexpected error: ${err.message}`);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch Bitget account" },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }
}
