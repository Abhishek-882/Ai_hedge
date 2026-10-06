import { NextRequest, NextResponse } from "next/server";
import { getBitgetAccount } from "@/lib/bitgetSigner";
import { logServerEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const DEFAULT_BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05";
    const DEFAULT_BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
    const DEFAULT_BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE || "ArbitrageBot2027";
    const DEFAULT_BITGET_ENV = "demo";

    const apiKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || DEFAULT_BITGET_KEY;
    const apiSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || DEFAULT_BITGET_SECRET;
    const passphrase = req.headers.get("x-bitget-passphrase") || DEFAULT_BITGET_PASSPHRASE;
    const env = req.headers.get("x-bitget-env") || process.env.BITGET_ENV || DEFAULT_BITGET_ENV;

    const creds = apiKey && apiSecret && passphrase
      ? { apiKey, apiSecret, passphrase, isDemo: env === "demo" }
      : undefined;

    const account = await getBitgetAccount(creds);

    const hasCustomKey = Boolean(req.headers.get("x-bitget-key"));
    const keyMask = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : (creds ? "ACTIVE" : "SIMULATION");

    if (account.success) {
      logServerEvent("INFO", "BITGET", `Account synced [${keyMask}] (${account.venue}). Equity: $${account.equity}`);
    } else {
      logServerEvent("ERROR", "BITGET", `Account error [${keyMask}]: ${account.error}`);
    }

    return NextResponse.json(
      {
        ...account,
        keyMask,
        isCustomKey: hasCustomKey,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        },
      }
    );
  } catch (err: any) {
    logServerEvent("ERROR", "BITGET", `Unexpected error: ${err.message}`);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch Bitget account" },
      { status: 500, headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  }
}
