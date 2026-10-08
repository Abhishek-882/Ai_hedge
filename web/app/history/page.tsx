"use client";

import React, { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HedgeHistoryTable, { HedgeTradeRecord } from "@/components/HedgeHistoryTable";
import { History, ShieldCheck, RefreshCw, Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const [history, setHistory] = useState<HedgeTradeRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchHistory = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/trades", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.trades)) {
        setHistory(data.trades);
      }
    } catch {
      // fallback to empty
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleClearHistory = async () => {
    setHistory([]);
    try {
      await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("HEDGE_TRADE_HISTORY");
        } catch {}
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 space-y-6">
        {/* Page Title & Navigation Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-cyan animate-pulse" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight uppercase">
                HEDGE TRADE HISTORY // AUDIT ARCHIVE
              </h1>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Real-Time Execution Logs • Cryptographic Receipts • Full Depth Analysis Per Hedge
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchHistory}
              disabled={isRefreshing}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-accent-cyan" : ""}`} />
              <span>Refresh Log</span>
            </button>

            <Link
              href="/terminal"
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow-sm"
            >
              <span>Back to Cockpit</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* History Table Container */}
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-start space-x-3 text-xs text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-accent-emerald shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-zinc-200">Execution Receipt Guarantee:</span>
              <p className="mt-0.5 text-zinc-400 text-[11px]">
                History starts now. Every automated and manual hedge executed on Binance USD-M and Bitget V3 is recorded with millisecond inter-leg delta, duration, and realized PnL. Click <strong>[ More Detail ]</strong> on any row to open the full cryptographic execution receipt.
              </p>
            </div>
          </div>

          <HedgeHistoryTable
            history={history}
            onClearHistory={handleClearHistory}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
