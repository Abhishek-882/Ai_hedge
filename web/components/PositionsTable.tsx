"use client";

import React from "react";

interface Position {
  symbol: string;
  amount: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
}

interface PositionsTableProps {
  positions: Position[];
  onClosePosition?: () => void;
}

export default function PositionsTable({ positions, onClosePosition }: PositionsTableProps) {
  return (
    <div className="bg-surface rounded-xl border border-border p-5 font-mono">
      <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-emerald" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            LIVE OPEN POSITIONS
          </h2>
        </div>
        <div className="text-[10px] text-zinc-500 uppercase">
          Active: {positions.length}
        </div>
      </div>

      {positions.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No open positions detected on Binance Futures Testnet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-[10px] text-zinc-400 uppercase">
                <th className="pb-2">Symbol</th>
                <th className="pb-2">Size</th>
                <th className="pb-2">Entry Price</th>
                <th className="pb-2">Mark Price</th>
                <th className="pb-2">PnL (USDT)</th>
                <th className="pb-2">Leverage</th>
                <th className="pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {positions.map((pos) => {
                const isLong = pos.amount > 0;
                const isProfit = pos.unrealizedPnl >= 0;
                return (
                  <tr key={pos.symbol} className="text-zinc-200">
                    <td className="py-2.5 font-bold flex items-center space-x-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isLong ? "bg-accent-emerald" : "bg-accent-rose"}`} />
                      <span>{pos.symbol}</span>
                    </td>
                    <td className="py-2.5">
                      <span className={isLong ? "text-accent-emerald font-semibold" : "text-accent-rose font-semibold"}>
                        {isLong ? "+" : ""}{pos.amount} BTC
                      </span>
                    </td>
                    <td className="py-2.5">${pos.entryPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5">${pos.markPrice?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="py-2.5">
                      <span className={`font-bold ${isProfit ? "text-accent-emerald" : "text-accent-rose"}`}>
                        {isProfit ? "+" : ""}{pos.unrealizedPnl?.toFixed(2)} USDT
                      </span>
                    </td>
                    <td className="py-2.5">{pos.leverage}x</td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={onClosePosition}
                        className="px-2 py-1 text-[10px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
                      >
                        Flatten
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
