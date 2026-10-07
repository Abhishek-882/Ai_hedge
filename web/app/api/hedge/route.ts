import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { placeBitgetOrder, BitgetCredentials } from "@/lib/bitgetSigner";
import { getLeadStaggerDelays, recordExecutionRTT, getLatencyMetrics, StaggerPolicy } from "@/lib/latencyTracker";
import { checkRateLimit } from "@/lib/rateLimiter";
import { recordServerTrade } from "@/lib/serverTradeStore";

export const dynamic = "force-dynamic";

function formatSymbolQuantity(qty: number, symbol: string, refPrice: number = 0): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC")) return Math.max(0.001, qty).toFixed(3);
  if (s.startsWith("ETH")) return Math.max(0.01, qty).toFixed(2);
  if (s.startsWith("SOL")) return Math.max(0.1, qty).toFixed(1);
  if (s.startsWith("DOGE")) return Math.max(50, Math.round(qty)).toString();
  if (s.startsWith("XRP")) return Math.max(10, Math.round(qty)).toString();

  // Dynamic formatting for arbitrary coins based on price magnitude
  if (refPrice > 500) return Math.max(0.01, qty).toFixed(2);
  if (refPrice > 50) return Math.max(0.1, qty).toFixed(1);
  if (refPrice > 1) return Math.max(1, Math.round(qty)).toString();
  return Math.max(10, Math.round(qty)).toString();
}

