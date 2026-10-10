import fs from "fs";
import path from "path";
import { signAndFetchBinance, setBinanceLeverage } from "./binanceSigner";
import { placeBitgetOrder, setBitgetLeverage, BitgetCredentials } from "./bitgetSigner";
import { getLeadStaggerDelays, recordExecutionRTT } from "./latencyTracker";
import { recordServerTrade } from "./serverTradeStore";
import { getDeterministicNextFundingTime } from "./settlementTime";
import { fetchFundingMetaMap, SymbolFundingMeta } from "./exchangeFundingMeta";
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
  maxMarginCapUsdt: number;
  postSettlementWaitSeconds: number;
  closeMaxPriceDivergencePct: number;
  scanIntervalSeconds: number;
  timingMode?: "FUNDING_SNIPER_1M" | "CONTINUOUS_SPREAD";
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

export interface BotSetFile {
  id: string;
  fileName: string;
  name: string;
  description: string;
  config: BotConfig;
  contentText: string;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BotInstance {
  id: string;
  name: string;
  activeSetFileName: string;
  enabled: boolean;
  maxMarginCapUsdt: number;
  config: BotConfig;
  flattenedCoinsBlacklist: string[];
  activeHedges: ActiveBotHedge[];
  completedHedges: ActiveBotHedge[];
  statusText: string;
  lastEvaluatedCandidate?: {
    symbol: string;
    spreadBps: number;
    divergencePct: number;
    secondsToFunding: number;
    qualified: boolean;
    reason: string;
  } | null;
  createdAt: number;
  updatedAt: number;
}

export interface BotEngineState {
  isRunning: boolean;
  runInBackgroundWhenClosed: boolean;
  mode: string;
  startedAt: number;
  lastCycleAt: number;
  cyclesCompleted: number;
  activeBotId: string;
  bots: BotInstance[];
  setFiles: BotSetFile[];
  logs: BotLog[];
  // Legacy backward compatibility properties
  config?: BotConfig;
  activeHedges?: ActiveBotHedge[];
  completedHedges?: ActiveBotHedge[];
  statusText?: string;
  lastEvaluatedCandidate?: any;
}

const STATE_FILE_PATH = path.join(process.cwd(), "bot_daemon_state.json");
const SET_FILES_PATH = path.join(process.cwd(), "bot_set_files.json");
const AUDIT_LOG_FILE_PATH = path.join(process.cwd(), "bot_audit_log.json");

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

export const DEFAULT_CONFIG: BotConfig = {
  enabled: true,
  minSpreadBps: 5.0,
  maxPriceDivergencePct: 0.03,
  balanceAllocationPct: 20,
  leverageMode: "MAX_PER_COIN",
  customLeverage: 50,
  maxSimultaneousHedges: 3,
  maxMarginCapUsdt: 500,
  postSettlementWaitSeconds: 15,
  closeMaxPriceDivergencePct: 0.03,
  scanIntervalSeconds: 5,
  timingMode: "FUNDING_SNIPER_1M",
};

export function serializeConfigToSetText(config: BotConfig, name: string): string {
  return [
    `; ============================================================`,
    `; AI-Hedge Delta-Neutral Quantitative Strategy Set File`,
    `; Strategy Preset: ${name}`,
    `; Exported: ${new Date().toISOString()}`,
    `; Compatible with: MetaTrader 4/5 & AI-Hedge Daemon Engine`,
    `; ============================================================`,
    `Enabled=${config.enabled}`,
    `MinSpreadBps=${config.minSpreadBps}`,
    `MaxPriceDivergencePct=${config.maxPriceDivergencePct}`,
    `BalanceAllocationPct=${config.balanceAllocationPct}`,
    `LeverageMode=${config.leverageMode}`,
    `CustomLeverage=${config.customLeverage}`,
    `MaxSimultaneousHedges=${config.maxSimultaneousHedges}`,
    `MaxMarginCapUsdt=${config.maxMarginCapUsdt || 500}`,
    `PostSettlementWaitSeconds=${config.postSettlementWaitSeconds}`,
    `CloseMaxPriceDivergencePct=${config.closeMaxPriceDivergencePct}`,
    `ScanIntervalSeconds=${config.scanIntervalSeconds}`,
    `TimingMode=${config.timingMode || "FUNDING_SNIPER_1M"}`,
  ].join("\n");
}

export function parseSetTextToConfig(text: string, baseConfig?: BotConfig): BotConfig {
  const cfg: BotConfig = { ...(baseConfig || DEFAULT_CONFIG) };
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim().toLowerCase();
    const val = line.slice(eqIdx + 1).trim();

    switch (key) {
      case "enabled":
        cfg.enabled = val.toLowerCase() === "true" || val === "1";
        break;
      case "minspreadbps":
        cfg.minSpreadBps = parseFloat(val) || cfg.minSpreadBps;
        break;
      case "maxpricedivergencepct":
        cfg.maxPriceDivergencePct = parseFloat(val) || cfg.maxPriceDivergencePct;
        break;
      case "balanceallocationpct":
        cfg.balanceAllocationPct = parseFloat(val) || cfg.balanceAllocationPct;
        break;
      case "leveragemode":
        cfg.leverageMode = val === "CUSTOM" ? "CUSTOM" : "MAX_PER_COIN";
        break;
      case "customleverage":
        cfg.customLeverage = parseInt(val, 10) || cfg.customLeverage;
        break;
      case "maxsimultaneoushedges":
        cfg.maxSimultaneousHedges = parseInt(val, 10) || cfg.maxSimultaneousHedges;
        break;
      case "maxmargincapusdt":
        cfg.maxMarginCapUsdt = parseFloat(val) || 500;
        break;
      case "postsettlementwaitseconds":
        cfg.postSettlementWaitSeconds = parseInt(val, 10) || cfg.postSettlementWaitSeconds;
        break;
      case "closemaxpricedivergencepct":
        cfg.closeMaxPriceDivergencePct = parseFloat(val) || cfg.closeMaxPriceDivergencePct;
        break;
      case "scanintervalseconds":
        cfg.scanIntervalSeconds = parseInt(val, 10) || cfg.scanIntervalSeconds;
        break;
      case "timingmode":
        cfg.timingMode = val === "CONTINUOUS_SPREAD" ? "CONTINUOUS_SPREAD" : "FUNDING_SNIPER_1M";
        break;
    }
  }
  return cfg;
}

