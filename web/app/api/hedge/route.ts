import { NextRequest, NextResponse } from "next/server";
import { signAndFetchBinance } from "@/lib/binanceSigner";
import { placeBitgetOrder, BitgetCredentials } from "@/lib/bitgetSigner";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const DEFAULT_BINANCE_KEY = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
  const DEFAULT_BINANCE_SECRET = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";

  const DEFAULT_BITGET_KEY = "bg_2c493eb64032f2b0aea68c1c18d56e05";
  const DEFAULT_BITGET_SECRET = "c77d2baac5b1fb84e9d900e15dfcac783b962d1da1837b50ff05daf68ac2f5f6";
  const DEFAULT_BITGET_PASSPHRASE = process.env.BITGET_PASSPHRASE || "ArbitrageBot2026";
  const DEFAULT_BITGET_ENV = "demo";

  // Binance Credentials
  const binanceKey = req.headers.get("x-binance-key") || process.env.BINANCE_TESTNET_API_KEY || DEFAULT_BINANCE_KEY;
  const binanceSecret = req.headers.get("x-binance-secret") || process.env.BINANCE_TESTNET_API_SECRET || DEFAULT_BINANCE_SECRET;
  const binanceEndpoint = req.headers.get("x-binance-endpoint") || undefined;

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
    const quantity = parseFloat(body.quantity || "0.005");
    const leg1Side: "BUY" | "SELL" = body.leg1Side || "SELL"; // Default arbitrage: Short Binance
    const leg2Side: "buy" | "sell" = leg1Side === "SELL" ? "buy" : "sell"; // Long Bitget
    const symbol = "BTCUSDT";

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
    const refPrice = parseFloat(prem.markPrice || "86400");

    // PHASE 1: CONCURRENT PARALLEL ENTRY WITH AGGRESSIVE FILL CHASE
    const tEntryStart = performance.now();

    // Launch Binance Leg 1
    const leg1EntryPromise = (async () => {
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
          quantity: quantity.toFixed(3),
        },
        true,
        endpoint
      );
      const tAck = performance.now();
      return {
        venue: `Binance (${new URL(endpoint).hostname})`,
        orderId: res.orderId,
        side: leg1Side,
        price: refPrice,
        dispatchMs: tAck - t0,
        success: true,
      };
    })();

    // Launch Bitget Leg 2 with Aggressive Fill Chase
    const leg2EntryPromise = (async () => {
      const t0 = performance.now();
      let res = await placeBitgetOrder(
        {
          symbol,
          side: leg2Side,
          size: quantity.toFixed(3),
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
            size: quantity.toFixed(3),
            orderType: "market",
            tradeSide: "open",
          },
          bitgetCreds
        );
      }

      const tAck = performance.now();
      return {
        venue: res.venue || "Bitget",
        orderId: res.orderId || `bitget_err_${Date.now()}`,
        side: leg2Side.toUpperCase(),
        price: res.avgPrice || refPrice,
        dispatchMs: tAck - t0,
        success: res.success,
        error: res.error,
        chaseAttempts,
      };
    })();

    const [leg1EntryRes, leg2EntryRes] = await Promise.all([leg1EntryPromise, leg2EntryPromise]);
    const tEntryEnd = performance.now();
    const interLegEntryDelta = Math.abs(leg1EntryRes.dispatchMs - leg2EntryRes.dispatchMs);

    // CIRCUIT BREAKER: Emergency Unwind if Leg 2 totally failed
    if (!leg2EntryRes.success) {
      // Leg 1 filled, but Leg 2 failed all 3 retries! Immediately unwind Leg 1 to eliminate directional exposure
      const unwindSide = leg1Side === "BUY" ? "SELL" : "BUY";
      await signAndFetchBinance(
        binanceKey,
        binanceSecret,
        "POST",
        "/fapi/v1/order",
        {
          symbol,
          side: unwindSide,
          type: "MARKET",
          quantity: quantity.toFixed(3),
          reduceOnly: "true",
        },
        true,
        endpoint
      );

      return NextResponse.json({
        success: false,
        error: `Leg 2 (Bitget) failed after 3 chase retries. Emergency unwind triggered on Leg 1. Error: ${leg2EntryRes.error}`,
        unwound: true,
      }, { status: 502 });
    }

    if (action === "entry") {
      return NextResponse.json({
        success: true,
        action: "entry",
        leg1: leg1EntryRes,
        leg2: leg2EntryRes,
        interLegDeltaMs: parseFloat(interLegEntryDelta.toFixed(1)),
        totalEntryMs: parseFloat((tEntryEnd - tEntryStart).toFixed(1)),
      });
    }

    // PHASE 2: BRIEF HOLD (FOR BENCHMARKING)
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

    // PHASE 3: SIMULTANEOUS CONCURRENT DUAL-CLOSE
    const tCloseStart = performance.now();
    const leg1CloseSide = leg1Side === "BUY" ? "SELL" : "BUY";
    const leg2CloseSide = leg2Side === "buy" ? "sell" : "buy";

    const [leg1ExitRes, leg2ExitRes] = await Promise.all([
      (async () => {
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
            quantity: quantity.toFixed(3),
            reduceOnly: "true",
          },
          true,
          endpoint
        );
        const tAck = performance.now();
        return {
          venue: `Binance (${new URL(endpoint).hostname})`,
          orderId: res.orderId,
          side: leg1CloseSide,
          price: exitMarkPrice,
          fillMs: tAck - t0,
        };
      })(),
      (async () => {
        const t0 = performance.now();
        const res = await placeBitgetOrder(
          {
            symbol,
            side: leg2CloseSide,
            size: quantity.toFixed(3),
            orderType: "market",
            tradeSide: "close",
          },
          bitgetCreds
        );
        const tAck = performance.now();
        return {
          venue: res.venue || "Bitget",
          orderId: res.orderId || `close_${Date.now()}`,
          side: leg2CloseSide.toUpperCase(),
          price: res.avgPrice || exitMarkPrice,
          fillMs: tAck - t0,
        };
      })(),
    ]);
    const tCloseEnd = performance.now();
    const dualCloseLatencyMs = tCloseEnd - tCloseStart;

    // PHASE 4: DELTA-NEUTRAL PnL RECONCILIATION
    const pnlLeg1 = leg1Side === "BUY"
      ? (leg1ExitRes.price - leg1EntryRes.price) * quantity
      : (leg1EntryRes.price - leg1ExitRes.price) * quantity;

    const pnlLeg2 = leg2Side === "buy"
      ? (leg2ExitRes.price - leg2EntryRes.price) * quantity
      : (leg2EntryRes.price - leg2ExitRes.price) * quantity;

    const netPnl = pnlLeg1 + pnlLeg2;

    return NextResponse.json({
      success: true,
      action: "benchmark_complete",
      entry: {
        leg1: leg1EntryRes,
        leg2: leg2EntryRes,
        interLegDeltaMs: parseFloat(interLegEntryDelta.toFixed(1)),
        totalEntryMs: parseFloat((tEntryEnd - tEntryStart).toFixed(1)),
      },
      exit: {
        leg1: leg1ExitRes,
        leg2: leg2ExitRes,
        dualCloseLatencyMs: parseFloat(dualCloseLatencyMs.toFixed(1)),
      },
      pnl: {
        leg1Pnl: parseFloat(pnlLeg1.toFixed(4)),
        leg2Pnl: parseFloat(pnlLeg2.toFixed(4)),
        netPnl: parseFloat(netPnl.toFixed(4)),
        deltaNeutralSuccess: Math.abs(netPnl) < 0.35,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
