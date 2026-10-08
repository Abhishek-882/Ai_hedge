"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  Server,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  User,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Quick Admin fill helper as instructed
  const handleFillAdmin = () => {
    setMode("signin");
    setEmail("varsha633@gmailcom");
    setPassword("99129838aA@");
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode === "signup" ? "signup" : "login",
          email: email.trim(),
          password: password.trim(),
          username: username.trim(),
        }),
      });

      const data = await res.json();

      if (data.success && data.user) {
        const isAdmin = data.user.role === "admin";
        setSuccessMsg(
          isAdmin
            ? "Authenticated as Primary Admin (varsha633@gmailcom). Entering terminal..."
            : `Welcome ${data.user.username || "Quant"}! Personal vault initialized (blank API keys). Redirecting...`
        );
        setTimeout(() => {
          router.push("/terminal");
        }, 800);
      } else {
        setErrorMsg(data.error || "Authentication failed. Please verify credentials.");
      }
    } catch (err: any) {
      setErrorMsg(`Network Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber">
      <Navbar />

      <main className="flex-1 flex flex-col justify-center items-center p-4 relative">
        {/* Subtle Background Grid Accent */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none"></div>

        <div className="w-full max-w-md relative z-10 my-8">
          {/* Card */}
          <div className="bg-[#121215] border border-zinc-800 rounded-2xl p-7 shadow-2xl space-y-6">
            {/* Logo & Header */}
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/20 text-accent-amber text-[11px] font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>INSTITUTIONAL QUANT ACCESS</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                Delta-Neutral Arbitrage Terminal
              </h1>
              <p className="text-xs text-zinc-400">
                Binance USD-M & Bitget V3 High-Frequency Execution
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex rounded-xl bg-zinc-900 p-1 border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "signin"
                    ? "bg-zinc-800 text-zinc-100 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  mode === "signup"
                    ? "bg-zinc-800 text-zinc-100 shadow"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* 1-Click Admin Preset Helper */}
            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
              <div className="text-[11px] text-zinc-300">
                <span className="font-semibold text-accent-amber">Admin Demo:</span>
                <span className="text-zinc-400 ml-1">varsha633@gmailcom</span>
              </div>
              <button
                type="button"
                onClick={handleFillAdmin}
                className="px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-accent-amber border border-amber-500/30 text-[10px] font-bold transition-colors"
              >
                Fill Admin
              </button>
            </div>

            {/* Feedback Notifications */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">
                    Trader Handle / Username
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. QuantAlpha"
                      className="w-full px-3.5 py-2.5 text-xs bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent-amber"
                    />
                    <User className="w-3.5 h-3.5 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 uppercase">
                  Institutional ID / Email
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@fund.com or varsha633@gmailcom"
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
                    placeholder="Enter passkey"
                    className="w-full px-3.5 py-2.5 text-xs bg-zinc-900 border border-zinc-700 rounded-xl text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent-amber"
                    required
                  />
                  <Lock className="w-3.5 h-3.5 text-zinc-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {/* Informational Policy Notice */}
              <div className="p-3 rounded-xl bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400 space-y-1">
                <div className="flex items-center space-x-1.5 text-zinc-300 font-semibold">
                  <Server className="w-3.5 h-3.5 text-accent-cyan" />
                  <span>Key Policy Notice:</span>
                </div>
                <p className="text-[10px] text-zinc-400 leading-relaxed">
                  Only the admin account has pre-seeded system testnet keys. All newly created or standard user accounts start with completely blank keys and must enter their own personal exchange credentials in the Profile vault.
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/10"
              >
                <span>{isLoading ? "Authenticating..." : mode === "signin" ? "Sign In to Terminal" : "Register Quant Account"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Bottom Status */}
            <div className="pt-3 border-t border-zinc-800 text-[10px] text-zinc-500 flex items-center justify-between">
              <span>Binance & Bitget Multi-Tenant Engine</span>
              <span className="text-accent-emerald font-semibold">Live Server Connected</span>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
