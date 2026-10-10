"use client";

import React, { useState } from "react";
import { ShieldCheck, Zap, Loader2, Info, Wallet } from "lucide-react";

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
  const [closingTarget, setClosingTarget] = useState<string | null>(null);

  const enrichedPositions = positions.map((pos) => {
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

    return {
      ...pos,
      isLong,
      assetSymbol,
      venueMarkPrice,
      dynamicPnl,
      isProfit,
      notional,
      leverage,
      initialMargin,
      roePct,
      estLiqPrice,
      liqBufferPct,
    };
  });

  const totalDynamicPnl = enrichedPositions.reduce((acc, p) => acc + (p.dynamicPnl || 0), 0);
  const totalExchangeMarkPnl = positions.reduce((acc, p) => acc + (p.unrealizedPnl || 0), 0);

  const longNotional = enrichedPositions
    .filter((p) => p.isLong)
    .reduce((acc, p) => acc + p.notional, 0);
  const shortNotional = enrichedPositions
    .filter((p) => !p.isLong)
    .reduce((acc, p) => acc + p.notional, 0);
  const notionalImbalance = Math.abs(longNotional - shortNotional);

  const handleClose = async (symbol?: string) => {
    const target = symbol || "ALL";
    setClosingTarget(target);
    try {
      await onClosePosition?.(symbol);
    } finally {
      setClosingTarget(null);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-3.5 sm:p-5 font-mono">
      <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 mb-4 gap-2">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-emerald animate-pulse" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            LIVE OPEN POSITIONS
          </h2>
        </div>
        <div className="flex items-center space-x-2 text-[10px] text-zinc-400">
          <span>Active: <strong className="text-zinc-200">{positions.length}</strong></span>
          {positions.length > 0 && (
            <>
              <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                DELTA NEUTRAL
              </span>
              <button
                onClick={() => handleClose("ALL")}
                disabled={closingTarget !== null}
                className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold transition-colors flex items-center gap-1"
                title="Emergency close all open legs simultaneously"
              >
                {closingTarget === "ALL" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                    <span>FLATTENING...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3 h-3 text-rose-400" />
                    <span>FLATTEN ALL</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {positions.length > 0 && (
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-zinc-950/70 p-3 rounded-xl border border-zinc-800">
          <div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
              <span>LIVE COMBINED PnL</span>
              <span className="text-[9px] text-zinc-400 font-normal">TICKER-BASED</span>
            </div>
            <div className={`text-base font-bold font-mono mt-0.5 ${totalDynamicPnl >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
              {totalDynamicPnl >= 0 ? "+" : ""}{totalDynamicPnl.toFixed(4)} USDT
            </div>
            <div className="text-[10px] text-zinc-400 mt-1 flex items-center gap-1">
              <span className="text-zinc-500">Exchange MTM Basis:</span>
              <span className={`font-mono font-medium ${totalExchangeMarkPnl >= 0 ? "text-emerald-400" : "text-zinc-300"}`}>
                {totalExchangeMarkPnl >= 0 ? "+" : ""}{totalExchangeMarkPnl.toFixed(4)} USDT
              </span>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-zinc-500 uppercase">NOTIONAL BALANCE (LONG vs SHORT)</div>
            <div className="text-xs text-zinc-300 font-mono mt-0.5">
              Long: ${longNotional.toFixed(2)} | Short: ${shortNotional.toFixed(2)}
            </div>
            <div className="text-[9px] text-zinc-500">
              Imbalance: ${notionalImbalance.toFixed(2)} USDT ({longNotional > 0 ? ((notionalImbalance / longNotional) * 100).toFixed(1) : 0}% skew)
            </div>
          </div>

          <div>
            <div className="text-[10px] text-zinc-500 uppercase flex items-center gap-1">
              <Wallet className="w-3 h-3 text-accent-cyan" />
              <span>FUNDING YIELD HARVEST</span>
            </div>
            <div className="text-[10px] text-zinc-400 mt-0.5 leading-tight">
              Delta-neutral hedge. Funding fees are credited directly into <strong className="text-zinc-200">Cash Wallet Balance</strong> at 00:00, 08:00, 16:00 UTC (not position unrealized PnL).
            </div>
          </div>
        </div>
      )}

      {positions.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No open positions detected on Binance Futures or Bitget UTA.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-1 sm:mx-0 px-1 sm:px-0">
          <table className="w-full min-w-[700px] text-left text-xs">
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
              {enrichedPositions.map((pos) => {
                const isProfit = pos.isProfit;

                return (
                  <tr key={`${pos.venue || "pos"}-${pos.symbol}-${pos.amount}`} className="text-zinc-200">
                    <td className="py-2.5 font-bold flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${pos.isLong ? "bg-accent-emerald" : "bg-accent-rose"}`} />
                      <span>{pos.symbol}</span>
                      {pos.venue && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-normal ${pos.venue === "Binance" ? "bg-amber-950/40 text-accent-amber border border-amber-800/40" : "bg-cyan-950/40 text-accent-cyan border border-cyan-800/40"}`}>
                          {pos.venue}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <span className={pos.isLong ? "text-accent-emerald font-semibold" : "text-accent-rose font-semibold"}>
                        {pos.isLong ? "+" : ""}{pos.amount} {pos.assetSymbol}
                      </span>
                      <div className="text-[10px] text-zinc-500 font-normal">
                        ${pos.notional.toFixed(2)} Notional
                      </div>
                    </td>
                    <td className="py-2.5">${pos.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5">
                      <div className="flex items-center space-x-1.5">
                        <span>${pos.venueMarkPrice?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          LIVE
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="flex flex-col">
                        <span className={`font-bold ${isProfit ? "text-accent-emerald" : "text-accent-rose"}`}>
                          {isProfit ? "+" : ""}{pos.dynamicPnl?.toFixed(4)} USDT
                        </span>
                        <span className={`text-[10px] ${pos.roePct >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
                          ({pos.roePct >= 0 ? "+" : ""}{pos.roePct?.toFixed(2)}% ROE)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={`text-[11px] font-semibold ${pos.liqBufferPct > 3 ? "text-emerald-400" : "text-amber-400"}`}>
                        +{pos.liqBufferPct.toFixed(1)}%
                      </span>
                      <div className="text-[9px] text-zinc-500">
                        Liq ~${pos.estLiqPrice.toFixed(1)}
                      </div>
                    </td>
                    <td className="py-2.5">{pos.leverage}x</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => handleClose(pos.symbol)}
                        disabled={closingTarget !== null}
                        className="px-2.5 py-1 text-[10px] font-semibold rounded bg-zinc-800 hover:bg-rose-950/80 hover:text-rose-300 hover:border-rose-700 text-zinc-300 border border-zinc-700 transition-colors inline-flex items-center gap-1"
                        title={`Flatten ${pos.symbol}`}
                      >
                        {closingTarget === pos.symbol ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-rose-400" />
                            <span>Flattening...</span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-2.5 h-2.5 text-accent-amber" />
                            <span>Flatten {pos.assetSymbol}</span>
                          </>
                        )}
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
