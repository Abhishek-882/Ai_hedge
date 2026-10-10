import fs from "fs";
import path from "path";
import { signAndFetchBinance, setBinanceLeverage } from "./binanceSigner";
import { placeBitgetOrder, setBitgetLeverage, BitgetCredentials } from "./bitgetSigner";
import { getLeadStaggerDelays, recordExecutionRTT } from "./latencyTracker";
import { recordServerTrade } from "./serverTradeStore";
import { getDeterministicNextFundingTime } from "./settlementTime";
import {
  SYSTEM_DEFAULT_BINANCE_KEY,
  SYSTEM_DEFAULT_BINANCE_SECRET,
  SYSTEM_DEFAULT_BITGET_KEY,
  SYSTEM_DEFAULT_BITGET_SECRET,
  SYSTEM_DEFAULT_BITGET_PASSPHRASE,
} from "./userStore";

export interface BotConfig {
  enabled: boolean;
  minSpreadBps: number;
  maxPriceDivergencePct: number;
  balanceAllocationPct: number;
  leverageMode: "MAX_PER_COIN" | "CUSTOM";
  customLeverage: number;
  maxSimultaneousHedges: number;
  postSettlementWaitSeconds: number;
  closeMaxPriceDivergencePct: number;
  scanIntervalSeconds: number;
}

export interface ActiveBotHedge {
  id: string;
  symbol: string;
  direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET";
  quantity: string;
  effectiveQty: number;
  notionalUsdt: number;
  binanceLeverage: number;
  bitgetLeverage: number;
  entrySpreadBps: number;
  entryBinancePrice: number;
  entryBitgetPrice: number;
  entryDivergencePct: number;
  entryTime: number;
  fundingSettlementTime: number;
  leg1OrderId?: string | number;
  leg2OrderId?: string | number;
  status: "ACTIVE" | "WAITING_PRICE_PARITY" | "CLOSING" | "CLOSED" | "FAILED_UNWOUND";
  unwindReason?: string;
  pnl?: number;
  closeBinancePrice?: number;
  closeBitgetPrice?: number;
  closeDivergencePct?: number;
  closeTime?: number;
}

export interface BotLog {
  timestamp: string;
  message: string;
  level: "info" | "success" | "warn" | "error";
}

export interface BotEngineState {
  isRunning: boolean;
  runInBackgroundWhenClosed: boolean;
  mode: string;
  startedAt: number;
  lastCycleAt: number;
  cyclesCompleted: number;
  config: BotConfig;
  activeHedges: ActiveBotHedge[];
  completedHedges: ActiveBotHedge[];
  logs: BotLog[];
  statusText: string;
  lastEvaluatedCandidate?: {
    symbol: string;
    spreadBps: number;
    divergencePct: number;
    secondsToFunding: number;
    qualified: boolean;
    reason: string;
  } | null;
}

const STATE_FILE_PATH = path.join(process.cwd(), "bot_daemon_state.json");

// System admin API credentials for 24/7 background worker
const ADMIN_BINANCE_KEY = SYSTEM_DEFAULT_BINANCE_KEY;
const ADMIN_BINANCE_SECRET = SYSTEM_DEFAULT_BINANCE_SECRET;
const ADMIN_BINANCE_ENDPOINT = "https://demo-fapi.binance.com";
const ADMIN_BITGET_CREDS: BitgetCredentials = {
  apiKey: SYSTEM_DEFAULT_BITGET_KEY,
  apiSecret: SYSTEM_DEFAULT_BITGET_SECRET,
  passphrase: SYSTEM_DEFAULT_BITGET_PASSPHRASE,
  isDemo: true,
};

