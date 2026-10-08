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
  Sparkles,
  Clock,
} from "lucide-react";
import { formatCountdown } from "@/lib/settlementTime";

export type SupportedAsset = string;

const DEFAULT_ASSET_CONFIGS: Record<string, { label: string; base: string; presets: string[]; step: string; defaultQty: string }> = {
  BTCUSDT: { label: "BTC", base: "BTC", presets: ["0.002", "0.005", "0.010", "0.020"], step: "0.001", defaultQty: "0.005" },
  ETHUSDT: { label: "ETH", base: "ETH", presets: ["0.02", "0.05", "0.10", "0.20"], step: "0.01", defaultQty: "0.05" },
  SOLUSDT: { label: "SOL", base: "SOL", presets: ["0.2", "0.5", "1.0", "2.0"], step: "0.1", defaultQty: "0.5" },
  DOGEUSDT: { label: "DOGE", base: "DOGE", presets: ["200", "500", "1000", "2000"], step: "10", defaultQty: "500" },
  XRPUSDT: { label: "XRP", base: "XRP", presets: ["50", "100", "200", "500"], step: "1", defaultQty: "100" },
};

function getAssetMeta(sym: string) {
  if (DEFAULT_ASSET_CONFIGS[sym]) return DEFAULT_ASSET_CONFIGS[sym];
  const base = sym.replace("USDT", "");
  return {
    label: base,
    base,
    presets: ["5", "10", "25", "50"],
    step: "1",
    defaultQty: "10",
  };
}

interface ControlCockpitProps {
  onRefresh?: () => void;
  onOrderSuccess?: (receipt: any) => void;
  onTradeExecuted?: (trade: any) => void;
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
  markPrice?: number;
  binanceFundingRate?: number;
  bitgetFundingRate?: number;
  nextFundingTime?: number;
}

