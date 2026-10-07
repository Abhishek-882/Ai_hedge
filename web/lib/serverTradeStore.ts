import fs from "fs";
import path from "path";

export interface ServerHedgeTrade {
  id: string;
  timestamp: number;
  symbol: string;
  type: string;
  directionLabel: string;
  quantity: number | string;
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
  status: "ACTIVE" | "CONFIRMED" | "CLOSED" | "DELTA_NEUTRAL";
}

const TRADES_FILE_PATH = path.join(process.cwd(), "hedge_trades_history.json");

// Singleton memory cache across hot-reloads / serverless invocations
const globalForTrades = global as unknown as {
  serverTrades?: ServerHedgeTrade[];
};

function getInitialSeededTrades(): ServerHedgeTrade[] {
  const now = Date.now();
  return [
    {
      id: "HDG-899884",
      timestamp: now - 180000,
      symbol: "ETHUSDT",
      type: "QUICK_HEDGE_1CLICK",
      directionLabel: "Long BN + Short BG",
      quantity: 0.03,
      leg1Venue: "Binance",
      leg1Side: "BUY",
      leg1Price: 2560.23,
      leg1OrderId: "777435",
      leg2Venue: "Bitget",
      leg2Side: "SELL",
      leg2Price: 2563.72,
      leg2OrderId: "548032",
      interLegDeltaMs: 147.4,
      realizedPnl: 0,
      status: "ACTIVE",
    },
    {
      id: "HDG-821906",
      timestamp: now - 360000,
      symbol: "SOLUSDT",
      type: "QUICK_HEDGE_1CLICK",
      directionLabel: "Long BN + Short BG",
      quantity: 0.20,
      leg1Venue: "Binance",
      leg1Side: "BUY",
      leg1Price: 116.09,
      leg1OrderId: "776682",
      leg2Venue: "Bitget",
      leg2Side: "SELL",
      leg2Price: 116.52,
      leg2OrderId: "864512",
      interLegDeltaMs: 32.6,
      realizedPnl: 0,
      status: "ACTIVE",
    },
    {
      id: "HDG-491801",
      timestamp: now - 600000,
      symbol: "BTCUSDT",
      type: "QUICK_HEDGE_1CLICK",
      directionLabel: "Long BN + Short BG",
      quantity: 0.005,
      leg1Venue: "Binance",
      leg1Side: "BUY",
      leg1Price: 82963.5,
      leg1OrderId: "773507",
      leg2Venue: "Bitget",
      leg2Side: "SELL",
      leg2Price: 82948.7,
      leg2OrderId: "440704",
      interLegDeltaMs: 6.0,
      realizedPnl: 0,
      status: "ACTIVE",
    },
    {
      id: "HDG-312948",
      timestamp: now - 900000,
      symbol: "LINKUSDT",
      type: "QUICK_HEDGE_1CLICK",
      directionLabel: "Long BN + Short BG",
      quantity: 1.0,
      leg1Venue: "Binance",
      leg1Side: "BUY",
      leg1Price: 13.39,
      leg1OrderId: "771203",
      leg2Venue: "Bitget",
      leg2Side: "SELL",
      leg2Price: 13.35,
      leg2OrderId: "329184",
      interLegDeltaMs: 45.2,
      realizedPnl: 0,
      status: "ACTIVE",
    },
    {
      id: "HDG-208492",
      timestamp: now - 1200000,
      symbol: "NEARUSDT",
      type: "QUICK_HEDGE_1CLICK",
      directionLabel: "Long BN + Short BG",
      quantity: 3.0,
      leg1Venue: "Binance",
      leg1Side: "BUY",
      leg1Price: 5.03,
      leg1OrderId: "769912",
      leg2Venue: "Bitget",
      leg2Side: "SELL",
      leg2Price: 5.09,
      leg2OrderId: "219842",
      interLegDeltaMs: 18.5,
      realizedPnl: 0,
      status: "ACTIVE",
    },
  ];
}

export function loadTrades(): ServerHedgeTrade[] {
  if (globalForTrades.serverTrades && globalForTrades.serverTrades.length > 0) {
    return globalForTrades.serverTrades;
  }

  try {
    if (fs.existsSync(TRADES_FILE_PATH)) {
      const raw = fs.readFileSync(TRADES_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
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

export function recordServerTrade(trade: Partial<ServerHedgeTrade>): ServerHedgeTrade {
  const trades = loadTrades();
  const fullTrade: ServerHedgeTrade = {
    id: trade.id || `HDG-${Date.now().toString().slice(-6)}`,
    timestamp: trade.timestamp || Date.now(),
    symbol: (trade.symbol || "BTCUSDT").toUpperCase(),
    type: trade.type || "QUICK_HEDGE_1CLICK",
    directionLabel: trade.directionLabel || (trade.leg1Side === "SELL" ? "Short BN + Long BG" : "Long BN + Short BG"),
    quantity: trade.quantity || "0.005",
    leg1Venue: trade.leg1Venue || "Binance",
    leg1Side: trade.leg1Side || "SELL",
    leg1Price: trade.leg1Price || 0,
    leg1OrderId: trade.leg1OrderId,
    leg2Venue: trade.leg2Venue || "Bitget",
    leg2Side: trade.leg2Side || "BUY",
    leg2Price: trade.leg2Price || 0,
    leg2OrderId: trade.leg2OrderId,
    interLegDeltaMs: trade.interLegDeltaMs || 0,
    realizedPnl: trade.realizedPnl || 0,
    status: trade.status || "ACTIVE",
  };
  const updated = [fullTrade, ...trades].slice(0, 100);
  saveTrades(updated);
  return fullTrade;
}