export function getCoinMaxLeverage(sym: string): { bn: number; bg: number } {
  const upper = sym.toUpperCase();
  if (["BTCUSDT", "ETHUSDT", "LTCUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "BCHUSDT", "DOGEUSDT"].includes(upper)) {
    return { bn: 50, bg: 50 };
  }
  return { bn: 20, bg: 20 };
}

function formatSymbolQuantity(qty: number, symbol: string, refPrice: number = 0): string {
  const s = symbol.toUpperCase();
  if (s.startsWith("BTC")) return Math.max(0.001, qty).toFixed(3);
  if (s.startsWith("ETH")) return Math.max(0.01, qty).toFixed(2);
  if (s.startsWith("SOL")) return Math.max(0.1, qty).toFixed(1);
  if (s.startsWith("DOGE")) return Math.max(50, Math.round(qty)).toString();
  if (s.startsWith("XRP")) return Math.max(10, Math.round(qty)).toString();

  if (refPrice > 500) return Math.max(0.01, qty).toFixed(2);
  if (refPrice > 50) return Math.max(0.1, qty).toFixed(1);
  if (refPrice > 1) return Math.max(1, Math.round(qty)).toString();
  return Math.max(10, Math.round(qty)).toString();
}

// Global Singleton to maintain worker interval across Next.js reloads
const globalForBot = global as unknown as {
  botEngineState?: BotEngineState;
  botInterval?: NodeJS.Timeout | null;
  botIsExecutingCycle?: boolean;
};

const DEFAULT_CONFIG: BotConfig = {
  enabled: true,
  minSpreadBps: 5.0,
  maxPriceDivergencePct: 0.01, // 0.01% ultra-strict price parity
  balanceAllocationPct: 20, // 20% of available account balance
  leverageMode: "MAX_PER_COIN",
  customLeverage: 50,
  maxSimultaneousHedges: 3,
  postSettlementWaitSeconds: 15, // Let funding fee credit apply
  closeMaxPriceDivergencePct: 0.01, // Close only when price parity matches
  scanIntervalSeconds: 5,
};

export function loadBotState(): BotEngineState {
  if (globalForBot.botEngineState) {
    return globalForBot.botEngineState;
  }

  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      // Merge with defaults to ensure complete schema
      const state: BotEngineState = {
        isRunning: parsed.isRunning !== undefined ? parsed.isRunning : true,
        runInBackgroundWhenClosed: true,
        mode: "AUTONOMOUS_SERVER_24_7",
        startedAt: parsed.startedAt || Date.now(),
        lastCycleAt: parsed.lastCycleAt || Date.now(),
        cyclesCompleted: parsed.cyclesCompleted || 0,
        config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
        activeHedges: Array.isArray(parsed.activeHedges) ? parsed.activeHedges : [],
        completedHedges: Array.isArray(parsed.completedHedges) ? parsed.completedHedges : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        statusText: parsed.statusText || "RUNNING_24_7",
        lastEvaluatedCandidate: parsed.lastEvaluatedCandidate || null,
      };
      globalForBot.botEngineState = state;
      return state;
    }
  } catch {}

  const defaultState: BotEngineState = {
    isRunning: true,
    runInBackgroundWhenClosed: true,
    mode: "AUTONOMOUS_SERVER_24_7",
    startedAt: Date.now(),
    lastCycleAt: Date.now(),
    cyclesCompleted: 0,
    config: DEFAULT_CONFIG,
    activeHedges: [],
    completedHedges: [],
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: "24/7 Autonomous Arbitrage Bot Engine initialized. Ready to execute delta-neutral hedges.",
        level: "info",
      },
    ],
    statusText: "RUNNING_24_7",
    lastEvaluatedCandidate: null,
  };

  globalForBot.botEngineState = defaultState;
  saveBotState(defaultState);
  return defaultState;
}

export function saveBotState(state: BotEngineState) {
  globalForBot.botEngineState = state;
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch {}
}

export function appendBotLog(
  state: BotEngineState,
  message: string,
  level: "info" | "success" | "warn" | "error" = "info"
) {
  const log: BotLog = {
    timestamp: new Date().toISOString(),
    message,
    level,
  };
  state.logs.unshift(log);
  if (state.logs.length > 80) {
    state.logs = state.logs.slice(0, 80);
  }
}

/**
 * Fetch available margin across Binance and Bitget
 */
