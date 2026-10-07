import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { placeBitgetOrder, getBitgetHeaders, BitgetCredentials } from "@/lib/bitgetSigner";
import { getLeadStaggerDelays, recordExecutionRTT } from "@/lib/latencyTracker";
import { logServerEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  const symbol = "BTCUSDT";
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
        const { data, endpoint } = await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "GET",
          "/fapi/v2/positionRisk",
          { symbol },
          true,
          preferredUrl
        );
        const openPos = (data || []).find((p: any) => parseFloat(p.positionAmt || "0") !== 0);

        if (!openPos) {
          return { venue: "Binance", closed: false, message: "No active position found", durationMs: performance.now() - t0 };
        }

        const amt = parseFloat(openPos.positionAmt);
        const closeSide = amt > 0 ? "SELL" : "BUY";
        const closeQty = Math.abs(amt);

        if (binanceDelayMs > 0) {
          await new Promise((r) => setTimeout(r, binanceDelayMs));
        }

        const tOrderStart = performance.now();
        const { data: res } = await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "POST",
          "/fapi/v1/order",
          {
            symbol,
            side: closeSide,
            type: "MARKET",
            quantity: closeQty.toFixed(3),
            reduceOnly: "true",
          },
          true,
          endpoint
        );
        binanceAckTime = performance.now();
        binanceOrderDurationMs = binanceAckTime - tOrderStart;

        return {
          venue: `Binance (${new URL(endpoint).hostname})`,
          closed: true,
          side: closeSide,
          quantity: closeQty,
          orderId: res.orderId,
          status: res.status,
          orderDurationMs: parseFloat(binanceOrderDurationMs.toFixed(1)),
          durationMs: parseFloat((binanceAckTime - t0).toFixed(1)),
        };
      } catch (err: any) {
        return { venue: "Binance", closed: false, error: err.message, durationMs: performance.now() - t0 };
      }
    })();

    const closeBitgetPromise = (async () => {
      const t0 = performance.now();
      if (!bitgetCreds) {
        return { venue: "Bitget", closed: false, message: "No Bitget credentials configured", durationMs: performance.now() - t0 };
      }

      try {
        const path = `/api/v3/position/current-position?category=USDT-FUTURES&symbol=${symbol}`;
        const headers = await getBitgetHeaders(bitgetCreds, "GET", path);
        const res = await fetch(`https://api.bitget.com${path}`, { headers, cache: "no-store" });
        const data = await res.json();

        // Guard against null data.data?.list
        const list = data?.data?.list || (Array.isArray(data?.data) ? data.data : []);
        const activePos = (list || []).find((p: any) => parseFloat(p?.total || p?.available || p?.pos || "0") > 0);

        if (!activePos) {
          return { venue: "Bitget", closed: false, message: "No active position found", durationMs: performance.now() - t0 };
        }

        const posSide = activePos.posSide || "long";
        const closeSide: "buy" | "sell" = posSide === "long" ? "sell" : "buy";
        const rawQty = activePos.total || activePos.available || activePos.pos || "0.005";
        const closeQty = parseFloat(rawQty).toFixed(3);

        if (bitgetDelayMs > 0) {
          await new Promise((r) => setTimeout(r, bitgetDelayMs));
        }

        const tOrderStart = performance.now();
        const orderRes = await placeBitgetOrder(
          {
            symbol,
            side: closeSide,
            size: closeQty,
            orderType: "market",
            tradeSide: "close",
            posSide,
          },
          bitgetCreds
        );
        bitgetAckTime = performance.now();
        bitgetOrderDurationMs = bitgetAckTime - tOrderStart;

        return {
          venue: orderRes.venue || "Bitget",
          closed: orderRes.success,
          side: closeSide.toUpperCase(),
          posSide,
          quantity: parseFloat(closeQty),
          orderId: orderRes.orderId,
          status: orderRes.success ? "FILLED" : "FAILED",
          error: orderRes.error,
          orderDurationMs: parseFloat(bitgetOrderDurationMs.toFixed(1)),
          durationMs: parseFloat((bitgetAckTime - t0).toFixed(1)),
        };
      } catch (err: any) {
        return { venue: "Bitget", closed: false, error: err.message, durationMs: performance.now() - t0 };
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
      summaryMessage = `Binance closed (${binanceRes.quantity} BTC). Bitget: ${bitgetRes.message || "Flat"}. Total: ${dualCloseLatencyMs}ms.`;
    } else if (!binanceRes.closed && bitgetRes.closed) {
      summaryMessage = `Bitget closed (${bitgetRes.quantity} BTC). Binance: ${binanceRes.message || "Flat"}. Total: ${dualCloseLatencyMs}ms.`;
    } else if (!hasError) {
      summaryMessage = `All positions already flat on Binance and Bitget. Total: ${dualCloseLatencyMs}ms.`;
    } else {
      summaryMessage = `Dual-Close error: Binance: ${binanceRes.error || "OK"}, Bitget: ${bitgetRes.error || "OK"}.`;
    }

    logServerEvent(success ? "INFO" : "WARN", "SYSTEM", `Dual-Close executed in ${dualCloseLatencyMs}ms (Success: ${success}, Delta: ${interLegCloseDeltaMs}ms)`);

    return NextResponse.json({
      success,
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
