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
  Radio,
  Sparkles,
  Gauge,
  TrendingUp,
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
  const [saveSuccess, setSaveSuccess] = useState(false);
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
    setSaveSuccess(false);
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
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
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
  const topCandidate = daemon?.lastEvaluatedCandidate;
  const currentSpread = topCandidate?.spreadBps || 0;
  const targetThreshold = daemon?.config?.minSpreadBps || 5.0;
  const corridorPct = Math.min(100, Math.max(8, (currentSpread / 25) * 100));

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-500 overflow-hidden font-mono p-4 sm:p-6 shadow-2xl ${
        isBotActive
          ? "border-emerald-500/40 bg-gradient-to-b from-zinc-950 via-zinc-900/90 to-zinc-950 shadow-emerald-500/10 ring-1 ring-emerald-500/20"
          : "border-border bg-surface"
      }`}
    >
      {/* Radiant Ambient Spotlight (Aceternity / Magic UI Inspired) */}
      <div
        className={`absolute -top-32 -right-32 w-96 h-96 rounded-full blur-[110px] pointer-events-none transition-opacity duration-700 ${
          isBotActive ? "bg-emerald-500/15 opacity-100" : "bg-zinc-700/10 opacity-40"
        }`}
      />
      <div
        className={`absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-[110px] pointer-events-none transition-opacity duration-700 ${
          isBotActive ? "bg-cyan-500/10 opacity-100" : "bg-zinc-700/5 opacity-20"
        }`}
      />

      {/* Header section: Master Bot Switch & Telemetry */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-border/80 relative z-10">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              {isBotActive && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  isBotActive ? "bg-emerald-500" : "bg-zinc-600"
                }`}
              ></span>
            </span>

            <div className="flex items-center space-x-2">
              <Bot className={`w-5 h-5 ${isBotActive ? "text-emerald-400" : "text-zinc-500"}`} />
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-zinc-100">
                24/7 AUTONOMOUS ARBITRAGE BOT // ENGINE
              </h2>
            </div>

            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wider transition-colors ${
                isBotActive
                  ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/70 shadow-sm shadow-emerald-500/20"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800"
              }`}
            >
              {isBotActive ? "RUNNING 24/7 (SERVER PERSISTENT)" : "STANDBY"}
            </span>
          </div>

          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            Autonomous dual-venue funding rate harvester. Enforces under 1-minute (&lt;1m) countdown settlement sniper, &ge;{targetThreshold} bps spread, and zero-basis parity (&le;{daemon?.config?.maxPriceDivergencePct ?? 0.01}% divergence). Operates 24/7 on backend even when logged out.
          </p>
        </div>

        {/* Master ON/OFF Button & Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
          <button
            onClick={handleForceScan}
            disabled={!isBotActive}
            className="px-3.5 py-2.5 rounded-xl bg-surface-card hover:bg-zinc-800 border border-border text-xs text-zinc-300 font-semibold flex items-center space-x-2 active:scale-95 transition-all disabled:opacity-40 hover:border-zinc-700"
            title="Trigger immediate scan cycle across all pairs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Force Scan</span>
          </button>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center space-x-2 active:scale-95 transition-all ${
              isConfigOpen
                ? "bg-amber-500/20 text-accent-amber border-amber-500/60 shadow-md shadow-amber-500/10"
                : "bg-surface-card hover:bg-zinc-800 border-border text-zinc-300 hover:border-zinc-700"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Config</span>
            {isConfigOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={toggleBot}
            disabled={loading}
            className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2.5 transition-all shadow-xl active:scale-95 ${
              isBotActive
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60 ring-2 ring-rose-400/50"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-400/60 animate-pulse"
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isBotActive ? "PAUSE AUTONOMOUS BOT" : "ACTIVATE 24/7 AUTO-BOT"}</span>
          </button>
        </div>
      </div>

      {/* Dynamic Opportunity Corridor Radar Bar (Blueprint B from elite-web-ui-motion) */}
      <div className="mt-4 p-3.5 rounded-xl bg-zinc-950/70 border border-border/80 space-y-2 relative">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Gauge className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="text-[11px] font-bold text-zinc-300 uppercase">
              LIVE OPPORTUNITY CORRIDOR RADAR
            </span>
            {topCandidate?.symbol && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-accent-amber font-mono font-bold">
                {topCandidate.symbol}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-[10px] font-mono">
            <span className="text-zinc-500">
              ENTRY TRIGGER: <strong className="text-accent-amber">{targetThreshold} bps</strong>
            </span>
            <span className="text-zinc-500">
              CURRENT TOP: <strong className={currentSpread >= targetThreshold ? "text-emerald-400" : "text-zinc-300"}>{currentSpread.toFixed(1)} bps</strong>
            </span>
          </div>
        </div>

        {/* Multi-stage Corridor Track */}
        <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800 relative">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              currentSpread >= targetThreshold
                ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-sm shadow-emerald-500/50"
                : "bg-gradient-to-r from-amber-500 to-amber-400"
            }`}
            style={{ width: `${corridorPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] text-zinc-500 uppercase">
          <span>0 bps (Flat)</span>
          <span className="text-accent-amber font-bold">Target &ge; {targetThreshold} bps Trigger</span>
          <span>15 bps (Prime)</span>
          <span>25+ bps (Extreme)</span>
        </div>
      </div>

      {/* Telemetry Stats Grid (Tremor & Modern FinTech Card Spec) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs font-mono">
        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>DAEMON STATE</span>
            <Radio className={`w-3 h-3 ${isBotActive ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
          </div>
          <div className="font-bold text-zinc-200 truncate mt-1 text-[11px]">
            {daemon?.statusText || "INITIALIZING..."}
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>ACTIVE HEDGES</span>
            <Layers className="w-3 h-3 text-accent-amber" />
          </div>
          <div className="flex items-center space-x-1.5 mt-1">
            <span className="font-bold text-accent-amber text-base">
              {daemon?.activeHedges?.length ?? 0}
            </span>
            <span className="text-zinc-500 text-[10px]">
              / {daemon?.config?.maxSimultaneousHedges ?? 3} MAX SLOTS
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>CYCLES COMPLETED</span>
            <Activity className="w-3 h-3 text-accent-cyan" />
          </div>
          <div className="font-bold text-zinc-200 mt-1">
            #{daemon?.cyclesCompleted ?? 0}
            <span className="text-[10px] text-zinc-500 font-normal ml-1">
              ({daemon?.uptimeSeconds ?? 0}s up)
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>CANDIDATE RADAR</span>
            <Sparkles className="w-3 h-3 text-accent-emerald" />
          </div>
          <div className="font-bold text-zinc-200 mt-1 text-[11px] truncate">
            {daemon?.lastEvaluatedCandidate?.symbol ? (
              <span
                className={
                  daemon.lastEvaluatedCandidate.qualified
                    ? "text-emerald-400 font-bold"
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

      {/* Collapsible Admin Settings Drawer with Tactile Micro-Interactions */}
      {isConfigOpen && (
        <div className="mt-4 p-5 rounded-2xl bg-zinc-950/95 border border-accent-amber/40 space-y-4 text-xs animate-in fade-in slide-in-from-top-3 duration-200 shadow-2xl">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2 text-accent-amber font-bold">
              <Sliders className="w-4 h-4" />
              <span>ADMIN ARBITRAGE BOT SETTINGS (CONFIGURABLE)</span>
            </div>
            {saveSuccess && (
              <div className="flex items-center space-x-1.5 text-emerald-400 text-xs font-bold animate-in fade-in">
                <CheckCircle2 className="w-4 h-4" />
                <span>SETTINGS SAVED TO DISK</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Setting 1: Min Spread Threshold */}
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                      minSpreadBps === val
                        ? "bg-accent-amber text-zinc-950 border-accent-amber shadow-sm ring-1 ring-amber-400"
                        : "bg-surface border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
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
                  className="w-16 px-2 py-1.5 rounded-lg bg-surface border border-border text-zinc-200 text-xs text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Default: 5 bps. Only coins with spread &ge; this value qualify.
              </p>
            </div>

            {/* Setting 2: Entry Price Parity Tolerance */}
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
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
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                      maxPriceDivergencePct === val
                        ? "bg-accent-cyan text-zinc-950 border-accent-cyan shadow-sm ring-1 ring-cyan-400"
                        : "bg-surface border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
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
                  className="w-16 px-2 py-1.5 rounded-lg bg-surface border border-border text-zinc-200 text-xs text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Default: 0.01% (ultra-strict). Rejects entry if prices differ.
              </p>
            </div>

            {/* Setting 3: Capital Allocation % */}
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                      balanceAllocationPct === val
                        ? "bg-accent-emerald text-zinc-950 border-accent-emerald shadow-sm ring-1 ring-emerald-400"
                        : "bg-surface border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
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
                  className="w-16 px-2 py-1.5 rounded-lg bg-surface border border-border text-zinc-200 text-xs text-center font-bold"
                />
              </div>
              <p className="text-[10px] text-zinc-500">
                Percent of available margin utilized per hedge. Default: 20%.
              </p>
            </div>

            {/* Setting 4: Leverage Mode */}
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
              <label className="text-[11px] text-zinc-400 font-semibold">
                LEVERAGE STRATEGY
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLeverageMode("MAX_PER_COIN")}
                  className={`py-2 px-2.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                    leverageMode === "MAX_PER_COIN"
                      ? "bg-amber-500/20 border-accent-amber text-accent-amber shadow-sm ring-1 ring-amber-400/40"
                      : "bg-surface border-border text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  ⚡ MAX PER COIN (50x/20x)
                </button>
                <button
                  type="button"
                  onClick={() => setLeverageMode("CUSTOM")}
                  className={`py-2 px-2.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                    leverageMode === "CUSTOM"
                      ? "bg-amber-500/20 border-accent-amber text-accent-amber shadow-sm ring-1 ring-amber-400/40"
                      : "bg-surface border-border text-zinc-400 hover:border-zinc-700"
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
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>MAX SIMULTANEOUS HEDGES</span>
                <span className="text-zinc-200 font-bold">{maxSimultaneousHedges}</span>
              </label>
              <div className="flex items-center space-x-1.5">
                {[1, 2, 3, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setMaxSimultaneousHedges(val)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border active:scale-95 transition-all ${
                      maxSimultaneousHedges === val
                        ? "bg-zinc-200 text-zinc-950 border-zinc-200 shadow-sm"
                        : "bg-surface border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
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
            <div className="space-y-2 bg-surface-card p-3 rounded-xl border border-border">
              <label className="text-[11px] text-zinc-400 font-semibold flex items-center justify-between">
                <span>CLOSE PRICE PARITY TOLERANCE</span>
                <span className="text-zinc-200 font-bold">{closeMaxPriceDivergencePct}%</span>
              </label>
              <input
                type="number"
                step="0.005"
                value={closeMaxPriceDivergencePct}
                onChange={(e) => setCloseMaxPriceDivergencePct(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-border text-zinc-200 text-xs font-bold"
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
              className="px-6 py-2.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center space-x-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSavingConfig ? "SAVING SETTINGS..." : "SAVE BOT CONFIGURATION"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Autonomous Hedges Card Grid with Pulse Rings */}
      <div className="mt-5 pt-4 border-t border-border/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-accent-amber" />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
              ACTIVE AUTONOMOUS HEDGES ({daemon?.activeHedges?.length ?? 0} /{" "}
              {daemon?.config?.maxSimultaneousHedges ?? 3})
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Auto-harvests funding &amp; unwinds on basis convergence
          </span>
        </div>

        {(!daemon?.activeHedges || daemon.activeHedges.length === 0) ? (
          <div className="p-5 rounded-xl bg-surface-card border border-border/80 text-center text-xs text-zinc-400 space-y-1.5">
            <div className="font-bold text-zinc-300">NO ACTIVE HEDGES CURRENTLY RUNNING</div>
            <p className="text-[11px] text-zinc-500 max-w-xl mx-auto">
              {isBotActive
                ? "The engine is actively scanning all perpetual contracts. When a coin reaches under 1 minute to settlement with spread ≥ 5 bps and near-zero price difference, a hedge will be opened automatically."
                : "Bot is currently paused. Activate the bot above to begin autonomous 24/7 arbitrage."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {daemon.activeHedges.map((hedge) => {
              const diffMs = hedge.fundingSettlementTime - nowMs;
              const hasSettled = diffMs <= 0;
              const isWaitingParity = hedge.status === "WAITING_PRICE_PARITY";

              return (
                <div
                  key={hedge.id}
                  className={`p-4 rounded-xl border text-xs space-y-2.5 relative transition-all duration-300 ${
                    isWaitingParity
                      ? "bg-amber-950/20 border-accent-amber/70 shadow-lg shadow-amber-500/10"
                      : "bg-surface-card border-border hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-zinc-100 text-sm tracking-tight">{hedge.symbol}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-accent-amber border border-amber-500/30 font-semibold">
                        {hedge.direction === "SHORT_BINANCE_LONG_BITGET"
                          ? "Short BN / Long BG"
                          : "Long BN / Short BG"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleForceCloseHedge(hedge.id, hedge.symbol)}
                      className="text-rose-400 hover:text-rose-200 text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-800/60 bg-rose-950/40 active:scale-95 transition-all"
                      title="Force immediate dual-close"
                    >
                      FORCE CLOSE
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
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

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-semibold">Status:</span>
                    <span
                      className={`font-black uppercase tracking-wider ${
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
      <div className="mt-5 pt-3.5 border-t border-border/80">
        <button
          onClick={() => setIsLogsOpen(!isLogsOpen)}
          className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1"
        >
          <span className="font-bold uppercase flex items-center space-x-2">
            <Activity className="w-3.5 h-3.5 text-accent-cyan" />
            <span>24/7 AUTONOMOUS BOT AUDIT STREAM</span>
            <span className="text-[10px] text-zinc-500 font-normal">
              ({daemon?.logs?.length ?? 0} events)
            </span>
          </span>
          {isLogsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {isLogsOpen && (
          <div className="mt-2.5 bg-zinc-950 p-3.5 rounded-xl border border-border/80 font-mono text-[11px] max-h-52 overflow-y-auto space-y-1.5 scrollbar-thin shadow-inner">
            {(!daemon?.logs || daemon.logs.length === 0) ? (
              <div className="text-zinc-600 text-center py-2">No log entries recorded yet.</div>
            ) : (
              daemon.logs.map((log, i) => {
                let badgeClass = "text-zinc-400";
                if (log.level === "success") badgeClass = "text-emerald-400 font-bold";
                else if (log.level === "warn") badgeClass = "text-amber-400";
                else if (log.level === "error") badgeClass = "text-rose-400 font-bold";

                return (
                  <div key={i} className="flex items-start space-x-2.5 py-0.5">
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
