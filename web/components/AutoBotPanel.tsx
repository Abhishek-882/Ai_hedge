"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Power,
  Play,
  Pause,
  Settings,
  Activity,
  ShieldCheck,
  Zap,
  ArrowRight,
  RefreshCw,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  DollarSign,
  Maximize2,
  XCircle,
  HelpCircle,
} from "lucide-react";
import { formatCountdown } from "@/lib/settlementTime";

interface BotConfig {
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

interface ActiveBotHedge {
  id: string;
  symbol: string;
  direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET";
  quantity: string;
  notionalUsdt: number;
  binanceLeverage: number;
  bitgetLeverage: number;
  entrySpreadBps: number;
  entryBinancePrice: number;
  entryBitgetPrice: number;
  entryDivergencePct: number;
  entryTime: number;
  fundingSettlementTime: number;
  status: "ACTIVE" | "WAITING_PRICE_PARITY" | "CLOSING" | "CLOSED" | "FAILED_UNWOUND";
  pnl?: number;
}

interface BotLog {
  timestamp: string;
  message: string;
  level: "info" | "success" | "warn" | "error";
}

interface BotDaemonState {
  isRunning: boolean;
  runInBackgroundWhenClosed: boolean;
  startedAt: number;
  lastCycleAt: number;
  cyclesCompleted: number;
  uptimeSeconds: number;
  statusText: string;
  config: BotConfig;
  activeHedges: ActiveBotHedge[];
  completedHedges: ActiveBotHedge[];
  logs: BotLog[];
  lastEvaluatedCandidate?: {
    symbol: string;
    spreadBps: number;
    divergencePct: number;
    secondsToFunding: number;
    qualified: boolean;
    reason: string;
  } | null;
}

export default function AutoBotPanel() {
  const [daemon, setDaemon] = useState<BotDaemonState | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(true);

  // Form Config State
  const [minSpreadBps, setMinSpreadBps] = useState<number>(5.0);
  const [maxPriceDivergencePct, setMaxPriceDivergencePct] = useState<number>(0.01);
  const [balanceAllocationPct, setBalanceAllocationPct] = useState<number>(20);
  const [leverageMode, setLeverageMode] = useState<"MAX_PER_COIN" | "CUSTOM">("MAX_PER_COIN");
  const [customLeverage, setCustomLeverage] = useState<number>(50);
  const [maxSimultaneousHedges, setMaxSimultaneousHedges] = useState<number>(3);
  const [closeMaxPriceDivergencePct, setCloseMaxPriceDivergencePct] = useState<number>(0.01);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  // Keep live countdown timer ticking
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/daemon", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        if (!isConfigOpen) {
          setMinSpreadBps(data.daemon.config?.minSpreadBps ?? 5.0);
          setMaxPriceDivergencePct(data.daemon.config?.maxPriceDivergencePct ?? 0.01);
          setBalanceAllocationPct(data.daemon.config?.balanceAllocationPct ?? 20);
          setLeverageMode(data.daemon.config?.leverageMode ?? "MAX_PER_COIN");
          setCustomLeverage(data.daemon.config?.customLeverage ?? 50);
          setMaxSimultaneousHedges(data.daemon.config?.maxSimultaneousHedges ?? 3);
          setCloseMaxPriceDivergencePct(data.daemon.config?.closeMaxPriceDivergencePct ?? 0.01);
        }
      }
    } catch {}
  }, [isConfigOpen]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const toggleBot = async () => {
    if (!daemon) return;
    setLoading(true);
    const action = daemon.isRunning && daemon.config.enabled ? "stop" : "start";
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          config: {
            minSpreadBps,
            maxPriceDivergencePct,
            balanceAllocationPct,
            leverageMode,
            customLeverage,
            maxSimultaneousHedges,
            closeMaxPriceDivergencePct,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        setSaveMessage("Settings saved successfully!");
        setTimeout(() => setSaveMessage(null), 3000);
      }
    } catch {
      setSaveMessage("Failed to save settings");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleForceScan = async () => {
    try {
      await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force_scan" }),
      });
      fetchStatus();
    } catch {}
  };

  const handleForceCloseHedge = async (id: string, symbol: string) => {
    if (!confirm(`Force close hedge on ${symbol}?`)) return;
    try {
      await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_hedge", hedgeId: id, symbol }),
      });
      fetchStatus();
    } catch {}
  };

  const isBotActive = daemon?.isRunning && daemon?.config?.enabled;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 font-mono shadow-xl relative overflow-hidden">
      {/* Decorative ambient background blur */}
      <div
        className={`absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none opacity-20 ${
          isBotActive ? "bg-emerald-500" : "bg-zinc-600"
        }`}
      />

      {/* Header section: Master Bot Switch & Telemetry */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <span
              className={`w-3 h-3 rounded-full shrink-0 ${
                isBotActive ? "bg-emerald-400 animate-ping" : "bg-zinc-500"
              }`}
            />
            <div className="flex items-center space-x-2">
              <Bot className={`w-5 h-5 ${isBotActive ? "text-emerald-400" : "text-zinc-400"}`} />
              <h2 className="text-base sm:text-lg font-bold uppercase tracking-tight text-zinc-100">
                24/7 AUTONOMOUS ARBITRAGE BOT // SERVER DAEMON
              </h2>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                isBotActive
                  ? "bg-emerald-950/70 text-emerald-400 border-emerald-700/60"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800"
              }`}
            >
              {isBotActive ? "RUNNING 24/7 (SERVER PERSISTENT)" : "STANDBY"}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Executes hedges autonomously when funding is &lt;1m away, spread &ge;{daemon?.config?.minSpreadBps ?? 5} bps, and price parity is nil (&le;{daemon?.config?.maxPriceDivergencePct ?? 0.01}%). Works even if logged out or browser closed.
          </p>
        </div>

        {/* Master ON/OFF Button & Action Bar */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={handleForceScan}
            disabled={!isBotActive}
            className="px-3 py-2 rounded-lg bg-surface-card hover:bg-zinc-800 border border-border text-xs text-zinc-300 font-semibold flex items-center space-x-1.5 transition-colors disabled:opacity-40"
            title="Trigger immediate scan cycle"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Force Scan</span>
          </button>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
              isConfigOpen
                ? "bg-amber-500/20 text-accent-amber border-amber-500/50"
                : "bg-surface-card hover:bg-zinc-800 border-border text-zinc-300"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Config</span>
            {isConfigOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={toggleBot}
            disabled={loading}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-lg active:scale-95 ${
              isBotActive
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/40 ring-1 ring-rose-400"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40 ring-1 ring-emerald-400 animate-pulse"
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isBotActive ? "PAUSE AUTONOMOUS BOT" : "ACTIVATE 24/7 AUTO-BOT"}</span>
          </button>
        </div>
      </div>

      {/* Telemetry Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 text-xs font-mono">
        <div className="bg-surface-card p-2.5 rounded-lg border border-border">
          <div className="text-[10px] text-zinc-500 uppercase">DAEMON STATUS</div>
          <div className="font-bold text-zinc-200 truncate mt-0.5 text-[11px]">
            {daemon?.statusText || "INITIALIZING..."}
          </div>
        </div>

        <div className="bg-surface-card p-2.5 rounded-lg border border-border">
          <div className="text-[10px] text-zinc-500 uppercase">ACTIVE HEDGES</div>
          <div className="flex items-center space-x-1.5 mt-0.5">
            <span className="font-bold text-accent-amber text-sm">
              {daemon?.activeHedges?.length ?? 0}
            </span>
            <span className="text-zinc-500 text-[10px]">
              / {daemon?.config?.maxSimultaneousHedges ?? 3} MAX
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-2.5 rounded-lg border border-border">
          <div className="text-[10px] text-zinc-500 uppercase">CYCLES COMPLETED</div>
          <div className="font-bold text-zinc-200 mt-0.5">
            #{daemon?.cyclesCompleted ?? 0}
            <span className="text-[10px] text-zinc-500 font-normal ml-1">
              ({daemon?.uptimeSeconds ?? 0}s up)
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-2.5 rounded-lg border border-border">
          <div className="text-[10px] text-zinc-500 uppercase">LAST CANDIDATE SCAN</div>
          <div className="font-bold text-zinc-200 mt-0.5 text-[11px] truncate">
            {daemon?.lastEvaluatedCandidate?.symbol ? (
              <span
                className={
                  daemon.lastEvaluatedCandidate.qualified
                    ? "text-emerald-400"
                    : "text-zinc-400"
                }
              >
                {daemon.lastEvaluatedCandidate.symbol} (
                {daemon.lastEvaluatedCandidate.spreadBps}bps /{" "}
                {daemon.lastEvaluatedCandidate.secondsToFunding}s)
              </span>
            ) : (
              <span className="text-zinc-500">Scanning pairs...</span>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Admin Settings Drawer */}
      {isConfigOpen && (
        <div className="mt-4 p-4 rounded-xl bg-zinc-950/80 border border-accent-amber/30 space-y-4 text-xs animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <div className="flex items-center space-x-2 text-accent-amber font-bold">
              <Sliders className="w-4 h-4" />
              <span>ADMIN ARBITRAGE BOT SETTINGS (CONFIGURABLE)</span>
            </div>
            {saveMessage && (
              <span className="text-emerald-400 text-xs font-bold animate-pulse">
                ✓ {saveMessage}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Setting 1: Min Spread Threshold */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>MIN SPREAD THRESHOLD (BPS)</span>
                <span className="text-accent-amber font-bold">{minSpreadBps} bps</span>
              </label>
              <div className="flex items-center space-x-1.5">
                {[3, 5, 8, 10, 15].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMinSpreadBps(val)}
                    className={`px-2 py-1 rounded text-xs border ${
                      minSpreadBps === val
                        ? "bg-accent-amber text-zinc-950 font-bold border-accent-amber"
                        : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {val}
                  </button>
                ))}
                <input
                  type="number"
                  step="0.5"
                  value={minSpreadBps}
                  onChange={(e) => setMinSpreadBps(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded bg-surface border border-border text-zinc-200 text-xs"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Default: 5 bps. Only coins with spread &ge; this value qualify.
              </p>
            </div>

            {/* Setting 2: Entry Price Parity Tolerance */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>ENTRY PRICE PARITY TOLERANCE</span>
                <span className="text-accent-cyan font-bold">{maxPriceDivergencePct}%</span>
              </label>
              <div className="flex items-center space-x-1.5">
                {[0.01, 0.02, 0.05, 0.1].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxPriceDivergencePct(val)}
                    className={`px-2 py-1 rounded text-xs border ${
                      maxPriceDivergencePct === val
                        ? "bg-accent-cyan text-zinc-950 font-bold border-accent-cyan"
                        : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
                <input
                  type="number"
                  step="0.005"
                  value={maxPriceDivergencePct}
                  onChange={(e) => setMaxPriceDivergencePct(parseFloat(e.target.value) || 0)}
                  className="w-16 px-2 py-1 rounded bg-surface border border-border text-zinc-200 text-xs"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Default: 0.01% (ultra-strict). Rejects entry if prices differ.
              </p>
            </div>

            {/* Setting 3: Capital Allocation % */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>CAPITAL ALLOCATION %</span>
                <span className="text-accent-emerald font-bold">{balanceAllocationPct}%</span>
              </label>
              <div className="flex items-center space-x-1.5">
                {[10, 20, 30, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setBalanceAllocationPct(val)}
                    className={`px-2 py-1 rounded text-xs border ${
                      balanceAllocationPct === val
                        ? "bg-accent-emerald text-zinc-950 font-bold border-accent-emerald"
                        : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {val}%
                  </button>
                ))}
                <input
                  type="number"
                  step="5"
                  value={balanceAllocationPct}
                  onChange={(e) => setBalanceAllocationPct(parseInt(e.target.value, 10) || 0)}
                  className="w-16 px-2 py-1 rounded bg-surface border border-border text-zinc-200 text-xs"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Percent of available margin utilized per hedge. Default: 20%.
              </p>
            </div>

            {/* Setting 4: Leverage Mode */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold">
                LEVERAGE MODE
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLeverageMode("MAX_PER_COIN")}
                  className={`py-1.5 px-2 rounded text-xs font-bold border transition-all ${
                    leverageMode === "MAX_PER_COIN"
                      ? "bg-accent-amber/20 border-accent-amber text-accent-amber"
                      : "bg-surface-card border-border text-zinc-400"
                  }`}
                >
                  ⚡ MAX PER COIN (50x/20x)
                </button>
                <button
                  type="button"
                  onClick={() => setLeverageMode("CUSTOM")}
                  className={`py-1.5 px-2 rounded text-xs font-bold border transition-all ${
                    leverageMode === "CUSTOM"
                      ? "bg-accent-amber/20 border-accent-amber text-accent-amber"
                      : "bg-surface-card border-border text-zinc-400"
                  }`}
                >
                  CUSTOM LEVERAGE
                </button>
              </div>
              {leverageMode === "CUSTOM" && (
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={customLeverage}
                    onChange={(e) => setCustomLeverage(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <span className="font-bold text-accent-amber w-10 text-right">{customLeverage}x</span>
                </div>
              )}
            </div>

            {/* Setting 5: Max Simultaneous Hedges */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>MAX SIMULTANEOUS HEDGES</span>
                <span className="text-zinc-200 font-bold">{maxSimultaneousHedges}</span>
              </label>
              <div className="flex items-center space-x-2">
                {[1, 2, 3, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxSimultaneousHedges(val)}
                    className={`flex-1 py-1 rounded text-xs font-bold border ${
                      maxSimultaneousHedges === val
                        ? "bg-zinc-200 text-zinc-950 border-zinc-200"
                        : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {val} {val === 1 ? "Pair" : "Pairs"}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500">
                Default: Up to 3 simultaneous hedges across different coins.
              </p>
            </div>

            {/* Setting 6: Exit Price Parity Check */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>CLOSE PRICE PARITY TOLERANCE</span>
                <span className="text-zinc-200 font-bold">{closeMaxPriceDivergencePct}%</span>
              </label>
              <input
                type="number"
                step="0.005"
                value={closeMaxPriceDivergencePct}
                onChange={(e) => setCloseMaxPriceDivergencePct(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 rounded bg-surface border border-border text-zinc-200 text-xs"
              />
              <p className="text-[10px] text-zinc-500">
                After settlement, waits until prices converge to &le; this % before closing.
              </p>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="px-5 py-2 rounded-lg bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs flex items-center space-x-1.5 shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSavingConfig ? "SAVING..." : "SAVE BOT CONFIGURATION"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Autonomous Hedges Card Grid */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-accent-amber" />
            <span className="text-xs font-bold uppercase text-zinc-200">
              ACTIVE AUTONOMOUS HEDGES ({daemon?.activeHedges?.length ?? 0} /{" "}
              {daemon?.config?.maxSimultaneousHedges ?? 3})
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Auto-harvests funding &amp; unwinds on basis convergence
          </span>
        </div>

        {(!daemon?.activeHedges || daemon.activeHedges.length === 0) ? (
          <div className="p-4 rounded-lg bg-surface-card border border-border/80 text-center text-xs text-zinc-400 space-y-1">
            <div className="font-semibold text-zinc-300">NO ACTIVE HEDGES CURRENTLY RUNNING</div>
            <p className="text-[11px] text-zinc-500">
              {isBotActive
                ? "The engine is actively monitoring all perpetual contracts. When a coin reaches <1m to settlement with spread >= 5 bps and near-zero price difference, a hedge will be opened automatically."
                : "Bot is currently paused. Activate the bot above to begin autonomous 24/7 arbitrage."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {daemon.activeHedges.map((hedge) => {
              const diffMs = hedge.fundingSettlementTime - nowMs;
              const hasSettled = diffMs <= 0;
              const isWaitingParity = hedge.status === "WAITING_PRICE_PARITY";

              return (
                <div
                  key={hedge.id}
                  className={`p-3 rounded-lg border text-xs space-y-2 relative transition-all ${
                    isWaitingParity
                      ? "bg-amber-950/20 border-accent-amber/60"
                      : "bg-surface-card border-border"
                  }`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-zinc-100 text-sm">{hedge.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-accent-amber border border-amber-500/30">
                        {hedge.direction === "SHORT_BINANCE_LONG_BITGET"
                          ? "Short BN / Long BG"
                          : "Long BN / Short BG"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleForceCloseHedge(hedge.id, hedge.symbol)}
                      className="text-rose-400 hover:text-rose-200 text-[10px] font-bold px-1.5 py-0.5 rounded border border-rose-800/60 bg-rose-950/30"
                      title="Force immediate dual-close"
                    >
                      FORCE CLOSE
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                    <div>
                      <div className="text-zinc-500 text-[9px]">SIZE &amp; NOTIONAL</div>
                      <div className="font-bold text-zinc-200">
                        {hedge.quantity} (${hedge.notionalUsdt} USDT)
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">ENTRY SPREAD</div>
                      <div className="font-bold text-accent-amber">
                        {hedge.entrySpreadBps} bps ({hedge.entryDivergencePct}% div)
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">LEVERAGE</div>
                      <div className="font-bold text-zinc-300">
                        BN: {hedge.binanceLeverage}x / BG: {hedge.bitgetLeverage}x
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">SETTLEMENT COUNTDOWN</div>
                      <div
                        className={`font-bold ${
                          hasSettled ? "text-emerald-400 animate-pulse" : "text-cyan-400"
                        }`}
                      >
                        {hasSettled ? "SETTLED ✓" : formatCountdown(hedge.fundingSettlementTime, nowMs)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-1 border-t border-border/40 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500">Status:</span>
                    <span
                      className={`font-bold uppercase ${
                        isWaitingParity
                          ? "text-accent-amber animate-pulse"
                          : hasSettled
                          ? "text-accent-emerald"
                          : "text-accent-cyan"
                      }`}
                    >
                      {isWaitingParity
                        ? "WAITING FOR PRICE PARITY TO CLOSE"
                        : hasSettled
                        ? "FEE SETTLING..."
                        : "HARVESTING FUNDING"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Audit Log Stream */}
      <div className="mt-4 pt-3 border-t border-border">
        <button
          onClick={() => setIsLogsOpen(!isLogsOpen)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1"
        >
          <span className="font-bold uppercase flex items-center space-x-1.5">
            <Activity className="w-3.5 h-3.5 text-accent-cyan" />
            <span>24/7 AUTONOMOUS BOT AUDIT STREAM</span>
            <span className="text-[10px] text-zinc-500 font-normal">
              ({daemon?.logs?.length ?? 0} events)
            </span>
          </span>
          {isLogsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isLogsOpen && (
          <div className="mt-2 bg-zinc-950 p-3 rounded-lg border border-border/80 font-mono text-[11px] max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
            {(!daemon?.logs || daemon.logs.length === 0) ? (
              <div className="text-zinc-600 text-center py-2">No log entries recorded yet.</div>
            ) : (
              daemon.logs.map((log, i) => {
                let badgeClass = "text-zinc-400";
                if (log.level === "success") badgeClass = "text-emerald-400 font-bold";
                else if (log.level === "warn") badgeClass = "text-amber-400";
                else if (log.level === "error") badgeClass = "text-rose-400 font-bold";

                return (
                  <div key={i} className="flex items-start space-x-2">
                    <span className="text-zinc-600 shrink-0 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={badgeClass}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