export const BUILT_IN_SET_FILES: BotSetFile[] = [
  {
    id: "set-conservative",
    fileName: "conservative_5bps_sniper.set",
    name: "Conservative 5bps Sniper",
    description: "Snipes within 60s of funding with strict 5 bps spread, 0.03% parity, $500 hard margin cap.",
    config: {
      enabled: true,
      minSpreadBps: 5.0,
      maxPriceDivergencePct: 0.03,
      balanceAllocationPct: 20,
      leverageMode: "MAX_PER_COIN",
      customLeverage: 50,
      maxSimultaneousHedges: 3,
      maxMarginCapUsdt: 500,
      postSettlementWaitSeconds: 15,
      closeMaxPriceDivergencePct: 0.03,
      scanIntervalSeconds: 5,
      timingMode: "FUNDING_SNIPER_1M",
    },
    contentText: serializeConfigToSetText(
      {
        enabled: true,
        minSpreadBps: 5.0,
        maxPriceDivergencePct: 0.03,
        balanceAllocationPct: 20,
        leverageMode: "MAX_PER_COIN",
        customLeverage: 50,
        maxSimultaneousHedges: 3,
        maxMarginCapUsdt: 500,
        postSettlementWaitSeconds: 15,
        closeMaxPriceDivergencePct: 0.03,
        scanIntervalSeconds: 5,
        timingMode: "FUNDING_SNIPER_1M",
      },
      "Conservative 5bps Sniper"
    ),
    isBuiltIn: true,
    createdAt: 1775000000000,
    updatedAt: 1775000000000,
  },
  {
    id: "set-aggressive",
    fileName: "aggressive_continuous_arbitrage.set",
    name: "Aggressive Continuous Arbitrage",
    description: "Continuous spread capture 24/7 without waiting for funding window. 3 bps spread, 0.05% parity, $1,000 cap.",
    config: {
      enabled: true,
      minSpreadBps: 3.0,
      maxPriceDivergencePct: 0.05,
      balanceAllocationPct: 25,
      leverageMode: "MAX_PER_COIN",
      customLeverage: 50,
      maxSimultaneousHedges: 5,
      maxMarginCapUsdt: 1000,
      postSettlementWaitSeconds: 15,
      closeMaxPriceDivergencePct: 0.05,
      scanIntervalSeconds: 5,
      timingMode: "CONTINUOUS_SPREAD",
    },
    contentText: serializeConfigToSetText(
      {
        enabled: true,
        minSpreadBps: 3.0,
        maxPriceDivergencePct: 0.05,
        balanceAllocationPct: 25,
        leverageMode: "MAX_PER_COIN",
        customLeverage: 50,
        maxSimultaneousHedges: 5,
        maxMarginCapUsdt: 1000,
        postSettlementWaitSeconds: 15,
        closeMaxPriceDivergencePct: 0.05,
        scanIntervalSeconds: 5,
        timingMode: "CONTINUOUS_SPREAD",
      },
      "Aggressive Continuous Arbitrage"
    ),
    isBuiltIn: true,
    createdAt: 1775000000000,
    updatedAt: 1775000000000,
  },
  {
    id: "set-balanced",
    fileName: "balanced_institutional_harvest.set",
    name: "Balanced Institutional Harvest",
    description: "Funding Sniper mode with 4 bps spread threshold, 0.03% parity, $750 hard cap.",
    config: {
      enabled: true,
      minSpreadBps: 4.0,
      maxPriceDivergencePct: 0.03,
      balanceAllocationPct: 20,
      leverageMode: "MAX_PER_COIN",
      customLeverage: 50,
      maxSimultaneousHedges: 4,
      maxMarginCapUsdt: 750,
      postSettlementWaitSeconds: 15,
      closeMaxPriceDivergencePct: 0.03,
      scanIntervalSeconds: 5,
      timingMode: "FUNDING_SNIPER_1M",
    },
    contentText: serializeConfigToSetText(
      {
        enabled: true,
        minSpreadBps: 4.0,
        maxPriceDivergencePct: 0.03,
        balanceAllocationPct: 20,
        leverageMode: "MAX_PER_COIN",
        customLeverage: 50,
        maxSimultaneousHedges: 4,
        maxMarginCapUsdt: 750,
        postSettlementWaitSeconds: 15,
        closeMaxPriceDivergencePct: 0.03,
        scanIntervalSeconds: 5,
        timingMode: "FUNDING_SNIPER_1M",
      },
      "Balanced Institutional Harvest"
    ),
    isBuiltIn: true,
    createdAt: 1775000000000,
    updatedAt: 1775000000000,
  },
];

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

export function loadSetFiles(): BotSetFile[] {
  let customFiles: BotSetFile[] = [];
  try {
    if (fs.existsSync(SET_FILES_PATH)) {
      const raw = fs.readFileSync(SET_FILES_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        customFiles = parsed;
      }
    }
  } catch {}

  const merged = [...BUILT_IN_SET_FILES];
  for (const cf of customFiles) {
    if (!merged.some((b) => b.fileName.toLowerCase() === cf.fileName.toLowerCase())) {
      merged.push(cf);
    }
  }
  return merged;
}

export function saveSetFiles(files: BotSetFile[]) {
  try {
    const customOnly = files.filter((f) => !f.isBuiltIn);
    fs.writeFileSync(SET_FILES_PATH, JSON.stringify(customOnly, null, 2), "utf-8");
  } catch (err: any) {
    console.error("Failed to save set files:", err.message);
  }
}

