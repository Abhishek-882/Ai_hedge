import fs from "fs";
import path from "path";

export interface ServerHedgeTrade {
  id: string;
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

const TRADES_FILE_PATH = path.join(process.cwd(), "hedge_trades_history.json");

// Singleton memory cache across hot-reloads / serverless invocations
const globalForTrades = global as unknown as {
  serverTrades?: ServerHedgeTrade[];
};

// History starts clean now - NO dummy/pre-seeded trades
function getInitialSeededTrades(): ServerHedgeTrade[] {
  return [];
}

export function loadTrades(): ServerHedgeTrade[] {
  if (globalForTrades.serverTrades !== undefined) {
    return globalForTrades.serverTrades;
  }

  try {
    if (fs.existsSync(TRADES_FILE_PATH)) {
      const raw = fs.readFileSync(TRADES_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        globalForTrades.serverTrades = parsed;
        return parsed;
      }
    }
  } catch {}

  const initial = getInitialSeededTrades();
  globalForTrades.serverTrades = initial;
  saveTrades(initial);
  return initial;
}

export function saveTrades(trades: ServerHedgeTrade[]) {
  globalForTrades.serverTrades = trades;
  try {
    fs.writeFileSync(TRADES_FILE_PATH, JSON.stringify(trades, null, 2), "utf-8");
  } catch {}
}

export function clearTrades(): void {
  saveTrades([]);
}

export function recordServerTrade(trade: Partial<ServerHedgeTrade>): ServerHedgeTrade {
  const trades = loadTrades();
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

  const updated = [fullTrade, ...trades].slice(0, 200);
  saveTrades(updated);
  return fullTrade;
}
