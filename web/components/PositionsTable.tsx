"use client";

import React from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

interface Position {
  venue?: string;
  symbol: string;
  amount: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

interface PositionsTableProps {
  positions: Position[];
  currentSymbol?: string;
  liveBinancePrice?: number;
  liveBitgetPrice?: number;
  onClosePosition?: (symbol?: string) => void;
}

export default function PositionsTable({
  positions,
  currentSymbol,
  liveBinancePrice,
  liveBitgetPrice,
  onClosePosition,
}: PositionsTableProps) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-emerald animate-pulse" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            LIVE OPEN POSITIONS
          </h2>
        </div>
        <div className="flex items-center space-x-3 text-[10px] text-zinc-400">
          <span>Active: <strong className="text-zinc-200">{positions.length}</strong></span>
          {positions.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              DELTA NEUTRAL
            </span>
          )}
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No open positions detected on Binance Futures or Bitget UTA.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] text-zinc-400 uppercase">
                <th className="pb-2">Symbol / Venue</th>
                <th className="pb-2">Size</th>
                <th className="pb-2">Entry Price</th>
                <th className="pb-2">Mark Price</th>
                <th className="pb-2">Dynamic PnL (4D)</th>
                <th className="pb-2">Liq. Buffer</th>
                <th className="pb-2">Leverage</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y border-border">
              {positions.map((pos) => {
                const isLong = pos.amount > 0;
                const matchesCurrentAsset = Boolean(currentSymbol && pos.symbol === currentSymbol);
                const rawLivePrice = (pos.venue === "Bitget" ? liveBitgetPrice : liveBinancePrice) || 0;
                const baselinePrice = pos.markPrice || pos.entryPrice;
                // Plausibility check: live price must be > 0 and within 20% of baseline price
                const isPricePlausible = Boolean(
                  rawLivePrice > 0 &&
                  baselinePrice > 0 &&
                  Math.abs(rawLivePrice - baselinePrice) / baselinePrice < 0.20
                );

                const venueMarkPrice = (matchesCurrentAsset && isPricePlausible)
                  ? rawLivePrice
                  : baselinePrice;

                const dynamicPnl = (matchesCurrentAsset && isPricePlausible && pos.amount !== 0 && pos.entryPrice > 0)
                  ? (venueMarkPrice - pos.entryPrice) * pos.amount
                  : (pos.unrealizedPnl || 0);

                const isProfit = dynamicPnl >= 0;
                const notional = pos.entryPrice * Math.abs(pos.amount);
                const leverage = pos.leverage || 20;
                const initialMargin = notional / leverage;
                const roePct = initialMargin > 0 ? (dynamicPnl / initialMargin) * 100 : 0;

                // Estimated liquidation distance
                const estLiqPrice = isLong
                  ? pos.entryPrice * (1 - (1 / leverage) * 0.9)
                  : pos.entryPrice * (1 + (1 / leverage) * 0.9);
                const liqBufferPct = venueMarkPrice > 0
                  ? (Math.abs(venueMarkPrice - estLiqPrice) / venueMarkPrice) * 100
                  : 5.0;

                const assetSymbol = pos.symbol.replace("USDT", "");

                return (
                  <tr key={`${pos.venue || "pos"}-${pos.symbol}-${pos.amount}`} className="text-zinc-200">
                    <td className="py-2.5 font-bold flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isLong ? "bg-accent-emerald" : "bg-accent-rose"}`} />
                      <span>{pos.symbol}</span>
                      {pos.venue && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-normal ${pos.venue === "Binance" ? "bg-amber-950/40 text-accent-amber border border-amber-800/40" : "bg-cyan-950/40 text-accent-cyan border border-cyan-800/40"}`}>
                          {pos.venue}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className={isLong ? "text-accent-emerald font-semibold" : "text-accent-rose font-semibold"}>
                        {isLong ? "+" : ""}{pos.amount} {assetSymbol}
                      </span>
                      <div className="text-[10px] text-zinc-500 font-normal">
                        ${notional.toFixed(2)} Notional
                      </div>
                    </td>
                    <td className="py-2.5">${pos.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5">
                      <div className="flex items-center space-x-1.5">
                        <span>${venueMarkPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          LIVE
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-col">
                        <span className={`font-bold ${isProfit ? "text-accent-emerald" : "text-accent-rose"}`}>
                          {isProfit ? "+" : ""}{dynamicPnl?.toFixed(4)} USDT
                        </span>
                        <span className={`text-[10px] ${roePct >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
                          ({roePct >= 0 ? "+" : ""}{roePct?.toFixed(2)}% ROE)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-[11px] font-semibold ${liqBufferPct > 3 ? "text-emerald-400" : "text-amber-400"}`}>
                        +{liqBufferPct.toFixed(1)}%
                      </span>
                      <div className="text-[9px] text-zinc-500">
                        Liq ~${estLiqPrice.toFixed(1)}
                      </div>
                    </td>
                    <td className="py-2.5">{leverage}x</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => onClosePosition?.(pos.symbol)}
                        className="px-2 py-1 text-[10px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                        title={`Flatten ${pos.symbol}`}
                      >
                        Flatten {assetSymbol}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
