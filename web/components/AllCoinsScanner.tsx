"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Search, Flame, ArrowUpRight, ArrowDownRight, RefreshCw, Zap, Clock, ShieldAlert, Check } from "lucide-react";
import { getDeterministicNextFundingTime, formatCountdown } from "@/lib/settlementTime";

export interface CoinOpportunity {
  symbol: string;
  baseAsset: string;
  binanceRate: number;
  bitgetRate: number;
  spreadBps: number;
  annualizedApr: number;
  binanceMarkPrice: number;
  bitgetMarkPrice: number;
  direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET";
  volume24h: number;
  nextFundingTime: number;
}

interface AllCoinsScannerProps {
  onSelectCoin: (symbol: string, direction?: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET") => void;
  selectedSymbol?: string;
  onTradeExecuted?: (trade: any) => void;
}

export default function AllCoinsScanner({ onSelectCoin, selectedSymbol, onTradeExecuted }: AllCoinsScannerProps) {
  const [coins, setCoins] = useState<CoinOpportunity[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterMode, setFilterMode] = useState<"HIGHEST_FUNDING" | "TOP_SPREADS" | "HIGH_APR" | "MAJORS" | "ALL">("HIGHEST_FUNDING");
  const [sortBy, setSortBy] = useState<"funding" | "spread" | "apr" | "countdown" | "volume" | "symbol">("funding");
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // 1-Click Quick Hedge Execution State
  const [executingSymbol, setExecutingSymbol] = useState<string | null>(null);
  const [filledSymbol, setFilledSymbol] = useState<string | null>(null);
  const [errorFeedback, setErrorFeedback] = useState<{ symbol: string; message: string } | null>(null);
  const [errorSymbol, setErrorSymbol] = useState<string | null>(null);

  // Throttled ticker for countdowns (3s interval, pauses when hidden)
  useEffect(() => {
    const tick = setInterval(() => {
      if (!document.hidden) {
        setCurrentTime(Date.now());
      }
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  const fetchCoins = async () => {
    if (document.hidden) return;
    try {
      const res = await fetch("/api/coins", { cache: "no-store" });
      const data = await res.json();
      if (data.success && Array.isArray(data.coins) && data.coins.length > 0) {
        setCoins(data.coins);
        setLastUpdated(data.updatedAt || Date.now());
        setError(null);
      } else {
        setCoins((prev) => {
          if (prev.length === 0) {
            setError(data.error || "Failed to load coin scanner");
          }
          return prev;
        });
      }
    } catch (err: any) {
      setCoins((prev) => {
        if (prev.length === 0) {
          setError(err.message || "Network error loading coins");
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCoins();
    // 8-second polling for live opportunity table, pauses when tab is hidden
    const interval = setInterval(() => {
      if (!document.hidden) fetchCoins();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  const fallbackTarget = useMemo(() => getDeterministicNextFundingTime(currentTime), [currentTime]);

  const filteredCoins = useMemo(() => {
    let list = [...coins];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toUpperCase().trim();
      list = list.filter((c) => c.symbol.includes(q) || c.baseAsset.includes(q));
    }

    // Category filter
    if (filterMode === "TOP_SPREADS") {
      list = list.filter((c) => c.spreadBps >= 2.0);
    } else if (filterMode === "HIGH_APR") {
      list = list.filter((c) => c.annualizedApr >= 25.0);
    } else if (filterMode === "MAJORS") {
      const majors = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "XRPUSDT", "BNBUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT", "NEARUSDT", "SUIUSDT"];
      list = list.filter((c) => majors.includes(c.symbol));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "funding") {
        if (b.binanceRate !== a.binanceRate) return b.binanceRate - a.binanceRate;
        return b.spreadBps - a.spreadBps;
      }
      if (sortBy === "spread") return b.spreadBps - a.spreadBps;
      if (sortBy === "apr") return b.annualizedApr - a.annualizedApr;
      if (sortBy === "countdown") {
        const timeA = a.nextFundingTime > 0 ? a.nextFundingTime : fallbackTarget;
        const timeB = b.nextFundingTime > 0 ? b.nextFundingTime : fallbackTarget;
        return timeA - timeB;
      }
      if (sortBy === "volume") return b.volume24h - a.volume24h;
      if (sortBy === "symbol") return a.symbol.localeCompare(b.symbol);
      return 0;
    });

    return list;
  }, [coins, searchQuery, filterMode, sortBy, fallbackTarget]);

  // 1-Click Quick Hedge on ANY coin row
  const handleQuickHedge = async (coin: CoinOpportunity) => {
    setExecutingSymbol(coin.symbol);
    setErrorSymbol(null);
    setErrorFeedback(null);
    try {
      // Calculate safe dynamic lot quantity ensuring notional >= exchange minimums ($60 for BTC, $30 for ETH, $15 for others)
      let minRequiredNotional = 15.0;
      if (coin.symbol.startsWith("BTC")) minRequiredNotional = 60.0;
      else if (coin.symbol.startsWith("ETH")) minRequiredNotional = 30.0;

      let safeQty = 10;
      if (coin.binanceMarkPrice > 0) {
        if (coin.symbol.startsWith("BTC")) {
          safeQty = 0.001;
        } else if (coin.symbol.startsWith("ETH")) {
          safeQty = 0.01;
        } else if (coin.symbol.startsWith("SOL")) {
          safeQty = 0.2;
        } else if (coin.binanceMarkPrice > 500) {
          safeQty = parseFloat((minRequiredNotional / coin.binanceMarkPrice).toFixed(2));
          if (safeQty <= 0) safeQty = 0.05;
        } else if (coin.binanceMarkPrice > 50) {
          safeQty = parseFloat((minRequiredNotional / coin.binanceMarkPrice).toFixed(1));
          if (safeQty <= 0) safeQty = 0.5;
        } else if (coin.binanceMarkPrice > 1) {
          safeQty = Math.max(1, Math.round(minRequiredNotional / coin.binanceMarkPrice));
        } else {
          safeQty = Math.max(10, Math.round(minRequiredNotional / coin.binanceMarkPrice));
        }
      }

      const leg1Side = coin.direction === "SHORT_BINANCE_LONG_BITGET" ? "SELL" : "BUY";

      const res = await fetch("/api/hedge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "entry",
          symbol: coin.symbol,
          quantity: safeQty,
          leg1Side,
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Hedge execution failed");

      setFilledSymbol(coin.symbol);
      setTimeout(() => setFilledSymbol(null), 4000);

      // Record trade and update history
      const tradeRecord = {
        id: `HDG-${Date.now().toString().slice(-6)}`,
        timestamp: Date.now(),
        symbol: coin.symbol,
        type: "QUICK_HEDGE_1CLICK",
        directionLabel: coin.direction === "SHORT_BINANCE_LONG_BITGET" ? "Short BN + Long BG" : "Long BN + Short BG",
        quantity: safeQty.toString(),
        leg1Venue: "Binance",
        leg1Side: leg1Side,
        leg1Price: data.leg1?.price || coin.binanceMarkPrice,
        leg1OrderId: data.leg1?.orderId,
        leg2Venue: "Bitget",
        leg2Side: leg1Side === "SELL" ? "BUY" : "SELL",
        leg2Price: data.leg2?.price || coin.bitgetMarkPrice,
        leg2OrderId: data.leg2?.orderId,
        interLegDeltaMs: data.interLegDeltaMs || 0,
        realizedPnl: 0,
        status: "ACTIVE",
      };

      if (onTradeExecuted) {
        onTradeExecuted(tradeRecord);
      }

      // Persist to server trade registry as well
      fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeRecord),
      }).catch(() => {});

      // Also set as active symbol
      onSelectCoin(coin.symbol, coin.direction);

    } catch (err: any) {
      setErrorSymbol(coin.symbol);
      setErrorFeedback({ symbol: coin.symbol, message: err.message || "Execution rejected" });
      setTimeout(() => {
        setErrorFeedback(null);
        setErrorSymbol(null);
      }, 6000);
    } finally {
      setExecutingSymbol(null);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-border p-5 font-mono">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border gap-3">
        <div className="flex items-center space-x-2">
          <Flame className="w-4 h-4 text-accent-amber animate-pulse" />
          <h2 className="text-sm font-semibold text-zinc-100 tracking-wide uppercase">
            ALL COINS FUNDING ARBITRAGE SCANNER
          </h2>
          <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
            {coins.length > 0 ? `${coins.length} Verified Pairs (Binance & Bitget)` : "Scanning..."}
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-accent-emerald border border-emerald-800/50">
            Ranked by Highest Funding (8h)
          </span>
        </div>

        {/* Search & Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search coin (e.g. PEPE, SOL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent-amber w-40 md:w-52"
            />
          </div>

          <div className="flex items-center space-x-1 text-[10px]">
            <button
              onClick={() => {
                setFilterMode("HIGHEST_FUNDING");
                setSortBy("funding");
              }}
              className={`px-2 py-1 rounded transition-colors ${
                filterMode === "HIGHEST_FUNDING"
                  ? "bg-accent-amber text-zinc-950 font-bold shadow-sm shadow-amber-500/20"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              }`}
            >
              Highest Funding
            </button>
            <button
              onClick={() => {
                setFilterMode("TOP_SPREADS");
                setSortBy("spread");
              }}
              className={`px-2 py-1 rounded transition-colors ${
                filterMode === "TOP_SPREADS"
                  ? "bg-accent-amber text-zinc-950 font-bold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              }`}
            >
              Top Spreads
            </button>
            <button
              onClick={() => {
                setFilterMode("HIGH_APR");
                setSortBy("apr");
              }}
              className={`px-2 py-1 rounded transition-colors ${
                filterMode === "HIGH_APR"
                  ? "bg-accent-emerald text-zinc-950 font-bold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              }`}
            >
              High APR
            </button>
            <button
              onClick={() => setFilterMode("MAJORS")}
              className={`px-2 py-1 rounded transition-colors ${
                filterMode === "MAJORS"
                  ? "bg-accent-cyan text-zinc-950 font-bold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              }`}
            >
              Majors
            </button>
            <button
              onClick={() => setFilterMode("ALL")}
              className={`px-2 py-1 rounded transition-colors ${
                filterMode === "ALL"
                  ? "bg-zinc-200 text-zinc-950 font-bold"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
              }`}
            >
              All
            </button>
          </div>

          <button
            onClick={fetchCoins}
            disabled={isLoading}
            className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Refresh All Coins"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-accent-amber" : ""}`} />
          </button>
        </div>
      </div>

      {/* Execution Alert Banner */}
      {errorFeedback && (
        <div className="my-3 px-3.5 py-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between shadow-lg shadow-rose-950/30 animate-fadeIn">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{errorFeedback.symbol}</strong> execution notice: {errorFeedback.message}
            </span>
          </div>
          <button
            onClick={() => setErrorFeedback(null)}
            className="text-zinc-400 hover:text-zinc-100 text-xs px-2 py-0.5 rounded hover:bg-rose-900/50 transition-colors"
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* Table Content */}
      {error ? (
        <div className="py-8 text-center text-xs text-rose-400 flex items-center justify-center space-x-2">
          <ShieldAlert className="w-4 h-4" />
          <span>Error loading coin scanner: {error}</span>
        </div>
      ) : filteredCoins.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-500">
          {isLoading ? "Scanning 800+ coins across Binance & Bitget..." : "No matching coins found."}
        </div>
      ) : (
        <div className="overflow-x-auto mt-3 max-h-96 overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface border-b border-border text-[10px] text-zinc-400 uppercase z-10">
              <tr>
                <th className="pb-2 cursor-pointer" onClick={() => setSortBy("symbol")}>
                  Coin / Asset {sortBy === "symbol" && "▾"}
                </th>
                <th
                  className="pb-2 cursor-pointer text-accent-emerald"
                  onClick={() => setSortBy("funding")}
                  title="Click to sort by Highest 8h Funding Rate"
                >
                  Binance 8h Rate {sortBy === "funding" && "▾"}
                </th>
                <th className="pb-2">Bitget 8h Rate</th>
                <th
                  className="pb-2 cursor-pointer text-zinc-300"
                  onClick={() => setSortBy("countdown")}
                  title="Click to sort by Settlement Countdown"
                >
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    <span>Countdown {sortBy === "countdown" && "▾"}</span>
                  </div>
                </th>
                <th className="pb-2 cursor-pointer text-accent-amber" onClick={() => setSortBy("spread")}>
                  Spread (bps) {sortBy === "spread" && "▾"}
                </th>
                <th className="pb-2 cursor-pointer text-accent-emerald" onClick={() => setSortBy("apr")}>
                  Annualized APR {sortBy === "apr" && "▾"}
                </th>
                <th className="pb-2">Direction</th>
                <th className="pb-2 cursor-pointer" onClick={() => setSortBy("volume")}>
                  24h Vol {sortBy === "volume" && "▾"}
                </th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y border-border">
              {filteredCoins.slice(0, 50).map((coin) => {
                const isSelected = selectedSymbol === coin.symbol;
                const isShortBn = coin.direction === "SHORT_BINANCE_LONG_BITGET";
                const coinFundingTarget = coin.nextFundingTime > 0 ? coin.nextFundingTime : fallbackTarget;
                const countdownDisplay = formatCountdown(coinFundingTarget, currentTime);
                const isExecuting = executingSymbol === coin.symbol;
                const isFilled = filledSymbol === coin.symbol;
                const isError = errorSymbol === coin.symbol;

                return (
                  <tr
                    key={coin.symbol}
                    className={`hover:bg-zinc-900/60 transition-colors ${
                      isSelected ? "bg-amber-950/20 border-l-2 border-accent-amber" : ""
                    }`}
                  >
                    <td className="py-2.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-zinc-100">{coin.baseAsset}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">USDT</span>
                        {isSelected && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-accent-amber border border-amber-500/30">
                            LOADED
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <span className={coin.binanceRate >= 0 ? "text-emerald-400 font-semibold font-mono" : "text-rose-400 font-semibold font-mono"}>
                        {coin.binanceRate >= 0 ? "+" : ""}{coin.binanceRate.toFixed(5)}%
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span className={coin.bitgetRate >= 0 ? "text-emerald-400 font-semibold font-mono" : "text-rose-400 font-semibold font-mono"}>
                        {coin.bitgetRate >= 0 ? "+" : ""}{coin.bitgetRate.toFixed(5)}%
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-zinc-200">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/60 text-[11px] text-zinc-200 font-semibold">
                        {countdownDisplay}
                      </span>
                    </td>
                    <td className="py-2.5 font-bold text-accent-amber font-mono">
                      +{coin.spreadBps.toFixed(2)} bps
                    </td>
                    <td className="py-2.5 font-bold text-accent-emerald font-mono">
                      +{coin.annualizedApr.toFixed(1)}% APR
                    </td>
                    <td className="py-2.5 text-[11px]">
                      <span className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded ${
                        isShortBn
                          ? "bg-amber-950/40 text-accent-amber border border-amber-800/40"
                          : "bg-cyan-950/40 text-accent-cyan border border-cyan-800/40"
                      }`}>
                        {isShortBn ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        <span>{isShortBn ? "Short BN / Long BG" : "Long BN / Short BG"}</span>
                      </span>
                    </td>
                    <td className="py-2.5 text-zinc-400 text-[11px] font-mono">
                      ${(coin.volume24h / 1_000_000).toFixed(1)}M
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {/* 1-Click Direct Quick Hedge */}
                        <button
                          onClick={() => handleQuickHedge(coin)}
                          disabled={isExecuting}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded transition-all flex items-center space-x-1 ${
                            isFilled
                              ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/20"
                              : isError
                              ? "bg-rose-900/90 text-rose-100 border border-rose-700 shadow-sm shadow-rose-900/40"
                              : isExecuting
                              ? "bg-amber-600 text-white animate-pulse"
                              : "bg-accent-amber hover:bg-amber-400 text-zinc-950 shadow-sm shadow-amber-500/10"
                          }`}
                          title={isError ? (errorFeedback?.message || "Execution rejected") : `1-Click Instant Dual Hedge on ${coin.symbol}`}
                        >
                          <Zap className="w-3 h-3" />
                          <span>
                            {isFilled ? "FILLED ✓" : isError ? "ERROR ✕" : isExecuting ? "HEDGING..." : "QUICK HEDGE"}
                          </span>
                        </button>

                        {/* Load into Cockpit */}
                        <button
                          onClick={() => onSelectCoin(coin.symbol, coin.direction)}
                          className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                            isSelected
                              ? "bg-amber-500/20 text-accent-amber border border-amber-500/40"
                              : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700"
                          }`}
                          title={`Load ${coin.symbol} into Execution Cockpit`}
                        >
                          {isSelected ? "LOADED" : "LOAD"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer Info */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-3 mt-3 border-t border-border text-[10px] text-zinc-500 gap-2">
        <span>
          Showing top {Math.min(filteredCoins.length, 50)} opportunities of {filteredCoins.length} filtered coins (Ranked by 8h Funding)
        </span>
        <div className="flex items-center space-x-3">
          <span>Click <strong>QUICK HEDGE</strong> for 1-click dual fill</span>
          <span>Click <strong>LOAD</strong> to configure in Execution Cockpit</span>
        </div>
      </div>
    </div>
  );
}
