"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ThreeHeroScene from "@/components/ThreeHeroScene";
import {
  ShieldCheck,
  Zap,
  TrendingUp,
  Activity,
  ArrowRight,
  Radio,
  Lock,
  Layers,
  Clock,
  Coins,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Terminal,
  Calculator,
  Sliders,
  DollarSign,
  Percent,
  Sparkles,
  Cpu,
  BarChart3,
  Scale,
  RefreshCw,
  Server,
  KeyRound,
  FileCode,
} from "lucide-react";

export default function IntroPage() {
  const [user, setUser] = useState<{ email: string; role: string; username: string } | null>(null);
  const [spreadBps, setSpreadBps] = useState<number>(18.5);

  // Interactive Arbitrage Cash-Flow Simulator State
  const [simCapital, setSimCapital] = useState<number>(10000);
  const [simSpreadBps, setSimSpreadBps] = useState<number>(22.5);
  const [simMode, setSimMode] = useState<"CASH" | "COMPOUND">("CASH");

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.isLoggedIn && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});

    // Live basis oscillation simulator
    const interval = setInterval(() => {
      setSpreadBps(16 + Math.sin(Date.now() / 2200) * 7.5);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Simulator calculations
  const eightHourPayout = simCapital * (simSpreadBps / 10000);
  const dailyPayout = eightHourPayout * 3;
  const monthlyPayout = dailyPayout * 30;
  const annualApy = (simSpreadBps * 3 * 365) / 100;
  const annualCompoundedApy = (Math.pow(1 + simSpreadBps / 10000, 3 * 365) - 1) * 100;

  const marketHighlights = [
    {
      symbol: "BTCUSDT",
      bnRate: "+0.0100%",
      bgRate: "+0.0245%",
      spread: "14.5 bps",
      apy: "15.9%",
      dir: "Short BN • Long BG",
      status: "PRIME HARVEST",
    },
    {
      symbol: "ETHUSDT",
      bnRate: "+0.0080%",
      bgRate: "+0.0215%",
      spread: "13.5 bps",
      apy: "14.8%",
      dir: "Short BN • Long BG",
      status: "ACTIVE",
    },
    {
      symbol: "SOLUSDT",
      bnRate: "-0.0050%",
      bgRate: "+0.0185%",
      spread: "23.5 bps",
      apy: "25.7%",
      dir: "Short BN • Long BG",
      status: "HIGH YIELD",
    },
    {
      symbol: "DOGEUSDT",
      bnRate: "+0.0120%",
      bgRate: "+0.0380%",
      spread: "26.0 bps",
      apy: "28.5%",
      dir: "Short BN • Long BG",
      status: "EXPANDED BASIS",
    },
    {
      symbol: "SUIUSDT",
      bnRate: "+0.0150%",
      bgRate: "+0.0460%",
      spread: "31.0 bps",
      apy: "33.9%",
      dir: "Short BN • Long BG",
      status: "SURGE SPREAD",
    },
    {
      symbol: "NEARUSDT",
      bnRate: "+0.0090%",
      bgRate: "+0.0280%",
      spread: "19.0 bps",
      apy: "20.8%",
      dir: "Short BN • Long BG",
      status: "ACTIVE",
    },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber overflow-x-hidden relative">
      <Navbar />

      {/* Top Institutional Production Telemetry Ticker Strip */}
      <div className="w-full bg-[#0c0c0f] border-b border-border/80 px-4 py-1.5 text-[10px] text-zinc-400 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
            <span className="font-bold text-zinc-200">PRODUCTION ENGINE v2.5</span>
          </div>
          <span className="text-zinc-700">•</span>
          <div>
            VENUE A: <strong className="text-accent-amber font-mono">BINANCE USD-M (ACTIVE)</strong>
          </div>
          <span className="text-zinc-700">•</span>
          <div>
            VENUE B: <strong className="text-accent-cyan font-mono">BITGET V3 PERP (ACTIVE)</strong>
          </div>
          <span className="text-zinc-700">•</span>
          <div>
            LATENCY SKEW: <strong className="text-accent-emerald font-mono">&lt; 10ms</strong>
          </div>
          <span className="text-zinc-700">•</span>
          <div>
            AUTONOMOUS DAEMON: <strong className="text-accent-emerald font-mono">24/7 SERVER PERSISTENT</strong>
          </div>
        </div>

        <div className="hidden lg:flex items-center space-x-3 text-zinc-500">
          <span>ZERO-BETA QUANTITATIVE ARBITRAGE</span>
          <span>•</span>
          <span>MMT QUANTITATIVE TECHNOLOGIES</span>
        </div>
      </div>

      <main className="flex-1 w-full pb-20 relative">
        {/* Subtle Architectural Grid Pattern (Anti-Vibe Minimalist Geometry) */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#27272a12_1px,transparent_1px),linear-gradient(to_bottom,#27272a12_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none -z-10" />

        {/* ========================================================================= */}
        {/* HERO SECTION: Asymmetric 2-Column with 3D Sacred Geometry WebGL Scene     */}
        {/* ========================================================================= */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 pt-10 pb-12 md:pt-14 md:pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Column: Institutional Value Proposition & Direct CTAs */}
            <div className="lg:col-span-7 space-y-6 text-left">
              {/* Architecture Badge */}
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-accent-amber text-[11px] font-bold tracking-wide">
                <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
                <span>INSTITUTIONAL QUANTITATIVE BASIS ARBITRAGE TERMINAL</span>
              </div>

              {/* Main Headline */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-zinc-100 leading-[1.12]">
                Capture Cross-Exchange Funding Rates with{" "}
                <span className="text-accent-amber underline decoration-amber-500/30 underline-offset-4">
                  Zero Directional Beta
                </span>
                .
              </h1>

              {/* Subheading */}
              <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-2xl">
                Simultaneous, atomic hedge execution across <strong>Binance USD-M</strong> and{" "}
                <strong>Bitget Perpetuals</strong>. Harvest persistent funding rate spreads with sub-250ms inter-leg
                lead-lag calibration and 24/7 background server automation.
              </p>

              {/* Tactile Metric Chips */}
              <div className="grid grid-cols-3 gap-2 max-w-md pt-1">
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <div className="text-[10px] text-zinc-500 uppercase">Delta Risk</div>
                  <div className="text-sm font-bold text-accent-emerald font-mono mt-0.5">0.00% Net</div>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <div className="text-[10px] text-zinc-500 uppercase">Order Latency</div>
                  <div className="text-sm font-bold text-accent-cyan font-mono mt-0.5">&lt; 250ms</div>
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border">
                  <div className="text-[10px] text-zinc-500 uppercase">Execution</div>
                  <div className="text-sm font-bold text-accent-amber font-mono mt-0.5">1-Click / Auto</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <Link
                  href="/terminal"
                  className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-2 shadow-xl shadow-amber-500/10 active:scale-95"
                >
                  <Terminal className="w-4 h-4" />
                  <span>{user ? "Enter Trading Terminal" : "Launch Trading Cockpit"}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                <Link
                  href="/history"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all flex items-center justify-center space-x-2 hover:border-zinc-700 active:scale-95"
                >
                  <Clock className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>View Audit Ledger</span>
                </Link>

                {!user && (
                  <Link
                    href="/login"
                    className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-accent-cyan border border-cyan-500/30 text-xs font-semibold transition-all flex items-center justify-center space-x-2 hover:border-cyan-400 active:scale-95"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Sign In</span>
                  </Link>
                )}
              </div>

              {/* Micro-Attribution Footnote */}
              <div className="pt-2 flex items-center space-x-2 text-[11px] text-zinc-500">
                <ShieldCheck className="w-3.5 h-3.5 text-accent-emerald" />
                <span>AES-256 Client-Side Key Storage • No Third-Party Custody • Multi-Tenant Isolation</span>
              </div>
            </div>

            {/* Right Column: 3D Sacred Geometry WebGL Scene */}
            <div className="lg:col-span-5 relative">
              <ThreeHeroScene spreadBps={spreadBps} />
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* LIVE SYSTEM TELEMETRY RIBBON: 4-Column Proof Architecture                 */}
        {/* ========================================================================= */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-6">
          <div className="bg-surface/90 backdrop-blur-md rounded-2xl border border-zinc-800/90 p-5 shadow-2xl">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              <div className="space-y-1 border-r border-zinc-800/80 pr-3">
                <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1.5 font-bold">
                  <Radio className="w-3 h-3 text-accent-emerald animate-pulse" />
                  <span>Active Contracts Matrix</span>
                </div>
                <div className="text-lg font-bold text-zinc-100 font-mono">50+ Perpetual Pairs</div>
                <div className="text-[10px] text-zinc-400">Binance USD-M ↔ Bitget V3</div>
              </div>

              <div className="space-y-1 border-r border-zinc-800/80 pr-3">
                <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1.5 font-bold">
                  <Zap className="w-3 h-3 text-accent-cyan" />
                  <span>Inter-Leg Stagger Engine</span>
                </div>
                <div className="text-lg font-bold text-accent-cyan font-mono">&lt; 250ms Lead-Lag</div>
                <div className="text-[10px] text-zinc-400">Adaptive EWMA Latency Sizing</div>
              </div>

              <div className="space-y-1 border-r border-zinc-800/80 pr-3">
                <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1.5 font-bold">
                  <TrendingUp className="w-3 h-3 text-accent-amber" />
                  <span>Portfolio Directional Beta</span>
                </div>
                <div className="text-lg font-bold text-accent-emerald font-mono">0.00% Exposure</div>
                <div className="text-[10px] text-zinc-400">Matched Dual Notional Value</div>
              </div>

              <div className="space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1.5 font-bold">
                  <ShieldCheck className="w-3 h-3 text-accent-emerald" />
                  <span>Liquidation Hazard</span>
                </div>
                <div className="text-lg font-bold text-accent-emerald font-mono">Zero Net Risk</div>
                <div className="text-[10px] text-zinc-400">Continuous Dynamic Rebalancing</div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* LIVE BASIS SPREADS MARQUEE & RADAR                                        */}
        {/* ========================================================================= */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-accent-amber" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                  Live Opportunity Corridor Matrix
                </h2>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Real-time funding rate divergence between Binance USD-M and Bitget Perpetual venues.
              </p>
            </div>

            <Link
              href="/terminal"
              className="text-xs font-semibold text-accent-amber hover:text-amber-300 flex items-center space-x-1 self-start sm:self-auto"
            >
              <span>Explore All 50+ Pairs in Scanner</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {marketHighlights.map((m) => (
              <div
                key={m.symbol}
                className="bg-surface/80 p-4 rounded-xl border border-border hover:border-zinc-700 transition-all space-y-2 group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-sm text-zinc-100">{m.symbol}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-accent-amber border border-amber-500/20 font-bold">
                      {m.spread}
                    </span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-accent-emerald border border-emerald-500/30 font-bold">
                    {m.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                    <div className="text-[9px] text-zinc-500 uppercase">Binance Rate</div>
                    <div className="font-mono font-bold text-zinc-200 mt-0.5">{m.bnRate}</div>
                  </div>
                  <div className="bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                    <div className="text-[9px] text-zinc-500 uppercase">Bitget Rate</div>
                    <div className="font-mono font-bold text-accent-cyan mt-0.5">{m.bgRate}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-800/60">
                  <span className="text-zinc-500 text-[10px]">{m.dir}</span>
                  <div className="flex items-center space-x-1">
                    <span className="text-zinc-400 text-[10px]">APR:</span>
                    <strong className="text-accent-emerald font-mono font-bold">{m.apy}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================================= */}
        {/* INTERACTIVE ARBITRAGE CASH-FLOW SIMULATOR                                 */}
        {/* ========================================================================= */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-10">
          <div className="bg-gradient-to-br from-zinc-900/90 via-surface to-zinc-950 rounded-2xl border border-zinc-800 p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Calculator className="w-4 h-4 text-accent-amber" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                    Interactive Arbitrage Cash-Flow Simulator
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Model institutional funding payouts and annualized yields based on deployed capital and spread divergence.
                </p>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center space-x-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800 self-start md:self-auto text-xs">
                <button
                  onClick={() => setSimMode("CASH")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    simMode === "CASH"
                      ? "bg-accent-amber text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Direct Cash Flow
                </button>
                <button
                  onClick={() => setSimMode("COMPOUND")}
                  className={`px-3 py-1 rounded-md font-semibold transition-all ${
                    simMode === "COMPOUND"
                      ? "bg-accent-emerald text-zinc-950 font-bold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Compounded APY
                </button>
              </div>
            </div>

            {/* Simulator Controls & Calculations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Controls Column */}
              <div className="space-y-5">
                {/* Capital Input Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400 uppercase">Deployed Notional Capital:</span>
                    <span className="font-bold text-accent-amber font-mono text-sm">
                      ${simCapital.toLocaleString()} USDT
                    </span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="100000"
                    step="1000"
                    value={simCapital}
                    onChange={(e) => setSimCapital(Number(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer h-2 bg-zinc-800 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between gap-1.5 pt-1">
                    {[1000, 5000, 25000, 50000, 100000].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSimCapital(val)}
                        className={`text-[10px] px-2.5 py-1 rounded border transition-all active:scale-95 ${
                          simCapital === val
                            ? "bg-accent-amber text-zinc-950 font-bold border-amber-400"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        ${val >= 1000 ? `${val / 1000}k` : val}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spread Basis Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400 uppercase">Funding Spread Divergence:</span>
                    <span className="font-bold text-accent-emerald font-mono text-sm">
                      {simSpreadBps.toFixed(1)} bps
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="0.5"
                    value={simSpreadBps}
                    onChange={(e) => setSimSpreadBps(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer h-2 bg-zinc-800 rounded-lg appearance-none"
                  />
                  <div className="flex justify-between gap-1.5 pt-1">
                    {[10, 15, 22.5, 35, 50].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSimSpreadBps(val)}
                        className={`text-[10px] px-2.5 py-1 rounded border transition-all active:scale-95 ${
                          simSpreadBps === val
                            ? "bg-accent-emerald text-zinc-950 font-bold border-emerald-400"
                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {val} bps
                      </button>
                    ))}
                  </div>
                </div>

                {/* Allocation Matrix Breakdown */}
                <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800 text-[11px] space-y-1.5">
                  <div className="text-zinc-400 font-semibold uppercase text-[10px]">
                    Matched Position Sizing Structure:
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span>Leg 1: Short Binance USD-M</span>
                    <span className="font-mono font-bold text-accent-amber">${(simCapital / 2).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-zinc-300">
                    <span>Leg 2: Long Bitget V3 Perp</span>
                    <span className="font-mono font-bold text-accent-cyan">${(simCapital / 2).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-zinc-800 text-accent-emerald font-bold">
                    <span>Net Directional Beta</span>
                    <span className="font-mono">0.00% Exposure</span>
                  </div>
                </div>
              </div>

              {/* Projected Returns Output Card */}
              <div className="bg-zinc-950/90 rounded-xl border border-zinc-800 p-5 space-y-4 shadow-xl">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-800/80 flex items-center justify-between">
                  <span>Projected Returns Matrix</span>
                  <span className="text-accent-emerald text-[10px] font-bold">Continuous 8H Payouts</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Per 8H Settlement</div>
                    <div className="text-xl font-bold text-accent-emerald mt-1 font-mono">
                      +${eightHourPayout.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-400">Single settlement cycle</div>
                  </div>

                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Daily Cash Flow (24h)</div>
                    <div className="text-xl font-bold text-accent-emerald mt-1 font-mono">
                      +${dailyPayout.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-400">3 settlement cycles / day</div>
                  </div>

                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">30-Day Monthly Yield</div>
                    <div className="text-xl font-bold text-accent-emerald mt-1 font-mono">
                      +${monthlyPayout.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-400">90 settlement cycles / month</div>
                  </div>

                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Annualized Return</div>
                    <div className="text-xl font-bold text-accent-amber mt-1 font-mono">
                      {simMode === "CASH" ? `${annualApy.toFixed(1)}% APR` : `${annualCompoundedApy.toFixed(1)}% APY`}
                    </div>
                    <div className="text-[9px] text-zinc-400">
                      {simMode === "CASH" ? "Simple annualized run-rate" : "Daily compounded reinvestment"}
                    </div>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <Link
                    href="/terminal"
                    className="inline-flex items-center space-x-1.5 text-xs text-accent-amber hover:text-amber-300 font-bold uppercase tracking-wider"
                  >
                    <span>Deploy Strategy in Cockpit</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* INSTITUTIONAL BENTO GRID FEATURE ARCHITECTURE                             */}
        {/* ========================================================================= */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-12 space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
              Institutional Core Infrastructure
            </h2>
            <p className="text-xs text-zinc-400">
              High-frequency multi-leg arbitrage technology built for capital protection and consistent cash yield.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Bento Card 1: 50-Coin Ranking Engine (Col Span 2) */}
            <div className="md:col-span-2 bg-gradient-to-br from-surface via-zinc-900 to-zinc-950 p-6 md:p-8 rounded-2xl border border-zinc-800 space-y-4 relative group hover:border-amber-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-accent-amber font-bold text-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/10 text-accent-amber border border-amber-500/20 font-bold uppercase">
                  Real-Time Matrix
                </span>
              </div>

              <h3 className="text-lg font-bold text-zinc-100">
                50-Coin Multi-Exchange Funding Matrix & 1-Click Execution
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                Continuously monitors all perpetual contracts across Binance USD-M and Bitget V3. Automatically ranks
                coins by absolute funding spread divergence and displays live settlement countdowns. 1-Click QUICK HEDGE
                instantly fires dual matched market orders directly from the scanner table.
              </p>

              <div className="pt-4 border-t border-zinc-800/80 grid grid-cols-3 gap-2 text-xs">
                <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Pairs Monitored</div>
                  <div className="font-bold text-zinc-200 mt-0.5">50+ Active</div>
                </div>
                <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Latency Profile</div>
                  <div className="font-bold text-accent-cyan mt-0.5">&lt; 150ms WS</div>
                </div>
                <div className="bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                  <div className="text-[10px] text-zinc-500">Execution Mode</div>
                  <div className="font-bold text-accent-emerald mt-0.5">1-Click Dual Hedge</div>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Atomic Lead-Lag Stagger Engine */}
            <div className="bg-surface p-6 rounded-2xl border border-zinc-800 space-y-4 relative group hover:border-cyan-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan font-bold text-sm">
                  <Zap className="w-5 h-5" />
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/10 text-accent-cyan border border-cyan-500/20 font-bold uppercase">
                  Zero Skew
                </span>
              </div>

              <h3 className="text-base font-bold text-zinc-100">
                Atomic Lead-Lag Stagger Engine
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Adaptive EWMA latency tracking measures millisecond round-trip response times for each exchange. Staggers the faster venue to ensure simultaneous fills with zero unhedged exposure.
              </p>

              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Tolerance:</span>
                <span className="text-zinc-300 font-semibold">&lt; 10ms Inter-Leg Skew</span>
              </div>
            </div>

            {/* Bento Card 3: 24/7 Autopilot */}
            <div className="bg-surface p-6 rounded-2xl border border-zinc-800 space-y-4 relative group hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-800/40 flex items-center justify-center text-accent-emerald font-bold text-sm">
                  <Cpu className="w-5 h-5" />
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-accent-emerald border border-emerald-800/40 font-bold uppercase">
                  Server Daemon
                </span>
              </div>

              <h3 className="text-base font-bold text-zinc-100">
                24/7 Autonomous Background Daemon
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Runs on Render server background daemons even if your browser is closed. Continuously checks spread targets, enters when spreads widen, locks flattened coins in memory, and supports MetaTrader .set files.
              </p>

              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Persistence:</span>
                <span className="text-zinc-300 font-semibold">100% Background Execution</span>
              </div>
            </div>

            {/* Bento Card 4: Multi-Tenant Key Vault (Col Span 2) */}
            <div className="md:col-span-2 bg-gradient-to-br from-zinc-950 via-surface to-zinc-900 p-6 md:p-8 rounded-2xl border border-zinc-800 space-y-4 relative group hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-accent-emerald font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/10 text-accent-emerald border border-emerald-500/20 font-bold uppercase">
                  AES-256 Vault
                </span>
              </div>

              <h3 className="text-lg font-bold text-zinc-100">
                Institutional Security & Blank Key Isolation
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                Strict separation between master administrator and individual trader quant accounts. Standard users start with 100% blank API keys and configure their own isolated credentials. Keys are encrypted at rest with non-destructive masking.
              </p>

              <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs">
                <span className="text-accent-amber font-semibold">Master Admin: varsha633@gmailcom</span>
                <span className="text-zinc-500 hidden sm:inline">•</span>
                <span className="text-accent-cyan font-semibold">Quant Accounts: 100% Isolated Vaults</span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* QUANTITATIVE METHODOLOGY & MATHEMATICAL PROOF SECTION                     */}
        {/* ========================================================================= */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-6">
          <div className="bg-surface/90 rounded-2xl border border-border p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-2 border-b border-zinc-800 pb-3">
              <Scale className="w-5 h-5 text-accent-amber" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                Quantitative Methodology: Why Delta-Neutral Arbitrage Works
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs text-zinc-400 leading-relaxed">
              <div className="space-y-2">
                <div className="font-bold text-zinc-200 uppercase text-[11px] flex items-center space-x-1">
                  <span className="text-accent-amber">01.</span>
                  <span>Persistent Basis Divergence</span>
                </div>
                <p>
                  Perpetual futures markets require funding fees to anchor derivative prices to spot index prices.
                  Because Binance and Bitget feature different retail/institutional trader imbalances, funding rates
                  frequently diverge by 10 to 50+ bps.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-zinc-200 uppercase text-[11px] flex items-center space-x-1">
                  <span className="text-accent-cyan">02.</span>
                  <span>Pure Directional Neutrality</span>
                </div>
                <p>
                  By taking a Short position on the higher-paying venue and an identical Long position on the lower-paying
                  venue, the portfolio&apos;s price beta is mathematically neutralized. Whether the asset moves +50% or -50%,
                  the net mark-to-market is preserved while funding is collected.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-bold text-zinc-200 uppercase text-[11px] flex items-center space-x-1">
                  <span className="text-accent-emerald">03.</span>
                  <span>Sub-250ms Dual Execution</span>
                </div>
                <p>
                  Traditional manual traders suffer execution slippage between legs. Our terminal measures network RTT to
                  both exchanges and sends staggered limit or IOC market orders so both positions fill at par without
                  unhedged market exposure.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* FINAL LAUNCH CTA STRIP                                                    */}
        {/* ========================================================================= */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 py-16 text-center space-y-6">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-accent-emerald text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
            <span>READY FOR LIVE CAPITAL DEPLOYMENT</span>
          </div>

          <h2 className="text-2xl sm:text-4xl font-extrabold text-zinc-100 tracking-tight">
            Deploy Institutional Arbitrage Today.
          </h2>

          <p className="text-xs sm:text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Real-time basis tables, 50-coin arbitrage matrix, millisecond order execution, 24/7 background server automation,
            and full-depth hedge telemetry receipts.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              href="/terminal"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-amber-500/10 active:scale-95 flex items-center justify-center space-x-2"
            >
              <Terminal className="w-4 h-4" />
              <span>Launch Trading Cockpit</span>
            </Link>

            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all hover:border-zinc-700 active:scale-95 flex items-center justify-center space-x-2"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In with Account</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
