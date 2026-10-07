import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { logServerEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const clientKey = req.headers.get("x-binance-key");
  const clientSecret = req.headers.get("x-binance-secret");
  const preferredUrl = req.headers.get("x-binance-endpoint") || undefined;

  const DEFAULT_BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
  const DEFAULT_BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";

  const isCustomKey = Boolean(clientKey && clientKey.trim());
  const apiKey = isCustomKey ? clientKey!.trim() : (process.env.BINANCE_TESTNET_API_KEY || DEFAULT_BINANCE_KEY);
  const apiSecret = isCustomKey ? (clientSecret ? clientSecret.trim() : "") : (process.env.BINANCE_TESTNET_API_SECRET || DEFAULT_BINANCE_SECRET);

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  if (!apiKey || !apiSecret) {
    logServerEvent("WARN", "BINANCE", "Missing credentials in request");
    return NextResponse.json(
      { success: false, error: "Missing API credentials" },
      { status: 401, headers: noCacheHeaders }
    );
  }

  const keyMask = apiKey.length >= 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "INVALID";

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

    let refMarkPrice = 0;
    try {
      const { data: prem } = await signAndFetchBinance(
        apiKey,
        apiSecret,
        "GET",
        "/fapi/v1/premiumIndex",
        { symbol: "BTCUSDT" },
        false,
        endpoint
      );
      refMarkPrice = parseFloat(prem?.markPrice || "0");
    } catch {
      // non-fatal fallback
    }

    const positions = (data.positions || [])
      .filter((p: any) => parseFloat(p.positionAmt || "0") !== 0)
      .map((p: any) => {
        const amt = parseFloat(p.positionAmt);
        const entryPrice = parseFloat(p.entryPrice);
        const unrealizedPnl = parseFloat(p.unrealizedProfit);
        const rawMark = parseFloat(p.markPrice || "0");
        const derivedMark = (amt !== 0 && entryPrice > 0) ? entryPrice + (unrealizedPnl / amt) : 0;
        const markPrice = rawMark > 0
          ? rawMark
          : (derivedMark > 0 ? derivedMark : (p.symbol === "BTCUSDT" ? refMarkPrice : entryPrice));
        return {
          venue: "Binance",
          symbol: p.symbol,
          amount: amt,
          entryPrice,
          markPrice: parseFloat(markPrice.toFixed(2)),
          unrealizedPnl,
          leverage: parseInt(p.leverage, 10),
        };
      });

    logServerEvent("INFO", "BINANCE", `Account synced [${keyMask}] on ${endpoint}. Balance: $${totalWalletBalance}`);

    return NextResponse.json(
      {
        success: true,
        endpoint,
        totalWalletBalance,
        availableBalance,
        totalUnrealizedProfit,
        positionsCount: positions.length,
        positions,
        keyMask,
        isCustomKey,
      },
      { headers: noCacheHeaders }
    );
  } catch (err: any) {
    logServerEvent("ERROR", "BINANCE", `Authentication failed for [${keyMask}] (${preferredUrl || "auto"}): ${err.message}`);
    return NextResponse.json(
      { success: false, error: err.message, keyMask, isCustomKey },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