export default function ControlCockpit({
  onRefresh,
  onOrderSuccess,
  onTradeExecuted,
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
  markPrice = 0,
  binanceFundingRate,
  bitgetFundingRate,
  nextFundingTime = 0,
}: ControlCockpitProps) {
  const currentAsset = selectedSymbol || "BTCUSDT";
  const assetMeta = getAssetMeta(currentAsset);

  const [quantity, setQuantity] = useState<string>(assetMeta.defaultQty);
  const [selectedNotional, setSelectedNotional] = useState<number | null>(null);
  const [internalMinSpread, setInternalMinSpread] = useState<number>(12);
  const [internalExitTarget, setInternalExitTarget] = useState<number>(2);
  const [cockpitError, setCockpitError] = useState<string | null>(null);

  const handleNotionalSelect = (dollars: number) => {
    setSelectedNotional(dollars);
    if (markPrice && markPrice > 0) {
      const rawQty = dollars / markPrice;
      let stepDecimals = 0;
      if (assetMeta.step.includes(".")) {
        stepDecimals = assetMeta.step.split(".")[1].length;
      }
      const formatted = stepDecimals > 0 ? rawQty.toFixed(stepDecimals) : Math.max(1, Math.round(rawQty)).toString();
      setQuantity(formatted);
    } else {
      if (dollars <= 25) setQuantity(assetMeta.presets[0]);
      else if (dollars <= 50) setQuantity(assetMeta.presets[1] || assetMeta.presets[0]);
      else if (dollars <= 100) setQuantity(assetMeta.presets[2] || assetMeta.presets[1]);
      else setQuantity(assetMeta.presets[3] || assetMeta.presets[2]);
    }
  };

  // Auto-sync quantity when selectedSymbol updates
  React.useEffect(() => {
    if (selectedSymbol) {
      const meta = getAssetMeta(selectedSymbol);
      setQuantity(meta.defaultQty);
    }
  }, [selectedSymbol]);

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
    const meta = getAssetMeta(sym);
    setQuantity(meta.defaultQty);
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
      if (onTradeExecuted) {
        onTradeExecuted({
          id: `HDG-${Date.now().toString().slice(-6)}`,
          timestamp: Date.now(),
          symbol: currentAsset,
          type: "HEDGE_ENTRY",
          directionLabel: direction === "SHORT_BINANCE_LONG_BITGET" ? "Short BN + Long BG" : "Long BN + Short BG",
          quantity,
          leg1Venue: "Binance",
          leg1Side: leg1Side,
          leg1Price: data.leg1?.price || 0,
          leg1OrderId: data.leg1?.orderId,
          leg2Venue: "Bitget",
          leg2Side: leg1Side === "SELL" ? "BUY" : "SELL",
          leg2Price: data.leg2?.price || 0,
          leg2OrderId: data.leg2?.orderId,
          interLegDeltaMs: data.interLegDeltaMs || 0,
          realizedPnl: 0,
          status: "ACTIVE",
        });
      }
      if (onOrderSuccess) onOrderSuccess(data);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setCockpitError(`Hedge Entry Failed: ${err.message}`);
      setTimeout(() => setCockpitError(null), 8000);
    } finally {
      setLoadingAction(null);
    }
  };

  const executeCloseAll = async () => {
    setLoadingAction("CLOSE");
    try {
      const res = await fetch("/api/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getVaultHeaders(),
        },
        body: JSON.stringify({ symbol: "ALL" }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message);
      setLastReceipt({
        type: "CLOSE",
        message: data.message,
        data,
      });
      if (onTradeExecuted) {
        onTradeExecuted({
          id: `CLS-${Date.now().toString().slice(-6)}`,
          timestamp: Date.now(),
          symbol: currentAsset,
          type: "MANUAL_CLOSE",
          directionLabel: "Dual Flatten / Close All",
          quantity,
          leg1Venue: "Binance",
          leg1Side: "CLOSE",
          leg1Price: 0,
          leg1OrderId: data.binance?.orders?.[0]?.orderId,
          leg2Venue: "Bitget",
          leg2Side: "CLOSE",
          leg2Price: 0,
          leg2OrderId: data.bitget?.orders?.[0]?.orderId,
          interLegDeltaMs: data.interLegCloseDeltaMs || 0,
          realizedPnl: 0,
          status: "CLOSED",
        });
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setCockpitError(`Close Failed: ${err.message}`);
      setTimeout(() => setCockpitError(null), 8000);
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
      if (onTradeExecuted) {
        onTradeExecuted({
          id: `BMK-${Date.now().toString().slice(-6)}`,
          timestamp: Date.now(),
          symbol: currentAsset,
          type: "BENCHMARK",
          directionLabel: "Short BN + Long BG (1.2s Auto-Closed)",
          quantity,
          leg1Venue: "Binance",
          leg1Side: "SELL -> BUY",
          leg1Price: data.entry?.leg1?.price || 0,
          leg1OrderId: data.entry?.leg1?.orderId,
          leg2Venue: "Bitget",
          leg2Side: "BUY -> SELL",
          leg2Price: data.entry?.leg2?.price || 0,
          leg2OrderId: data.entry?.leg2?.orderId,
          interLegDeltaMs: data.entry?.interLegDeltaMs || 0,
          realizedPnl: data.pnl?.netPnl || 0,
          status: "DELTA_NEUTRAL",
        });
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setCockpitError(`Hedge Benchmark Failed: ${err.message}`);
      setTimeout(() => setCockpitError(null), 8000);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-3.5 sm:p-5 flex flex-col justify-between font-mono">
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

        {/* Cockpit Error Banner */}
        {cockpitError && (
          <div className="my-3 px-3.5 py-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between shadow-lg shadow-rose-950/30 animate-fadeIn">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{cockpitError}</span>
            </div>
            <button
              onClick={() => setCockpitError(null)}
              className="text-zinc-400 hover:text-zinc-100 text-xs px-2 py-0.5 rounded hover:bg-rose-900/50 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Multi-Asset Selector Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-zinc-400 block uppercase font-semibold">
              SELECT TRADING ASSET
            </label>
            {!DEFAULT_ASSET_CONFIGS[currentAsset] && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-accent-amber border border-amber-500/30 font-bold animate-pulse">
                LOADED: {currentAsset}
              </span>
            )}
          </div>
          <div className={`grid ${!DEFAULT_ASSET_CONFIGS[currentAsset] ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-3 sm:grid-cols-5"} gap-1.5`}>
            {(Object.keys(DEFAULT_ASSET_CONFIGS) as string[]).map((sym) => {
              const meta = DEFAULT_ASSET_CONFIGS[sym];
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
            {!DEFAULT_ASSET_CONFIGS[currentAsset] && (
              <button
                onClick={() => handleAssetSelect(currentAsset)}
                className="py-1.5 text-xs rounded border transition-all font-bold bg-accent-amber text-zinc-950 border-amber-400 shadow-sm flex items-center justify-center space-x-1"
              >
                <span>{assetMeta.label}</span>
              </button>
            )}
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
        <div className="mt-4 space-y-3">
          {/* Quick Notional Dollar Chips */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[10px] text-zinc-400 uppercase font-semibold flex items-center space-x-1">
                <span>QUICK NOTIONAL SIZING</span>
              </label>
              {markPrice && markPrice > 0 ? (
                <span className="text-[10px] text-accent-cyan font-mono">
                  Est. ${(parseFloat(quantity || "0") * markPrice).toFixed(2)} USDT
                </span>
              ) : null}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[25, 50, 100, 250, 500].map((dollars) => (
                <button
                  key={dollars}
                  onClick={() => handleNotionalSelect(dollars)}
                  className={`py-1 text-[11px] rounded border transition-all active:scale-95 ${
                    selectedNotional === dollars
                      ? "bg-amber-500/20 border-accent-amber text-accent-amber font-bold shadow-sm"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  ${dollars}
                </button>
              ))}
            </div>
          </div>

          {/* Unit Quantity Presets */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-400 uppercase">
                COIN UNITS ({assetMeta.base})
              </label>
              <span className="text-[10px] text-zinc-500">
                Selected: <strong className="text-zinc-200">{quantity} {assetMeta.base}</strong>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-2">
              {assetMeta.presets.map((qty) => (
                <button
                  key={qty}
                  onClick={() => {
                    setSelectedNotional(null);
                    setQuantity(qty);
                  }}
                  className={`py-1.5 text-xs rounded border transition-colors ${
                    quantity === qty && selectedNotional === null
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
                onChange={(e) => {
                  setSelectedNotional(null);
                  setQuantity(e.target.value);
                }}
                className="flex-1 px-2.5 py-1 text-xs bg-zinc-900 border border-border rounded font-mono text-zinc-100 focus:outline-none focus:border-accent-amber"
                placeholder={`Enter custom ${assetMeta.base}`}
              />
            </div>
          </div>
        </div>

        {/* Real-Time Funding Harvest & Yield Projection Engine */}
        {(() => {
          const numQty = parseFloat(quantity || "0") || 0;
          const effectivePrice = markPrice > 0 ? markPrice : 1;
          const notionalDollars = numQty * effectivePrice;
          const absSpread = Math.abs(spreadBps || 0);
          const est8hPayout = (notionalDollars * absSpread) / 10000;
          const estDailyPayout = est8hPayout * 3;
          const estAnnualApy = (absSpread * 3 * 365) / 100;
          const isShortBnOptimal = (binanceFundingRate !== undefined && bitgetFundingRate !== undefined)
            ? (binanceFundingRate >= bitgetFundingRate)
            : (spreadBps >= 0);

          return (
            <div className="mt-4 p-3.5 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-zinc-950 to-zinc-900 shadow-lg font-mono">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/60">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-zinc-200">
                  <Sparkles className="w-3.5 h-3.5 text-accent-amber animate-pulse" />
                  <span>ESTIMATED 8H FUNDING HARVEST</span>
                </div>
                <div className="flex items-center space-x-2">
                  {nextFundingTime && nextFundingTime > Date.now() && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-zinc-400" />
                      <span>{formatCountdown(nextFundingTime)}</span>
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-accent-emerald border border-emerald-500/30 font-bold">
                    +{estAnnualApy.toFixed(1)}% APR
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center py-1">
                <div className="p-2 rounded-lg bg-surface/80 border border-border">
                  <div className="text-[9px] text-zinc-500 uppercase">Hedged Notional</div>
                  <div className="text-xs font-bold text-zinc-200 font-mono mt-0.5">
                    ${notionalDollars.toFixed(2)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-surface/80 border border-border">
                  <div className="text-[9px] text-zinc-500 uppercase">Est. 8h Payout</div>
                  <div className="text-xs font-bold text-accent-emerald font-mono mt-0.5">
                    +${est8hPayout.toFixed(4)}
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-surface/80 border border-border">
                  <div className="text-[9px] text-zinc-500 uppercase">24h Run-Rate</div>
                  <div className="text-xs font-bold text-accent-amber font-mono mt-0.5">
                    +${estDailyPayout.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* Directional Cash Flow Recommendation */}
              <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">Optimal Cash Flow:</span>
                <span className={`font-semibold ${isShortBnOptimal ? "text-accent-amber" : "text-accent-cyan"}`}>
                  {isShortBnOptimal ? "Short Binance (pays funding) + Long Bitget" : "Long Binance + Short Bitget (pays funding)"}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Dual-Leg Real-Time Hedging Controls */}
        {(() => {
          const isShortBnOptimal = (binanceFundingRate !== undefined && bitgetFundingRate !== undefined)
            ? (binanceFundingRate >= bitgetFundingRate)
            : (spreadBps >= 0);

          return (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                  LIVE PERSISTENT HEDGE ENTRY (STAYS OPEN)
                </label>
                <span className="text-[9px] text-emerald-400 font-mono">
                  Positions reflect in Live Table
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={() => executeHedge("SHORT_BINANCE_LONG_BITGET")}
                  disabled={!!loadingAction}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition-all disabled:opacity-50 text-xs font-bold relative active:scale-[0.98] ${
                    isShortBnOptimal
                      ? "bg-amber-500/20 border-amber-500/50 text-accent-amber ring-1 ring-amber-500/40 shadow-lg shadow-amber-500/10"
                      : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {isShortBnOptimal && (
                    <span className="text-[8px] px-1.5 py-0.2 rounded bg-accent-amber text-zinc-950 font-black mb-1">
                      ★ RECOMMENDED HARVEST
                    </span>
                  )}
                  {loadingAction === "SHORT_BINANCE_LONG_BITGET" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mb-1" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 mb-1" />
                  )}
                  <span>SHORT BINANCE</span>
                  <span className="text-[10px] text-accent-cyan font-medium">+ LONG BITGET ({quantity} {assetMeta.base})</span>
                  <span className="text-[9px] text-zinc-400 mt-0.5">Keep Open In Table</span>
                </button>

                <button
                  onClick={() => executeHedge("LONG_BINANCE_SHORT_BITGET")}
                  disabled={!!loadingAction}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border transition-all disabled:opacity-50 text-xs font-bold relative active:scale-[0.98] ${
                    !isShortBnOptimal
                      ? "bg-cyan-500/20 border-cyan-500/50 text-accent-cyan ring-1 ring-cyan-500/40 shadow-lg shadow-cyan-500/10"
                      : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {!isShortBnOptimal && (
                    <span className="text-[8px] px-1.5 py-0.2 rounded bg-accent-cyan text-zinc-950 font-black mb-1">
                      ★ RECOMMENDED HARVEST
                    </span>
                  )}
                  {loadingAction === "LONG_BINANCE_SHORT_BITGET" ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin mb-1" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 mb-1" />
                  )}
                  <span>LONG BINANCE</span>
                  <span className="text-[10px] text-accent-amber font-medium">+ SHORT BITGET ({quantity} {assetMeta.base})</span>
                  <span className="text-[9px] text-zinc-400 mt-0.5">Keep Open In Table</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Dual Hedge Latency Test Suite */}
        <div className="mt-4 p-3 rounded-lg bg-surface-card border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] text-zinc-300 font-bold flex items-center space-x-1.5">
              <Play className="w-3.5 h-3.5 text-accent-cyan" />
              <span>DUAL HEDGE BENCHMARK ({currentAsset})</span>
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/40 text-accent-cyan border border-cyan-800/40">
              1.2s AUTO-CLOSE SPEED TEST
            </span>
          </div>
          <p className="text-[10px] text-zinc-400 mb-2.5">
            ⚡ Executes sub-250ms simultaneous entry & exit to calibrate lead stagger without ongoing risk. (To keep positions open, use the buttons above).
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