export function loadBotState(): BotEngineState {
  if (globalForBot.botEngineState) {
    return globalForBot.botEngineState;
  }

  const allSetFiles = loadSetFiles();

  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const raw = fs.readFileSync(STATE_FILE_PATH, "utf-8");
      const parsed = JSON.parse(raw);

      let bots: BotInstance[] = [];
      if (Array.isArray(parsed.bots) && parsed.bots.length > 0) {
        bots = parsed.bots.map((b: any, idx: number) => ({
          id: b.id || `bot-${idx + 1}`,
          name: b.name || `Bot ${idx + 1}`,
          activeSetFileName: b.activeSetFileName || "conservative_5bps_sniper.set",
          enabled: b.enabled !== undefined ? b.enabled : true,
          maxMarginCapUsdt: b.maxMarginCapUsdt || b.config?.maxMarginCapUsdt || 500,
          config: { ...DEFAULT_CONFIG, ...(b.config || {}) },
          flattenedCoinsBlacklist: Array.isArray(b.flattenedCoinsBlacklist) ? b.flattenedCoinsBlacklist : [],
          activeHedges: Array.isArray(b.activeHedges) ? b.activeHedges : [],
          completedHedges: Array.isArray(b.completedHedges) ? b.completedHedges : [],
          statusText: b.statusText || "RUNNING_24_7",
          lastEvaluatedCandidate: b.lastEvaluatedCandidate || null,
          createdAt: b.createdAt || Date.now(),
          updatedAt: b.updatedAt || Date.now(),
        }));
      } else {
        // Upgrade legacy single-bot schema to multi-bot roster
        bots = [
          {
            id: "bot-1",
            name: "Conservative Funding Sniper",
            activeSetFileName: "conservative_5bps_sniper.set",
            enabled: parsed.config?.enabled !== undefined ? parsed.config.enabled : true,
            maxMarginCapUsdt: parsed.config?.maxMarginCapUsdt || 500,
            config: { ...DEFAULT_CONFIG, ...(parsed.config || {}) },
            flattenedCoinsBlacklist: [],
            activeHedges: Array.isArray(parsed.activeHedges) ? parsed.activeHedges : [],
            completedHedges: Array.isArray(parsed.completedHedges) ? parsed.completedHedges : [],
            statusText: parsed.statusText || "RUNNING_24_7",
            lastEvaluatedCandidate: parsed.lastEvaluatedCandidate || null,
            createdAt: parsed.startedAt || Date.now(),
            updatedAt: Date.now(),
          },
        ];
      }

      const activeBotId = parsed.activeBotId && bots.some((b) => b.id === parsed.activeBotId)
        ? parsed.activeBotId
        : bots[0].id;

      const activeBot = bots.find((b) => b.id === activeBotId) || bots[0];

      const state: BotEngineState = {
        isRunning: parsed.isRunning !== undefined ? parsed.isRunning : true,
        runInBackgroundWhenClosed: true,
        mode: "AUTONOMOUS_SERVER_24_7",
        startedAt: parsed.startedAt || Date.now(),
        lastCycleAt: parsed.lastCycleAt || Date.now(),
        cyclesCompleted: parsed.cyclesCompleted || 0,
        activeBotId,
        bots,
        setFiles: allSetFiles,
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        // Legacy props mirrored from active bot
        config: activeBot.config,
        activeHedges: activeBot.activeHedges,
        completedHedges: activeBot.completedHedges,
        statusText: activeBot.statusText,
        lastEvaluatedCandidate: activeBot.lastEvaluatedCandidate,
      };

      globalForBot.botEngineState = state;
      return state;
    }
  } catch {}

  // Initial fresh state
  const initialBot: BotInstance = {
    id: "bot-1",
    name: "Conservative Funding Sniper",
    activeSetFileName: "conservative_5bps_sniper.set",
    enabled: true,
    maxMarginCapUsdt: 500,
    config: { ...DEFAULT_CONFIG },
    flattenedCoinsBlacklist: [],
    activeHedges: [],
    completedHedges: [],
    statusText: "RUNNING_24_7",
    lastEvaluatedCandidate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const defaultState: BotEngineState = {
    isRunning: true,
    runInBackgroundWhenClosed: true,
    mode: "AUTONOMOUS_SERVER_24_7",
    startedAt: Date.now(),
    lastCycleAt: Date.now(),
    cyclesCompleted: 0,
    activeBotId: initialBot.id,
    bots: [initialBot],
    setFiles: allSetFiles,
    logs: [
      {
        timestamp: new Date().toISOString(),
        message: "24/7 Autonomous Multi-Bot Arbitrage Engine initialized. Ready to execute delta-neutral hedges.",
        level: "info",
      },
    ],
    config: initialBot.config,
    activeHedges: initialBot.activeHedges,
    completedHedges: initialBot.completedHedges,
    statusText: initialBot.statusText,
    lastEvaluatedCandidate: null,
  };

  globalForBot.botEngineState = defaultState;
  saveBotState(defaultState);
  return defaultState;
}

