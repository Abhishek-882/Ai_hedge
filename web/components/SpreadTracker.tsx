"use client";

import React from "react";
import { ArrowRight, TrendingUp, Sparkles, Activity, AlertCircle, CheckCircle2 } from "lucide-react";

interface SpreadTrackerProps {
  symbol?: string;
  binanceFundingRate?: number;
  bitgetFundingRate?: number;
  spreadBps?: number;
  markPrice?: number;
}

export default function SpreadTracker({
  symbol = "BTCUSDT",
  binanceFundingRate = 0.0001,
  bitgetFundingRate = 0.0002,
  spreadBps = 10.0,
  markPrice = 0,
}: SpreadTrackerProps) {
  const binancePct = (binanceFundingRate || 0) * 100;
  const bitgetPct = (bitgetFundingRate || 0) * 100;
  const absSpread = Math.abs(spreadBps || 0);
  const apy = ((absSpread * 3 * 365) / 100).toFixed(1);

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
    <div className="bg-surface rounded-xl border border-border p-5 font-mono space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-accent-amber" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            CROSS-EXCHANGE FUNDING SPREAD // {symbol}
          </h2>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-[10px] text-zinc-400">
            Mark Price: <strong className="text-zinc-200">{markPrice > 0 ? `$${markPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "SYNCING..."}</strong>
          </span>
          <span className={`text-[10px] px-2 py-0.5 rounded border font-bold ${corridorBadge}`}>
            {corridorStatus}
          </span>
        </div>
      </div>

      {/* 3-Column Rates & Basis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Exchange A */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border hover:border-zinc-700 transition-colors">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-between">
            <span>Venue A (Binance Testnet)</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-accent-amber">USD-M</span>
          </div>
          <div className="text-xl font-bold text-accent-amber">
            {binancePct >= 0 ? "+" : ""}{binancePct.toFixed(4)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Settlement: {(binancePct * 3 * 365).toFixed(1)}% APY
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

        {/* Exchange B */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border hover:border-zinc-700 transition-colors">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-between">
            <span>Venue B (Bitget Demo)</span>
            <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-accent-emerald">V3 FUTURES</span>
          </div>
          <div className="text-xl font-bold text-accent-emerald">
            {bitgetPct >= 0 ? "+" : ""}{bitgetPct.toFixed(4)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Settlement: {(bitgetPct * 3 * 365).toFixed(1)}% APY
          </div>
        </div>
      </div>

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

        {/* Corridor Meter Bar */}
        <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-zinc-800 p-[1px]">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 ease-out`}
            style={{ width: `${corridorPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-[9px] text-zinc-500 font-mono">
          <span>0 bps (Neutral)</span>
          <span className="text-zinc-400">Target Threshold: &gt; 12.0 bps</span>
          <span>25+ bps (Max Corridor)</span>
        </div>
      </div>
    </div>
  );
}
