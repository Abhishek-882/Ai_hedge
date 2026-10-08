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
} from "lucide-react";

export default function IntroPage() {
  const [user, setUser] = useState<{ email: string; role: string; username: string } | null>(null);
  const [spreadBps, setSpreadBps] = useState<number>(14.2);

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
      setSpreadBps(10 + Math.sin(Date.now() / 2000) * 6);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const marketHighlights = [
    { symbol: "BTCUSDT", bnRate: "+0.0100%", bgRate: "+0.0245%", spread: "14.5 bps", apy: "15.8%", dir: "Short BN + Long BG" },
    { symbol: "ETHUSDT", bnRate: "+0.0080%", bgRate: "+0.0210%", spread: "13.0 bps", apy: "14.2%", dir: "Short BN + Long BG" },
    { symbol: "SOLUSDT", bnRate: "-0.0050%", bgRate: "+0.0180%", spread: "23.0 bps", apy: "25.1%", dir: "Short BN + Long BG" },
    { symbol: "DOGEUSDT", bnRate: "+0.0120%", bgRate: "+0.0350%", spread: "23.0 bps", apy: "25.1%", dir: "Short BN + Long BG" },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber">
      <Navbar />

      <main className="flex-1 w-full overflow-hidden">
        {/* Background Gradients & Grids */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370d_1px,transparent_1px),linear-gradient(to_bottom,#1f29370d_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none -z-10" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[350px] bg-amber-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 pt-12 pb-16 md:pt-20 md:pb-24 flex flex-col items-center text-center space-y-6">
          {/* Status Badge */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-accent-amber text-xs font-semibold animate-in fade-in duration-500">
            <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
            <span>INSTITUTIONAL DELTA-NEUTRAL ARBITRAGE TERMINAL v2.4</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-zinc-100 max-w-4xl leading-[1.15]">
            Capture Cross-Exchange Funding Rates with <span className="text-accent-amber underline decoration-amber-500/40">Zero Directional Risk</span>.
          </h1>

          {/* Subheading */}
          <p className="text-sm md:text-base text-zinc-400 max-w-2xl leading-relaxed">
            Simultaneous atomic execution across <strong>Binance USD-M</strong> and <strong>Bitget Perpetuals</strong>. Harvest persistent funding rate divergences with sub-250ms inter-leg delta and 24/7 autonomous server execution.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-4 w-full sm:w-auto">
            <Link
              href="/terminal"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs tracking-wider uppercase transition-all flex items-center justify-center space-x-2 shadow-xl shadow-amber-500/10 hover:scale-[1.02]"
            >
              <span>{user ? "Enter Trading Terminal" : "Launch Trading Cockpit"}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <Link
              href="/history"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all flex items-center justify-center space-x-2 hover:border-zinc-700"
            >
              <span>View Trade History Log</span>
            </Link>

            {!user && (
              <Link
                href="/login"
                className="w-full sm:w-auto px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-accent-cyan border border-cyan-500/30 text-xs font-semibold transition-all flex items-center justify-center space-x-2"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Sign In / Sign Up</span>
              </Link>
            )}
          </div>

          {/* Live Basis Ticker Bar */}
          <div className="w-full max-w-4xl pt-8">
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

        {/* Interactive 3D Prismatic Core Nexus Showcase */}
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-10">
          <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-border">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-100">
                    Dual-Exchange Prismatic Nexus // Real-Time Basis Pulse
                  </h2>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Visual representation of basis spread equilibrium between Binance (Amber) and Bitget (Emerald).
                </p>
              </div>
              <div className="text-xs font-mono text-zinc-400 self-start sm:self-center">
                Basis Spread: <span className="font-bold text-accent-amber">{spreadBps.toFixed(1)} bps</span>
              </div>
            </div>

            <PrismaticCore3D spreadBps={spreadBps} />
          </div>
        </section>

        {/* Scrolling Architecture Steps Section */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-16 space-y-10">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
              How Delta-Neutral Basis Capture Works
            </h2>
            <p className="text-xs text-zinc-400">
              Three-stage algorithmic protocol designed to extract continuous cash flow from perpetual funding discrepancies with zero price beta.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Step 1 */}
            <div className="bg-surface p-6 rounded-2xl border border-border space-y-4 relative group hover:border-amber-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-accent-amber font-bold text-sm">
                01
              </div>
              <h3 className="text-base font-bold text-zinc-100">
                Continuous Basis Discovery
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Dual WebSockets continuously stream mark prices and 8-hour funding rates across 50+ perpetual contracts on Binance USD-M and Bitget V3. When funding divergence widens beyond threshold (&gt;12 bps), an execution trigger fires.
              </p>
              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Metric:</span>
                <span className="text-zinc-300 font-semibold">Sub-250ms Dual WebSockets</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-surface p-6 rounded-2xl border border-border space-y-4 relative group hover:border-cyan-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-accent-cyan font-bold text-sm">
                02
              </div>
              <h3 className="text-base font-bold text-zinc-100">
                Atomic Lead-Lag Stagger Fill
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Adaptive EWMA latency tracking measures millisecond round-trip response times for each exchange. The engine staggers the faster venue by calibrated milliseconds, ensuring both legs execute in simultaneous market harmony.
              </p>
              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Metric:</span>
                <span className="text-zinc-300 font-semibold">Zero Unhedged Exposure Skew</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-surface p-6 rounded-2xl border border-border space-y-4 relative group hover:border-emerald-500/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-800/40 flex items-center justify-center text-accent-emerald font-bold text-sm">
                03
              </div>
              <h3 className="text-base font-bold text-zinc-100">
                Funding Harvest & Unwind
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                You collect funding settlement every 8 hours directly into your balance. When the basis spread mean-reverts or compresses (&lt;2 bps), the 24/7 server autonomous engine simultaneously flattens both legs to lock in realized profits.
              </p>
              <div className="pt-2 text-[11px] text-zinc-500 border-t border-zinc-800 flex items-center space-x-1">
                <span>Metric:</span>
                <span className="text-zinc-300 font-semibold">100% Delta-Neutral PnL</span>
              </div>
            </div>
          </div>
        </section>

        {/* Security & Multi-Tenant Credential Isolation Policy */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 py-12">
          <div className="bg-gradient-to-r from-zinc-950 via-surface to-zinc-950 p-8 rounded-3xl border border-border space-y-6">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-accent-amber" />
                  <h3 className="text-lg font-bold text-zinc-100 uppercase">
                    Strict Credential Isolation Architecture
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 max-w-xl">
                  Enterprise-grade separation between the fund master administrator and individual trader quant accounts.
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300">
                  AES-256 Vault Encryption
                </span>
                <span className="px-3 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-accent-emerald font-semibold">
                  Zero Shared Keys
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
                <div className="font-bold text-accent-amber">Primary Administrator Account</div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  Configured under <code className="text-zinc-200">varsha633@gmailcom</code> with complete administrative access to pre-seeded institutional testnet infrastructure and server autopilot scheduling.
                </p>
              </div>

              <div className="bg-zinc-900/60 p-4 rounded-xl border border-zinc-800 space-y-2">
                <div className="font-bold text-accent-cyan">Standard Quant User Accounts</div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  All other users operate under complete credential isolation. API keys start <strong>strictly blank</strong> by default. Each trader must configure their own personal Binance and Bitget API keys in their profile vault.
                </p>
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
              className="px-8 py-3.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-amber-500/10 hover:scale-[1.02]"
            >
              Launch Trading Cockpit
            </Link>
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl bg-surface hover:bg-zinc-800 text-zinc-200 border border-border text-xs font-semibold transition-all hover:border-zinc-700"
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
