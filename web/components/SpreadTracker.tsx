"use client";

import React from "react";
import { ArrowRight, TrendingUp, Sparkles, Activity, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

interface SpreadTrackerProps {
  symbol?: string;
  binanceFundingRate?: number;
  bitgetFundingRate?: number;
  spreadBps?: number;
  markPrice?: number;
  binancePrice?: number;
  bitgetPrice?: number;
  priceDiff?: number;
  priceDivergencePct?: number;
}

export default function SpreadTracker({
  symbol = "BTCUSDT",
  binanceFundingRate = 0.0001,
  bitgetFundingRate = 0.0002,
  spreadBps = 10.0,
  markPrice = 0,
  binancePrice = 0,
  bitgetPrice = 0,
  priceDiff,
  priceDivergencePct,
}: SpreadTrackerProps) {
  const binancePct = (binanceFundingRate || 0) * 100;
  const bitgetPct = (bitgetFundingRate || 0) * 100;
  const absSpread = Math.abs(spreadBps || 0);
  const apy = ((absSpread * 3 * 365) / 100).toFixed(1);

  // Cross-Exchange Mark Price Divergence Calculations
  const bnPrice = binancePrice > 0 ? binancePrice : markPrice > 0 ? markPrice : 0;
  const bgPrice = bitgetPrice > 0 ? bitgetPrice : markPrice > 0 ? markPrice : 0;
  const effectivePriceDiff = priceDiff !== undefined ? priceDiff : Math.abs(bnPrice - bgPrice);
  const effectiveDivergencePct =
    priceDivergencePct !== undefined
      ? priceDivergencePct
      : bnPrice > 0
      ? (effectivePriceDiff / bnPrice) * 100
      : 0;

  const isHighDivergence = effectiveDivergencePct > 0.35;
  const isModerateDivergence = effectiveDivergencePct > 0.15 && !isHighDivergence;

  // Corridor Status Calculation
  let corridorStatus = "COMPRESSED (< 3 bps)";
  let corridorBadge = "bg-amber-500/10 text-amber-400 border-amber-500/30";
  let barGradient = "from-amber-500 to-amber-400";
  let corridorPercent = Math.min(100, Math.max(10, (absSpread / 25) * 100));

  if (absSpread >= 12) {
    corridorStatus = "PRIME ARBITRAGE WINDOW (> 12 bps)";
    corridorBadge = "bg-emerald-500/10 text-accent-emerald border-emerald-500/30 animate-pulse";
    barGradient = "from-emerald-500 via-teal-400 to-emerald-300";
  } else if (absSpread >= 4) {
    corridorStatus = "MODERATE CORRIDOR (4 - 12 bps)";
    corridorBadge = "bg-cyan-500/10 text-accent-cyan border-cyan-500/30";
    barGradient = "from-cyan-500 to-blue-400";
  }

  return (
    <div className="bg-surface rounded-xl border border-border p-3.5 sm:p-5 font-mono space-y-4 shadow-xl">
      {/* Header with Live Mark Price & Cross-Exchange Price Divergence */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 gap-2">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-accent-amber" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            CROSS-EXCHANGE FUNDING SPREAD // {symbol}
          </h2>
        </div>

        {/* Live Cross-Exchange Price Divergence Badge */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[10px]">
            <span className="text-zinc-500">PRICE GAP:</span>
            <strong className="text-zinc-200">
              ${effectivePriceDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </strong>
            <span
              className={`font-bold ml-1 ${
                isHighDivergence
                  ? "text-rose-400"
                  : isModerateDivergence
                  ? "text-amber-400"
                  : "text-emerald-400"
              }`}
            >
              ({effectiveDivergencePct.toFixed(2)}%)
            </span>
          </div>

          <span
            className={`text-[10px] px-2 py-0.5 rounded border font-bold flex items-center space-x-1 ${
              isHighDivergence
                ? "bg-rose-500/15 text-rose-400 border-rose-500/40 animate-pulse"
                : isModerateDivergence
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-emerald-500/10 text-accent-emerald border-emerald-500/30"
            }`}
          >
            {isHighDivergence ? (
              <>
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>PRICE GAP RISK</span>
              </>
            ) : isModerateDivergence ? (
              <span>MODERATE GAP</span>
            ) : (
              <>
                <CheckCircle2 className="w-2.5 h-2.5" />
                <span>OPTIMAL BASIS</span>
              </>
            )}
          </span>

          <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${corridorBadge}`}>
            {corridorStatus}
          </span>
        </div>
      </div>

      {/* 3-Column Rates, Mark Prices & Spread Basis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Exchange A: Binance */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border hover:border-zinc-700 transition-colors">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-between">
            <span>Venue A (Binance Testnet)</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-accent-amber">USD-M</span>
          </div>
          <div className="text-xl font-bold text-accent-amber">
            {binancePct >= 0 ? "+" : ""}{binancePct.toFixed(4)}%
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
            <span>Settlement: {(binancePct * 3 * 365).toFixed(1)}% APY</span>
            <span className="text-zinc-400 font-bold">
              Mark: ${bnPrice > 0 ? bnPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "..."}
            </span>
          </div>
        </div>

        {/* Spread Nexus */}
        <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-center relative overflow-hidden group">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-center space-x-1">
            <span>SPREAD BASIS</span>
            <ArrowRight className="w-3 h-3 text-accent-amber" />
          </div>
          <div className="text-2xl font-bold text-accent-amber tracking-tight font-mono">
            {(spreadBps || 0).toFixed(1)} <span className="text-xs text-zinc-400 font-normal">bps</span>
          </div>
          <div className="text-[10px] text-accent-emerald font-semibold mt-1 flex items-center justify-center space-x-1">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Estimated Yield: {apy}% APY</span>
          </div>
        </div>

        {/* Exchange B: Bitget */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border hover:border-zinc-700 transition-colors">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-between">
            <span>Venue B (Bitget Demo)</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-accent-emerald">V3 FUTURES</span>
          </div>
          <div className="text-xl font-bold text-accent-emerald">
            {bitgetPct >= 0 ? "+" : ""}{bitgetPct.toFixed(4)}%
          </div>
          <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
            <span>Settlement: {(bitgetPct * 3 * 365).toFixed(1)}% APY</span>
            <span className="text-zinc-400 font-bold">
              Mark: ${bgPrice > 0 ? bgPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "..."}
            </span>
          </div>
        </div>
      </div>

      {/* High Price Divergence Warning Alert Banner (If Applicable) */}
      {isHighDivergence && (
        <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-rose-400 flex-shrink-0 animate-bounce" />
          <div>
            <strong className="text-rose-200">Price Divergence Alert ({effectiveDivergencePct.toFixed(2)}%):</strong>{" "}
            Binance (${bnPrice.toFixed(2)}) and Bitget (${bgPrice.toFixed(2)}) have a ${effectivePriceDiff.toFixed(2)} disparity. Entering now risks basis convergence drag. Auto-Wait Sniper will hold order until the price gap narrows.
          </div>
        </div>
      )}

      {/* Visual Arbitrage Opportunity Corridor Meter */}
      <div className="pt-2 border-t border-border/80 space-y-1.5">
        <div className="flex items-center justify-between text-[10px] text-zinc-400">
          <span className="flex items-center space-x-1">
            <Activity className="w-3 h-3 text-zinc-400" />
            <span>ARBITRAGE OPPORTUNITY CORRIDOR</span>
          </span>
          <span className="font-mono text-zinc-300">
            {absSpread >= 12 ? "HIGH ALPHA OPPORTUNITY" : absSpread >= 4 ? "NORMAL SPREAD" : "SUB-OPTIMAL SPREAD"}
          </span>
        </div>

        {/* Corridor Meter Bar with Glowing Needle */}
        <div className="relative w-full bg-zinc-950 rounded-full h-3 border border-zinc-800 p-[1px] my-2">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 ease-out`}
            style={{ width: `${corridorPercent}%` }}
          />
          {/* Glowing Needle Indicator */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-accent-amber shadow-md shadow-amber-500/60 transition-all duration-500 ease-out -ml-1.5"
            style={{ left: `${Math.min(99, Math.max(1, corridorPercent))}%` }}
            title={`Current Corridor Position: ${absSpread.toFixed(1)} bps`}
          />
        </div>

        <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
          <span>0 bps (Neutral)</span>
          <span className="text-zinc-400">Target Threshold: &gt; 12.0 bps</span>
          <span>25+ bps (Max Corridor)</span>
        </div>

        {/* Directional Mechanics Breakdown */}
        <div className="mt-2.5 p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800/80 text-[10px] text-zinc-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />
            <span>
              Cash Flow Engine:{" "}
              <strong className="text-zinc-200">
                {binanceFundingRate >= bitgetFundingRate
                  ? `Binance shorts receive +${binancePct.toFixed(4)}% vs Bitget longs +${bitgetPct.toFixed(4)}%`
                  : `Bitget shorts receive +${bitgetPct.toFixed(4)}% vs Binance longs +${binancePct.toFixed(4)}%`}
              </strong>
            </span>
          </div>
          <span className="text-accent-emerald font-bold font-mono">
            Net Basis: +{absSpread.toFixed(1)} bps / 8h (+{apy}% APY)
          </span>
        </div>
      </div>
    </div>
  );
}
