"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Play,
  RefreshCw,
  ShieldAlert,
  XCircle,
  Sliders,
  CheckCircle2,
  Sparkles,
  Clock,
  Crosshair,
  Gauge,
  AlertTriangle,
  Lock,
  Unlock,
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

function getCoinMaxLeverage(sym: string): { binance: number; bitget: number } {
  const upper = sym.toUpperCase();
  if (["BTCUSDT", "ETHUSDT", "LTCUSDT", "XRPUSDT", "SOLUSDT", "BNBUSDT", "BCHUSDT", "DOGEUSDT"].includes(upper)) {
    return { binance: 50, bitget: 50 };
  }
  return { binance: 20, bitget: 20 };
}

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
  binancePrice?: number;
  bitgetPrice?: number;
  priceDiff?: number;
  priceDivergencePct?: number;
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
  binancePrice = 0,
  bitgetPrice = 0,
  priceDiff,
  priceDivergencePct,
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

  // Cross-Exchange Mark Price Divergence Calculations
  const bnPrice = binancePrice > 0 ? binancePrice : markPrice > 0 ? markPrice : 1;
  const bgPrice = bitgetPrice > 0 ? bitgetPrice : markPrice > 0 ? markPrice : 1;
  const effectivePriceDiff = priceDiff !== undefined ? priceDiff : Math.abs(bnPrice - bgPrice);
  const effectiveDivergencePct =
    priceDivergencePct !== undefined
      ? priceDivergencePct
      : bnPrice > 0
      ? (effectivePriceDiff / bnPrice) * 100
      : 0;

  // Auto-Wait Limit Sniper State
  const [maxPriceDivergencePct, setMaxPriceDivergencePct] = useState<number>(0.25);
  const [sniperWaitingDirection, setSniperWaitingDirection] = useState<"SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET" | null>(null);

  // Dynamic Leverage Engine State
  const coinLimits = getCoinMaxLeverage(currentAsset);
  const [leveragePreset, setLeveragePreset] = useState<"MAX" | "50" | "30" | "20" | "10" | "5" | "CUSTOM">("MAX");
  const [binanceLeverage, setBinanceLeverage] = useState<number>(coinLimits.binance);
  const [bitgetLeverage, setBitgetLeverage] = useState<number>(coinLimits.bitget);
  const [showCustomSplit, setShowCustomSplit] = useState<boolean>(false);

  // Sync leverage when coin changes or preset changes
  useEffect(() => {
    const limits = getCoinMaxLeverage(currentAsset);
    if (leveragePreset === "MAX") {
      setBinanceLeverage(limits.binance);
      setBitgetLeverage(limits.bitget);
    } else if (leveragePreset !== "CUSTOM") {
      const target = parseInt(leveragePreset, 10);
      setBinanceLeverage(Math.min(target, limits.binance));
      setBitgetLeverage(Math.min(target, limits.bitget));
    }
  }, [currentAsset, leveragePreset]);

  const effectiveBinanceLeverage = Math.max(1, binanceLeverage);
  const effectiveBitgetLeverage = Math.max(1, bitgetLeverage);

  const handlePresetSelect = (preset: "MAX" | "50" | "30" | "20" | "10" | "5") => {
    setLeveragePreset(preset);
    const limits = getCoinMaxLeverage(currentAsset);
    if (preset === "MAX") {
      setBinanceLeverage(limits.binance);
      setBitgetLeverage(limits.bitget);
      setShowCustomSplit(false);
    } else {
      const val = parseInt(preset, 10);
      setBinanceLeverage(Math.min(val, limits.binance));
      setBitgetLeverage(Math.min(val, limits.bitget));
    }
  };

  const handleEqualizeMax = () => {
    const limits = getCoinMaxLeverage(currentAsset);
    setLeveragePreset("MAX");
    setBinanceLeverage(limits.binance);
    setBitgetLeverage(limits.bitget);
    setShowCustomSplit(false);
  };

  // Emergency Kill Switch Safety State
  const [isKillSwitchArmed, setIsKillSwitchArmed] = useState<boolean>(false);

  // Stagger Strategy State
  const [staggerPolicy, setStaggerPolicy] = useState<"auto_ewma" | "simultaneous" | "manual">("auto_ewma");
  const [manualDelayMs, setManualDelayMs] = useState<number>(120);
  const [manualVenue, setManualVenue] = useState<"Binance" | "Bitget">("Bitget");

  const [showConfig, setShowConfig] = useState<boolean>(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<any>(null);

  // Auto-sync quantity and reset error banners when selectedSymbol updates
  useEffect(() => {
    if (selectedSymbol) {
      const meta = getAssetMeta(selectedSymbol);
      setQuantity(meta.defaultQty);
      setCockpitError(null);
    }
  }, [selectedSymbol]);

  // Auto-Wait Limit Sniper Loop with 1.2s Hysteresis Dwell Confirmation
  useEffect(() => {
    if (!sniperWaitingDirection || loadingAction) return;

    if (effectiveDivergencePct <= maxPriceDivergencePct) {
      // Basis gap is within tolerance - require it to hold steady for 1.2s before firing
      const dwellTimer = setTimeout(() => {
        const dir = sniperWaitingDirection;
        setSniperWaitingDirection(null);
        executeHedge(dir, true);
      }, 1200);

      return () => clearTimeout(dwellTimer);
    }
  }, [sniperWaitingDirection, effectiveDivergencePct, maxPriceDivergencePct, loadingAction]);

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

  const handleAssetSelect = (sym: SupportedAsset) => {
    if (onSymbolChange) {
      onSymbolChange(sym);
    }
    const meta = getAssetMeta(sym);
    setQuantity(meta.defaultQty);
    setSniperWaitingDirection(null);
  };

  const executeHedge = async (
    direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET",
    bypassSniper = false
  ) => {
    // Check if live divergence exceeds threshold and sniper is not bypassed
    if (!bypassSniper && effectiveDivergencePct > maxPriceDivergencePct) {
      setSniperWaitingDirection(direction);
      return;
    }

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
          maxPriceDivergencePct,
          bypassSniper,
          binanceLeverage: effectiveBinanceLeverage,
          bitgetLeverage: effectiveBitgetLeverage,
          leverage: effectiveBinanceLeverage,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        if (data.sniperPending) {
          setSniperWaitingDirection(direction);
          setCockpitError(null);
          return;
        }
        throw new Error(data.error);
      }
      setSniperWaitingDirection(null);
      setCockpitError(null);
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
      if (!err.message?.includes("Sniper Hold")) {
        setCockpitError(`Hedge Entry Failed: ${err.message}`);
        setTimeout(() => setCockpitError(null), 8000);
      }
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
      setIsKillSwitchArmed(false);
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
          bypassSniper: true,
          binanceLeverage: effectiveBinanceLeverage,
          bitgetLeverage: effectiveBitgetLeverage,
          leverage: effectiveBinanceLeverage,
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

  const numQty = parseFloat(quantity || "0") || 0;
  const effectivePrice = bnPrice > 0 ? bnPrice : 1;
  const notionalDollars = numQty * effectivePrice;
  const estMarginBinance = notionalDollars / effectiveBinanceLeverage;
  const estMarginBitget = notionalDollars / effectiveBitgetLeverage;
  const totalMargin = estMarginBinance + estMarginBitget;

  const hasDisparity = effectiveBinanceLeverage !== effectiveBitgetLeverage;
  const disparityRatio = hasDisparity
    ? Math.max(effectiveBinanceLeverage, effectiveBitgetLeverage) / Math.min(effectiveBinanceLeverage, effectiveBitgetLeverage)
    : 1;
  const lowerLeverageVenue = effectiveBinanceLeverage < effectiveBitgetLeverage
    ? "Binance"
    : effectiveBitgetLeverage < effectiveBinanceLeverage
    ? "Bitget"
    : null;

  const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "XRPUSDT"];
  const normalizedCurrent = currentAsset.toUpperCase().endsWith("USDT")
    ? currentAsset.toUpperCase()
    : `${currentAsset.toUpperCase()}USDT`;
  const isCustomAsset = !DEFAULT_SYMBOLS.includes(normalizedCurrent);

  return (
    <div className="bg-surface rounded-xl border border-border p-3.5 sm:p-5 flex flex-col justify-between font-mono">
      <div>
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-pulse" />
            <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
              ORDER EXECUTION PANEL
            </h2>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-cyan-400 border border-cyan-800/40 font-mono">
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
            <label className="text-[10px] text-zinc-400 uppercase font-semibold">
              SELECT TRADING ASSET
            </label>
            <span className="text-[10px] text-accent-amber font-mono">
              LOADED: {normalizedCurrent}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {DEFAULT_SYMBOLS.map((sym) => {
              const isSelected = normalizedCurrent === sym;
              const label = sym.replace("USDT", "");
              return (
                <button
                  key={sym}
                  onClick={() => handleAssetSelect(sym)}
                  className={`py-1.5 px-2 rounded text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-accent-amber text-zinc-950 shadow-md font-black ring-1 ring-amber-400"
                      : "bg-surface-card hover:bg-zinc-800 border border-border text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {isCustomAsset ? (
              <button
                onClick={() => handleAssetSelect(normalizedCurrent)}
                className="py-1.5 px-2 rounded text-xs font-bold bg-accent-amber text-zinc-950 shadow-md font-black ring-1 ring-amber-400 truncate flex items-center justify-center space-x-1"
                title={`Active custom asset: ${normalizedCurrent}`}
              >
                <span>{normalizedCurrent.replace("USDT", "")}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-950 animate-pulse shrink-0" />
              </button>
            ) : (
              <div
                className="py-1.5 px-2 rounded text-[10px] text-zinc-600 bg-zinc-900/40 border border-dashed border-zinc-800 flex items-center justify-center select-none"
                title="Select any ranked coin from the scanner table below"
              >
                + COIN
              </div>
            )}
          </div>
        </div>

        {/* DYNAMIC LEVERAGE CONTROL ENGINE & COLLATERAL BALANCER */}
        <div className="mt-4 p-3 rounded-lg bg-zinc-950 border border-zinc-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-bold flex items-center space-x-1.5 text-[11px]">
              <Gauge className="w-3.5 h-3.5 text-accent-amber" />
              <span>DYNAMIC LEVERAGE ENGINE</span>
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono text-zinc-400">
                BN: <strong className="text-accent-amber">{effectiveBinanceLeverage}x</strong> • BG:{" "}
                <strong className="text-cyan-400">{effectiveBitgetLeverage}x</strong>
              </span>
              <button
                onClick={() => setShowCustomSplit((prev) => !prev)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                  showCustomSplit
                    ? "bg-amber-500/20 text-accent-amber border-amber-500/40"
                    : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200"
                }`}
                title="Toggle independent venue leverage split sliders"
              >
                ⚡ {showCustomSplit ? "Hide Split" : "Custom Split"}
              </button>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div className="grid grid-cols-6 gap-1.5">
            {(["MAX", "50", "30", "20", "10", "5"] as const).map((m) => {
              const isSelected = leveragePreset === m && !showCustomSplit;
              return (
                <button
                  key={m}
                  onClick={() => handlePresetSelect(m)}
                  className={`py-1 rounded text-[10px] font-bold transition-all border ${
                    isSelected
                      ? "bg-amber-500/20 text-accent-amber border-amber-500/50 shadow-sm"
                      : "bg-surface-card border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                  }`}
                >
                  {m === "MAX" ? "MAX LEV" : `${m}x`}
                </button>
              );
            })}
          </div>

          {/* Expandable Custom Venue Split Panel */}
          {showCustomSplit && (
            <div className="p-2.5 rounded bg-zinc-900/90 border border-zinc-800 space-y-2.5 text-[10px] animate-fadeIn">
              <div className="flex items-center justify-between text-zinc-300 font-bold border-b border-zinc-800 pb-1.5">
                <span className="flex items-center space-x-1">
                  <Sliders className="w-3 h-3 text-accent-amber" />
                  <span>INDEPENDENT VENUE LEVERAGE SPLIT</span>
                </span>
                <button
                  onClick={handleEqualizeMax}
                  className="px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-black text-[9px] hover:bg-amber-400 transition-colors shadow-sm"
                >
                  ⚡ Try to Use Max ({coinLimits.binance}x / {coinLimits.bitget}x)
                </button>
              </div>

              {/* Binance Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
                    <span>Binance Leverage:</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <strong className="text-accent-amber font-mono text-xs">{binanceLeverage}x</strong>
                    <span className="text-zinc-500 text-[9px]">(Max {coinLimits.binance}x)</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max={coinLimits.binance}
                    step="1"
                    value={binanceLeverage}
                    onChange={(e) => {
                      setBinanceLeverage(parseInt(e.target.value, 10));
                      setLeveragePreset("CUSTOM");
                    }}
                    className="w-full accent-amber-400 h-1 bg-zinc-800 rounded cursor-pointer"
                  />
                  <div className="flex space-x-1 shrink-0">
                    {[10, 20, 30, coinLimits.binance].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setBinanceLeverage(v);
                          setLeveragePreset("CUSTOM");
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                          binanceLeverage === v
                            ? "bg-amber-500/20 text-accent-amber border-amber-500/40"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {v}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bitget Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Bitget Leverage:</span>
                  </span>
                  <div className="flex items-center space-x-1">
                    <strong className="text-cyan-400 font-mono text-xs">{bitgetLeverage}x</strong>
                    <span className="text-zinc-500 text-[9px]">(Max {coinLimits.bitget}x)</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="range"
                    min="1"
                    max={coinLimits.bitget}
                    step="1"
                    value={bitgetLeverage}
                    onChange={(e) => {
                      setBitgetLeverage(parseInt(e.target.value, 10));
                      setLeveragePreset("CUSTOM");
                    }}
                    className="w-full accent-cyan-400 h-1 bg-zinc-800 rounded cursor-pointer"
                  />
                  <div className="flex space-x-1 shrink-0">
                    {[10, 20, 30, coinLimits.bitget].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setBitgetLeverage(v);
                          setLeveragePreset("CUSTOM");
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                          bitgetLeverage === v
                            ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/40"
                            : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {v}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Adaptable Collateral Margin Breakdown */}
          <div className="grid grid-cols-2 gap-2 text-[10px] pt-1 border-t border-zinc-800/80">
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-zinc-400 font-medium">Binance Margin ({effectiveBinanceLeverage}x):</span>
                <span className="text-[9px] text-zinc-500 font-mono">Notional: ${notionalDollars.toFixed(2)}</span>
              </div>
              <strong className="text-accent-amber font-mono text-xs">${estMarginBinance.toFixed(2)}</strong>
            </div>
            <div className="p-2 rounded bg-zinc-900 border border-zinc-800 flex justify-between items-center">
              <div className="flex flex-col">
                <span className="text-zinc-400 font-medium">Bitget Margin ({effectiveBitgetLeverage}x):</span>
                <span className="text-[9px] text-zinc-500 font-mono">Notional: ${notionalDollars.toFixed(2)}</span>
              </div>
              <strong className="text-cyan-400 font-mono text-xs">${estMarginBitget.toFixed(2)}</strong>
            </div>
          </div>

          {/* Combined Margin Requirement */}
          <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-900/60 border border-zinc-800/60 text-[10px]">
            <span className="text-zinc-400 flex items-center space-x-1.5">
              <span>Total Combined Collateral:</span>
              <span className="text-[9px] text-zinc-500">(Binance + Bitget)</span>
            </span>
            <strong className="text-zinc-100 font-mono text-xs">${totalMargin.toFixed(2)}</strong>
          </div>

          {/* Collateral Parity / Disparity Analyzer */}
          {!hasDisparity ? (
            <div className="px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>1:1 Leverage Parity ({effectiveBinanceLeverage}x) — Equal capital utilization (${estMarginBinance.toFixed(2)} each)</span>
              </span>
              <span className="font-bold font-mono text-[9px] uppercase px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                1:1 MATCH
              </span>
            </div>
          ) : (
            <div className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>
                  Disparity ({disparityRatio.toFixed(1)}x): {lowerLeverageVenue} ({Math.min(effectiveBinanceLeverage, effectiveBitgetLeverage)}x) consumes{" "}
                  <strong>{disparityRatio.toFixed(1)}x more margin</strong> (${(lowerLeverageVenue === "Binance" ? estMarginBinance : estMarginBitget).toFixed(2)}) due to lower leverage.
                </span>
              </div>
              <button
                onClick={handleEqualizeMax}
                className="px-2 py-0.5 rounded bg-amber-500 text-zinc-950 font-black text-[9px] whitespace-nowrap hover:bg-amber-400 transition-colors shadow-sm shrink-0"
                title="Equalize to coin max leverage to minimize margin commitment"
              >
                ⚡ Try Max
              </button>
            </div>
          )}
        </div>

        {/* AUTO-WAIT LIMIT SNIPER & PRICE DIVERGENCE GUARD */}
        <div className="mt-4 p-3 rounded-lg bg-surface-card border border-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-bold flex items-center space-x-1.5 text-[11px]">
              <Crosshair className="w-3.5 h-3.5 text-accent-cyan" />
              <span>AUTO-WAIT BASIS SNIPER</span>
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                effectiveDivergencePct > maxPriceDivergencePct
                  ? "bg-rose-500/10 text-rose-400 border-rose-500/30 font-bold animate-pulse"
                  : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
              }`}
            >
              Gap: {effectiveDivergencePct.toFixed(2)}% {effectiveDivergencePct > maxPriceDivergencePct ? "⚠️ (EXCEEDS LIMIT)" : "✓ (OPTIMAL)"}
            </span>
          </div>

          <div className="flex items-center space-x-3 text-[10px]">
            <span className="text-zinc-400 whitespace-nowrap">Tolerance:</span>
            <input
              type="range"
              min="0.05"
              max="1.50"
              step="0.05"
              value={maxPriceDivergencePct}
              onChange={(e) => setMaxPriceDivergencePct(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 cursor-pointer h-1.5 bg-zinc-800 rounded-lg"
            />
            <span className="font-mono text-accent-amber font-bold w-12 text-right">
              {maxPriceDivergencePct.toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center justify-between gap-1.5 pt-1 text-[9px]">
            <span className="text-zinc-500">Presets:</span>
            <div className="flex gap-1.5">
              {[
                { label: "Tight 0.10%", val: 0.1 },
                { label: "Normal 0.25%", val: 0.25 },
                { label: "Relaxed 0.50%", val: 0.5 },
              ].map((p) => (
                <button
                  key={p.label}
                  onClick={() => setMaxPriceDivergencePct(p.val)}
                  className={`px-2 py-0.5 rounded border transition-colors ${
                    maxPriceDivergencePct === p.val
                      ? "bg-accent-amber/20 text-accent-amber border-amber-500/40"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quantity Sizing Controls */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-zinc-400 uppercase font-semibold">
              QUICK NOTIONAL SIZING
            </label>
            <span className="text-[10px] text-zinc-400 font-mono">
              Est. ${notionalDollars.toFixed(2)} USDT
            </span>
          </div>

          <div className="grid grid-cols-5 gap-1.5 mb-2.5">
            {[25, 50, 100, 250, 500].map((dollars) => (
              <button
                key={dollars}
                onClick={() => handleNotionalSelect(dollars)}
                className={`py-1.5 px-2 rounded-lg text-xs font-bold active:scale-95 transition-all duration-150 ${
                  selectedNotional === dollars
                    ? "bg-accent-amber text-zinc-950 shadow-md font-black ring-1 ring-amber-400"
                    : "bg-surface-card hover:bg-zinc-800 border border-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
                }`}
              >
                ${dollars}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-zinc-400 uppercase font-semibold">
                COIN UNITS ({assetMeta.base})
              </label>
              <span className="text-[10px] text-zinc-400 font-mono">
                Selected: <strong className="text-zinc-200">{quantity} {assetMeta.base}</strong>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {assetMeta.presets.map((qty) => (
                <button
                  key={qty}
                  onClick={() => {
                    setSelectedNotional(null);
                    setQuantity(qty);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold active:scale-95 transition-all duration-150 border ${
                    quantity === qty && selectedNotional === null
                      ? "bg-zinc-800 border-accent-amber text-accent-amber ring-1 ring-amber-400/50 shadow-sm"
                      : "bg-surface-card border-border text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {qty} {assetMeta.base}
                </button>
              ))}
            </div>

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
          const absSpread = Math.abs(spreadBps || 0);
          const est8hPayout = (notionalDollars * absSpread) / 10000;
          const estDailyPayout = est8hPayout * 3;
          const estAnnualApy = (absSpread * 3 * 365) / 100;
          const isShortBnOptimal =
            binanceFundingRate !== undefined && bitgetFundingRate !== undefined
              ? binanceFundingRate >= bitgetFundingRate
              : spreadBps >= 0;

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

              <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                <span className="text-zinc-400">Optimal Cash Flow:</span>
                <span className={`font-semibold ${isShortBnOptimal ? "text-accent-amber" : "text-accent-cyan"}`}>
                  {isShortBnOptimal ? "Short Binance (pays funding) + Long Bitget" : "Long Binance + Short Bitget (pays funding)"}
                </span>
              </div>
            </div>
          );
        })()}

        {/* ACTIVE SNIPER WAITING BANNER (IF ARMED) */}
        {sniperWaitingDirection && (
          <div className="mt-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs space-y-2 animate-pulse">
            <div className="flex items-center justify-between">
              <span className="font-bold flex items-center space-x-1.5">
                <Crosshair className="w-4 h-4 text-accent-amber animate-spin" />
                <span>SNIPER ARMED: WAITING FOR BASIS COMPRESSION</span>
              </span>
              <span className="font-mono text-[10px] bg-zinc-950/80 px-2 py-0.5 rounded border border-amber-500/30">
                Gap: {effectiveDivergencePct.toFixed(2)}% &gt; {maxPriceDivergencePct.toFixed(2)}%
              </span>
            </div>
            <p className="text-[10px] text-zinc-300">
              Holding entry until Binance (${bnPrice.toFixed(2)}) and Bitget (${bgPrice.toFixed(2)}) prices converge within {maxPriceDivergencePct.toFixed(2)}% tolerance.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => executeHedge(sniperWaitingDirection, true)}
                className="flex-1 py-1.5 px-3 rounded bg-amber-500 text-zinc-950 font-bold text-[10px] hover:bg-amber-400 transition-colors"
              >
                ⚡ FORCE EXECUTE NOW (Bypass Sniper)
              </button>
              <button
                onClick={() => setSniperWaitingDirection(null)}
                className="py-1.5 px-3 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] hover:text-white"
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}

        {/* Dual-Leg Real-Time Hedging Execution Controls */}
        {(() => {
          const isShortBnOptimal =
            binanceFundingRate !== undefined && bitgetFundingRate !== undefined
              ? binanceFundingRate >= bitgetFundingRate
              : spreadBps >= 0;

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
                  <span className="text-[10px] text-accent-cyan font-medium">
                    + LONG BITGET ({quantity} {assetMeta.base})
                  </span>
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
                  <span className="text-[10px] text-accent-amber font-medium">
                    + SHORT BITGET ({quantity} {assetMeta.base})
                  </span>
                  <span className="text-[9px] text-zinc-400 mt-0.5">Keep Open In Table</span>
                </button>
              </div>
            </div>
          );
        })()}

        {/* Dual Hedge Latency Test Suite (Routine Benchmark) */}
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
            ⚡ Executes sub-250ms simultaneous entry & exit to calibrate lead stagger without ongoing risk.
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

        {/* DEDICATED EMERGENCY RISK CONTROLS PANEL (SEPARATED FROM SPEED TESTS) */}
        <div className="mt-5 p-3.5 rounded-xl bg-gradient-to-br from-rose-950/20 via-zinc-950 to-zinc-950 border border-rose-900/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-400 flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-accent-rose" />
              <span>EMERGENCY RISK CONTROLS</span>
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">
              Global Position Unwind
            </span>
          </div>

          {/* Safety Arming Tick Checkbox */}
          <label className="flex items-center space-x-2 text-[10px] cursor-pointer select-none py-1 px-2 rounded bg-zinc-900/80 border border-zinc-800">
            <input
              type="checkbox"
              checked={isKillSwitchArmed}
              onChange={(e) => setIsKillSwitchArmed(e.target.checked)}
              className="rounded border-zinc-700 text-rose-600 focus:ring-rose-500 bg-zinc-950 cursor-pointer"
            />
            <span className={isKillSwitchArmed ? "text-rose-300 font-bold flex items-center gap-1" : "text-zinc-400 flex items-center gap-1"}>
              {isKillSwitchArmed ? <Unlock className="w-3 h-3 text-rose-400" /> : <Lock className="w-3 h-3 text-zinc-500" />}
              <span>Arm Emergency Kill Switch (Check to unlock instant total liquidation)</span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={executeCloseAll}
              disabled={!!loadingAction}
              className="py-2 px-3 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>FLATTEN ALL</span>
            </button>

            <button
              onClick={executeCloseAll}
              disabled={!isKillSwitchArmed || !!loadingAction}
              className={`py-2 px-3 rounded text-xs flex items-center justify-center space-x-1.5 transition-all font-bold ${
                isKillSwitchArmed
                  ? "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/60 ring-2 ring-rose-400 cursor-pointer active:scale-95 animate-pulse"
                  : "bg-zinc-900/50 border border-zinc-800 text-zinc-600 cursor-not-allowed opacity-40"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{isKillSwitchArmed ? "🚨 EXECUTE KILL SWITCH" : "KILL SWITCH (LOCKED)"}</span>
            </button>
          </div>
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
