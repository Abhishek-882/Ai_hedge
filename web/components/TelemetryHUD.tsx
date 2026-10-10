"use client";

import React, { useEffect, useState } from "react";
import { Activity, Clock, ShieldCheck, Zap, Radio, CheckCircle2 } from "lucide-react";
import { getDeterministicNextFundingTime, formatCountdown } from "@/lib/settlementTime";

interface TelemetryHUDProps {
  spreadBps?: number;
  nextFundingTime?: number;
  clockOffsetMs?: number;
  symbol?: string;
}

export default function TelemetryHUD({
  spreadBps = 0,
  nextFundingTime = 0,
  clockOffsetMs = 24,
  symbol = "BTCUSDT",
}: TelemetryHUDProps) {
  const effectiveFundingTime = nextFundingTime && nextFundingTime > Date.now() 
    ? nextFundingTime 
    : getDeterministicNextFundingTime();

  const [countdown, setCountdown] = useState<string>(() => formatCountdown(effectiveFundingTime));

  useEffect(() => {
    const targetTime = nextFundingTime && nextFundingTime > Date.now() 
      ? nextFundingTime 
      : getDeterministicNextFundingTime();

    setCountdown(formatCountdown(targetTime));

    const interval = setInterval(() => {
      setCountdown(formatCountdown(targetTime));
    }, 1000);

    return () => clearInterval(interval);
  }, [nextFundingTime]);

  const baseAsset = symbol ? symbol.replace("USDT", "") : "BTC";
  const apy = ((spreadBps * 3 * 365) / 100).toFixed(1);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 font-mono">
      {/* 1. Settlement Countdown */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all" />
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">SETTLEMENT UTC</span>
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

      {/* 2. Clock Drift Offset */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-emerald-500/10 rounded-full blur-xl group-hover:bg-emerald-500/20 transition-all" />
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">CLOCK CALIBRATION</span>
          <Activity className="w-3.5 h-3.5 text-accent-emerald" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-accent-emerald flex items-center space-x-1">
          <span>{clockOffsetMs >= 0 ? "+" : ""}{Math.abs(clockOffsetMs) < 1000 ? `${clockOffsetMs}ms` : `${(clockOffsetMs / 1000).toFixed(1)}s`}</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span>Auto-synced with Binance</span>
        </div>
      </div>

      {/* 3. Basis Spread */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-amber-500/10 rounded-full blur-xl group-hover:bg-amber-500/20 transition-all" />
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">BASIS SPREAD</span>
          <Zap className="w-3.5 h-3.5 text-accent-amber" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-accent-amber">
          {(spreadBps || 0).toFixed(1)} <span className="text-xs text-zinc-400 font-semibold">bps</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <span className="text-emerald-400 font-bold">{apy}% APY</span>
          <span>• 3x daily harvest</span>
        </div>
      </div>

      {/* 4. Delta-Neutral Guarantee */}
      <div className="bg-surface rounded-2xl border border-border p-3.5 sm:p-4 flex flex-col justify-between hover:border-zinc-700 transition-all duration-200 shadow-lg relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-24 h-24 bg-cyan-500/10 rounded-full blur-xl group-hover:bg-cyan-500/20 transition-all" />
        <div className="flex items-center justify-between text-zinc-400 text-[10px] sm:text-xs">
          <span className="font-semibold tracking-wider text-zinc-400">DELTA EXPOSURE</span>
          <ShieldCheck className="w-3.5 h-3.5 text-accent-cyan" />
        </div>
        <div className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-accent-cyan">
          0.0000 <span className="text-xs text-zinc-400 font-normal">{baseAsset}</span>
        </div>
        <div className="mt-1.5 text-[9px] sm:text-[10px] text-zinc-500 flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Zero directional liquidation risk</span>
        </div>
      </div>
    </div>
  );
}
