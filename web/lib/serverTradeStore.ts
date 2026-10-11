import fs from "fs";
import path from "path";
import { readDataFile, saveDataFile, readUserDataFile, saveUserDataFile } from "./storagePath";

export interface ServerHedgeTrade {
  id: string;
  userId?: string;
  timestamp: number; // Open timestamp
  closeTimestamp?: number; // Close timestamp
  durationMs?: number; // Latency / duration between hedge open and close
  symbol: string;
  type: string;
  directionLabel: string;
  quantity: number | string;
  notionalUsdt?: number;
  leg1Venue: string;
  leg1Side: string;
  leg1Price: number;
  leg1OrderId?: string | number;
  leg2Venue: string;
  leg2Side: string;
  leg2Price: number;
  leg2OrderId?: string | number;
  interLegDeltaMs: number;
  realizedPnl: number;
  returnsPct?: number;
  feesUsdt?: number;
  status: "ACTIVE" | "CONFIRMED" | "CLOSED" | "DELTA_NEUTRAL";
}

const TRADES_FILE_NAME = "hedge_trades_history.json";

// In-memory per-tenant trade cache
const globalForTrades = global as unknown as {
  tenantTrades?: Record<string, ServerHedgeTrade[]>;
};

if (!globalForTrades.tenantTrades) {
  globalForTrades.tenantTrades = {};
}

export function loadTrades(userId?: string): ServerHedgeTrade[] {
  const cacheKey = userId || "global_default";

  if (globalForTrades.tenantTrades?.[cacheKey] !== undefined) {
    return globalForTrades.tenantTrades[cacheKey];
  }

  let parsed: ServerHedgeTrade[] = [];
  if (userId && userId !== "global_default") {
    parsed = readUserDataFile<ServerHedgeTrade[]>(userId, TRADES_FILE_NAME, []);
    // Fallback to global if user has no trades yet and is admin
    if (parsed.length === 0 && (userId === "usr_admin_varsha" || userId.includes("admin"))) {
      parsed = readDataFile<ServerHedgeTrade[]>(TRADES_FILE_NAME, []);
    }
  } else {
    parsed = readDataFile<ServerHedgeTrade[]>(TRADES_FILE_NAME, []);
  }

  if (!Array.isArray(parsed)) {
    parsed = [];
  }

  globalForTrades.tenantTrades![cacheKey] = parsed;
  return parsed;
}

export function saveTrades(trades: ServerHedgeTrade[], userId?: string) {
  const cacheKey = userId || "global_default";
  globalForTrades.tenantTrades![cacheKey] = trades;

  if (userId && userId !== "global_default") {
    saveUserDataFile(userId, TRADES_FILE_NAME, trades);
    // Mirror to global if admin
    if (userId === "usr_admin_varsha" || userId.includes("admin")) {
      saveDataFile(TRADES_FILE_NAME, trades);
    }
  } else {
    saveDataFile(TRADES_FILE_NAME, trades);
  }
}

export function clearTrades(userId?: string): void {
  saveTrades([], userId);
}

export function recordServerTrade(trade: Partial<ServerHedgeTrade>, userId?: string): ServerHedgeTrade {
  const targetUser = userId || trade.userId || "global_default";
  const trades = loadTrades(targetUser);
  const now = Date.now();
  const openTime = trade.timestamp || now;
  const closeTime = trade.closeTimestamp || (trade.status === "CLOSED" || trade.status === "DELTA_NEUTRAL" ? now : undefined);
  const durationMs = trade.durationMs !== undefined
    ? trade.durationMs
    : (closeTime ? Math.max(120, closeTime - openTime) : undefined);

  const price = trade.leg1Price || trade.leg2Price || 0;
  const qty = typeof trade.quantity === "number" ? trade.quantity : parseFloat(String(trade.quantity || "0"));
  const notional = trade.notionalUsdt || (price > 0 && qty > 0 ? parseFloat((price * qty).toFixed(2)) : 0);
  const realizedPnl = trade.realizedPnl !== undefined ? trade.realizedPnl : 0;
  const returnsPct = trade.returnsPct !== undefined
    ? trade.returnsPct
    : (notional > 0 ? parseFloat(((realizedPnl / notional) * 100).toFixed(4)) : 0);

  const fullTrade: ServerHedgeTrade = {
    id: trade.id || `HDG-${Date.now().toString().slice(-6)}`,
    userId: targetUser,
    timestamp: openTime,
    closeTimestamp: closeTime,
    durationMs,
    symbol: (trade.symbol || "BTCUSDT").toUpperCase(),
    type: trade.type || "QUICK_HEDGE_1CLICK",
    directionLabel: trade.directionLabel || (trade.leg1Side === "SELL" ? "Short BN + Long BG" : "Long BN + Short BG"),
    quantity: trade.quantity || "0.005",
    notionalUsdt: notional,
    leg1Venue: trade.leg1Venue || "Binance",
    leg1Side: trade.leg1Side || "SELL",
    leg1Price: trade.leg1Price || 0,
    leg1OrderId: trade.leg1OrderId,
    leg2Venue: trade.leg2Venue || "Bitget",
    leg2Side: trade.leg2Side || "BUY",
    leg2Price: trade.leg2Price || 0,
    leg2OrderId: trade.leg2OrderId,
    interLegDeltaMs: trade.interLegDeltaMs || 0,
    realizedPnl,
    returnsPct,
    feesUsdt: trade.feesUsdt ?? 0.0012,
    status: trade.status || "ACTIVE",
  };

  const existingIdx = trades.findIndex((t) => t.id === fullTrade.id);
  let updated: ServerHedgeTrade[];
  if (existingIdx >= 0) {
    updated = [...trades];
    updated[existingIdx] = {
      ...updated[existingIdx],
      ...fullTrade,
      leg1OrderId: fullTrade.leg1OrderId || updated[existingIdx].leg1OrderId,
      leg2OrderId: fullTrade.leg2OrderId || updated[existingIdx].leg2OrderId,
    };
  } else {
    updated = [fullTrade, ...trades].slice(0, 200);
  }

  saveTrades(updated, targetUser);
  return fullTrade;
}
