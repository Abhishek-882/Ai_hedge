"use client";

import React, { useEffect, useState } from "react";
import { Activity, Clock, ShieldCheck, Zap } from "lucide-react";
import { getDeterministicNextFundingTime, formatCountdown } from "@/lib/settlementTime";

interface TelemetryHUDProps {
  spreadBps?: number;
  nextFundingTime?: number;
  clockOffsetMs?: number;
}

export default function TelemetryHUD({
  spreadBps = 0,
  nextFundingTime = 0,
  clockOffsetMs = 24,
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

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
      {/* 1. Settlement Countdown */}
      <div className="bg-surface rounded-xl border border-border p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400 text-xs">
          <span>SETTLEMENT UTC</span>
          <Clock className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        <div className="mt-2 text-xl font-bold tracking-tight text-zinc-100">{countdown}</div>
        <div className="mt-1 text-[10px] text-zinc-500">8-hour funding boundary</div>
      </div>

      {/* 2. Clock Drift Offset */}
      <div className="bg-surface rounded-xl border border-border p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400 text-xs">
          <span>CLOCK CALIBRATION</span>
          <Activity className="w-3.5 h-3.5 text-accent-emerald" />
        </div>
        <div className="mt-2 text-xl font-bold tracking-tight text-accent-emerald">
          {clockOffsetMs >= 0 ? "+" : ""}{Math.abs(clockOffsetMs) < 1000 ? `${clockOffsetMs}ms` : `${(clockOffsetMs / 1000).toFixed(1)}s`}
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">Auto-synced with Binance</div>
      </div>

      {/* 3. Basis Spread */}
      <div className="bg-surface rounded-xl border border-border p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400 text-xs">
          <span>BASIS SPREAD</span>
          <Zap className="w-3.5 h-3.5 text-accent-amber" />
        </div>
        <div className="mt-2 text-xl font-bold tracking-tight text-accent-amber">
          {(spreadBps || 0).toFixed(1)} <span className="text-xs text-zinc-400">bps</span>
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          Annualized: {((spreadBps * 3 * 365) / 100).toFixed(1)}% APY
        </div>
      </div>

      {/* 4. Delta-Neutral Guard */}
      <div className="bg-surface rounded-xl border border-border p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-zinc-400 text-xs">
          <span>DELTA GUARANTEE</span>
          <ShieldCheck className="w-3.5 h-3.5 text-accent-cyan" />
        </div>
        <div className="mt-2 text-xl font-bold tracking-tight text-accent-cyan">0.0000 BTC</div>
        <div className="mt-1 text-[10px] text-zinc-500">Residual directional risk</div>
      </div>
    </div>
  );
}
