"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { KeyRound, RefreshCw, Wallet, ShieldCheck, ExternalLink, Activity, Radio, History, User, AlertCircle, ArrowRight, Flame } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PrismaticCore3D from "@/components/PrismaticCore3D";
import TelemetryHUD from "@/components/TelemetryHUD";
import SpreadTracker from "@/components/SpreadTracker";
import ControlCockpit, { SupportedAsset } from "@/components/ControlCockpit";
import PositionsTable from "@/components/PositionsTable";
import AllCoinsScanner from "@/components/AllCoinsScanner";
import SettingsModal from "@/components/SettingsModal";
import UserProfileModal from "@/components/UserProfileModal";
import ServerDaemonIndicator from "@/components/ServerDaemonIndicator";
import { useDualExchangeWebSockets } from "@/hooks/useDualExchangeWebSockets";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function TerminalPage() {
  const router = useRouter();
  const [selectedSymbol, setSelectedSymbol] = useState<SupportedAsset>("BTCUSDT");
  const [loadedPulse, setLoadedPulse] = useState(false);

  // Live Dual-Exchange WebSockets Stream
  const wsData = useDualExchangeWebSockets(selectedSymbol);

  const [account, setAccount] = useState<any>(null);
  const [bitgetAccount, setBitgetAccount] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [bitgetError, setBitgetError] = useState<string | null>(null);
  const [accountEndpoint, setAccountEndpoint] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStudioMode, setIsStudioMode] = useState(false);

  // 24/7 Autonomous Autopilot State
  const [isAutopilotActive, setIsAutopilotActive] = useState(false);
  const [autopilotState, setAutopilotState] = useState<string>("IDLE_SCANNING");
  const [minSpreadEntry, setMinSpreadEntry] = useState<number>(12);
  const [exitSpreadTarget, setExitSpreadTarget] = useState<number>(2);
  const lastAutopilotActionRef = useRef<number>(0);

  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [closeError, setCloseError] = useState<string | null>(null);

  // Check auth on load
  const verifyAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.isLoggedIn && data.user) {
        setCurrentUser(data.user);
        setIsAuthLoading(false);
      } else {
        router.push("/login");
      }
    } catch {
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    verifyAuth();
  }, [verifyAuth]);

  const handleSelectCoinFromScanner = useCallback((symbol: string) => {
    setSelectedSymbol(symbol as any);
    setLoadedPulse(true);
    setTimeout(() => setLoadedPulse(false), 2000);
    const el = document.getElementById("execution-cockpit-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  const getVaultHeaders = useCallback((): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const headers: Record<string, string> = {};

    const key = localStorage.getItem("BINANCE_KEY") || "";
    const secret = localStorage.getItem("BINANCE_SECRET") || "";
    const endpoint = localStorage.getItem("BINANCE_ENDPOINT") || "";
    if (key) headers["x-binance-key"] = key;
    if (secret) headers["x-binance-secret"] = secret;
    if (endpoint) headers["x-binance-endpoint"] = endpoint;

    const bitgetKey = localStorage.getItem("BITGET_KEY") || "";
    const bitgetSecret = localStorage.getItem("BITGET_SECRET") || "";
    const bitgetPass = localStorage.getItem("BITGET_PASSPHRASE") || "";
    const bitgetEnv = localStorage.getItem("BITGET_ENV") || "demo";
    if (bitgetKey) headers["x-bitget-key"] = bitgetKey;
    if (bitgetSecret) headers["x-bitget-secret"] = bitgetSecret;
    if (bitgetPass) headers["x-bitget-passphrase"] = bitgetPass;
    if (bitgetEnv) headers["x-bitget-env"] = bitgetEnv;

    if (currentUser?.email) {
      headers["x-user-email"] = currentUser.email;
    }
    if (currentUser?.id) {
      headers["x-user-id"] = currentUser.id;
    }

    return headers;
  }, [currentUser]);

  const fetchData = useCallback(async () => {
    if (document.hidden) return;
    setIsRefreshing(true);
    try {
      const headers = getVaultHeaders();
      const ts = Date.now();

      let binancePositions: any[] = [];
      let bitgetPositions: any[] = [];

      // 1. Binance Account & Positions
      try {
        const accountRes = await fetch(`/api/account?_t=${ts}`, { headers, cache: "no-store" });
        const accountData = await accountRes.json();
        if (accountData.success) {
          setAccount(accountData);
          binancePositions = (accountData.positions || []).map((p: any) => ({ ...p, venue: p.venue || "Binance" }));
          setAccountError(null);
          if (accountData.endpoint) setAccountEndpoint(accountData.endpoint);
        } else {
          setAccount(null);
          setAccountError(accountData.error || "Failed to authenticate with Binance");
          if (accountData.endpoint) setAccountEndpoint(accountData.endpoint);
        }
      } catch (err: any) {
        setAccount(null);
        setAccountError(err.message || "Network error fetching Binance");
      }

      // 2. Bitget Account
      try {
        const bitgetRes = await fetch(`/api/bitget/account?_t=${ts}`, { headers, cache: "no-store" });
        const bitgetData = await bitgetRes.json();
        if (bitgetData.success) {
          setBitgetAccount(bitgetData);
          bitgetPositions = (bitgetData.positions || []).map((p: any) => ({ ...p, venue: p.venue || "Bitget" }));
          setBitgetError(null);
        } else {
          setBitgetAccount(null);
          setBitgetError(bitgetData.error || "Failed to authenticate with Bitget");
        }
      } catch (err: any) {
        setBitgetAccount(null);
        setBitgetError(err.message || "Network error fetching Bitget");
      }

      setPositions([...binancePositions, ...bitgetPositions]);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [getVaultHeaders]);

  useEffect(() => {
    if (!currentUser) return;
    fetchData();
    // 5-second polling for live balances, pauses when tab is hidden
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser, fetchData]);

  // 24/7 Autonomous Scanner & Auto-Hedger Loop
  useEffect(() => {
    if (!isAutopilotActive) return;

    const autopilotInterval = setInterval(async () => {
      const now = Date.now();
      if (now - lastAutopilotActionRef.current < 10000) return; // 10s throttle

      const spread = wsData.spreadBps;

      // Rule: Spread >= minSpreadEntry bps -> Enter Dual Hedge
      if (autopilotState === "IDLE_SCANNING" && spread >= minSpreadEntry) {
        try {
          setAutopilotState("ENTERING_HEDGE");
          lastAutopilotActionRef.current = now;

          const res = await fetch("/api/hedge", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...getVaultHeaders(),
            },
            body: JSON.stringify({
              action: "entry",
              quantity: 0.005,
              leg1Side: "SELL",
            }),
          });
          const data = await res.json();
          if (data.success) {
            setAutopilotState("HEDGED_MONITORING");
            fetchData();
          } else {
            setAutopilotState("IDLE_SCANNING");
          }
        } catch {
          setAutopilotState("IDLE_SCANNING");
        }
      }

      // Rule: Spread <= exitSpreadTarget bps -> Close Dual Hedge
      if (autopilotState === "HEDGED_MONITORING" && spread <= exitSpreadTarget) {
        try {
          setAutopilotState("CLOSING_HEDGE");
          lastAutopilotActionRef.current = now;

          const res = await fetch("/api/close", {
            method: "POST",
            headers: getVaultHeaders(),
          });
          const data = await res.json();
          if (data.success) {
            setAutopilotState("COOLDOWN");
            fetchData();
            setTimeout(() => setAutopilotState("IDLE_SCANNING"), 30000);
          }
        } catch {
          setAutopilotState("HEDGED_MONITORING");
        }
      }
    }, 4000);

    return () => clearInterval(autopilotInterval);
  }, [isAutopilotActive, autopilotState, wsData.spreadBps, minSpreadEntry, exitSpreadTarget, getVaultHeaders, fetchData]);

  const handleClosePosition = async (targetSymbol?: string) => {
    try {
      const res = await fetch("/api/close", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getVaultHeaders(),
        },
        body: JSON.stringify({ symbol: targetSymbol || "ALL" }),
      });
      const data = await res.json();
      if (data.success) {
        setCloseError(null);
        fetchData();
      } else {
        const errMsg = data.error || data.message || "Failed to close position";
        setCloseError(errMsg);
        setTimeout(() => setCloseError(null), 6000);
      }
    } catch (err: any) {
      setCloseError(`Error: ${err.message}`);
      setTimeout(() => setCloseError(null), 6000);
    }
  };

  // Dynamic real-time combined unrealized PnL
  const dynamicNetPnl = positions.reduce((acc, pos) => {
    const isCurrentAsset = Boolean(selectedSymbol && pos.symbol === selectedSymbol);
    const rawLivePrice = pos.venue === "Bitget" ? wsData.bitgetPrice : wsData.binancePrice;
    const baselinePrice = pos.markPrice || pos.entryPrice;
    const isPlausible = Boolean(
      rawLivePrice > 0 &&
      baselinePrice > 0 &&
      Math.abs(rawLivePrice - baselinePrice) / baselinePrice < 0.20
    );
    const liveMarkPrice = (isCurrentAsset && isPlausible) ? rawLivePrice : baselinePrice;
    const pnl = (isCurrentAsset && isPlausible && pos.amount !== 0 && pos.entryPrice > 0)
      ? (liveMarkPrice - pos.entryPrice) * pos.amount
      : (pos.unrealizedPnl || 0);
    return acc + pnl;
  }, 0);

  const isNonAdminBlankKeys = currentUser && currentUser.role !== "admin" && (!account?.totalWalletBalance && !bitgetAccount?.equity);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background text-zinc-100 flex flex-col font-mono">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center space-x-3 text-zinc-400 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-accent-amber" />
            <span>Verifying institutional quant session...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-8 pb-24 sm:pb-8 space-y-4 sm:space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${accountError ? "bg-accent-rose animate-ping" : "bg-accent-amber animate-pulse"}`} />
              <h1 className="text-lg md:text-xl font-bold tracking-tight uppercase">
                FUNDING RATE ARBITRAGE // COCKPIT
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-border">
                {accountEndpoint ? accountEndpoint.replace("https://", "") : "TESTNET v2.4"}
              </span>

              {/* WebSocket Stream Live Badges */}
              <div className="flex items-center space-x-1.5 ml-1">
                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center space-x-1 border ${
                  wsData.binanceWsConnected
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-zinc-800 text-zinc-500 border-border"
                }`}>
                  <Radio className={`w-2.5 h-2.5 ${wsData.binanceWsConnected ? "text-amber-400 animate-pulse" : "text-zinc-600"}`} />
                  <span>BN WS</span>
                </span>

                <span className={`px-2 py-0.5 rounded text-[10px] flex items-center space-x-1 border ${
                  wsData.bitgetWsConnected
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-zinc-800 text-zinc-500 border-border"
                }`}>
                  <Radio className={`w-2.5 h-2.5 ${wsData.bitgetWsConnected ? "text-cyan-400 animate-pulse" : "text-zinc-600"}`} />
                  <span>BG WS</span>
                </span>
              </div>

              {account?.keyMask && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  account.isCustomKey
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                }`}>
                  BN: {account.keyMask} {account.isCustomKey ? "(VAULT)" : "(ADMIN)"}
                </span>
              )}

              {bitgetAccount?.keyMask && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  bitgetAccount.isCustomKey
                    ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                }`}>
                  BG: {bitgetAccount.keyMask} {bitgetAccount.isCustomKey ? "(VAULT)" : "(ADMIN)"}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Delta-Neutral Basis Capture • Dual-Stream WebSockets • Binance USD-M & Bitget Perpetuals
            </p>
          </div>

          {/* Live Wallet & Account Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
            {/* Binance Wallet */}
            <div className="flex items-center space-x-2 bg-surface px-2.5 py-2 sm:px-3 rounded-lg border border-border text-xs">
              <Wallet className={`w-4 h-4 ${accountError ? "text-accent-rose" : "text-accent-amber"}`} />
              <div>
                <div className="text-[10px] text-zinc-500">BINANCE WALLET</div>
                <div className="font-bold text-zinc-200">
                  {account?.totalWalletBalance !== undefined
                    ? `$${account.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`
                    : accountError
                    ? <span className="text-accent-rose">AUTH REQUIRED</span>
                    : "SYNCING..."}
                </div>
              </div>
            </div>

            {/* Bitget Equity */}
            <div className="flex items-center space-x-2 bg-surface px-2.5 py-2 sm:px-3 rounded-lg border border-border text-xs">
              <Wallet className={`w-4 h-4 ${bitgetError ? "text-accent-rose" : "text-cyan-400"}`} />
              <div>
                <div className="text-[10px] text-zinc-500">BITGET EQUITY</div>
                <div className="font-bold text-zinc-200">
                  {bitgetAccount?.equity !== undefined
                    ? `$${bitgetAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`
                    : bitgetError
                    ? <span className="text-accent-rose">AUTH REQUIRED</span>
                    : "SYNCING..."}
                </div>
              </div>
            </div>

            {/* Unrealized PnL */}
            <div className="col-span-2 sm:col-span-1 flex items-center space-x-2 bg-surface px-2.5 py-2 sm:px-3 rounded-lg border border-border text-xs">
              <ShieldCheck className="w-4 h-4 text-accent-emerald" />
              <div>
                <div className="text-[10px] text-zinc-500">NET UNREALIZED PnL</div>
                <div className={`font-bold ${dynamicNetPnl >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
                  {positions.length > 0
                    ? `${dynamicNetPnl >= 0 ? "+" : ""}$${dynamicNetPnl.toFixed(4)} USDT`
                    : "$0.0000 USDT"}
                </div>
              </div>
            </div>

            {/* Action buttons & controls row */}
            <div className="col-span-2 sm:col-span-3 lg:col-span-auto flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2 pt-1 sm:pt-0">
              {/* 24/7 Server Autonomous Bot Status Indicator */}
              <ServerDaemonIndicator onOpenProfile={() => setIsProfileOpen(true)} />

              <Link
                href="/history"
                className="flex items-center space-x-1.5 px-2.5 py-2 sm:px-3 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
                title="View Complete Trade History Log"
              >
                <History className="w-3.5 h-3.5 text-accent-cyan" />
                <span className="hidden sm:inline">History</span>
              </Link>

              <Link
                href="/profile"
                className="flex items-center space-x-1.5 px-2.5 py-2 sm:px-3 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
                title="Quant Profile & API Keys Vault"
              >
                <User className="w-3.5 h-3.5 text-accent-amber" />
                <span className="hidden sm:inline">Profile</span>
              </Link>

              <button
                onClick={() => setIsSettingsOpen(true)}
                className="flex items-center space-x-1.5 px-2.5 py-2 sm:px-3 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-accent-amber" />
                <span>Vault</span>
              </button>

              <button
                onClick={fetchData}
                disabled={isRefreshing}
                className="p-2 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-accent-amber" : ""}`} />
              </button>
            </div>
          </div>
        </header>

        {/* Informational Key Requirement Notice for Non-Admin accounts */}
        {isNonAdminBlankKeys && (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-accent-amber shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-amber-300">Personal API Keys Required:</span>
                <p className="text-zinc-300 text-[11px] mt-0.5">
                  You are signed in as a standard quant account. Standard accounts start with blank API keys and must supply their own exchange credentials. Please enter your Binance and Bitget keys in your Profile or Vault.
                </p>
              </div>
            </div>
            <Link
              href="/profile"
              className="px-3 py-1.5 rounded-lg bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs whitespace-nowrap transition-colors flex items-center space-x-1 self-start sm:self-center"
            >
              <span>Setup Keys in Profile</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Account Error / Diagnostic Alert Banner */}
        {(accountError || bitgetError) && !isNonAdminBlankKeys && (
          <div className="p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 space-y-3 text-xs">
            {accountError && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-1 w-full">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️ Binance Authentication Issue:</span>
                  </div>
                  <div className="text-zinc-300 font-mono text-[11px] bg-zinc-950/60 p-2 rounded border border-rose-500/20 max-w-3xl overflow-x-auto">
                    {accountError}
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold whitespace-nowrap transition-colors self-start sm:self-center"
                >
                  Open Vault Settings
                </button>
              </div>
            )}

            {bitgetError && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-rose-500/20">
                <div className="space-y-1 w-full">
                  <div className="font-bold text-rose-300 flex items-center gap-1.5">
                    <span>⚠️ Bitget Authentication Issue:</span>
                  </div>
                  <div className="text-zinc-300 font-mono text-[11px] bg-zinc-950/60 p-2 rounded border border-rose-500/20 max-w-3xl overflow-x-auto">
                    {bitgetError}
                  </div>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40 font-semibold whitespace-nowrap transition-colors self-start sm:self-center"
                >
                  Open Vault Settings
                </button>
              </div>
            )}
          </div>
        )}

        {/* Trending Asset Quick-Explorer Strip */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="text-[10px] text-zinc-500 uppercase font-semibold shrink-0 flex items-center space-x-1">
            <Flame className="w-3.5 h-3.5 text-accent-amber animate-pulse" />
            <span>QUICK EXPLORE:</span>
          </span>
          {[
            { sym: "BTCUSDT", label: "BTC" },
            { sym: "ETHUSDT", label: "ETH" },
            { sym: "SOLUSDT", label: "SOL" },
            { sym: "DOGEUSDT", label: "DOGE" },
            { sym: "LTCUSDT", label: "LTC" },
            { sym: "XRPUSDT", label: "XRP" },
            { sym: "PEPEUSDT", label: "PEPE" },
            { sym: "SUIUSDT", label: "SUI" },
          ].map((item) => {
            const isSelected = selectedSymbol === item.sym;
            return (
              <button
                key={item.sym}
                onClick={() => {
                  setSelectedSymbol(item.sym as any);
                  setLoadedPulse(true);
                  setTimeout(() => setLoadedPulse(false), 2000);
                }}
                className={`px-3 py-1.5 rounded-lg border font-mono font-bold text-xs transition-all shrink-0 active:scale-95 flex items-center space-x-1.5 ${
                  isSelected
                    ? "bg-amber-500/20 text-accent-amber border-accent-amber shadow-sm shadow-amber-500/20 ring-1 ring-amber-500/40"
                    : "bg-surface hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-border"
                }`}
                title={`Explore ${item.sym}`}
              >
                <span>{item.label}</span>
                {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-accent-amber animate-pulse" />}
              </button>
            );
          })}
        </div>

        {/* Grid: 3D Prismatic Core & Control Cockpit */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Real-Time Arbitrage Basis Visualizer & Telemetry HUD */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <PrismaticCore3D
              spreadBps={wsData.spreadBps}
              symbol={selectedSymbol}
              binancePrice={wsData.binancePrice}
              bitgetPrice={wsData.bitgetPrice}
              binanceFundingRate={wsData.binanceFundingRate}
              bitgetFundingRate={wsData.bitgetFundingRate}
              nextFundingTime={wsData.nextFundingTime}
              isInspecting={isStudioMode}
              onToggleInspect={() => setIsStudioMode(!isStudioMode)}
            />
            <TelemetryHUD
              spreadBps={wsData.spreadBps}
              nextFundingTime={wsData.nextFundingTime}
              clockOffsetMs={wsData.clockOffsetMs || 24}
            />
          </div>

          {/* Right Column: Execution Cockpit */}
          <div
            id="execution-cockpit-section"
            className={`lg:col-span-5 rounded-xl transition-all duration-300 ${
              loadedPulse ? "ring-2 ring-accent-amber shadow-xl shadow-amber-500/20" : ""
            }`}
          >
            <ControlCockpit
              onRefresh={fetchData}
              getVaultHeaders={getVaultHeaders}
              selectedSymbol={selectedSymbol}
              onSymbolChange={setSelectedSymbol}
              isAutopilotActive={isAutopilotActive}
              onToggleAutopilot={setIsAutopilotActive}
              autopilotState={autopilotState}
              spreadBps={wsData.spreadBps}
              minSpreadEntry={minSpreadEntry}
              onMinSpreadEntryChange={setMinSpreadEntry}
              exitSpreadTarget={exitSpreadTarget}
              onExitSpreadTargetChange={setExitSpreadTarget}
              markPrice={wsData.binancePrice}
              binanceFundingRate={wsData.binanceFundingRate}
              bitgetFundingRate={wsData.bitgetFundingRate}
            />
          </div>
        </div>

        {/* Spread Comparison Tracker */}
        <div>
          <SpreadTracker
            symbol={selectedSymbol}
            binanceFundingRate={wsData.binanceFundingRate}
            bitgetFundingRate={wsData.bitgetFundingRate}
            spreadBps={wsData.spreadBps}
            markPrice={wsData.binancePrice}
          />
        </div>

        {closeError && (
          <div className="px-4 py-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center space-x-2">
              <span className="font-bold">⚠️ Close Position Notice:</span>
              <span>{closeError}</span>
            </div>
            <button
              onClick={() => setCloseError(null)}
              className="text-rose-400 hover:text-rose-200 text-xs font-mono ml-4 px-1.5 py-0.5 rounded border border-rose-800/60"
            >
              ✕
            </button>
          </div>
        )}

        {/* Live Positions Table */}
        <div>
          <PositionsTable
            positions={positions}
            currentSymbol={selectedSymbol}
            liveBinancePrice={wsData.binancePrice}
            liveBitgetPrice={wsData.bitgetPrice}
            onClosePosition={handleClosePosition}
          />
        </div>

        {/* All Coins Funding Arbitrage Scanner Matrix */}
        <div>
          <AllCoinsScanner
            onSelectCoin={handleSelectCoinFromScanner}
            selectedSymbol={selectedSymbol}
            getVaultHeaders={getVaultHeaders}
          />
        </div>
      </main>

      <Footer />

      {/* Settings Modal (Client Session Vault) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchData}
      />

      {/* Institutional User Profile & 24/7 Autonomous Bot Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </div>
  );
}
