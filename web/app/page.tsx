"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PrismaticCore3D from "@/components/PrismaticCore3D";
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
} from "lucide-react";

export default function IntroPage() {
  const [user, setUser] = useState<{ email: string; role: string; username: string } | null>(null);
  const [spreadBps, setSpreadBps] = useState<number>(18.5);

  // Interactive Cash Flow Simulator State
  const [simCapital, setSimCapital] = useState<number>(10000);
  const [simSpreadBps, setSimSpreadBps] = useState<number>(22.5);

  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.isLoggedIn && data.user) {
          setUser(data.user);
        }
      })
      .catch(() => {});

    // Subtle gentle basis oscillation for hero 3D visualizer
    const interval = setInterval(() => {
      setSpreadBps(15 + Math.sin(Date.now() / 2400) * 8);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Simulator calculations
  const eightHourPayout = (simCapital * (simSpreadBps / 10000));
  const dailyPayout = eightHourPayout * 3;
  const annualApy = ((simSpreadBps * 3 * 365) / 100);

  const marketHighlights = [
    { symbol: "BTCUSDT", bnRate: "+0.0100%", bgRate: "+0.0245%", spread: "14.5 bps", apy: "15.8%", dir: "Short BN + Long BG" },
    { symbol: "ETHUSDT", bnRate: "+0.0080%", bgRate: "+0.0210%", spread: "13.0 bps", apy: "14.2%", dir: "Short BN + Long BG" },
    { symbol: "SOLUSDT", bnRate: "-0.0050%", bgRate: "+0.0180%", spread: "23.0 bps", apy: "25.1%", dir: "Short BN + Long BG" },
    { symbol: "DOGEUSDT", bnRate: "+0.0120%", bgRate: "+0.0350%", spread: "23.0 bps", apy: "25.1%", dir: "Short BN + Long BG" },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber overflow-x-hidden relative">
      <Navbar />

      <main className="flex-1 w-full overflow-hidden pb-24 sm:pb-0 relative">
        {/* Background Gradients & Cyber Grids (Clipped within overflow-hidden to prevent mobile scroll) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370d_1px,transparent_1px),linear-gradient(to_bottom,#1f29370d_1px,transparent_1px)] bg-[size:48px_48px]" />
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-amber-500/5 blur-[120px] rounded-full" />
          <div className="absolute top-2/3 right-10 w-[500px] h-[250px] bg-emerald-500/5 blur-[130px] rounded-full" />
        </div>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 pt-12 pb-14 md:pt-20 md:pb-20 flex flex-col items-center text-center space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-accent-amber text-xs font-semibold animate-in fade-in duration-500 hover:border-amber-400 transition-colors">
            <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
            <span>INSTITUTIONAL DELTA-NEUTRAL ARBITRAGE TERMINAL v2.5</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-100 max-w-4xl leading-[1.15]">
            Capture Cross-Exchange Funding Rates with <span className="text-accent-amber underline decoration-amber-500/40">Zero Directional Risk</span>.
          </h1>

          {/* Subheading */}
          <p className="text-sm md:text-base text-zinc-400 max-w-2xl leading-relaxed">
            Simultaneous atomic execution across <strong>Binance USD-M</strong> and <strong>Bitget Perpetuals</strong>. Harvest persistent funding rate divergences with sub-250ms inter-leg delta and 24/7 autonomous server execution.
          </p>

          {/* CTA Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-3 w-full sm:w-auto">
            <Link
              href="/terminal"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center space-x-2 shadow-xl shadow-amber-500/10 hover:scale-[1.02] active:scale-95"
            >
              <span>{user ? "Enter Trading Terminal" : "Launch Trading Cockpit"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/history"
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all flex items-center justify-center space-x-2 hover:border-zinc-700 active:scale-95"
            >
              <Clock className="w-3.5 h-3.5 text-accent-cyan" />
              <span>View Trade Audit Ledger</span>
            </Link>

            {!user && (
              <Link
                href="/login"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-accent-cyan border border-cyan-500/30 text-xs font-semibold transition-all flex items-center justify-center space-x-2 hover:border-cyan-400 active:scale-95"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In / Sign Up</span>
              </Link>
            )}
          </div>

          {/* Live System Telemetry Ribbon */}
          <div className="w-full max-w-5xl pt-4">
            <div className="bg-zinc-950/80 backdrop-blur-md rounded-2xl border border-zinc-800/90 p-4 shadow-xl">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4 text-left">
                <div className="space-y-1 border-r border-zinc-800/80 pr-2">
                  <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1">
                    <Radio className="w-3 h-3 text-accent-emerald animate-pulse" />
                    <span>Active Contracts</span>
                  </div>
                  <div className="text-base font-bold text-zinc-100 font-mono">17 Perpetual Pairs</div>
                  <div className="text-[10px] text-zinc-400">Binance ↔ Bitget Matrix</div>
                </div>

                <div className="space-y-1 border-r border-zinc-800/80 pr-2">
                  <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1">
                    <Zap className="w-3 h-3 text-accent-cyan" />
                    <span>Inter-Leg Stagger</span>
                  </div>
                  <div className="text-base font-bold text-accent-cyan font-mono">&lt; 250ms Lead-Lag</div>
                  <div className="text-[10px] text-zinc-400">Adaptive EWMA Calibration</div>
                </div>

                <div className="space-y-1 border-r border-zinc-800/80 pr-2">
                  <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1">
                    <TrendingUp className="w-3 h-3 text-accent-amber" />
                    <span>Portfolio Beta</span>
                  </div>
                  <div className="text-base font-bold text-accent-emerald font-mono">0.00% Exposure</div>
                  <div className="text-[10px] text-zinc-400">Delta-Neutral Matched Notional</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] text-zinc-500 uppercase flex items-center space-x-1">
                    <ShieldCheck className="w-3 h-3 text-accent-emerald" />
                    <span>Liquidation Protection</span>
                  </div>
                  <div className="text-base font-bold text-accent-emerald font-mono">Zero Net Risk</div>
                  <div className="text-[10px] text-zinc-400">Dynamic Stop & Unwind</div>
                </div>
              </div>
            </div>
          </div>

          {/* Live Basis Ticker Bar */}
          <div className="w-full max-w-5xl pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-left">
              {marketHighlights.map((m) => (
                <div key={m.symbol} className="bg-surface/80 p-3.5 rounded-xl border border-border space-y-1.5 hover:border-zinc-700 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-zinc-100">{m.symbol}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-accent-amber border border-amber-500/20 font-semibold">
                      {m.spread}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 flex justify-between">
                    <span>Est. Annual APR:</span>
                    <span className="text-accent-emerald font-bold">{m.apy}</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {m.dir}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Interactive Arbitrage Cash-Flow Simulator Section */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-8">
          <div className="bg-gradient-to-br from-zinc-900/90 via-surface to-zinc-950 rounded-2xl border border-zinc-800 p-6 md:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 blur-[80px] rounded-full pointer-events-none" />

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

              <div className="flex items-center space-x-2 self-start md:self-auto">
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-accent-emerald border border-emerald-500/20 font-bold uppercase">
                  Continuous 8H Settlement
                </span>
              </div>
            </div>

            {/* Simulator Controls & Calculations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              {/* Controls */}
              <div className="space-y-5">
                {/* Capital Input */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400 uppercase">Deployed Notional Capital:</span>
                    <span className="font-bold text-accent-amber">${simCapital.toLocaleString()} USDT</span>
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
                  <div className="flex justify-between gap-2 pt-1">
                    {[1000, 5000, 25000, 100000].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSimCapital(val)}
                        className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
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

                {/* Spread Basis Input */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400 uppercase">Funding Spread Divergence:</span>
                    <span className="font-bold text-accent-emerald">{simSpreadBps.toFixed(1)} bps</span>
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
                  <div className="flex justify-between gap-2 pt-1">
                    {[10, 20, 35, 50].map((val) => (
                      <button
                        key={val}
                        onClick={() => setSimSpreadBps(val)}
                        className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
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
              </div>

              {/* Real-Time Projected Outputs */}
              <div className="bg-zinc-950/90 rounded-xl border border-zinc-800 p-5 space-y-4">
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider pb-2 border-b border-zinc-800/80 flex items-center justify-between">
                  <span>Projected Returns Matrix</span>
                  <span className="text-accent-emerald text-[10px]">Zero Price Beta</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">8-Hour Harvest</div>
                    <div className="text-lg font-bold text-accent-emerald mt-1 font-mono">
                      +${eightHourPayout.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-400">Single settlement cycle</div>
                  </div>

                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800">
                    <div className="text-[10px] text-zinc-500 uppercase">Daily Cash Flow</div>
                    <div className="text-lg font-bold text-accent-emerald mt-1 font-mono">
                      +${dailyPayout.toFixed(2)}
                    </div>
                    <div className="text-[9px] text-zinc-400">3 settlement cycles/day</div>
                  </div>

                  <div className="bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 col-span-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-zinc-500 uppercase">Projected Annual Yield</div>
                        <div className="text-2xl font-bold text-accent-amber mt-1 font-mono">
                          {annualApy.toFixed(1)}% APY
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-zinc-500 uppercase">Directional Risk</div>
                        <div className="text-sm font-bold text-accent-emerald mt-1 font-mono">
                          0.00% Net Beta
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Real-Time Arbitrage Basis Visualizer Showcase */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-8">
          <div className="bg-surface rounded-2xl border border-border p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-accent-amber animate-pulse" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                    Real-Time Arbitrage Basis Visualizer & Oscilloscope
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Live rolling spread waveform, dual-exchange order flow conduits, and 8-hour funding settlement radar.
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-400 self-start sm:self-center">
                Basis Spread: <span className="font-bold text-accent-amber">{spreadBps.toFixed(1)} bps</span>
              </div>
            </div>

            <PrismaticCore3D
              spreadBps={spreadBps}
              symbol="BTCUSDT"
              binancePrice={98450}
              bitgetPrice={98438}
            />
          </div>
        </section>

        {/* Aceternity-Style Bento Grid Showcase */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-14 space-y-8">
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
                  Real-Time Scan
                </span>
              </div>

              <h3 className="text-lg font-bold text-zinc-100">
                50-Coin Multi-Exchange Funding Matrix
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed max-w-xl">
                Scans all perpetual contracts across Binance USD-M and Bitget V3. Automatically ranks coins by highest funding spread and displays live countdowns to settlement. 1-Click QUICK HEDGE directly executes from the scanner row.
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
                  <div className="font-bold text-accent-emerald mt-0.5">1-Click Quick</div>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Atomic Inter-Leg Stagger Engine */}
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
                24/7 Autonomous Autopilot
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Runs on server background daemons even if your browser is closed. Continuously checks spread targets, enters when spreads widen, and unwinds both legs to lock in realized profits.
              </p>

              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Availability:</span>
                <span className="text-zinc-300 font-semibold">99.99% Server Autopilot</span>
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
                <span className="text-accent-amber font-semibold">Admin: varsha633@gmailcom</span>
                <span className="text-zinc-500 hidden sm:inline">•</span>
                <span className="text-accent-cyan font-semibold">User Vaults: Zero Shared Access</span>
              </div>
            </div>
          </div>
        </section>

        {/* Launch CTA Strip */}
        <section className="max-w-4xl mx-auto px-4 md:px-8 py-16 text-center space-y-6">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-100">
            Ready to Run Institutional Funding Arbitrage?
          </h2>
          <p className="text-xs text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Access real-time basis tables, 50-coin arbitrage matrix, millisecond order execution, and full-depth hedge telemetry receipts.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/terminal"
              className="px-8 py-3.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-amber-500/10 hover:scale-[1.02] active:scale-95"
            >
              Launch Trading Cockpit
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all hover:border-zinc-700 active:scale-95"
            >
              Sign In with Admin Account
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
