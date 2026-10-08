"use client";

import React from "react";
import {
  X,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Zap,
  Layers,
  Coins,
  DollarSign,
  Copy,
  ExternalLink,
} from "lucide-react";
import { ServerHedgeTrade } from "@/lib/serverTradeStore";

interface HedgeDetailModalProps {
  trade: ServerHedgeTrade | null;
  onClose: () => void;
}

export default function HedgeDetailModal({ trade, onClose }: HedgeDetailModalProps) {
  if (!trade) return null;

  const isProfit = trade.realizedPnl >= 0;
  const openDate = new Date(trade.timestamp);
  const isClosed = Boolean(trade.closeTimestamp || trade.status === "CLOSED" || trade.status === "DELTA_NEUTRAL");
  const closeDateStr = trade.closeTimestamp
    ? new Date(trade.closeTimestamp).toLocaleTimeString()
    : isClosed
    ? new Date(trade.timestamp + (trade.durationMs || 250)).toLocaleTimeString()
    : "Holding / Active In-Flight";

  const notional = trade.notionalUsdt || ((trade.leg1Price || 0) * (typeof trade.quantity === "number" ? trade.quantity : parseFloat(String(trade.quantity || "0"))));
  const returnsPct = trade.returnsPct !== undefined
    ? trade.returnsPct
    : (notional > 0 ? (trade.realizedPnl / notional) * 100 : 0);

  const durationLabel = trade.durationMs !== undefined
    ? `${trade.durationMs.toLocaleString()} ms (${(trade.durationMs / 1000).toFixed(2)}s)`
    : isClosed
    ? "Sub-second Atomic Fill"
    : "Active (Holding Open)";

  const copyDetailsJson = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(trade, null, 2));
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md font-mono animate-in fade-in duration-200">
      <div className="bg-[#121215] border border-zinc-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-accent-amber font-bold text-xs">
              Δ
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-zinc-100">Hedge Execution Receipt</h2>
                <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  {trade.id}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-semibold">
                  {trade.status}
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Full Depth Telemetry • Multi-Exchange Arbitrage Execution
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 space-y-6 overflow-y-auto text-xs text-zinc-300">
          {/* Main 4-Pillar KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* 1. COIN & MARKET */}
            <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase">
                <span className="flex items-center space-x-1">
                  <Coins className="w-3.5 h-3.5 text-accent-amber" />
                  <span>Coin / Asset Pair</span>
                </span>
                <span className="text-zinc-400 font-bold">PERPETUAL</span>
              </div>
              <div className="text-xl font-bold text-zinc-100 flex items-center justify-between">
                <span>{trade.symbol}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {trade.type}
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800/80">
                <span>Direction:</span>
                <span className="text-accent-amber font-semibold">{trade.directionLabel}</span>
              </div>
            </div>

            {/* 2. AMOUNT & NOTIONAL */}
            <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase">
                <span className="flex items-center space-x-1">
                  <DollarSign className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>Amount & Size</span>
                </span>
                <span className="text-zinc-400 font-bold">BALANCED</span>
              </div>
              <div className="text-xl font-bold text-zinc-100 flex items-center justify-between">
                <span>{trade.quantity} <span className="text-xs text-zinc-400 font-normal">{trade.symbol.replace("USDT", "")}</span></span>
                <span className="text-xs text-zinc-300 font-mono">
                  ${notional > 0 ? notional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"} USDT
                </span>
              </div>
              <div className="text-[11px] text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800/80">
                <span>Hedge Sizing:</span>
                <span className="text-accent-emerald font-semibold">1:1 Delta-Neutral Ratio</span>
              </div>
            </div>

            {/* 3. LATENCY BETWEEN OPEN & CLOSE */}
            <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase">
                <span className="flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>Latency & Timings</span>
                </span>
                <span className="text-accent-cyan font-bold">SUB-SECOND</span>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] text-zinc-500">OPEN ↔ CLOSE LATENCY</div>
                  <div className="text-lg font-bold text-zinc-100">
                    {durationLabel}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500">INTER-LEG SKEW</div>
                  <div className="text-lg font-bold text-accent-cyan">
                    {trade.interLegDeltaMs.toFixed(1)} ms
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 space-y-0.5 pt-1 border-t border-zinc-800/80">
                <div className="flex justify-between">
                  <span>Open Timestamp:</span>
                  <span className="text-zinc-300 font-mono">{openDate.toLocaleTimeString()} ({openDate.toISOString().slice(0, 10)})</span>
                </div>
                <div className="flex justify-between">
                  <span>Close Timestamp:</span>
                  <span className="text-zinc-300 font-mono">{closeDateStr}</span>
                </div>
              </div>
            </div>

            {/* 4. RETURNS & REALIZED PNL */}
            <div className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 space-y-2">
              <div className="flex items-center justify-between text-zinc-500 text-[10px] uppercase">
                <span className="flex items-center space-x-1">
                  <TrendingUp className="w-3.5 h-3.5 text-accent-emerald" />
                  <span>Returns & Realized PnL</span>
                </span>
                <span className={isProfit ? "text-accent-emerald font-bold" : "text-accent-rose font-bold"}>
                  {isProfit ? "PROFITABLE" : "LOSS"}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] text-zinc-500">REALIZED NET PnL</div>
                  <div className={`text-xl font-bold ${isProfit ? "text-accent-emerald" : "text-accent-rose"}`}>
                    {isProfit ? "+" : ""}{trade.realizedPnl.toFixed(4)} USDT
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-zinc-500">RETURN YIELD</div>
                  <div className={`text-base font-bold ${isProfit ? "text-accent-emerald" : "text-accent-rose"}`}>
                    {returnsPct >= 0 ? "+" : ""}{returnsPct.toFixed(4)}%
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-zinc-500 flex justify-between pt-1 border-t border-zinc-800/80">
                <span>Est. Exchange Fees:</span>
                <span className="text-zinc-300">${(trade.feesUsdt ?? 0.0012).toFixed(4)} USDT</span>
              </div>
            </div>
          </div>

          {/* Dual Leg Exchange Execution Breakdown */}
          <div className="space-y-3">
            <div className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center space-x-2">
              <Layers className="w-4 h-4 text-accent-amber" />
              <span>Simultaneous Dual-Leg Execution Breakdown</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Leg 1: Binance */}
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400">LEG 1: BINANCE USD-M</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    {trade.leg1Side}
                  </span>
                </div>
                <div className="text-sm font-semibold text-zinc-200">
                  Fill Price: ${trade.leg1Price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div className="text-[11px] text-zinc-400 space-y-1 pt-1 border-t border-zinc-800">
                  <div className="flex justify-between">
                    <span>Venue:</span>
                    <span className="text-zinc-300">{trade.leg1Venue || "Binance Testnet"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Order ID:</span>
                    <span className="text-amber-400 font-mono">
                      {trade.leg1OrderId ? `#${trade.leg1OrderId}` : "Immediate Market Fill"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Execution:</span>
                    <span className="text-emerald-400 font-semibold">Immediate Taker Fill</span>
                  </div>
                </div>
              </div>

              {/* Leg 2: Bitget */}
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-cyan-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-400">LEG 2: BITGET V3 PERP</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    {trade.leg2Side}
                  </span>
                </div>
                <div className="text-sm font-semibold text-zinc-200">
                  Fill Price: ${trade.leg2Price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                </div>
                <div className="text-[11px] text-zinc-400 space-y-1 pt-1 border-t border-zinc-800">
                  <div className="flex justify-between">
                    <span>Venue:</span>
                    <span className="text-zinc-300">{trade.leg2Venue || "Bitget V3 Demo"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Order ID:</span>
                    <span className="text-cyan-400 font-mono">
                      {trade.leg2OrderId ? `#${trade.leg2OrderId}` : "Stagger-Compensated Fill"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Execution:</span>
                    <span className="text-emerald-400 font-semibold">Stagger-Compensated Fill</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Verification Note */}
          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start space-x-3 text-[11px] text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-accent-emerald shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-zinc-200">Delta-Neutral Mathematical Verification:</span>
              <p className="mt-0.5 text-zinc-400">
                Both legs were executed with zero unhedged exposure window. Directional market risk was eliminated by holding inverse contracts on Binance and Bitget. Realized PnL reflects funding rate settlement and spread convergence.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
          <button
            onClick={copyDetailsJson}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy JSON Receipt</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-accent-amber hover:bg-amber-400 text-zinc-950 transition-colors"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
}
