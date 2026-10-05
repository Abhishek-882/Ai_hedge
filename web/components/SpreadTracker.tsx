"use client";

import React from "react";
import { ArrowRight, TrendingUp } from "lucide-react";

interface SpreadTrackerProps {
  binanceFundingRate?: number;
  bitgetFundingRate?: number;
  spreadBps?: number;
  markPrice?: number;
}

export default function SpreadTracker({
  binanceFundingRate = 0.0001,
  bitgetFundingRate = 0.0002,
  spreadBps = 10.0,
  markPrice = 86400,
}: SpreadTrackerProps) {
  const binancePct = binanceFundingRate * 100;
  const bitgetPct = bitgetFundingRate * 100;
  const apy = ((spreadBps * 3 * 365) / 100).toFixed(1);

  return (
    <div className="bg-surface rounded-xl border border-border p-5 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-accent-amber" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            CROSS-EXCHANGE FUNDING SPREAD
          </h2>
        </div>
        <div className="text-[10px] text-zinc-400">
          Mark: ${markPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
        {/* Exchange A */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border">
          <div className="text-[10px] text-zinc-400 uppercase mb-1">Venue A (Binance Testnet)</div>
          <div className="text-lg font-bold text-accent-amber">
            {binancePct >= 0 ? "+" : ""}{binancePct.toFixed(4)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Settlement: {(binancePct * 3 * 365).toFixed(1)}% APY
          </div>
        </div>

        {/* Spread Nexus */}
        <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800 text-center">
          <div className="text-[10px] text-zinc-400 uppercase mb-1 flex items-center justify-center space-x-1">
            <span>SPREAD BASIS</span>
            <ArrowRight className="w-3 h-3 text-accent-amber" />
          </div>
          <div className="text-2xl font-bold text-accent-amber">
            {spreadBps.toFixed(1)} <span className="text-xs text-zinc-400">bps</span>
          </div>
          <div className="text-[10px] text-accent-emerald font-semibold mt-1">
            Estimated Yield: {apy}% APY
          </div>
        </div>

        {/* Exchange B */}
        <div className="p-3.5 rounded-lg bg-surface-card border border-border">
          <div className="text-[10px] text-zinc-400 uppercase mb-1">Venue B (Bitget Demo)</div>
          <div className="text-lg font-bold text-accent-emerald">
            {bitgetPct >= 0 ? "+" : ""}{bitgetPct.toFixed(4)}%
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Settlement: {(bitgetPct * 3 * 365).toFixed(1)}% APY
          </div>
        </div>
      </div>
    </div>
  );
}
