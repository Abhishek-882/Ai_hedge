import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { placeBitgetOrder, getBitgetHeaders, BitgetCredentials } from "@/lib/bitgetSigner";
import { getLeadStaggerDelays, recordExecutionRTT } from "@/lib/latencyTracker";
import { checkRateLimit } from "@/lib/rateLimiter";
import { logServerEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

function formatSymbolQuantity(qty: number, symbol: string): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC")) return qty.toFixed(3);
  if (s.startsWith("ETH")) return qty.toFixed(2);
  if (s.startsWith("SOL")) return qty.toFixed(1);
  if (s.startsWith("DOGE")) return Math.round(qty).toString();
  if (s.startsWith("XRP")) return qty.toFixed(1);
  return qty.toFixed(3);
}

export async function POST(req: NextRequest) {
  // 1. Sliding-Window Rate Limiting (12 requests / 5s per IP)
  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local_client";
  const rateLimit = checkRateLimit(clientIp, { windowMs: 5000, maxRequests: 12 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit exceeded. System is pacing requests. Retry in ${(rateLimit.resetMs / 1000).toFixed(1)}s.`,
      },
      { status: 429 }
    );
  }

  const DEFAULT_BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
  const DEFAULT_BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";

  const DEFAULT_BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05";
  const DEFAULT_BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
  const DEFAULT_BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE || "ArbitrageBot2027";
  const DEFAULT_BITGET_ENV = "demo";

  // Binance Credentials
  const binanceKey = req.headers.get("x-binance-key") || process.env.BINANCE_TESTNET_API_KEY || DEFAULT_BINANCE_KEY;
  const binanceSecret = req.headers.get("x-binance-secret") || process.env.BINANCE_TESTNET_API_SECRET || DEFAULT_BINANCE_SECRET;
  const preferredUrl = req.headers.get("x-binance-endpoint") || "https://demo-fapi.binance.com";

  // Bitget Credentials
  const bitgetKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || DEFAULT_BITGET_KEY;
  const bitgetSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || DEFAULT_BITGET_SECRET;
  const bitgetPassphrase = req.headers.get("x-bitget-passphrase") || DEFAULT_BITGET_PASSPHRASE;
  const bitgetEnv = req.headers.get("x-bitget-env") || process.env.BITGET_ENV || DEFAULT_BITGET_ENV;

  const bitgetCreds: BitgetCredentials | undefined = bitgetKey && bitgetSecret && bitgetPassphrase
    ? { apiKey: bitgetKey, apiSecret: bitgetSecret, passphrase: bitgetPassphrase, isDemo: bitgetEnv === "demo" }
    : undefined;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const targetSymbol: string | undefined = body?.symbol && body.symbol !== "ALL"
    ? String(body.symbol).toUpperCase()
    : undefined;

  const tCloseStart = performance.now();

  try {
    const { binanceDelayMs, bitgetDelayMs, leadStaggerAppliedMs, staggerVenue } = getLeadStaggerDelays();

    let binanceAckTime = 0;
    let bitgetAckTime = 0;
    let binanceOrderDurationMs = 0;
    let bitgetOrderDurationMs = 0;

    // 1. Concurrent Position Discovery & Staggered Dual Close
    const closeBinancePromise = (async () => {
      const t0 = performance.now();
      try {
        const queryParams: Record<string, string | number> | undefined = targetSymbol ? { symbol: targetSymbol } : undefined;
        const { data, endpoint } = await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "GET",
          "/fapi/v2/positionRisk",
          queryParams,
          true,
          preferredUrl
        );

        const openPositions = (Array.isArray(data) ? data : [])
          .filter((p: any) => {
            const amt = Math.abs(parseFloat(p.positionAmt || "0"));
            if (targetSymbol) {
              return p.symbol === targetSymbol && amt > 0;
            }
            return amt > 0;
          });

        if (openPositions.length === 0) {
          return { venue: "Binance", closed: false, count: 0, message: "No active position found", durationMs: performance.now() - t0 };
        }

        if (binanceDelayMs > 0) {
          await new Promise((r) => setTimeout(r, binanceDelayMs));
        }

        const tOrderStart = performance.now();
        const closeResults = [];

        for (const pos of openPositions) {
          const amt = parseFloat(pos.positionAmt);
          const closeSide = amt > 0 ? "SELL" : "BUY";
          const closeQty = Math.abs(amt);
          const formattedQty = formatSymbolQuantity(closeQty, pos.symbol);

          const { data: res } = await signAndFetchBinance(
            binanceKey,
            binanceSecret,
            "POST",
            "/fapi/v1/order",
            {
              symbol: pos.symbol,
              side: closeSide,
              type: "MARKET",
              quantity: formattedQty,
              reduceOnly: "true",
            },
            true,
            endpoint
          );

          closeResults.push({
            symbol: pos.symbol,
            side: closeSide,
            quantity: closeQty,
            orderId: res.orderId,
            status: res.status,
          });
        }

        binanceAckTime = performance.now();
        binanceOrderDurationMs = binanceAckTime - tOrderStart;

        return {
          venue: `Binance (${new URL(endpoint).hostname})`,
          closed: true,
          count: closeResults.length,
          orders: closeResults,
          orderDurationMs: parseFloat(binanceOrderDurationMs.toFixed(1)),
          durationMs: parseFloat((binanceAckTime - t0).toFixed(1)),
        };
      } catch (err: any) {
        return { venue: "Binance", closed: false, count: 0, error: err.message, durationMs: performance.now() - t0 };
      }
    })();

    const closeBitgetPromise = (async () => {
      const t0 = performance.now();
      if (!bitgetCreds) {
        return { venue: "Bitget", closed: false, count: 0, message: "No Bitget credentials configured", durationMs: performance.now() - t0 };
      }

      try {
        const path = targetSymbol
          ? `/api/v3/position/current-position?category=USDT-FUTURES&symbol=${targetSymbol}`
          : `/api/v3/position/current-position?category=USDT-FUTURES`;

        const headers = await getBitgetHeaders(bitgetCreds, "GET", path);
        const res = await fetch(`https://api.bitget.com${path}`, { headers, cache: "no-store" });
        const data = await res.json();

        const list = data?.data?.list || (Array.isArray(data?.data) ? data.data : []);
        const activePositions = (list || [])
          .filter((p: any) => {
            const qty = parseFloat(p?.total || p?.available || p?.pos || "0");
            if (targetSymbol) {
              return p?.symbol === targetSymbol && qty > 0;
            }
            return qty > 0;
          });

        if (activePositions.length === 0) {
          return { venue: "Bitget", closed: false, count: 0, message: "No active position found", durationMs: performance.now() - t0 };
        }

        if (bitgetDelayMs > 0) {
          await new Promise((r) => setTimeout(r, bitgetDelayMs));
        }

        const tOrderStart = performance.now();
        const closeResults = [];

        for (const pos of activePositions) {
          const posSide = pos.posSide || "long";
          const closeSide: "buy" | "sell" = posSide === "long" ? "sell" : "buy";
          const rawQty = parseFloat(pos.total || pos.available || pos.pos || "0");
          const posSymbol = pos.symbol || targetSymbol || "BTCUSDT";
          const formattedQty = formatSymbolQuantity(rawQty, posSymbol);

          const orderRes = await placeBitgetOrder(
            {
              symbol: posSymbol,
              side: closeSide,
              size: formattedQty,
              orderType: "market",
              tradeSide: "close",
              posSide,
            },
            bitgetCreds
          );

          closeResults.push({
            symbol: posSymbol,
            side: closeSide.toUpperCase(),
            posSide,
            quantity: rawQty,
            orderId: orderRes.orderId,
            status: orderRes.success ? "FILLED" : "FAILED",
            error: orderRes.error,
          });
        }

        bitgetAckTime = performance.now();
        bitgetOrderDurationMs = bitgetAckTime - tOrderStart;

        const allBitgetSucceeded = closeResults.every((o) => o.status === "FILLED");

        return {
          venue: "Bitget",
          closed: allBitgetSucceeded,
          count: closeResults.length,
          orders: closeResults,
          orderDurationMs: parseFloat(bitgetOrderDurationMs.toFixed(1)),
          durationMs: parseFloat((bitgetAckTime - t0).toFixed(1)),
        };
      } catch (err: any) {
        return { venue: "Bitget", closed: false, count: 0, error: err.message, durationMs: performance.now() - t0 };
      }
    })();

    const [binanceRes, bitgetRes] = await Promise.all([closeBinancePromise, closeBitgetPromise]);
    const tCloseEnd = performance.now();
    const dualCloseLatencyMs = parseFloat((tCloseEnd - tCloseStart).toFixed(1));

    const hasError = Boolean(binanceRes.error || bitgetRes.error);
    const success = !hasError;

    let interLegCloseDeltaMs = 0;
    if (binanceRes.closed && bitgetRes.closed && binanceAckTime > 0 && bitgetAckTime > 0) {
      interLegCloseDeltaMs = parseFloat(Math.abs(binanceAckTime - bitgetAckTime).toFixed(2));
      recordExecutionRTT(binanceOrderDurationMs, bitgetOrderDurationMs, interLegCloseDeltaMs, leadStaggerAppliedMs, staggerVenue);
    }

    let summaryMessage = "";
    if (binanceRes.closed && bitgetRes.closed) {
      summaryMessage = `Dual-Close confirmed in ${dualCloseLatencyMs}ms (Binance + Bitget). Inter-leg delta: ${interLegCloseDeltaMs}ms.`;
    } else if (binanceRes.closed && !bitgetRes.closed) {
      summaryMessage = `Binance closed (${binanceRes.count} positions). Bitget: ${bitgetRes.message || "Flat"}. Total: ${dualCloseLatencyMs}ms.`;
    } else if (!binanceRes.closed && bitgetRes.closed) {
      summaryMessage = `Bitget closed (${bitgetRes.count} positions). Binance: ${binanceRes.message || "Flat"}. Total: ${dualCloseLatencyMs}ms.`;
    } else if (!hasError) {
      summaryMessage = `All positions already flat on Binance and Bitget. Total: ${dualCloseLatencyMs}ms.`;
    } else {
      summaryMessage = `Dual-Close error: Binance: ${binanceRes.error || "OK"}, Bitget: ${bitgetRes.error || "OK"}.`;
    }

    logServerEvent(success ? "INFO" : "WARN", "SYSTEM", `Dual-Close executed in ${dualCloseLatencyMs}ms (Success: ${success}, Delta: ${interLegCloseDeltaMs}ms, Target: ${targetSymbol || "ALL"})`);

    return NextResponse.json({
      success,
      targetSymbol: targetSymbol || "ALL",
      dualCloseLatencyMs,
      interLegCloseDeltaMs,
      leadStaggerAppliedMs,
      staggerVenue,
      binance: binanceRes,
      bitget: bitgetRes,
      message: summaryMessage,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
