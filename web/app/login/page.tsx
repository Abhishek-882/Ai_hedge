"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Lock, ArrowRight, Server, CheckCircle2, ChevronLeft } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("demo@quantfunds.io");
  const [password, setPassword] = useState("••••••••••••");
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, action: "login" }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccessMsg("Authenticated as Institutional Quant. Redirecting to trading terminal...");
        setTimeout(() => {
          router.push("/");
        }, 800);
      }
    } catch {
      setSuccessMsg("Login successful (Demo mode)");
      setTimeout(() => {
        router.push("/");
      }, 800);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col justify-center items-center p-4 font-mono relative selection:bg-accent-amber selection:text-zinc-950">
      {/* Background Subtle Grid Accent */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center space-x-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to Terminal</span>
        </Link>

        {/* Card */}
        <div className="bg-[#121215] border border-zinc-800 rounded-2xl p-7 shadow-2xl space-y-6">
          {/* Logo & Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-accent-amber text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>INSTITUTIONAL QUANT ACCESS</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              Delta-Neutral Arbitrage Cockpit
            </h1>
            <p className="text-xs text-zinc-400">
              Multi-Exchange High-Frequency Funding Basis Terminal
            </p>
          </div>

          {successMsg ? (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center space-x-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">
                  Institutional ID / Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent-amber"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">
                  Security Passkey
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-xs bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent-amber"
                    required
                  />
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* 24/7 background bot assurance notice */}
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 flex items-start space-x-2.5">
                <Server className="w-4 h-4 text-accent-cyan shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-zinc-300">24/7 Server Autonomous Execution:</span>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Your automated hedging engine runs continuously on the server even when logged out or when your browser is closed.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/10"
              >
                <span>{isLoading ? "Authenticating..." : "1-Click Institutional Sign In"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Institutional Tier Footer */}
          <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
            <span>Binance Futures & Bitget V3 Demo</span>
            <span className="text-accent-emerald font-semibold">Live Server Connected</span>
          </div>
        </div>
      </div>
    </div>
  );
}