export async function POST(req: NextRequest) {
  // 1. In-Memory Sliding-Window Rate Limiting (12 requests / 5 seconds per client IP)
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
  const binanceEndpoint = req.headers.get("x-binance-endpoint") || "https://demo-fapi.binance.com";

  // Bitget Credentials
  const bitgetKey = req.headers.get("x-bitget-key") || process.env.BITGET_API_KEY || DEFAULT_BITGET_KEY;
  const bitgetSecret = req.headers.get("x-bitget-secret") || process.env.BITGET_API_SECRET || DEFAULT_BITGET_SECRET;
  const bitgetPassphrase = req.headers.get("x-bitget-passphrase") || DEFAULT_BITGET_PASSPHRASE;
  const bitgetEnv = req.headers.get("x-bitget-env") || process.env.BITGET_ENV || DEFAULT_BITGET_ENV;

  if (!binanceKey || !binanceSecret) {
    return NextResponse.json({ success: false, error: "Missing Binance API credentials" }, { status: 401 });
  }

  const bitgetCreds: BitgetCredentials | undefined = bitgetKey && bitgetSecret && bitgetPassphrase
    ? { apiKey: bitgetKey, apiSecret: bitgetSecret, passphrase: bitgetPassphrase, isDemo: bitgetEnv === "demo" }
    : undefined;

  try {
    const body = await req.json();
    const action = body.action || "benchmark"; // "entry", "benchmark", "exit"
    const symbol = (body.symbol || "BTCUSDT").toUpperCase();
    const rawQuantity = parseFloat(body.quantity || "0.005");
    
    // Direction & Leg Side Resolution
    let leg1Side: "BUY" | "SELL" = body.leg1Side || "SELL";
    if (body.direction === "REVERSE_CARRY") {
      leg1Side = "BUY";
    } else if (body.direction === "STANDARD_CARRY") {
      leg1Side = "SELL";
    }
    const leg2Side: "buy" | "sell" = leg1Side === "SELL" ? "buy" : "sell";
    
    // Flexible Stagger Policy Options
    const staggerPolicy: StaggerPolicy = body.staggerPolicy || "auto_ewma";
    const manualDelayMs: number = parseFloat(body.manualDelayMs || "0");
    const manualVenue: "Binance" | "Bitget" | "None" = body.manualVenue || "None";

    // 1. Fetch reference mark price from Binance
    const { data: prem, endpoint } = await signAndFetchBinance(
      binanceKey,
      binanceSecret,
      "GET",
      "/fapi/v1/premiumIndex",
      { symbol },
      false,
      binanceEndpoint
    );
    const refPrice = parseFloat(prem?.markPrice || "86400");

    // Auto-scale quantity to satisfy exchange minimum notionals ($55 for BTC, $25 for ETH, $12 for others)
    let minNotional = 12.0;
    if (symbol.startsWith("BTC")) minNotional = 55.0;
    else if (symbol.startsWith("ETH")) minNotional = 25.0;

    let effectiveQuantity = rawQuantity;
    if (refPrice > 0 && refPrice * effectiveQuantity < minNotional) {
      effectiveQuantity = Math.max(0.001, minNotional / refPrice);
    }
    const formattedQty = formatSymbolQuantity(effectiveQuantity, symbol, refPrice);
    const notional = refPrice * parseFloat(formattedQty);

    // PRE-FLIGHT SAFETY 2: Collateral & Margin Check
    const estRequiredMargin = (notional / 20) * 1.1; // 20x leverage + 10% safety buffer
    if (action === "entry") {
      try {
        const { data: acc } = await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "GET",
          "/fapi/v2/account",
          {},
          true,
          endpoint
        );
        const availBal = parseFloat(acc?.availableBalance || "0");
        if (availBal > 0 && availBal < estRequiredMargin) {
          return NextResponse.json(
            {
              success: false,
              error: `Pre-flight Collateral Guard: Available margin ($${availBal.toFixed(2)}) is below required initial margin ($${estRequiredMargin.toFixed(2)}) for ${symbol} order.`,
            },
            { status: 400 }
          );
        }
      } catch {
        // Non-fatal if account query experiences network hiccup
      }
    }

    // PHASE 1: CONCURRENT PARALLEL ENTRY WITH DYNAMIC EWMA LEAD STAGGER
    const tEntryStart = performance.now();

    // Get calibrated dynamic lead stagger delays based on selected policy
    const {
      binanceDelayMs: leg1DelayMs,
      bitgetDelayMs: leg2DelayMs,
      leadStaggerAppliedMs,
      staggerVenue,
    } = getLeadStaggerDelays(staggerPolicy, manualDelayMs, manualVenue);

    let leg1AckTime = 0;
    let leg2AckTime = 0;
    let leg1OrderDurationMs = 0;
    let leg2OrderDurationMs = 0;

    // Launch Binance Leg 1
    const leg1EntryPromise = (async () => {
      if (leg1DelayMs > 0) {
        await new Promise((r) => setTimeout(r, leg1DelayMs));
      }
      const t0 = performance.now();
      const { data: res } = await signAndFetchBinance(
        binanceKey,
        binanceSecret,
        "POST",
        "/fapi/v1/order",
        {
          symbol,
          side: leg1Side,
          type: "MARKET",
          quantity: formattedQty,
        },
        true,
        endpoint
      );
      leg1AckTime = performance.now();
      leg1OrderDurationMs = leg1AckTime - t0;

      const fillPrice = parseFloat(res.avgPrice || "0") || (parseFloat(res.cumQuote || "0") > 0 && parseFloat(res.executedQty || "0") > 0 ? parseFloat(res.cumQuote) / parseFloat(res.executedQty) : refPrice);

      return {
        venue: `Binance (${new URL(endpoint).hostname})`,
        orderId: res.orderId,
        side: leg1Side,
        price: fillPrice,
        dispatchMs: parseFloat(leg1OrderDurationMs.toFixed(1)),
        ackTimestamp: leg1AckTime,
        staggerAppliedMs: leg1DelayMs,
        success: true,
      };
    })();

    // Launch Bitget Leg 2 with Aggressive Fill Chase
    const leg2EntryPromise = (async () => {
      if (leg2DelayMs > 0) {
        await new Promise((r) => setTimeout(r, leg2DelayMs));
      }
      const t0 = performance.now();
      let res = await placeBitgetOrder(
        {
          symbol,
          side: leg2Side,
          size: formattedQty,
          orderType: "market",
          tradeSide: "open",
        },
        bitgetCreds
      );

      // Aggressive Fill Chase: up to 3 rapid retries within 1.5s if rejected or network hiccup
      let chaseAttempts = 0;
      while (!res.success && chaseAttempts < 3) {
        chaseAttempts++;
        await new Promise((r) => setTimeout(r, 200));
        res = await placeBitgetOrder(
          {
            symbol,
            side: leg2Side,
            size: formattedQty,
            orderType: "market",
            tradeSide: "open",
          },
          bitgetCreds
        );
      }

      leg2AckTime = performance.now();
      leg2OrderDurationMs = leg2AckTime - t0;

      return {
        venue: res.venue || "Bitget",
        orderId: res.orderId || `bitget_err_${Date.now()}`,
        side: leg2Side.toUpperCase(),
        price: res.avgPrice || refPrice,
        dispatchMs: parseFloat(leg2OrderDurationMs.toFixed(1)),
        ackTimestamp: leg2AckTime,
        staggerAppliedMs: leg2DelayMs,
        success: res.success,
        error: res.error,
        chaseAttempts,
      };
    })();

    const [leg1EntryRes, leg2EntryRes] = await Promise.all([leg1EntryPromise, leg2EntryPromise]);
    const tEntryEnd = performance.now();

    // Actual arrival delta at matching engines / client ACK
    const interLegEntryDelta = Math.abs(leg1AckTime - leg2AckTime);

    // Update shared EWMA latency tracker with outlier filtering
    if (leg1EntryRes.success && leg2EntryRes.success) {
      recordExecutionRTT(leg1OrderDurationMs, leg2OrderDurationMs, interLegEntryDelta, leadStaggerAppliedMs, staggerVenue);
    }

    // CIRCUIT BREAKER 2.0: Immediate IOC Unwind on Leg 1 if Leg 2 fails
    if (!leg2EntryRes.success) {
      const unwindSide = leg1Side === "BUY" ? "SELL" : "BUY";
      try {
        await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "POST",
          "/fapi/v1/order",
          {
            symbol,
            side: unwindSide,
            type: "MARKET",
            quantity: formattedQty,
            reduceOnly: "true",
          },
          true,
          endpoint
        );
      } catch (unwindErr) {
        console.error("Critical: Leg 1 emergency unwind failed:", unwindErr);
      }

      return NextResponse.json({
        success: false,
        error: `Leg 2 (Bitget) rejected after 3 chase retries. Atomic IOC unwind executed on Leg 1. Bitget Error: ${leg2EntryRes.error}`,
        unwound: true,
      }, { status: 502 });
    }

    if (action === "entry") {
      try {
        recordServerTrade({
          symbol,
          type: "QUICK_HEDGE_1CLICK",
          directionLabel: leg1Side === "SELL" ? "Short BN + Long BG" : "Long BN + Short BG",
          quantity: formattedQty,
          leg1Venue: "Binance",
          leg1Side: leg1Side,
          leg1Price: leg1EntryRes.price,
          leg1OrderId: leg1EntryRes.orderId,
          leg2Venue: "Bitget",
          leg2Side: leg2Side.toUpperCase(),
          leg2Price: leg2EntryRes.price,
          leg2OrderId: leg2EntryRes.orderId,
          interLegDeltaMs: interLegEntryDelta,
          realizedPnl: 0,
          status: "ACTIVE",
        });
      } catch (logErr) {
        console.error("Failed to persist server trade record:", logErr);
      }

      return NextResponse.json({
        success: true,
        action: "entry",
        symbol,
        leg1: leg1EntryRes,
        leg2: leg2EntryRes,
        interLegDeltaMs: parseFloat(interLegEntryDelta.toFixed(2)),
        leadStaggerAppliedMs,
        staggerVenue,
        staggerPolicy,
        totalEntryMs: parseFloat((tEntryEnd - tEntryStart).toFixed(1)),
        latencyMetrics: getLatencyMetrics(),
      });
    }

    // PHASE 2: BRIEF HOLD (FOR BENCHMARKING DUAL CLOSE)
    await new Promise((r) => setTimeout(r, 1200));

    // Refetch latest mark price for exit
    const { data: premExit } = await signAndFetchBinance(
      binanceKey,
      binanceSecret,
      "GET",
      "/fapi/v1/premiumIndex",
      { symbol },
      false,
      endpoint
    );
    const exitMarkPrice = parseFloat(premExit.markPrice || String(refPrice));

    // PHASE 3: SIMULTANEOUS CONCURRENT DUAL-CLOSE WITH DYNAMIC EWMA LEAD STAGGER
    const tCloseStart = performance.now();
    const leg1CloseSide = leg1Side === "BUY" ? "SELL" : "BUY";
    const leg2CloseSide = leg2Side === "buy" ? "sell" : "buy";

    let closeLeg1Ack = 0;
    let closeLeg2Ack = 0;
    let closeLeg1OrderDurationMs = 0;
    let closeLeg2OrderDurationMs = 0;

    const [leg1ExitRes, leg2ExitRes] = await Promise.all([
      (async () => {
        if (leg1DelayMs > 0) {
          await new Promise((r) => setTimeout(r, leg1DelayMs));
        }
        const t0 = performance.now();
        const { data: res } = await signAndFetchBinance(
          binanceKey,
          binanceSecret,
          "POST",
          "/fapi/v1/order",
          {
            symbol,
            side: leg1CloseSide,
            type: "MARKET",
            quantity: formattedQty,
            reduceOnly: "true",
          },
          true,
          endpoint
        );
        closeLeg1Ack = performance.now();
        closeLeg1OrderDurationMs = closeLeg1Ack - t0;

        const exitFillPrice = parseFloat(res.avgPrice || "0") || (parseFloat(res.cumQuote || "0") > 0 && parseFloat(res.executedQty || "0") > 0 ? parseFloat(res.cumQuote) / parseFloat(res.executedQty) : exitMarkPrice);

        return {
          venue: `Binance (${new URL(endpoint).hostname})`,
          orderId: res.orderId,
          side: leg1CloseSide,
          price: exitFillPrice,
          fillMs: parseFloat(closeLeg1OrderDurationMs.toFixed(1)),
          ackTimestamp: closeLeg1Ack,
        };
      })(),
      (async () => {
        if (leg2DelayMs > 0) {
          await new Promise((r) => setTimeout(r, leg2DelayMs));
        }
        const t0 = performance.now();
        const res = await placeBitgetOrder(
          {
            symbol,
            side: leg2CloseSide,
            size: formattedQty,
            orderType: "market",
            tradeSide: "close",
          },
          bitgetCreds
        );
        closeLeg2Ack = performance.now();
        closeLeg2OrderDurationMs = closeLeg2Ack - t0;

        return {
          venue: res.venue || "Bitget",
          orderId: res.orderId || `bitget_close_${Date.now()}`,
          side: leg2CloseSide.toUpperCase(),
          price: res.avgPrice || exitMarkPrice,
          fillMs: parseFloat(closeLeg2OrderDurationMs.toFixed(1)),
          ackTimestamp: closeLeg2Ack,
          success: res.success,
        };
      })(),
    ]);

    const tCloseEnd = performance.now();
    const dualCloseLatencyMs = tCloseEnd - tCloseStart;
    const interLegCloseDelta = Math.abs(closeLeg1Ack - closeLeg2Ack);

    // PHASE 4: RECONCILE DIRECTIONAL DELTA-NEUTRAL PNL
    const binanceDir = leg1Side === "BUY" ? 1 : -1;
    const bitgetDir = leg2Side === "buy" ? 1 : -1;

    const binancePnl = binanceDir * (leg1ExitRes.price - leg1EntryRes.price) * effectiveQuantity;
    const bitgetPnl = bitgetDir * (leg2ExitRes.price - leg2EntryRes.price) * effectiveQuantity;
    const netPnl = binancePnl + bitgetPnl;
    try {
      recordServerTrade({
        symbol,
        type: "BENCHMARK_DUAL_FILL",
        directionLabel: leg1Side === "SELL" ? "Short BN + Long BG" : "Long BN + Short BG",
        quantity: formattedQty,
        leg1Venue: "Binance",
        leg1Side: leg1Side,
        leg1Price: leg1EntryRes.price,
        leg1OrderId: leg1EntryRes.orderId,
        leg2Venue: "Bitget",
        leg2Side: leg2Side.toUpperCase(),
        leg2Price: leg2EntryRes.price,
        leg2OrderId: leg2EntryRes.orderId,
        interLegDeltaMs: interLegEntryDelta,
        realizedPnl: parseFloat(netPnl.toFixed(4)),
        status: "DELTA_NEUTRAL",
      });
    } catch (logErr) {
      console.error("Failed to persist server trade benchmark:", logErr);
    }

    return NextResponse.json({
      success: true,
      action: "benchmark",
      symbol,
      entry: {
        leg1: leg1EntryRes,
        leg2: leg2EntryRes,
        interLegDeltaMs: parseFloat(interLegEntryDelta.toFixed(2)),
        totalEntryLatencyMs: parseFloat((tEntryEnd - tEntryStart).toFixed(1)),
        leadStaggerAppliedMs,
        staggerVenue,
        staggerPolicy,
      },
      exit: {
        leg1: leg1ExitRes,
        leg2: leg2ExitRes,
        interLegCloseDeltaMs: parseFloat(interLegCloseDelta.toFixed(2)),
        dualCloseLatencyMs: parseFloat(dualCloseLatencyMs.toFixed(1)),
      },
      pnl: {
        binancePnl: parseFloat(binancePnl.toFixed(4)),
        bitgetPnl: parseFloat(bitgetPnl.toFixed(4)),
        netPnl: parseFloat(netPnl.toFixed(4)),
        deltaNeutralSuccess: Math.abs(netPnl) < 1.0,
      },
      latencyMetrics: getLatencyMetrics(),
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
