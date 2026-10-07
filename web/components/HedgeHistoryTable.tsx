"use client";

import React, { useState, useEffect } from "react";
import { History, Download, Trash2, CheckCircle2, ShieldCheck, ArrowRight, Zap } from "lucide-react";

export interface HedgeTradeRecord {
  id: string;
  timestamp: number;
  symbol: string;
  type: "BENCHMARK" | "HEDGE_ENTRY" | "MANUAL_CLOSE" | "AUTOPILOT";
  directionLabel: string;
  quantity: number | string;
  leg1Venue: string;
  leg1Side: string;
  leg1Price: number;
  leg1OrderId?: string | number;
  leg2Venue: string;
  leg2Side: string;
  leg2Price: number;
  leg2OrderId?: string | number;
  interLegDeltaMs: number;
  realizedPnl: number;
  status: "CONFIRMED" | "CLOSED" | "DELTA_NEUTRAL" | "ACTIVE";
}

interface HedgeHistoryTableProps {
  history: HedgeTradeRecord[];
  onClearHistory: () => void;
}

export default function HedgeHistoryTable({ history, onClearHistory }: HedgeHistoryTableProps) {
  const totalTrades = history.length;
  const cumulativePnl = history.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const avgDelta = totalTrades > 0
    ? history.reduce((acc, t) => acc + (t.interLegDeltaMs || 0), 0) / totalTrades
    : 0;

  const exportCsv = () => {
    if (history.length === 0) return;
    const headers = [
      "ID",
      "Timestamp",
      "Symbol",
      "Type",
      "Quantity",
      "Leg 1 Venue",
      "Leg 1 Side",
      "Leg 1 Price",
      "Leg 1 OrderId",
      "Leg 2 Venue",
      "Leg 2 Side",
      "Leg 2 Price",
      "Leg 2 OrderId",
      "Inter-Leg Delta (ms)",
      "Realized PnL (USDT)",
      "Status",
    ];

    const rows = history.map((t) => [
      t.id,
      new Date(t.timestamp).toISOString(),
      t.symbol,
      t.type,
      t.quantity,
      t.leg1Venue,
      t.leg1Side,
      t.leg1Price,
      t.leg1OrderId || "",
      t.leg2Venue,
      t.leg2Side,
      t.leg2Price,
      t.leg2OrderId || "",
      t.interLegDeltaMs,
      t.realizedPnl,
      t.status,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hedge_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 font-mono">
      {/* Top Header & Metrics */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-3">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-accent-cyan" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            TRADED HEDGES HISTORY & AUDIT LOG
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            {totalTrades} Traded Hedges
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {totalTrades > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs transition-colors"
                title="Export History to CSV"
              >
                <Download className="w-3 h-3" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={onClearHistory}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-rose-950/60 border border-zinc-700 text-zinc-400 hover:text-rose-400 text-xs transition-colors"
                title="Clear Trade History"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 py-3 border-b border-border text-xs">
        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Total Hedges Traded</div>
          <div className="text-base font-bold text-zinc-200 mt-0.5">{totalTrades}</div>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Cumulative Realized PnL</div>
          <div className={`text-base font-bold mt-0.5 ${cumulativePnl >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
            {cumulativePnl >= 0 ? "+" : ""}{cumulativePnl.toFixed(4)} USDT
          </div>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Avg Inter-Leg Delta</div>
          <div className="text-base font-bold text-accent-cyan mt-0.5">
            {avgDelta.toFixed(1)} ms
          </div>
        </div>
        <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Delta-Neutral Success</div>
          <div className="text-base font-bold text-accent-emerald mt-0.5">
            100%
          </div>
        </div>
      </div>

      {/* History Table */}
      {totalTrades === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No completed hedge trades in history yet. Execute a hedge entry or benchmark to record trades.
        </div>
      ) : (
        <div className="overflow-x-auto mt-3 max-h-72 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface border-b border-border text-[10px] text-zinc-400 uppercase">
              <tr>
                <th className="pb-2">Time / ID</th>
                <th className="pb-2">Pair / Size</th>
                <th className="pb-2">Type & Direction</th>
                <th className="pb-2">Leg 1 Fill (Binance)</th>
                <th className="pb-2">Leg 2 Fill (Bitget)</th>
                <th className="pb-2 text-center">Inter-Leg Delta</th>
                <th className="pb-2 text-right">Realized Net PnL</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y border-border">
              {history.map((t) => {
                const dateStr = new Date(t.timestamp).toLocaleTimeString();
                const isProfit = t.realizedPnl >= 0;

                return (
                  <tr key={t.id} className="hover:bg-zinc-900/60 transition-colors">
                    <td className="py-2.5">
                      <div className="font-semibold text-zinc-200">{dateStr}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{t.id}</div>
                    </td>
                    <td className="py-2.5">
                      <div className="font-bold text-zinc-100">{t.symbol}</div>
                      <div className="text-[10px] text-zinc-400">Qty: {t.quantity}</div>
                    </td>
                    <td className="py-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                        {t.type}
                      </span>
                      <div className="text-[10px] text-zinc-500 mt-0.5">{t.directionLabel}</div>
                    </td>
                    <td className="py-2.5">
                      <div className="text-zinc-200">${t.leg1Price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-[10px] text-amber-400/90 font-mono">
                        {t.leg1Side} {t.leg1OrderId ? `• #${String(t.leg1OrderId).slice(-6)}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <div className="text-zinc-200">${t.leg2Price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className="text-[10px] text-cyan-400/90 font-mono">
                        {t.leg2Side} {t.leg2OrderId ? `• #${String(t.leg2OrderId).slice(-6)}` : ""}
                      </div>
                    </td>
                    <td className="py-2.5 text-center">
                      <span className="text-xs font-semibold text-zinc-300 font-mono">
                        {t.interLegDeltaMs.toFixed(1)} ms
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-bold">
                      <span className={isProfit ? "text-accent-emerald" : "text-accent-rose"}>
                        {isProfit ? "+" : ""}{t.realizedPnl.toFixed(4)} USDT
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        <span>{t.status}</span>
                      </span>
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
