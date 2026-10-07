"use client";

import React, { useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
  Zap,
  Sliders,
  CheckCircle2,
  ShieldCheck,
  Cpu,
} from "lucide-react";

export type SupportedAsset = "BTCUSDT" | "ETHUSDT" | "SOLUSDT" | "DOGEUSDT" | "XRPUSDT";

const ASSET_CONFIGS: Record<SupportedAsset, { label: string; base: string; presets: string[]; step: string; defaultQty: string }> = {
  BTCUSDT: { label: "BTC", base: "BTC", presets: ["0.002", "0.005", "0.010", "0.020"], step: "0.001", defaultQty: "0.005" },
  ETHUSDT: { label: "ETH", base: "ETH", presets: ["0.02", "0.05", "0.10", "0.20"], step: "0.01", defaultQty: "0.05" },
  SOLUSDT: { label: "SOL", base: "SOL", presets: ["0.2", "0.5", "1.0", "2.0"], step: "0.1", defaultQty: "0.5" },
  DOGEUSDT: { label: "DOGE", base: "DOGE", presets: ["200", "500", "1000", "2000"], step: "10", defaultQty: "500" },
  XRPUSDT: { label: "XRP", base: "XRP", presets: ["50", "100", "200", "500"], step: "1", defaultQty: "100" },
};

interface ControlCockpitProps {
  onRefresh?: () => void;
  onOrderSuccess?: (receipt: any) => void;
  getVaultHeaders: () => Record<string, string>;
  selectedSymbol?: SupportedAsset;
  onSymbolChange?: (sym: SupportedAsset) => void;
  isAutopilotActive?: boolean;
  onToggleAutopilot?: (active: boolean) => void;
  autopilotState?: string;
  spreadBps?: number;
  minSpreadEntry?: number;
  onMinSpreadEntryChange?: (val: number) => void;
  exitSpreadTarget?: number;
  onExitSpreadTargetChange?: (val: number) => void;
}