export function saveBotState(state: BotEngineState) {
  // Mirror active bot onto legacy properties for seamless backward compatibility
  const activeBot = state.bots.find((b) => b.id === state.activeBotId) || state.bots[0];
  if (activeBot) {
    state.config = activeBot.config;
    state.activeHedges = activeBot.activeHedges;
    state.completedHedges = activeBot.completedHedges;
    state.statusText = activeBot.statusText;
    state.lastEvaluatedCandidate = activeBot.lastEvaluatedCandidate;
  }

  globalForBot.botEngineState = state;
  try {
    fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (err: any) {
    console.error("Failed to save bot daemon state:", err.message);
  }
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
  if (state.logs.length > 100) {
    state.logs = state.logs.slice(0, 100);
  }

  // AUTO-SAVE AUDIT STREAM: Immediately persist to disk for 24/7 diagnostics
  try {
    saveBotState(state);

    let auditHistory: BotLog[] = [];
    if (fs.existsSync(AUDIT_LOG_FILE_PATH)) {
      try {
        const raw = fs.readFileSync(AUDIT_LOG_FILE_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) auditHistory = parsed;
      } catch {}
    }
    auditHistory.unshift(log);
    if (auditHistory.length > 500) {
      auditHistory = auditHistory.slice(0, 500);
    }
    fs.writeFileSync(AUDIT_LOG_FILE_PATH, JSON.stringify(auditHistory, null, 2), "utf-8");
  } catch (err: any) {
    console.error("Auto-save audit log error:", err.message);
  }
}

// ─────────────────────────────────────────────────────────────
// PER-BOT FLATTEN MEMORY LOCK HELPERS
// ─────────────────────────────────────────────────────────────
export function lockFlattenedCoinForBot(symbol: string, botId?: string) {
  const state = loadBotState();
  const upper = symbol.toUpperCase();
  let changed = false;

  for (const bot of state.bots) {
    if (!botId || bot.id === botId) {
      if (!bot.flattenedCoinsBlacklist.includes(upper)) {
        bot.flattenedCoinsBlacklist.push(upper);
        changed = true;
        appendBotLog(
          state,
          `[MEMORY LOCK ENGAGED] ${upper} was flattened. Locked in bot "${bot.name}" memory to prevent churn until manual reset.`,
          "warn"
        );
      }
    }
  }

  if (changed) {
    saveBotState(state);
  }
}

export function resetBotMemory(botId?: string) {
  const state = loadBotState();
  let changed = false;

  for (const bot of state.bots) {
    if (!botId || bot.id === botId) {
      const count = bot.flattenedCoinsBlacklist.length;
      bot.flattenedCoinsBlacklist = [];
      changed = true;
      appendBotLog(
        state,
        `[MEMORY RESET] Cleared ${count} locked coin(s) from bot "${bot.name}". All universe coins now eligible for trading.`,
        "info"
      );
    }
  }

  if (changed) {
    saveBotState(state);
  }
}

export function unlockSingleCoin(symbol: string, botId?: string) {
  const state = loadBotState();
  const upper = symbol.toUpperCase();
  let changed = false;

  for (const bot of state.bots) {
    if (!botId || bot.id === botId) {
      const idx = bot.flattenedCoinsBlacklist.indexOf(upper);
      if (idx !== -1) {
        bot.flattenedCoinsBlacklist.splice(idx, 1);
        changed = true;
        appendBotLog(
          state,
          `[MEMORY UNLOCKED] ${upper} unblocked from bot "${bot.name}". Now eligible for scanning.`,
          "info"
        );
      }
    }
  }

  if (changed) {
    saveBotState(state);
  }
}

// ─────────────────────────────────────────────────────────────
// MULTI-BOT CRUD & SET FILE MANAGER HELPERS
// ─────────────────────────────────────────────────────────────
export function createBot(name: string, setFileName?: string, maxMarginCapUsdt?: number): BotInstance {
  const state = loadBotState();
  const setFiles = loadSetFiles();

  const chosenSet = setFileName
    ? setFiles.find((s) => s.fileName.toLowerCase() === setFileName.toLowerCase())
    : setFiles[0];

  const configToUse = chosenSet ? { ...chosenSet.config } : { ...DEFAULT_CONFIG };
  if (maxMarginCapUsdt && maxMarginCapUsdt > 0) {
    configToUse.maxMarginCapUsdt = maxMarginCapUsdt;
  }

  const newBot: BotInstance = {
    id: `bot-${Date.now().toString().slice(-6)}`,
    name: name.trim() || `Bot ${state.bots.length + 1}`,
    activeSetFileName: chosenSet?.fileName || "conservative_5bps_sniper.set",
    enabled: true,
    maxMarginCapUsdt: configToUse.maxMarginCapUsdt || 500,
    config: configToUse,
    flattenedCoinsBlacklist: [],
    activeHedges: [],
    completedHedges: [],
    statusText: "READY",
    lastEvaluatedCandidate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  state.bots.push(newBot);
  state.activeBotId = newBot.id;
  appendBotLog(state, `[BOT CREATED] New bot "${newBot.name}" added with preset "${newBot.activeSetFileName}".`, "success");
  saveBotState(state);
  return newBot;
}

export function editBot(
  botId: string,
  updates: {
    name?: string;
    activeSetFileName?: string;
    maxMarginCapUsdt?: number;
    enabled?: boolean;
    config?: Partial<BotConfig>;
    flattenedCoinsBlacklist?: string[];
  }
): BotInstance | null {
  const state = loadBotState();
  const bot = state.bots.find((b) => b.id === botId);
  if (!bot) return null;

  if (updates.name && updates.name.trim()) {
    bot.name = updates.name.trim();
  }
  if (updates.activeSetFileName) {
    bot.activeSetFileName = updates.activeSetFileName;
  }
  if (updates.enabled !== undefined) {
    bot.enabled = updates.enabled;
    bot.config.enabled = updates.enabled;
  }
  if (updates.maxMarginCapUsdt !== undefined && updates.maxMarginCapUsdt > 0) {
    bot.maxMarginCapUsdt = updates.maxMarginCapUsdt;
    bot.config.maxMarginCapUsdt = updates.maxMarginCapUsdt;
  }
  if (Array.isArray(updates.flattenedCoinsBlacklist)) {
    bot.flattenedCoinsBlacklist = updates.flattenedCoinsBlacklist;
  }
  if (updates.config) {
    bot.config = {
      ...bot.config,
      ...updates.config,
    };
  }

  bot.updatedAt = Date.now();
  appendBotLog(state, `[BOT UPDATED] Configuration for "${bot.name}" saved to disk.`, "info");
  saveBotState(state);
  return bot;
}

export function deleteBot(botId: string): boolean {
  const state = loadBotState();
  if (state.bots.length <= 1) {
    return false; // Cannot delete the last active bot
  }

  const idx = state.bots.findIndex((b) => b.id === botId);
  if (idx === -1) return false;

  const deleted = state.bots.splice(idx, 1)[0];
  if (state.activeBotId === botId) {
    state.activeBotId = state.bots[0].id;
  }

  appendBotLog(state, `[BOT DELETED] Bot "${deleted.name}" removed from server roster.`, "warn");
  saveBotState(state);
  return true;
}

export function saveSetFile(
  fileName: string,
  name: string,
  description: string,
  config: BotConfig
): BotSetFile {
  let cleanFileName = fileName.trim();
  if (!cleanFileName.toLowerCase().endsWith(".set")) {
    cleanFileName += ".set";
  }

  const state = loadBotState();
  let setFiles = loadSetFiles();

  const contentText = serializeConfigToSetText(config, name);
  const existingIdx = setFiles.findIndex((s) => s.fileName.toLowerCase() === cleanFileName.toLowerCase());

  let setFileObj: BotSetFile;

  if (existingIdx !== -1) {
    setFileObj = {
      ...setFiles[existingIdx],
      name: name.trim() || setFiles[existingIdx].name,
      description: description.trim() || setFiles[existingIdx].description,
      config: { ...config },
      contentText,
      updatedAt: Date.now(),
    };
    setFiles[existingIdx] = setFileObj;
  } else {
    setFileObj = {
      id: `set-${Date.now().toString().slice(-6)}`,
      fileName: cleanFileName,
      name: name.trim() || cleanFileName,
      description: description.trim() || "Custom user-saved quantitative parameters.",
      config: { ...config },
      contentText,
      isBuiltIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setFiles.push(setFileObj);
  }

  saveSetFiles(setFiles);
  state.setFiles = setFiles;
  appendBotLog(state, `[SET FILE SAVED] Strategy preset "${cleanFileName}" saved to disk.`, "success");
  saveBotState(state);
  return setFileObj;
}

export function applySetFileToBot(botId: string, fileName: string): boolean {
  const state = loadBotState();
  const bot = state.bots.find((b) => b.id === botId);
  if (!bot) return false;

  const setFiles = loadSetFiles();
  const setObj = setFiles.find((s) => s.fileName.toLowerCase() === fileName.toLowerCase());
  if (!setObj) return false;

  bot.config = { ...bot.config, ...setObj.config };
  bot.activeSetFileName = setObj.fileName;
  if (setObj.config.maxMarginCapUsdt) {
    bot.maxMarginCapUsdt = setObj.config.maxMarginCapUsdt;
  }
  bot.updatedAt = Date.now();

  appendBotLog(
    state,
    `[SET APPLIED] Preset "${setObj.name}" (${setObj.fileName}) loaded into bot "${bot.name}".`,
    "success"
  );
  saveBotState(state);
  return true;
}

export function deleteSetFile(fileName: string): boolean {
  const setFiles = loadSetFiles();
  const target = setFiles.find((s) => s.fileName.toLowerCase() === fileName.toLowerCase());
  if (!target || target.isBuiltIn) {
    return false; // Cannot delete built-in presets
  }

  const filtered = setFiles.filter((s) => s.fileName.toLowerCase() !== fileName.toLowerCase());
  saveSetFiles(filtered);

  const state = loadBotState();
  state.setFiles = filtered;
  appendBotLog(state, `[SET FILE DELETED] Preset "${fileName}" removed.`, "warn");
  saveBotState(state);
  return true;
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
    const path = "/api/v3/account/assets?category=USDT-FUTURES";
    const res = await fetch(`https://api.bitget.com${path}`, {
      headers: {
        papertrading: "1",
        paptrading: "1",
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

// ─────────────────────────────────────────────────────────────
// TRADABLE SYMBOL UNIVERSE VALIDATOR
// Eliminates rejections by ensuring only symbols active on BOTH testnets qualify
// ─────────────────────────────────────────────────────────────
let cachedTradableSymbols: Set<string> | null = null;
let lastTradableSymbolsFetch = 0;

const FALLBACK_DUAL_SYMBOLS = new Set([
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "ADAUSDT", "DOGEUSDT",
  "LTCUSDT", "BNBUSDT", "XRPUSDT", "LINKUSDT", "AVAXUSDT",
  "DOTUSDT", "NEARUSDT", "TRXUSDT", "UNIUSDT", "PEPEUSDT",
  "SHIBUSDT", "BCHUSDT", "USDCUSDT"
]);

async function getTradableSymbolsSet(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedTradableSymbols && (now - lastTradableSymbolsFetch < 300_000)) {
    return cachedTradableSymbols;
  }

  try {
    const [bnRes, bgRes] = await Promise.allSettled([
      fetch("https://demo-fapi.binance.com/fapi/v1/exchangeInfo", { cache: "no-store" }).then((r) => r.json()),
      fetch("https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES", {
        headers: { papertrading: "1", paptrading: "1" },
        cache: "no-store",
      }).then((r) => r.json()),
    ]);

    const bnSymbols = new Set<string>();
    if (bnRes.status === "fulfilled" && Array.isArray(bnRes.value?.symbols)) {
      for (const s of bnRes.value.symbols) {
        if (s.status === "TRADING" && s.symbol) bnSymbols.add(s.symbol);
      }
    }

    const bgSymbols = new Set<string>();
    if (bgRes.status === "fulfilled" && Array.isArray(bgRes.value?.data)) {
      for (const c of bgRes.value.data) {
        if (c.symbol) bgSymbols.add(c.symbol);
      }
    }

    const common = new Set<string>();
    bnSymbols.forEach((sym) => {
      if (bgSymbols.has(sym)) {
        common.add(sym);
      }
    });

    if (common.size === 0) {
      cachedTradableSymbols = FALLBACK_DUAL_SYMBOLS;
    } else {
      cachedTradableSymbols = common;
    }
    lastTradableSymbolsFetch = now;
    return cachedTradableSymbols;
  } catch {
    cachedTradableSymbols = FALLBACK_DUAL_SYMBOLS;
    return cachedTradableSymbols;
  }
}

/**
 * Fetch live tickers and candidates from exchanges
 */
async function fetchOpportunityCoins(): Promise<any[]> {
  try {
    const tradableSet = await getTradableSymbolsSet();
    const [bnRes, bgRes, metaMap] = await Promise.all([
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
      fetchFundingMetaMap(),
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

      if (!tradableSet.has(sym)) continue;

      const bg = bgMap.get(sym);
      if (!bg) continue;

      const bnRate = parseFloat(bn.lastFundingRate || "0");
      const bgRate = parseFloat(bg.fundingRate || "0");
      const spreadBps = parseFloat((Math.abs(bnRate - bgRate) * 10000).toFixed(2));

      const bnMark = parseFloat(bn.markPrice || "0");
      const bgMark = parseFloat(bg.markPrice || bg.lastPr || "0") || bnMark;

      const priceDiff = Math.abs(bnMark - bgMark);
      const divergencePct = bnMark > 0 ? (priceDiff / bnMark) * 100 : 0;

      const meta: SymbolFundingMeta = metaMap.get(sym) || {
        symbol: sym,
        fundingIntervalHours: 8,
        binanceIntervalHours: 8,
        bitgetIntervalHours: 8,
        settlementCycleLabel: "8h Cycle",
        payoutsPerDay: 3,
        bitgetNextUpdate: 0,
      };

      const effInterval = meta.fundingIntervalHours;
      const rawBnNext = parseInt(bn.nextFundingTime || "0", 10);
      const bgNext = meta.bitgetNextUpdate || 0;
      let nextFundingTime = 0;

      if (rawBnNext > now && bgNext > now) {
        nextFundingTime = Math.min(rawBnNext, bgNext);
      } else if (rawBnNext > now) {
        nextFundingTime = rawBnNext;
      } else if (bgNext > now) {
        nextFundingTime = bgNext;
      } else {
        nextFundingTime = getDeterministicNextFundingTime(now, effInterval);
      }

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
        fundingIntervalHours: effInterval,
        settlementCycleLabel: meta.settlementCycleLabel,
        payoutsPerDay: meta.payoutsPerDay,
        direction,
      });
    }

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
  allocatedMargin: number,
  botName: string,
  state: BotEngineState
): Promise<{ success: boolean; hedge?: ActiveBotHedge; error?: string }> {
  const symbol = coin.symbol;
  const maxLev = getCoinMaxLeverage(symbol);
  const binanceLeverage = config.leverageMode === "CUSTOM" ? config.customLeverage : maxLev.bn;
  const bitgetLeverage = config.leverageMode === "CUSTOM" ? config.customLeverage : maxLev.bg;

  const refPrice = coin.binanceMarkPrice || 100;
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

  appendBotLog(
    state,
    `[ORDER PREPARE] Bot "${botName}": Sizing calculated for ${symbol} | Notional: $${totalNotional.toFixed(2)} USDT (${formattedQty} units) | Lev: BN ${binanceLeverage}x / BG ${bitgetLeverage}x | Direction: ${coin.direction === "SHORT_BINANCE_LONG_BITGET" ? "Short BN + Long BG" : "Long BN + Short BG"}`,
    "info"
  );

  await Promise.allSettled([
    setBinanceLeverage(ADMIN_BINANCE_KEY, ADMIN_BINANCE_SECRET, symbol, binanceLeverage, ADMIN_BINANCE_ENDPOINT),
    setBitgetLeverage(ADMIN_BITGET_CREDS, symbol, bitgetLeverage),
  ]);

  const { binanceDelayMs, bitgetDelayMs, leadStaggerAppliedMs, staggerVenue } = getLeadStaggerDelays();

  let leg1AckTime = 0;
  let leg2AckTime = 0;
  let leg1OrderDurationMs = 0;
  let leg2OrderDurationMs = 0;

  appendBotLog(
    state,
    `[ORDER DISPATCH] Bot "${botName}": Firing parallel orders for ${symbol} (Leg 1: ${leg1Side} Binance, Leg 2: ${leg2Side.toUpperCase()} Bitget) with ${leadStaggerAppliedMs.toFixed(0)}ms lead-stagger...`,
    "info"
  );

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
      appendBotLog(
        state,
        `[LEG 1 FILLED] Bot "${botName}": Binance ${leg1Side} ${symbol} filled successfully! Order #${res.orderId} @ $${fillPrice} (${leg1OrderDurationMs.toFixed(0)}ms)`,
        "info"
      );
      return { success: true, orderId: res.orderId, price: fillPrice, venue: "Binance" };
    } catch (err: any) {
      appendBotLog(
        state,
        `[LEG 1 REJECTED] Bot "${botName}": Binance ${leg1Side} ${symbol} failed: ${err.message}`,
        "error"
      );
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
    const bitgetPrice = res.avgPrice || coin.bitgetMarkPrice || refPrice;

    if (res.success) {
      appendBotLog(
        state,
        `[LEG 2 FILLED] Bot "${botName}": Bitget ${leg2Side.toUpperCase()} ${symbol} filled successfully! Order #${res.orderId} @ $${bitgetPrice} (${leg2OrderDurationMs.toFixed(0)}ms)`,
        "info"
      );
    } else {
      appendBotLog(
        state,
        `[LEG 2 REJECTED] Bot "${botName}": Bitget ${leg2Side.toUpperCase()} ${symbol} failed: ${res.error || "Order execution error"}`,
        "error"
      );
    }

    return {
      success: res.success,
      orderId: res.orderId,
      price: bitgetPrice,
      error: res.error,
      venue: "Bitget",
    };
  })();

  const [leg1Res, leg2Res] = await Promise.all([leg1Promise, leg2Promise]);
  const interLegDelta = Math.abs(leg1AckTime - leg2AckTime);

  // Circuit breaker unwind if one leg failed
  if (leg1Res.success && !leg2Res.success) {
    const unwindSide = leg1Side === "BUY" ? "SELL" : "BUY";
    appendBotLog(
      state,
      `[CIRCUIT BREAKER] Bot "${botName}": Bitget rejected (${leg2Res.error}). Triggering immediate emergency IOC unwind on Binance for ${symbol}...`,
      "warn"
    );
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
      appendBotLog(
        state,
        `[UNWIND SUCCESS] Bot "${botName}": Successfully unwound Binance leg for ${symbol}. Net exposure neutralized to $0.00.`,
        "warn"
      );
    } catch (unwindErr: any) {
      console.error("Critical: Leg 1 emergency unwind failed:", unwindErr);
      appendBotLog(
        state,
        `[CRITICAL ALERT] Bot "${botName}": Binance emergency unwind failed for ${symbol}: ${unwindErr.message}`,
        "error"
      );
    }
    return {
      success: false,
      error: `Leg 2 (Bitget) rejected: ${leg2Res.error}. Emergency IOC unwind executed on Leg 1. Safe retry next cycle.`,
    };
  }

  if (!leg1Res.success && leg2Res.success) {
    appendBotLog(
      state,
      `[CIRCUIT BREAKER] Bot "${botName}": Binance rejected (${leg1Res.error}). Triggering immediate emergency IOC unwind on Bitget for ${symbol}...`,
      "warn"
    );
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
      appendBotLog(
        state,
        `[UNWIND SUCCESS] Bot "${botName}": Successfully unwound Bitget leg for ${symbol}. Net exposure neutralized to $0.00.`,
        "warn"
      );
    } catch (unwindErr: any) {
      console.error("Critical: Leg 2 emergency unwind failed:", unwindErr);
      appendBotLog(
        state,
        `[CRITICAL ALERT] Bot "${botName}": Bitget emergency unwind failed for ${symbol}: ${unwindErr.message}`,
        "error"
      );
    }
    return {
      success: false,
      error: `Leg 1 (Binance) rejected: ${leg1Res.error}. Emergency IOC unwind executed on Leg 2. Safe retry next cycle.`,
    };
  }

  if (!leg1Res.success && !leg2Res.success) {
    appendBotLog(
      state,
      `[TRADE FAILED] Bot "${botName}": Both venue orders rejected for ${symbol}. Binance: ${leg1Res.error} | Bitget: ${leg2Res.error}`,
      "error"
    );
    return {
      success: false,
      error: `Both legs failed. BN: ${leg1Res.error} | BG: ${leg2Res.error}`,
    };
  }

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

  appendBotLog(
    state,
    `[HEDGE FILLED] Bot "${botName}": Successfully entered dual delta-neutral hedge on ${symbol}! Net Delta = 0.00. Inter-leg arrival delta: ${interLegDelta.toFixed(1)}ms. BN #${leg1Res.orderId} @ $${leg1Res.price} | BG #${leg2Res.orderId} @ $${leg2Res.price}.`,
    "success"
  );

  return { success: true, hedge };
}

/**
 * Execute dual close for an active hedge once price parity matches
 */
async function executeDualHedgeClose(
  hedge: ActiveBotHedge,
  freshPrices: { bnPrice: number; bgPrice: number; divergencePct: number },
  botName: string,
  state: BotEngineState
): Promise<{ success: boolean; pnl: number; error?: string }> {
  const symbol = hedge.symbol;
  const formattedQty = hedge.quantity;
  const leg1CloseSide: "BUY" | "SELL" = hedge.direction === "SHORT_BINANCE_LONG_BITGET" ? "BUY" : "SELL";
  const leg2CloseSide: "buy" | "sell" = leg1CloseSide === "BUY" ? "sell" : "buy";

  appendBotLog(
    state,
    `[CLOSE DISPATCH] Bot "${botName}": Submitting synchronized market close for ${symbol} (Binance ${leg1CloseSide} & Bitget ${leg2CloseSide.toUpperCase()})...`,
    "info"
  );

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
      appendBotLog(
        state,
        `[CLOSE LEG 1] Bot "${botName}": Binance ${leg1CloseSide} ${symbol} close filled @ $${exitPrice}`,
        "info"
      );
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
      const exitPrice = res.avgPrice || freshPrices.bgPrice;
      if (res.success) {
        appendBotLog(
          state,
          `[CLOSE LEG 2] Bot "${botName}": Bitget ${leg2CloseSide.toUpperCase()} ${symbol} close filled @ $${exitPrice}`,
          "info"
        );
      } else {
        appendBotLog(
          state,
          `[CLOSE LEG 2 REJECTED] Bot "${botName}": Bitget close failed for ${symbol}: ${res.error || "Close error"}`,
          "error"
        );
      }
      return { success: res.success, price: exitPrice };
    })(),
  ]);

  const bnExitPrice = closeBnRes.status === "fulfilled" && closeBnRes.value.success ? closeBnRes.value.price : freshPrices.bnPrice;
  const bgExitPrice = closeBgRes.status === "fulfilled" && closeBgRes.value.success ? closeBgRes.value.price : freshPrices.bgPrice;

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

  appendBotLog(
    state,
    `[CLOSE COMPLETED] Bot "${botName}": Successfully unwound ${symbol} hedge. Binance PnL: $${bnPnl.toFixed(4)}, Bitget PnL: $${bgPnl.toFixed(4)}, Net Realized PnL: $${netPnl.toFixed(4)} USDT.`,
    "success"
  );

  return { success: true, pnl: netPnl };
}

