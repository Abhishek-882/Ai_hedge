"use client";

import React, { useEffect, useState } from "react";
import { Clock, Zap, TrendingUp } from "lucide-react";
import { getDeterministicNextFundingTime, formatCountdown } from "@/lib/settlementTime";

interface TelemetryHUDProps {
  spreadBps?: number;
  nextFundingTime?: number;
  symbol?: string;
}

export default function TelemetryHUD({
  spreadBps = 0,
  nextFundingTime = 0,
  symbol = "BTCUSDT",
}: TelemetryHUDProps) {
  const effectiveFundingTime =
    nextFundingTime && nextFundingTime > Date.now()
      ? nextFundingTime
      : getDeterministicNextFundingTime();

  const [countdown, setCountdown] = useState<string>(() => formatCountdown(effectiveFundingTime));

  useEffect(() => {
    const targetTime =
      nextFundingTime && nextFundingTime > Date.now()
        ? nextFundingTime
        : getDeterministicNextFundingTime();

    setCountdown(formatCountdown(targetTime));

    const interval = setInterval(() => {
      setCountdown(formatCountdown(targetTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [nextFundingTime]);

  const baseAsset = symbol ? symbol.replace("USDT", "") : "BTC";
  const apy = ((Math.abs(spreadBps) * 3 * 365) / 100).toFixed(1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 font-mono">
      {/* 1. Settlement Countdown (Real Dynamic Countdown) */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">SETTLEMENT COUNTDOWN</span>
          <Clock className="w-3.5 h-3.5 text-accent-cyan" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-zinc-100 flex items-center space-x-1.5">
          <span>{countdown}</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{baseAsset} 8h settlement cycle</span>
        </div>
      </div>

      {/* 2. Live Basis Spread (Real Dynamic Spread in bps) */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">NET BASIS SPREAD</span>
          <Zap className="w-3.5 h-3.5 text-accent-amber" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-accent-amber">
          {(spreadBps || 0).toFixed(1)} <span className="text-xs text-zinc-400 font-semibold">bps</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <span className="text-zinc-400">Binance ↔ Bitget delta</span>
        </div>
      </div>

      {/* 3. Real Annualized Yield Run-Rate */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">EST. ANNUALIZED APR</span>
          <TrendingUp className="w-3.5 h-3.5 text-accent-emerald" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-accent-emerald">
          {apy}% <span className="text-xs text-zinc-400 font-semibold">APR</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <span className="text-emerald-400 font-bold">3x daily payout cycle</span>
        </div>
      </div>
    </div>
  );
}
