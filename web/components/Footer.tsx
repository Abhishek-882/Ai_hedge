"use client";

import React from "react";
import Link from "next/link";
import { ExternalLink, ShieldCheck, Zap } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full bg-[#09090b] border-t border-border mt-12 pt-8 pb-24 sm:pb-8 px-4 md:px-8 font-mono text-xs text-zinc-400">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Info & Attribution Row */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-border/80">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
              <span className="font-bold text-zinc-200 tracking-wide uppercase">
                AI-HEDGE // HIGH-FREQUENCY ARBITRAGE TERMINAL
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              Autonomous Delta-Neutral Basis Capture • Dual WebSockets Engine • Sub-250ms Execution Delta
            </p>
          </div>

          {/* Developer & Company Attribution */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] bg-surface px-3 py-2 rounded-lg border border-border">
            <div className="text-zinc-400">
              Developer: <span className="font-bold text-accent-amber">Abhishek</span>
            </div>
            <span className="text-zinc-600">•</span>
            <div className="text-zinc-400">
              Company: <span className="font-bold text-accent-cyan">MMT</span>
            </div>
            <span className="text-zinc-600">•</span>
            <div className="text-zinc-500">
              System: <span className="text-zinc-300">Production Build v2.4</span>
            </div>
          </div>
        </div>

        {/* Mandatory Regulatory & Risk Disclaimer */}
        <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/90 text-[11px] leading-relaxed text-zinc-400 space-y-2">
          <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold uppercase tracking-wider text-[10px]">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Institutional Trading & Execution Risk Disclaimer</span>
          </div>
          <p>
            High-frequency funding rate arbitrage and cryptocurrency derivative trading involve substantial risk of loss and are not suitable for every investor. While delta-neutral strategies aim to minimize directional exposure, execution risks such as slippage, exchange API latency divergence, liquidation hazards during rapid basis divergence, and connectivity failures may still occur. Past performance and simulated backtest results do not guarantee future returns.
          </p>
          <p className="text-zinc-500 text-[10px]">
            This software platform is an automated execution and mathematical telemetry tool provided for institutional research and qualified traders. It does not constitute financial, legal, tax, or investment advice. Developed by Abhishek for company MMT.
          </p>
        </div>

        {/* Bottom Credits & Quick Links */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 gap-3 pt-2">
          <div>
            © {new Date().getFullYear()} MMT (Developed by Abhishek). All rights reserved.
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
            <Link href="/" className="hover:text-zinc-300 transition-colors">
              Platform Intro
            </Link>
            <Link href="/terminal" className="hover:text-zinc-300 transition-colors">
              Trading Terminal
            </Link>
            <Link href="/history" className="hover:text-zinc-300 transition-colors">
              Hedge History
            </Link>
            <Link href="/profile" className="hover:text-zinc-300 transition-colors">
              User Profile
            </Link>
            <a
              href="https://testnet.binancefuture.com"
              target="_blank"
              rel="noreferrer"
              className="text-zinc-400 hover:text-zinc-200 flex items-center space-x-1"
            >
              <span>Binance Testnet</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