/**
 * Main Autonomous Multi-Bot Cycle
 * Iterates across all enabled bots in the roster:
 * 1. Evaluates exits on active hedges
 * 2. Evaluates margin cap and capacity
 * 3. Scans candidates honoring the bot's Flatten Memory Lock and Set parameters
 */
export async function runAutonomousBotCycle(): Promise<void> {
  const state = loadBotState();
  if (!state.isRunning) {
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

    // Fetch shared balances & candidates once for all bots in this cycle
    const [balances, opportunities] = await Promise.all([
      fetchAvailableBalances(),
      fetchOpportunityCoins(),
    ]);

    const effectiveBal = Math.min(balances.binanceBal, balances.bitgetBal);

    for (const bot of state.bots) {
      if (!bot.enabled) {
        bot.statusText = "PAUSED_BY_USER";
        continue;
      }

      const config = bot.config;

      // ─────────────────────────────────────────────────────────────
      // PHASE 1: EXIT MONITOR FOR THIS BOT'S ACTIVE HEDGES
      // ─────────────────────────────────────────────────────────────
      const survivingHedges: ActiveBotHedge[] = [];

      for (const hedge of bot.activeHedges) {
        const waitThreshold = hedge.fundingSettlementTime + (config.postSettlementWaitSeconds || 15) * 1000;
        const settlementHasPassed = now >= waitThreshold;

        if (!settlementHasPassed) {
          survivingHedges.push(hedge);
          continue;
        }

        const freshPrices = await fetchFreshPrices(hedge.symbol);
        const isParitySatisfied = freshPrices.divergencePct <= (config.closeMaxPriceDivergencePct || 0.03);

        if (!isParitySatisfied) {
          hedge.status = "WAITING_PRICE_PARITY";
          survivingHedges.push(hedge);

          if (state.cyclesCompleted % 4 === 0) {
            appendBotLog(
              state,
              `[BASIS HOLD] Bot "${bot.name}": ${hedge.symbol} settlement passed. Waiting for basis divergence (${freshPrices.divergencePct.toFixed(3)}%) to converge to <= ${config.closeMaxPriceDivergencePct}% before closing.`,
              "warn"
            );
          }
          continue;
        }

        appendBotLog(
          state,
          `[AUTO-CLOSE TRIGGERED] Bot "${bot.name}": ${hedge.symbol} funding fee credited & price divergence (${freshPrices.divergencePct.toFixed(3)}% <= ${config.closeMaxPriceDivergencePct}%). Executing dual close...`,
          "info"
        );

        hedge.status = "CLOSING";
        const closeRes = await executeDualHedgeClose(hedge, freshPrices, bot.name, state);

        if (closeRes.success) {
          hedge.status = "CLOSED";
          hedge.closeTime = Date.now();
          hedge.closeBinancePrice = freshPrices.bnPrice;
          hedge.closeBitgetPrice = freshPrices.bgPrice;
          hedge.closeDivergencePct = freshPrices.divergencePct;
          hedge.pnl = closeRes.pnl;

          bot.completedHedges.unshift(hedge);
          if (bot.completedHedges.length > 50) {
            bot.completedHedges = bot.completedHedges.slice(0, 50);
          }

          appendBotLog(
            state,
            `[HEDGE CLOSED] Successfully unwound ${hedge.symbol} hedge by "${bot.name}". Net Realized PnL: $${closeRes.pnl} USDT.`,
            "success"
          );

          // PER-BOT FLATTEN MEMORY LOCK: Lock coin so bot will NEVER re-trade until memory is force-reset
          if (!bot.flattenedCoinsBlacklist.includes(hedge.symbol)) {
            bot.flattenedCoinsBlacklist.push(hedge.symbol);
            appendBotLog(
              state,
              `[MEMORY LOCK ENGAGED] ${hedge.symbol} was flattened. Locked in bot "${bot.name}" memory to prevent churn until manual reset.`,
              "warn"
            );
          }
        } else {
          hedge.status = "ACTIVE";
          survivingHedges.push(hedge);
          appendBotLog(
            state,
            `[CLOSE RETRY] Bot "${bot.name}": Error closing ${hedge.symbol}: ${closeRes.error}. Will retry on next cycle.`,
            "warn"
          );
        }
      }

      bot.activeHedges = survivingHedges;

      // ─────────────────────────────────────────────────────────────
      // PHASE 2: MARGIN CEILING & CAPACITY VERIFICATION
      // ─────────────────────────────────────────────────────────────
      const currentBotMargin = bot.activeHedges.reduce((sum, h) => {
        const lev = h.binanceLeverage || 20;
        return sum + (h.notionalUsdt / lev);
      }, 0);

      const marginCap = bot.maxMarginCapUsdt || config.maxMarginCapUsdt || 500;
      if (currentBotMargin >= marginCap) {
        bot.statusText = `MARGIN_CAP_REACHED ($${currentBotMargin.toFixed(0)}/$${marginCap} USDT)`;
        if (state.cyclesCompleted % 6 === 0) {
          appendBotLog(
            state,
            `[CAPACITY CHECK] Bot "${bot.name}": Margin cap reached ($${currentBotMargin.toFixed(2)}/$${marginCap} USDT). New entries paused until hedges unwind.`,
            "warn"
          );
        }
        continue;
      }

      const availableSlots = (config.maxSimultaneousHedges || 3) - bot.activeHedges.length;
      if (availableSlots <= 0) {
        bot.statusText = `AT_MAX_CAPACITY (${bot.activeHedges.length}/${config.maxSimultaneousHedges} ACTIVE)`;
        if (state.cyclesCompleted % 6 === 0) {
          appendBotLog(
            state,
            `[CAPACITY CHECK] Bot "${bot.name}": Maximum simultaneous hedges active (${bot.activeHedges.length}/${config.maxSimultaneousHedges}). Capacity full.`,
            "info"
          );
        }
        continue;
      }

      if (opportunities.length === 0) {
        bot.statusText = "SCANNING_OPPORTUNITIES";
        if (state.cyclesCompleted % 6 === 0) {
          appendBotLog(state, `[SCAN CHECK] Bot "${bot.name}": No market opportunities returned from exchanges. Retrying...`, "warn");
        }
        continue;
      }

      // ─────────────────────────────────────────────────────────────
      // PHASE 3: CANDIDATE FILTERING WITH FLATTEN MEMORY LOCK
      // ─────────────────────────────────────────────────────────────
      const activeSymbolsInBot = new Set(bot.activeHedges.map((h) => h.symbol));
      let topCandidate: any = null;
      let highestSpread = 0;

      for (const coin of opportunities) {
        if (activeSymbolsInBot.has(coin.symbol)) continue;

        // FLATTEN MEMORY LOCK CHECK:
        if (bot.flattenedCoinsBlacklist.includes(coin.symbol)) {
          if (!bot.lastEvaluatedCandidate || bot.lastEvaluatedCandidate.symbol === coin.symbol) {
            bot.lastEvaluatedCandidate = {
              symbol: coin.symbol,
              spreadBps: coin.spreadBps,
              divergencePct: coin.divergencePct,
              secondsToFunding: coin.secondsToFunding,
              qualified: false,
              reason: `[LOCKED IN MEMORY] ${coin.symbol} was flattened. Reset memory in settings to re-trade.`,
            };
          }
          continue;
        }

        const secondsToFunding = coin.secondsToFunding;
        const isContinuous = config.timingMode === "CONTINUOUS_SPREAD";
        const isTimingQualified = isContinuous || (secondsToFunding > 0 && secondsToFunding <= 60);

        if (!isTimingQualified) continue;

        const isSpreadSufficient = coin.spreadBps >= (config.minSpreadBps || 5.0);
        const isPriceParityStrict = coin.divergencePct <= (config.maxPriceDivergencePct || 0.03);

        bot.lastEvaluatedCandidate = {
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
        bot.statusText = `SCANNING (Top: ${topOpp?.symbol || "N/A"} - Spread: ${topOpp?.spreadBps || 0} bps - Cycle: ${topOpp?.fundingIntervalHours || 8}h - Countdown: ${topOpp?.secondsToFunding || 0}s)`;
        if (state.cyclesCompleted % 6 === 0 && topOpp) {
          const timingInfo = config.timingMode === "FUNDING_SNIPER_1M"
            ? `Countdown: ${topOpp.secondsToFunding}s (${topOpp.fundingIntervalHours || 8}h cycle, >60s sniper window)`
            : `Spread: ${topOpp.spreadBps} bps (${topOpp.fundingIntervalHours || 8}h cycle, Min: ${config.minSpreadBps} bps)`;
          appendBotLog(
            state,
            `[SCAN CHECK] Bot "${bot.name}": Inspected ${opportunities.length} pairs. Top: ${topOpp.symbol} (Spread: ${topOpp.spreadBps} bps, Cycle: ${topOpp.fundingIntervalHours || 8}h, Div: ${topOpp.divergencePct}%). ${timingInfo}. Standing by.`,
            "info"
          );
        }
        continue;
      }

      // Fresh parity verification
      const freshCheck = await fetchFreshPrices(topCandidate.symbol);
      if (freshCheck.divergencePct > (config.maxPriceDivergencePct || 0.03)) {
        appendBotLog(
          state,
          `[PARITY DRIFT BLOCKED] Bot "${bot.name}": ${topCandidate.symbol} spread is ${topCandidate.spreadBps} bps, but fresh price divergence drifted to ${freshCheck.divergencePct.toFixed(3)}% (Limit: ${config.maxPriceDivergencePct}%). Waiting for parity.`,
          "warn"
        );
        bot.statusText = `WAITING_PARITY (${topCandidate.symbol} ${freshCheck.divergencePct.toFixed(3)}%)`;
        continue;
      }

      // Compute sizing bounded by available allocation & margin cap headroom
      const rawAllocatedMargin = Math.max(10, effectiveBal * ((config.balanceAllocationPct || 20) / 100));
      const remainingMarginCap = Math.max(10, marginCap - currentBotMargin);
      const allocatedMargin = Math.min(rawAllocatedMargin, remainingMarginCap);

      appendBotLog(
        state,
        `[OPPORTUNITY QUALIFIED] Bot "${bot.name}" selected ${topCandidate.symbol} (Spread: ${topCandidate.spreadBps} bps, Cycle: ${topCandidate.fundingIntervalHours || 8}h, Div: ${freshCheck.divergencePct.toFixed(4)}%, Alloc: $${allocatedMargin.toFixed(0)} USDT). Executing dual hedge...`,
        "info"
      );

      bot.statusText = `EXECUTING_HEDGE (${topCandidate.symbol})`;
      const entryRes = await executeDualHedgeEntry(topCandidate, config, allocatedMargin, bot.name, state);

      if (entryRes.success && entryRes.hedge) {
        bot.activeHedges.push(entryRes.hedge);
        appendBotLog(
          state,
          `[HEDGE PLACED] Bot "${bot.name}" opened dual hedge on ${topCandidate.symbol}! Size: ${entryRes.hedge.quantity} ($${entryRes.hedge.notionalUsdt} USDT). Active: ${bot.activeHedges.length}/${config.maxSimultaneousHedges}.`,
          "success"
        );
        bot.statusText = `HEDGED (${topCandidate.symbol} ACTIVE)`;
      } else {
        appendBotLog(
          state,
          `[ENTRY ABORTED] Bot "${bot.name}": ${topCandidate.symbol} entry failed: ${entryRes.error}`,
          "error"
        );
        bot.statusText = `ENTRY_FAILED (${topCandidate.symbol})`;
      }
    }

    saveBotState(state);
  } catch (err: any) {
    console.error("Multi-bot cycle error:", err);
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
  if (state.isRunning && !globalForBot.botInterval) {
    runAutonomousBotCycle().catch(() => {});

    globalForBot.botInterval = setInterval(() => {
      runAutonomousBotCycle().catch(() => {});
    }, 5000);
  }
}

// Auto-boot background worker on module initialization
ensureBotWorker();