async function fetchAvailableBalances(): Promise<{ binanceBal: number; bitgetBal: number }> {
  let binanceBal = 1000;
  let bitgetBal = 1000;

  try {
    const { data: bnAcc } = await signAndFetchBinance(
      ADMIN_BINANCE_KEY,
      ADMIN_BINANCE_SECRET,
      "GET",
      "/fapi/v2/account",
      {},
      true,
      ADMIN_BINANCE_ENDPOINT
    );
    const avail = parseFloat(bnAcc?.availableBalance || "0");
    if (avail > 0) binanceBal = avail;
  } catch {}

  try {
    // Check Bitget account asset balance
    const path = "/api/v3/account/assets?category=USDT-FUTURES";
    const res = await fetch(`https://api.bitget.com${path}`, {
      headers: {
        "papertrading": "1",
        "paptrading": "1",
      },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const usdt = (data?.data?.assets || []).find((a: any) => a.coin === "USDT" || a.currency === "USDT");
      const avail = parseFloat(usdt?.available || usdt?.equity || "0");
      if (avail > 0) bitgetBal = avail;
    }
  } catch {}

  return { binanceBal, bitgetBal };
}

/**
 * Fetch live tickers and candidates from exchanges
 */
async function fetchOpportunityCoins(): Promise<any[]> {
  try {
    const [bnRes, bgRes] = await Promise.all([
      fetch("https://fapi.binance.com/fapi/v1/premiumIndex", {
        headers: { "User-Agent": "AutonomousBotEngine/1.0" },
        cache: "no-store",
      }).catch(async () => {
        return fetch("https://testnet.binancefuture.com/fapi/v1/premiumIndex", { cache: "no-store" });
      }),
      fetch("https://api.bitget.com/api/v2/mix/market/tickers?productType=USDT-FUTURES", {
        headers: { "User-Agent": "AutonomousBotEngine/1.0" },
        cache: "no-store",
      }),
    ]);

    const bnRaw = await bnRes.json().catch(() => []);
    const bnList: any[] = Array.isArray(bnRaw) ? bnRaw : [];
    const bgRaw = await bgRes.json().catch(() => ({}));
    const bgList: any[] = Array.isArray(bgRaw?.data) ? bgRaw.data : [];

    const bgMap = new Map<string, any>();
    for (const b of bgList) {
      if (b.symbol && b.symbol.endsWith("USDT")) {
        bgMap.set(b.symbol, b);
      }
    }

    const now = Date.now();
    const results: any[] = [];

    for (const bn of bnList) {
      const sym = bn.symbol;
      if (!sym || !sym.endsWith("USDT")) continue;
      const bg = bgMap.get(sym);
      if (!bg) continue;

      const bnRate = parseFloat(bn.lastFundingRate || "0");
      const bgRate = parseFloat(bg.fundingRate || "0");
      const spreadBps = parseFloat((Math.abs(bnRate - bgRate) * 10000).toFixed(2));

      const bnMark = parseFloat(bn.markPrice || "0");
      const bgMark = parseFloat(bg.markPrice || bg.lastPr || "0") || bnMark;

      const priceDiff = Math.abs(bnMark - bgMark);
      const divergencePct = bnMark > 0 ? (priceDiff / bnMark) * 100 : 0;

      const rawNextFunding = parseInt(bn.nextFundingTime || "0", 10);
      const nextFundingTime = rawNextFunding > now ? rawNextFunding : getDeterministicNextFundingTime(now);

      const direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET" =
        bnRate >= bgRate ? "SHORT_BINANCE_LONG_BITGET" : "LONG_BINANCE_SHORT_BITGET";

      results.push({
        symbol: sym,
        binanceRate: bnRate,
        bitgetRate: bgRate,
        spreadBps,
        binanceMarkPrice: bnMark,
        bitgetMarkPrice: bgMark,
        priceDiff,
        divergencePct: parseFloat(divergencePct.toFixed(5)),
        nextFundingTime,
        secondsToFunding: Math.round((nextFundingTime - now) / 1000),
        direction,
      });
    }

    // Sort by highest spreadBps descending
    results.sort((a, b) => b.spreadBps - a.spreadBps);
    return results;
  } catch (err: any) {
    console.error("fetchOpportunityCoins error:", err.message);
    return [];
  }
}

/**
 * Fetch fresh live prices for a specific symbol to compute accurate price divergence
 */
async function fetchFreshPrices(symbol: string): Promise<{ bnPrice: number; bgPrice: number; divergencePct: number }> {
  let bnPrice = 0;
  let bgPrice = 0;

  try {
    const [bnRes, bgRes] = await Promise.allSettled([
      signAndFetchBinance(
        ADMIN_BINANCE_KEY,
        ADMIN_BINANCE_SECRET,
        "GET",
        "/fapi/v1/premiumIndex",
        { symbol },
        false,
        ADMIN_BINANCE_ENDPOINT
      ),
      fetch(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`, {
        cache: "no-store",
      }),
    ]);

    if (bnRes.status === "fulfilled") {
      bnPrice = parseFloat(bnRes.value.data?.markPrice || "0");
    }

    if (bgRes.status === "fulfilled" && bgRes.value.ok) {
      const data = await bgRes.value.json();
      bgPrice = parseFloat(data?.data?.[0]?.markPrice || data?.data?.[0]?.lastPr || "0");
    }
  } catch {}

  if (bnPrice === 0 && bgPrice > 0) bnPrice = bgPrice;
  if (bgPrice === 0 && bnPrice > 0) bgPrice = bnPrice;

  const priceDiff = Math.abs(bnPrice - bgPrice);
  const divergencePct = bnPrice > 0 ? (priceDiff / bnPrice) * 100 : 0;

  return {
    bnPrice,
    bgPrice,
    divergencePct: parseFloat(divergencePct.toFixed(5)),
  };
}

/**
 * Execute dual hedge entry for a qualified coin
 */
async function executeDualHedgeEntry(
  coin: any,
  config: BotConfig,
  allocatedMargin: number
): Promise<{ success: boolean; hedge?: ActiveBotHedge; error?: string }> {
  const symbol = coin.symbol;
  const maxLev = getCoinMaxLeverage(symbol);
  const binanceLeverage = config.leverageMode === "CUSTOM" ? config.customLeverage : maxLev.bn;
  const bitgetLeverage = config.leverageMode === "CUSTOM" ? config.customLeverage : maxLev.bg;

  const refPrice = coin.binanceMarkPrice || 100;
  // Calculate quantity using allocated margin and leverage
  const effectiveLeverage = Math.min(binanceLeverage, bitgetLeverage);
  const targetNotional = Math.max(15, allocatedMargin * effectiveLeverage);
  let rawQty = targetNotional / refPrice;

  let minNotional = 12.0;
  if (symbol.startsWith("BTC")) minNotional = 55.0;
  else if (symbol.startsWith("ETH")) minNotional = 25.0;

  if (refPrice > 0 && refPrice * rawQty < minNotional) {
    rawQty = Math.max(0.001, minNotional / refPrice);
  }

  const formattedQty = formatSymbolQuantity(rawQty, symbol, refPrice);
  const effectiveQty = parseFloat(formattedQty);
  const totalNotional = refPrice * effectiveQty;

  const leg1Side: "BUY" | "SELL" = coin.direction === "SHORT_BINANCE_LONG_BITGET" ? "SELL" : "BUY";
  const leg2Side: "buy" | "sell" = leg1Side === "SELL" ? "buy" : "sell";

  // Calibrate leverage on both venues
  await Promise.allSettled([
    setBinanceLeverage(ADMIN_BINANCE_KEY, ADMIN_BINANCE_SECRET, symbol, binanceLeverage, ADMIN_BINANCE_ENDPOINT),
    setBitgetLeverage(ADMIN_BITGET_CREDS, symbol, bitgetLeverage),
  ]);

  const { binanceDelayMs, bitgetDelayMs, leadStaggerAppliedMs, staggerVenue } = getLeadStaggerDelays();

  let leg1AckTime = 0;
  let leg2AckTime = 0;
  let leg1OrderDurationMs = 0;
  let leg2OrderDurationMs = 0;

  // Leg 1: Binance
  const leg1Promise = (async () => {
    if (binanceDelayMs > 0) await new Promise((r) => setTimeout(r, binanceDelayMs));
    const t0 = performance.now();
    try {
      const { data: res } = await signAndFetchBinance(
        ADMIN_BINANCE_KEY,
        ADMIN_BINANCE_SECRET,
        "POST",
        "/fapi/v1/order",
        {
          symbol,
          side: leg1Side,
          type: "MARKET",
          quantity: formattedQty,
        },
        true,
        ADMIN_BINANCE_ENDPOINT
      );
      leg1AckTime = performance.now();
      leg1OrderDurationMs = leg1AckTime - t0;
      const fillPrice = parseFloat(res.avgPrice || "0") || refPrice;
      return { success: true, orderId: res.orderId, price: fillPrice, venue: "Binance" };
    } catch (err: any) {
      return { success: false, error: err.message, venue: "Binance", price: refPrice };
    }
  })();

  // Leg 2: Bitget
  const leg2Promise = (async () => {
    if (bitgetDelayMs > 0) await new Promise((r) => setTimeout(r, bitgetDelayMs));
    const t0 = performance.now();
    let res = await placeBitgetOrder(
      {
        symbol,
        side: leg2Side,
        size: formattedQty,
        orderType: "market",
        tradeSide: "open",
      },
      ADMIN_BITGET_CREDS
    );

    // Fill chase retry up to 2 times
    let attempts = 0;
    while (!res.success && attempts < 2) {
      attempts++;
      await new Promise((r) => setTimeout(r, 200));
      res = await placeBitgetOrder(
        {
          symbol,
          side: leg2Side,
          size: formattedQty,
          orderType: "market",
          tradeSide: "open",
        },
        ADMIN_BITGET_CREDS
      );
    }

    leg2AckTime = performance.now();
    leg2OrderDurationMs = leg2AckTime - t0;
    return {
      success: res.success,
      orderId: res.orderId,
      price: res.avgPrice || coin.bitgetMarkPrice || refPrice,
      error: res.error,
      venue: "Bitget",
    };
  })();

  const [leg1Res, leg2Res] = await Promise.all([leg1Promise, leg2Promise]);
  const interLegDelta = Math.abs(leg1AckTime - leg2AckTime);

  // CIRCUIT BREAKER: Atomic IOC Unwind if one leg failed
  if (leg1Res.success && !leg2Res.success) {
    const unwindSide = leg1Side === "BUY" ? "SELL" : "BUY";
    try {
      await signAndFetchBinance(
        ADMIN_BINANCE_KEY,
        ADMIN_BINANCE_SECRET,
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
        ADMIN_BINANCE_ENDPOINT
      );
    } catch (unwindErr) {
      console.error("Critical: Leg 1 emergency unwind failed:", unwindErr);
    }
    return {
      success: false,
      error: `Leg 2 (Bitget) rejected: ${leg2Res.error}. Emergency IOC unwind executed on Leg 1. Safe retry next cycle.`,
    };
  }

  if (!leg1Res.success && leg2Res.success) {
    try {
      const unwindSide = leg2Side === "buy" ? "sell" : "buy";
      await placeBitgetOrder(
        {
          symbol,
          side: unwindSide,
          size: formattedQty,
          orderType: "market",
          tradeSide: "close",
        },
        ADMIN_BITGET_CREDS
      );
    } catch (unwindErr) {
      console.error("Critical: Leg 2 emergency unwind failed:", unwindErr);
    }
    return {
      success: false,
      error: `Leg 1 (Binance) rejected: ${leg1Res.error}. Emergency IOC unwind executed on Leg 2. Safe retry next cycle.`,
    };
  }

  if (!leg1Res.success && !leg2Res.success) {
    return {
      success: false,
      error: `Both legs failed. BN: ${leg1Res.error} | BG: ${leg2Res.error}`,
    };
  }

  // Both legs filled successfully!
  recordExecutionRTT(leg1OrderDurationMs, leg2OrderDurationMs, interLegDelta, leadStaggerAppliedMs, staggerVenue);

  const hedge: ActiveBotHedge = {
    id: `BOT-${Date.now().toString().slice(-6)}`,
    symbol,
    direction: coin.direction,
    quantity: formattedQty,
    effectiveQty,
    notionalUsdt: parseFloat(totalNotional.toFixed(2)),
    binanceLeverage,
    bitgetLeverage,
    entrySpreadBps: coin.spreadBps,
    entryBinancePrice: leg1Res.price,
    entryBitgetPrice: leg2Res.price,
    entryDivergencePct: coin.divergencePct,
    entryTime: Date.now(),
    fundingSettlementTime: coin.nextFundingTime,
    leg1OrderId: leg1Res.orderId,
    leg2OrderId: leg2Res.orderId,
    status: "ACTIVE",
  };

  recordServerTrade({
    id: hedge.id,
    symbol,
    type: "AUTONOMOUS_SERVER_HEDGE",
    directionLabel: coin.direction === "SHORT_BINANCE_LONG_BITGET" ? "Short BN + Long BG" : "Long BN + Short BG",
    quantity: formattedQty,
    notionalUsdt: totalNotional,
    leg1Venue: "Binance",
    leg1Side: leg1Side,
    leg1Price: leg1Res.price,
    leg1OrderId: leg1Res.orderId,
    leg2Venue: "Bitget",
    leg2Side: leg2Side.toUpperCase(),
    leg2Price: leg2Res.price,
    leg2OrderId: leg2Res.orderId,
    interLegDeltaMs: interLegDelta,
    realizedPnl: 0,
    status: "ACTIVE",
  });

  return { success: true, hedge };
}

/**
 * Execute dual close for an active hedge once price parity matches
 */
async function executeDualHedgeClose(
  hedge: ActiveBotHedge,
  freshPrices: { bnPrice: number; bgPrice: number; divergencePct: number }
): Promise<{ success: boolean; pnl: number; error?: string }> {
  const symbol = hedge.symbol;
  const formattedQty = hedge.quantity;
  const leg1CloseSide: "BUY" | "SELL" = hedge.direction === "SHORT_BINANCE_LONG_BITGET" ? "BUY" : "SELL";
  const leg2CloseSide: "buy" | "sell" = leg1CloseSide === "BUY" ? "sell" : "buy";

  const { binanceDelayMs, bitgetDelayMs } = getLeadStaggerDelays();

  const [closeBnRes, closeBgRes] = await Promise.allSettled([
    (async () => {
      if (binanceDelayMs > 0) await new Promise((r) => setTimeout(r, binanceDelayMs));
      const { data: res } = await signAndFetchBinance(
        ADMIN_BINANCE_KEY,
        ADMIN_BINANCE_SECRET,
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
        ADMIN_BINANCE_ENDPOINT
      );
      const exitPrice = parseFloat(res.avgPrice || "0") || freshPrices.bnPrice;
      return { success: true, price: exitPrice };
    })(),
    (async () => {
      if (bitgetDelayMs > 0) await new Promise((r) => setTimeout(r, bitgetDelayMs));
      const res = await placeBitgetOrder(
        {
          symbol,
          side: leg2CloseSide,
          size: formattedQty,
          orderType: "market",
          tradeSide: "close",
        },
        ADMIN_BITGET_CREDS
      );
      return { success: res.success, price: res.avgPrice || freshPrices.bgPrice };
    })(),
  ]);

  const bnExitPrice = closeBnRes.status === "fulfilled" && closeBnRes.value.success ? closeBnRes.value.price : freshPrices.bnPrice;
  const bgExitPrice = closeBgRes.status === "fulfilled" && closeBgRes.value.success ? closeBgRes.value.price : freshPrices.bgPrice;

  // Calculate net realized PnL
  const bnDir = hedge.direction === "SHORT_BINANCE_LONG_BITGET" ? -1 : 1;
  const bgDir = hedge.direction === "SHORT_BINANCE_LONG_BITGET" ? 1 : -1;

  const bnPnl = bnDir * (bnExitPrice - hedge.entryBinancePrice) * hedge.effectiveQty;
  const bgPnl = bgDir * (bgExitPrice - hedge.entryBitgetPrice) * hedge.effectiveQty;
  const netPnl = parseFloat((bnPnl + bgPnl).toFixed(4));

  recordServerTrade({
    id: `CLS-${hedge.id}`,
    symbol,
    type: "AUTONOMOUS_SERVER_CLOSE",
    directionLabel: "Unwind & Realize Harvest",
    quantity: formattedQty,
    leg1Venue: "Binance",
    leg1Side: leg1CloseSide,
    leg1Price: bnExitPrice,
    leg2Venue: "Bitget",
    leg2Side: leg2CloseSide.toUpperCase(),
    leg2Price: bgExitPrice,
    realizedPnl: netPnl,
    status: "CLOSED",
  });

  return { success: true, pnl: netPnl };
}

/**
 * Main Autonomous Bot Cycle
 * Evaluates exits first (basis convergence check), then evaluates entries (<1m to funding, spread >= 5bps, divergence <= 0.01%)
 */
export async function runAutonomousBotCycle(): Promise<void> {
  const state = loadBotState();
  if (!state.isRunning || !state.config.enabled) {
    return;
  }

  if (globalForBot.botIsExecutingCycle) {
    return; // Prevent overlapping executions
  }

  globalForBot.botIsExecutingCycle = true;
  state.lastCycleAt = Date.now();
  state.cyclesCompleted += 1;

  try {
    const now = Date.now();
    const config = state.config;

    // ─────────────────────────────────────────────────────────────
    // PHASE 1: EXIT MONITOR FOR ACTIVE HEDGES
    // ─────────────────────────────────────────────────────────────
    const survivingHedges: ActiveBotHedge[] = [];

    for (const hedge of state.activeHedges) {
      const waitThreshold = hedge.fundingSettlementTime + config.postSettlementWaitSeconds * 1000;
      const settlementHasPassed = now >= waitThreshold;

      if (!settlementHasPassed) {
        // Still waiting for funding settlement timestamp
        survivingHedges.push(hedge);
        continue;
      }

      // Settlement has passed! Check live cross-exchange price divergence
      const freshPrices = await fetchFreshPrices(hedge.symbol);
      const isParitySatisfied = freshPrices.divergencePct <= config.closeMaxPriceDivergencePct;

      if (!isParitySatisfied) {
        // Hold and wait for price divergence to compress to <= closeMaxPriceDivergencePct
        hedge.status = "WAITING_PRICE_PARITY";
        survivingHedges.push(hedge);

        if (state.cyclesCompleted % 4 === 0) {
          appendBotLog(
            state,
            `[BASIS HOLD] ${hedge.symbol} settlement passed. Waiting for basis divergence (${freshPrices.divergencePct.toFixed(3)}%) to converge to <= ${config.closeMaxPriceDivergencePct}% before closing.`,
            "warn"
          );
        }
        continue;
      }

      // Both conditions met: Settlement passed AND price parity is satisfied!
      appendBotLog(
        state,
        `[AUTO-CLOSE TRIGGERED] ${hedge.symbol}: Funding fee credited & price divergence (${freshPrices.divergencePct.toFixed(3)}% <= ${config.closeMaxPriceDivergencePct}%). Executing dual close...`,
        "info"
      );

      hedge.status = "CLOSING";
      const closeRes = await executeDualHedgeClose(hedge, freshPrices);

      if (closeRes.success) {
        hedge.status = "CLOSED";
        hedge.closeTime = Date.now();
        hedge.closeBinancePrice = freshPrices.bnPrice;
        hedge.closeBitgetPrice = freshPrices.bgPrice;
        hedge.closeDivergencePct = freshPrices.divergencePct;
        hedge.pnl = closeRes.pnl;

        state.completedHedges.unshift(hedge);
        if (state.completedHedges.length > 50) {
          state.completedHedges = state.completedHedges.slice(0, 50);
        }

        appendBotLog(
          state,
          `[HEDGE CLOSED] Successfully unwound ${hedge.symbol} hedge. Net Realized PnL: $${closeRes.pnl} USDT (Exit Parity: ${freshPrices.divergencePct.toFixed(3)}%).`,
          "success"
        );
      } else {
        // Re-queue if close failed
        hedge.status = "ACTIVE";
        survivingHedges.push(hedge);
        appendBotLog(
          state,
          `[CLOSE RETRY] Error closing ${hedge.symbol}: ${closeRes.error}. Will retry on next cycle.`,
          "warn"
        );
      }
    }

    state.activeHedges = survivingHedges;

    // ─────────────────────────────────────────────────────────────
    // PHASE 2: ENTRY SCANNER FOR TOP-RANKED COIN
    // ─────────────────────────────────────────────────────────────
    const availableSlots = config.maxSimultaneousHedges - state.activeHedges.length;
    if (availableSlots <= 0) {
      state.statusText = `AT_MAX_CAPACITY (${state.activeHedges.length}/${config.maxSimultaneousHedges} HEDGES ACTIVE)`;
      saveBotState(state);
      return;
    }

    const opportunities = await fetchOpportunityCoins();
    if (opportunities.length === 0) {
      state.statusText = "SCANNING_OPPORTUNITIES";
      saveBotState(state);
      return;
    }

    // Filter candidate coins:
    // 1. Time to funding must be between 1s and 60s (< 1 minute countdown!)
    // 2. Spread must be >= minSpreadBps (default 5 bps)
    // 3. Price divergence must be <= maxPriceDivergencePct (default 0.01%)
    // 4. Symbol must not already be in activeHedges
    const activeSymbols = new Set(state.activeHedges.map((h) => h.symbol));

    let topCandidate: any = null;
    let highestSpread = 0;

    for (const coin of opportunities) {
      if (activeSymbols.has(coin.symbol)) continue;

      const secondsToFunding = coin.secondsToFunding;
      // Countdown condition: less than 1 minute (1s to 60s)
      const isFundingImminent = secondsToFunding > 0 && secondsToFunding <= 60;

      if (!isFundingImminent) continue;

      const isSpreadSufficient = coin.spreadBps >= config.minSpreadBps;
      const isPriceParityStrict = coin.divergencePct <= config.maxPriceDivergencePct;

      state.lastEvaluatedCandidate = {
        symbol: coin.symbol,
        spreadBps: coin.spreadBps,
        divergencePct: coin.divergencePct,
        secondsToFunding,
        qualified: isSpreadSufficient && isPriceParityStrict,
        reason: !isSpreadSufficient
          ? `Spread (${coin.spreadBps} bps) < Min (${config.minSpreadBps} bps)`
          : !isPriceParityStrict
          ? `Price Divergence (${coin.divergencePct}%) > Max (${config.maxPriceDivergencePct}%)`
          : "QUALIFIED_FOR_ENTRY",
      };

      if (isSpreadSufficient && isPriceParityStrict) {
        if (coin.spreadBps > highestSpread) {
          highestSpread = coin.spreadBps;
          topCandidate = coin;
        }
      }
    }

    if (!topCandidate) {
      const topOpp = opportunities[0];
      state.statusText = `SCANNING (Top: ${topOpp?.symbol || "N/A"} - Spread: ${topOpp?.spreadBps || 0} bps - Countdown: ${topOpp?.secondsToFunding || 0}s)`;
      saveBotState(state);
      return;
    }

    // Double-check fresh price divergence right before placement
    const freshCheck = await fetchFreshPrices(topCandidate.symbol);
    if (freshCheck.divergencePct > config.maxPriceDivergencePct) {
      appendBotLog(
        state,
        `[SNIPER PAUSE] ${topCandidate.symbol} spread is ${topCandidate.spreadBps} bps, but fresh price divergence drifted to ${freshCheck.divergencePct.toFixed(3)}% (Limit: ${config.maxPriceDivergencePct}%). Waiting for parity.`,
        "warn"
      );
      state.statusText = `WAITING_PARITY (${topCandidate.symbol} ${freshCheck.divergencePct.toFixed(3)}%)`;
      saveBotState(state);
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // PHASE 3: EXECUTE DUAL HEDGE ENTRY FOR TOP CANDIDATE
    // ─────────────────────────────────────────────────────────────
    appendBotLog(
      state,
      `[OPPORTUNITY QUALIFIED] ${topCandidate.symbol} reached funding window (${topCandidate.secondsToFunding}s left). Spread: ${topCandidate.spreadBps} bps (>= ${config.minSpreadBps} bps). Divergence: ${freshCheck.divergencePct.toFixed(4)}% (<= ${config.maxPriceDivergencePct}%). Executing dual hedge...`,
      "info"
    );

    // Compute sizing: 20% of available balance
    const { binanceBal, bitgetBal } = await fetchAvailableBalances();
    const effectiveBal = Math.min(binanceBal, bitgetBal);
    const allocatedMargin = Math.max(10, effectiveBal * (config.balanceAllocationPct / 100));

    state.statusText = `EXECUTING_HEDGE (${topCandidate.symbol})`;
    const entryRes = await executeDualHedgeEntry(topCandidate, config, allocatedMargin);

    if (entryRes.success && entryRes.hedge) {
      state.activeHedges.push(entryRes.hedge);
      appendBotLog(
        state,
        `[HEDGE PLACED] Successfully opened dual hedge on ${topCandidate.symbol}! Size: ${entryRes.hedge.quantity} ($${entryRes.hedge.notionalUsdt} USDT). Active hedges: ${state.activeHedges.length}/${config.maxSimultaneousHedges}.`,
        "success"
      );
      state.statusText = `HEDGED (${topCandidate.symbol} ACTIVE)`;
    } else {
      appendBotLog(
        state,
        `[ENTRY ABORTED] ${topCandidate.symbol} entry failed: ${entryRes.error}`,
        "error"
      );
      state.statusText = `ENTRY_FAILED (${topCandidate.symbol})`;
    }

    saveBotState(state);
  } catch (err: any) {
    console.error("Bot cycle unexpected error:", err);
    appendBotLog(state, `Cycle error: ${err.message}`, "error");
    saveBotState(state);
  } finally {
    globalForBot.botIsExecutingCycle = false;
  }
}

/**
 * Ensure background worker is active
 */
export function ensureBotWorker(): void {
  const state = loadBotState();
  if (state.isRunning && state.config.enabled && !globalForBot.botInterval) {
    // Run an immediate initial cycle
    runAutonomousBotCycle().catch(() => {});

    // Set recurring 5-second interval
    globalForBot.botInterval = setInterval(() => {
      runAutonomousBotCycle().catch(() => {});
    }, (state.config.scanIntervalSeconds || 5) * 1000);
  }
}

// Auto-boot background worker on module initialization
ensureBotWorker();
