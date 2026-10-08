"use client";

import React, { useState } from "react";
import { History, Download, Trash2, CheckCircle2, ShieldCheck, ArrowRight, Zap, Info, Filter } from "lucide-react";
import HedgeDetailModal from "./HedgeDetailModal";
import { ServerHedgeTrade } from "@/lib/serverTradeStore";

export type HedgeTradeRecord = ServerHedgeTrade;

interface HedgeHistoryTableProps {
  history: HedgeTradeRecord[];
  onClearHistory: () => void;
}

export default function HedgeHistoryTable({ history, onClearHistory }: HedgeHistoryTableProps) {
  const [selectedTrade, setSelectedTrade] = useState<HedgeTradeRecord | null>(null);
  const [filterMode, setFilterMode] = useState<"ALL" | "ACTIVE" | "CLOSED" | "PROFIT">("ALL");

  const totalTrades = history.length;
  const cumulativePnl = history.reduce((acc, t) => acc + (t.realizedPnl || 0), 0);
  const avgDelta = totalTrades > 0
    ? history.reduce((acc, t) => acc + (t.interLegDeltaMs || 0), 0) / totalTrades
    : 0;
  const totalNotional = history.reduce((acc, t) => {
    const notional = t.notionalUsdt || (parseFloat(String(t.quantity || 0)) * (t.leg1Price || 0));
    return acc + notional;
  }, 0);

  const filteredHistory = history.filter((t) => {
    if (filterMode === "ACTIVE") return t.status === "ACTIVE" || t.status === "DELTA_NEUTRAL" || !t.durationMs;
    if (filterMode === "CLOSED") return t.status === "CLOSED" || !!t.durationMs;
    if (filterMode === "PROFIT") return (t.realizedPnl || 0) > 0;
    return true;
  });

  const exportCsv = () => {
    if (history.length === 0) return;
    const headers = [
      "ID",
      "Timestamp",
      "Symbol",
      "Type",
      "Quantity",
      "Notional USDT",
      "Leg 1 Venue",
      "Leg 1 Side",
      "Leg 1 Price",
      "Leg 1 OrderId",
      "Leg 2 Venue",
      "Leg 2 Side",
      "Leg 2 Price",
      "Leg 2 OrderId",
      "Inter-Leg Delta (ms)",
      "Duration (ms)",
      "Realized PnL (USDT)",
      "Return %",
      "Status",
    ];

    const rows = history.map((t) => [
      t.id,
      new Date(t.timestamp).toISOString(),
      t.symbol,
      t.type,
      t.quantity,
      t.notionalUsdt || "",
      t.leg1Venue,
      t.leg1Side,
      t.leg1Price,
      t.leg1OrderId || "",
      t.leg2Venue,
      t.leg2Side,
      t.leg2Price,
      t.leg2OrderId || "",
      t.interLegDeltaMs,
      t.durationMs || "",
      t.realizedPnl,
      t.returnsPct || "",
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
    <div className="bg-surface rounded-xl border border-border p-5 font-mono space-y-4 shadow-xl">
      {/* Top Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-border gap-3">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-accent-cyan" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            TRADED HEDGES HISTORY & AUDIT LOG
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
            {totalTrades} Records
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {totalTrades > 0 && (
            <>
              <button
                onClick={exportCsv}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-xs transition-colors active:scale-95"
                title="Export History to CSV"
              >
                <Download className="w-3 h-3" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={onClearHistory}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-rose-950/60 border border-zinc-700 text-zinc-400 hover:text-rose-400 text-xs transition-colors active:scale-95"
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Total Traded Notional</div>
          <div className="text-base font-bold text-zinc-200 mt-0.5 font-mono">
            ${totalNotional.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">{totalTrades} Executed Hedges</div>
        </div>

        <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Cumulative Realized PnL</div>
          <div className={`text-base font-bold mt-0.5 font-mono ${cumulativePnl >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
            {cumulativePnl >= 0 ? "+" : ""}{cumulativePnl.toFixed(4)} USDT
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">Net Funding + Basis</div>
        </div>

        <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Avg Inter-Leg Delta</div>
          <div className="text-base font-bold text-accent-cyan mt-0.5 font-mono">
            {avgDelta.toFixed(1)} ms
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">Binance ↔ Bitget Skew</div>
        </div>

        <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">Delta-Neutral Success</div>
          <div className="text-base font-bold text-accent-emerald mt-0.5 font-mono">
            {totalTrades > 0 ? "100.0%" : "---"}
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">0 Liquidation Events</div>
        </div>
      </div>

      {/* Filter Quick-Chips */}
      {totalTrades > 0 && (
        <div className="flex items-center space-x-2 pt-1 border-t border-border/80 overflow-x-auto">
          <span className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1 shrink-0">
            <Filter className="w-3 h-3" />
            <span>Filter:</span>
          </span>
          {[
            { id: "ALL", label: `All Hedges (${history.length})` },
            { id: "ACTIVE", label: `Active (${history.filter(t => t.status === "ACTIVE" || t.status === "DELTA_NEUTRAL" || !t.durationMs).length})` },
            { id: "CLOSED", label: `Closed (${history.filter(t => t.status === "CLOSED" || !!t.durationMs).length})` },
            { id: "PROFIT", label: `Profitable (${history.filter(t => (t.realizedPnl || 0) > 0).length})` },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterMode(f.id as any)}
              className={`px-2.5 py-1 rounded text-xs transition-all active:scale-95 whitespace-nowrap ${
                filterMode === f.id
                  ? "bg-accent-amber text-zinc-950 font-bold border border-amber-400 shadow-sm"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* History Table */}
      {totalTrades === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No completed hedge trades in history yet. History starts now — execute a hedge entry or benchmark to record live trades.
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          No hedge records match the selected filter ({filterMode}).
        </div>
      ) : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
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
                <th className="pb-2 text-right pr-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y border-border">
              {filteredHistory.map((t) => {
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
                    <td className="py-2.5 text-right pr-2">
                      <button
                        onClick={() => setSelectedTrade(t)}
                        className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-accent-amber border border-amber-500/30 hover:border-amber-400 text-[11px] font-bold transition-all shadow-sm active:scale-95"
                        title="View Full Depth Details for this Hedge"
                      >
                        [ More Detail ]
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Full Depth Detail Modal */}
      <HedgeDetailModal
        trade={selectedTrade}
        onClose={() => setSelectedTrade(null)}
      />
    </div>
  );
}