export default function ControlCockpit({
  onRefresh,
  onOrderSuccess,
  getVaultHeaders,
  selectedSymbol = "BTCUSDT",
  onSymbolChange,
  isAutopilotActive = false,
  onToggleAutopilot,
  autopilotState = "IDLE_SCANNING",
  spreadBps = 10.0,
  minSpreadEntry = 12,
  onMinSpreadEntryChange,
  exitSpreadTarget = 2,
  onExitSpreadTargetChange,
}: ControlCockpitProps) {
  const currentAsset = ASSET_CONFIGS[selectedSymbol] ? selectedSymbol : "BTCUSDT";
  const assetMeta = ASSET_CONFIGS[currentAsset];

  const [quantity, setQuantity] = useState<string>(assetMeta.defaultQty);
  const [internalMinSpread, setInternalMinSpread] = useState<number>(12);
  const [internalExitTarget, setInternalExitTarget] = useState<number>(2);

  // Stagger Strategy State
  const [staggerPolicy, setStaggerPolicy] = useState<"auto_ewma" | "simultaneous" | "manual">("auto_ewma");
  const [manualDelayMs, setManualDelayMs] = useState<number>(120);
  const [manualVenue, setManualVenue] = useState<"Binance" | "Bitget">("Bitget");

  const currentMinSpread = minSpreadEntry ?? internalMinSpread;
  const currentExitTarget = exitSpreadTarget ?? internalExitTarget;

  const handleMinSpreadChange = (val: number) => {
    if (onMinSpreadEntryChange) {
      onMinSpreadEntryChange(val);
    } else {
      setInternalMinSpread(val);
    }
  };

  const handleExitTargetChange = (val: number) => {
    if (onExitSpreadTargetChange) {
      onExitSpreadTargetChange(val);
    } else {
      setInternalExitTarget(val);
    }
  };

  const handleAssetSelect = (sym: SupportedAsset) => {
    if (onSymbolChange) {
      onSymbolChange(sym);
    }
    setQuantity(ASSET_CONFIGS[sym].defaultQty);
  };

  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  const executeHedge = async (direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET") => {
    setLoadingAction(direction);
    try {
      const leg1Side = direction === "SHORT_BINANCE_LONG_BITGET" ? "SELL" : "BUY";
      const res = await fetch("/api/hedge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getVaultHeaders(),
        },
        body: JSON.stringify({
          action: "entry",
          symbol: currentAsset,
          quantity: parseFloat(quantity),
          leg1Side,
          staggerPolicy,
          manualDelayMs,
          manualVenue,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLastReceipt({
        type: "HEDGE_ENTRY",
        direction,
        data,
      });
      if (onOrderSuccess) onOrderSuccess(data);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Hedge Entry Failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const executeCloseAll = async () => {
    setLoadingAction("CLOSE");
    try {
      const res = await fetch("/api/close", {
        method: "POST",
        headers: getVaultHeaders(),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message);
      setLastReceipt({
        type: "CLOSE",
        message: data.message,
        data,
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Close Failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const executeHedgeBenchmark = async () => {
    setLoadingAction("HEDGE_BENCHMARK");
    try {
      const res = await fetch("/api/hedge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getVaultHeaders(),
        },
        body: JSON.stringify({
          action: "benchmark",
          symbol: currentAsset,
          quantity: parseFloat(quantity),
          leg1Side: "SELL",
          staggerPolicy,
          manualDelayMs,
          manualVenue,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setLastReceipt({
        type: "HEDGE_BENCHMARK",
        data,
      });
      if (onRefresh) onRefresh();
    } catch (err: any) {
      alert(`Hedge Benchmark Failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 flex flex-col justify-between font-mono">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-pulse" />
            <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
              EXECUTION COCKPIT
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-cyan-400 border border-cyan-800/40">
              BINANCE + BITGET
            </span>
          </div>
        </div>

        {/* Multi-Asset Selector Bar */}
        <div className="mt-4">
          <label className="text-[10px] text-zinc-400 block mb-1.5 uppercase font-semibold">
            SELECT TRADING ASSET
          </label>
          <div className="grid grid-cols-5 gap-1.5">
            {(Object.keys(ASSET_CONFIGS) as SupportedAsset[]).map((sym) => {
              const meta = ASSET_CONFIGS[sym];
              const isSelected = sym === currentAsset;
              return (
                <button
                  key={sym}
                  onClick={() => handleAssetSelect(sym)}
                  className={`py-1.5 text-xs rounded border transition-all font-bold ${
                    isSelected
                      ? "bg-accent-amber/20 border-accent-amber text-accent-amber shadow-sm"
                      : "bg-surface-card border-border text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 24/7 Autonomous Autopilot Panel */}
        <div className="mt-4 p-3.5 rounded-xl border border-border bg-surface-card/60 backdrop-blur">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Zap className={`w-4 h-4 ${isAutopilotActive ? "text-accent-amber animate-bounce" : "text-zinc-500"}`} />
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                24/7 AUTONOMOUS HEDGER
              </span>
            </div>
            <button
              onClick={() => onToggleAutopilot && onToggleAutopilot(!isAutopilotActive)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                isAutopilotActive
                  ? "bg-accent-amber text-black shadow-lg shadow-amber-500/20"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {isAutopilotActive ? "ACTIVE" : "STANDBY"}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
            <span className="flex items-center space-x-1">
              <span>Status:</span>
              <strong className={isAutopilotActive ? "text-emerald-400" : "text-zinc-400"}>
                {isAutopilotActive ? autopilotState : "OFFLINE"}
              </strong>
            </span>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="text-zinc-400 hover:text-zinc-200 flex items-center space-x-1"
            >
              <Sliders className="w-3 h-3" />
              <span>{showConfig ? "Hide Config" : "Tuning & Policy"}</span>
            </button>
          </div>

          {showConfig && (
            <div className="mt-2 pt-2 border-t border-border space-y-2 text-[10px]">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-zinc-500 block mb-1">ENTRY THRESHOLD (BPS)</label>
                  <input
                    type="number"
                    value={currentMinSpread}
                    onChange={(e) => handleMinSpreadChange(parseFloat(e.target.value) || 12)}
                    className="w-full px-2 py-1 bg-zinc-900 border border-border rounded text-zinc-200 font-mono"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">EXIT TARGET (BPS)</label>
                  <input
                    type="number"
                    value={currentExitTarget}
                    onChange={(e) => handleExitTargetChange(parseFloat(e.target.value) || 2)}
                    className="w-full px-2 py-1 bg-zinc-900 border border-border rounded text-zinc-200 font-mono"
                  />
                </div>
              </div>

              {/* Stagger Policy Selector */}
              <div>
                <label className="text-zinc-500 block mb-1">LATENCY STAGGER POLICY</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { id: "auto_ewma", label: "Auto EWMA" },
                    { id: "simultaneous", label: "Parallel (0ms)" },
                    { id: "manual", label: "Manual Delay" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setStaggerPolicy(p.id as any)}
                      className={`py-1 text-[9px] rounded border ${
                        staggerPolicy === p.id
                          ? "bg-zinc-800 border-accent-cyan text-accent-cyan font-bold"
                          : "bg-zinc-900 border-border text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {staggerPolicy === "manual" && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-zinc-500 block mb-0.5">DELAY VENUE</label>
                    <select
                      value={manualVenue}
                      onChange={(e) => setManualVenue(e.target.value as any)}
                      className="w-full px-2 py-1 bg-zinc-900 border border-border rounded text-zinc-200 font-mono text-[9px]"
                    >
                      <option value="Bitget">Bitget</option>
                      <option value="Binance">Binance</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-zinc-500 block mb-0.5">OFFSET (MS)</label>
                    <input
                      type="number"
                      value={manualDelayMs}
                      onChange={(e) => setManualDelayMs(parseInt(e.target.value, 10) || 0)}
                      className="w-full px-2 py-1 bg-zinc-900 border border-border rounded text-zinc-200 font-mono text-[9px]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
            <span>Aggressive Chase: 3x Retries / 1.5s</span>
            <span className="text-accent-amber">Live Spread: {spreadBps.toFixed(1)} bps</span>
          </div>
        </div>

        {/* Size Selection & Custom Continuous Input */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-zinc-400 uppercase">
              ORDER QUANTITY ({assetMeta.base})
            </label>
            <span className="text-[10px] text-zinc-500">
              Selected: <strong className="text-zinc-200">{quantity} {assetMeta.base}</strong>
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-2">
            {assetMeta.presets.map((qty) => (
              <button
                key={qty}
                onClick={() => setQuantity(qty)}
                className={`py-1.5 text-xs rounded border transition-colors ${
                  quantity === qty
                    ? "bg-zinc-800 border-accent-amber text-zinc-100 font-bold"
                    : "bg-surface-card border-border text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {qty} {assetMeta.base}
              </button>
            ))}
          </div>

          {/* Custom Numerical Quantity Input */}
          <div className="flex items-center space-x-2">
            <span className="text-[10px] text-zinc-500">Custom Size:</span>
            <input
              type="number"
              step={assetMeta.step}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="flex-1 px-2.5 py-1 text-xs bg-zinc-900 border border-border rounded font-mono text-zinc-100 focus:outline-none focus:border-accent-amber"
              placeholder={`Enter custom ${assetMeta.base}`}
            />
          </div>
        </div>

        {/* Dual-Leg Real-Time Hedging Controls */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={() => executeHedge("SHORT_BINANCE_LONG_BITGET")}
            disabled={!!loadingAction}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-accent-amber hover:bg-amber-500/20 active:scale-[0.98] transition-all disabled:opacity-50 text-xs font-bold"
          >
            {loadingAction === "SHORT_BINANCE_LONG_BITGET" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin mb-1" />
            ) : (
              <ArrowDownRight className="w-4 h-4 mb-1" />
            )}
            <span>SHORT BINANCE</span>
            <span className="text-[10px] text-accent-cyan font-medium">+ LONG BITGET ({quantity} {assetMeta.base})</span>
          </button>

          <button
            onClick={() => executeHedge("LONG_BINANCE_SHORT_BITGET")}
            disabled={!!loadingAction}
            className="flex flex-col items-center justify-center p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-accent-cyan hover:bg-cyan-500/20 active:scale-[0.98] transition-all disabled:opacity-50 text-xs font-bold"
          >
            {loadingAction === "LONG_BINANCE_SHORT_BITGET" ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin mb-1" />
            ) : (
              <ArrowUpRight className="w-4 h-4 mb-1" />
            )}
            <span>LONG BINANCE</span>
            <span className="text-[10px] text-accent-amber font-medium">+ SHORT BITGET ({quantity} {assetMeta.base})</span>
          </button>
        </div>

        {/* Dual Hedge Latency Test Suite */}
        <div className="mt-4 p-3 rounded-lg bg-surface-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-zinc-300 font-bold flex items-center space-x-1.5">
              <Play className="w-3.5 h-3.5 text-accent-cyan" />
              <span>DUAL HEDGE BENCHMARK ({currentAsset})</span>
            </span>
            <span className="text-[10px] text-zinc-500">Sub-250ms Target</span>
          </div>
          <p className="text-[10px] text-zinc-400 mb-2.5">
            Dispatches Binance Short & Bitget Long concurrently with Aggressive Fill Chase and tests simultaneous dual-close.
          </p>
          <button
            onClick={executeHedgeBenchmark}
            disabled={!!loadingAction}
            className="w-full py-2 px-3 rounded bg-accent-cyan/15 hover:bg-accent-cyan/25 border border-accent-cyan/40 text-accent-cyan text-xs font-semibold flex items-center justify-center space-x-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loadingAction === "HEDGE_BENCHMARK" ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>BENCHMARKING DUAL-VENUE HEDGE...</span>
              </>
            ) : (
              <span>RUN PURE DUAL HEDGE BENCHMARK</span>
            )}
          </button>
        </div>

        {/* Emergency Kill Switch / Close Position */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={executeCloseAll}
            disabled={!!loadingAction}
            className="py-2 px-3 rounded bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center justify-center space-x-1.5 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>FLATTEN ALL</span>
          </button>

          <button
            onClick={executeCloseAll}
            disabled={!!loadingAction}
            className="py-2 px-3 rounded bg-rose-950/40 hover:bg-rose-950/70 border border-rose-800/60 text-rose-300 text-xs flex items-center justify-center space-x-1.5 transition-colors font-bold"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-accent-rose" />
            <span>KILL SWITCH</span>
          </button>
        </div>
      </div>

      {/* Live Transaction Receipt */}
      {lastReceipt && (
        <div className="mt-4 p-3 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] text-zinc-400 space-y-1">
          <div className="font-semibold text-zinc-200 uppercase flex justify-between">
            <span>RECEIPT: {lastReceipt.type} ({lastReceipt.data?.symbol || currentAsset})</span>
            <span className="text-accent-emerald flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              CONFIRMED
            </span>
          </div>
          {lastReceipt.data?.orderId && (
            <div>Order ID: {lastReceipt.data.orderId} • Status: {lastReceipt.data.status}</div>
          )}
          {lastReceipt.type === "HEDGE_ENTRY" && lastReceipt.data && (
            <div className="text-accent-cyan flex flex-wrap gap-x-1.5">
              <span>Arrival Delta: {lastReceipt.data.interLegDeltaMs}ms</span>
              <span>•</span>
              <span>Total Entry: {lastReceipt.data.totalEntryMs}ms</span>
              {lastReceipt.data.leadStaggerAppliedMs > 0 && (
                <>
                  <span>•</span>
                  <span className="text-accent-amber">Stagger: {lastReceipt.data.leadStaggerAppliedMs}ms ({lastReceipt.data.staggerVenue})</span>
                </>
              )}
            </div>
          )}
          {lastReceipt.data?.entry && (
            <div className="text-accent-cyan flex flex-wrap gap-x-1.5">
              <span>Inter-Leg Delta: {lastReceipt.data.entry.interLegDeltaMs}ms</span>
              <span>•</span>
              <span>Dual-Close: {lastReceipt.data.exit?.dualCloseLatencyMs}ms</span>
              {lastReceipt.data.entry.leadStaggerAppliedMs > 0 && (
                <>
                  <span>•</span>
                  <span className="text-accent-amber">Stagger: {lastReceipt.data.entry.leadStaggerAppliedMs}ms ({lastReceipt.data.entry.staggerVenue})</span>
                </>
              )}
            </div>
          )}
          {lastReceipt.data?.interLegCloseDeltaMs !== undefined && (
            <div className="text-accent-cyan flex flex-wrap gap-x-1.5">
              <span>Dual-Close Latency: {lastReceipt.data.dualCloseLatencyMs}ms</span>
              <span>•</span>
              <span>Inter-Leg Close Delta: {lastReceipt.data.interLegCloseDeltaMs}ms</span>
            </div>
          )}
          {lastReceipt.data?.pnl && (
            <div className="text-accent-emerald font-bold">
              Net Directional PnL: ${lastReceipt.data.pnl.netPnl} USDT (Delta Neutral: {String(lastReceipt.data.pnl.deltaNeutralSuccess)})
            </div>
          )}
          {lastReceipt.message && <div>{lastReceipt.message}</div>}
        </div>
      )}
    </div>
  );
}
