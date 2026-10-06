"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { KeyRound, RefreshCw, Wallet, ShieldCheck, ExternalLink, Activity, Radio } from "lucide-react";
import PrismaticCore3D from "@/components/PrismaticCore3D";
import TelemetryHUD from "@/components/TelemetryHUD";
import SpreadTracker from "@/components/SpreadTracker";
import ControlCockpit from "@/components/ControlCockpit";
import PositionsTable from "@/components/PositionsTable";
import SettingsModal from "@/components/SettingsModal";
import { useDualExchangeWebSockets } from "@/hooks/useDualExchangeWebSockets";

export default function DashboardPage() {
  // Live Dual-Exchange WebSockets Stream
  const wsData = useDualExchangeWebSockets();

  const [account, setAccount] = useState<any>(null);
  const [bitgetAccount, setBitgetAccount] = useState<any>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [bitgetError, setBitgetError] = useState<string | null>(null);
  const [accountEndpoint, setAccountEndpoint] = useState<string | null>(null);
  const [hasCustomKey, setHasCustomKey] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStudioMode, setIsStudioMode] = useState(false);

  // 24/7 Autonomous Autopilot State
  const [isAutopilotActive, setIsAutopilotActive] = useState(false);
  const [autopilotState, setAutopilotState] = useState<string>("IDLE_SCANNING");
  const lastAutopilotActionRef = useRef<number>(0);

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
    const bitgetEnv = localStorage.getItem("BITGET_ENV") || "live";
    if (bitgetKey) headers["x-bitget-key"] = bitgetKey;
    if (bitgetSecret) headers["x-bitget-secret"] = bitgetSecret;
    if (bitgetPass) headers["x-bitget-passphrase"] = bitgetPass;
    if (bitgetEnv) headers["x-bitget-env"] = bitgetEnv;

    return headers;
  }, []);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (typeof window !== "undefined") {
        setHasCustomKey(Boolean(localStorage.getItem("BINANCE_KEY")));
      }

      const headers = getVaultHeaders();
      const ts = Date.now();

      // 1. Binance Account & Positions (Strict Uncached)
      try {
        const accountRes = await fetch(`/api/account?_t=${ts}`, { headers, cache: "no-store" });
        const accountData = await accountRes.json();
        if (accountData.success) {
          setAccount(accountData);
          setPositions(accountData.positions || []);
          setAccountError(null);
          if (accountData.endpoint) setAccountEndpoint(accountData.endpoint);
        } else {
          setAccount(null);
          setPositions([]);
          setAccountError(accountData.error || "Failed to authenticate with Binance");
          if (accountData.endpoint) setAccountEndpoint(accountData.endpoint);
        }
      } catch (err: any) {
        setAccount(null);
        setPositions([]);
        setAccountError(err.message || "Network error fetching Binance");
      }

      // 2. Bitget Account (Strict Uncached)
      try {
        const bitgetRes = await fetch(`/api/bitget/account?_t=${ts}`, { headers, cache: "no-store" });
        const bitgetData = await bitgetRes.json();
        if (bitgetData.success) {
          setBitgetAccount(bitgetData);
          setBitgetError(null);
        } else {
          setBitgetAccount(null);
          setBitgetError(bitgetData.error || "Failed to authenticate with Bitget");
        }
      } catch (err: any) {
        setBitgetAccount(null);
        setBitgetError(err.message || "Network error fetching Bitget");
      }
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [getVaultHeaders]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // 24/7 Autonomous Scanner & Auto-Hedger Loop
  useEffect(() => {
    if (!isAutopilotActive) return;

    const autopilotInterval = setInterval(async () => {
      const now = Date.now();
      if (now - lastAutopilotActionRef.current < 10000) return; // 10s minimum throttle

      const spread = wsData.spreadBps;

      // Rule: Spread >= 12 bps -> Enter Dual Hedge (Binance Short + Bitget Long)
      if (autopilotState === "IDLE_SCANNING" && spread >= 12.0) {
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

      // Rule: Spread <= 2.0 bps -> Close Dual Hedge (Mean Reverted)
      if (autopilotState === "HEDGED_MONITORING" && spread <= 2.0) {
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
            setTimeout(() => setAutopilotState("IDLE_SCANNING"), 30000); // 30s cooldown
          }
        } catch {
          setAutopilotState("HEDGED_MONITORING");
        }
      }
    }, 3000);

    return () => clearInterval(autopilotInterval);
  }, [isAutopilotActive, autopilotState, wsData.spreadBps, getVaultHeaders, fetchData]);

  const handleClosePosition = async () => {
    try {
      const res = await fetch("/api/close", {
        method: "POST",
        headers: getVaultHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(data.error || "Failed to close position");
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  return (
    <main className="min-h-screen bg-background text-zinc-100 p-4 md:p-8 max-w-7xl mx-auto font-mono">
      {/* Top Header Bar */}
      <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-5 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${accountError ? "bg-accent-rose animate-ping" : "bg-accent-amber animate-pulse"}`} />
            <h1 className="text-lg md:text-xl font-bold tracking-tight uppercase">
              FUNDING RATE ARBITRAGE // COCKPIT
            </h1>
            <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 border border-border">
              {accountEndpoint ? accountEndpoint.replace("https://", "") : "TESTNET v1.2"}
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

            {account?.keyMask ? (
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                account.isCustomKey
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
              }`}>
                KEY: {account.keyMask} {account.isCustomKey ? "(VAULT CUSTOM)" : "(DEFAULT TESTNET)"}
              </span>
            ) : hasCustomKey ? (
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                VAULT KEYS LOADED
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/30">
                SYSTEM DEFAULT KEYS
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Delta-Neutral Basis Capture • Dual-Stream WebSockets • Binance USD-M & Bitget Perpetuals
          </p>
        </div>

        {/* Live Wallet & Account Stats */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Binance Wallet */}
          <div className="flex items-center space-x-2 bg-surface px-3 py-2 rounded-lg border border-border text-xs">
            <Wallet className={`w-4 h-4 ${accountError ? "text-accent-rose" : "text-accent-amber"}`} />
            <div>
              <div className="text-[10px] text-zinc-500">BINANCE WALLET</div>
              <div className="font-bold text-zinc-200">
                {account?.totalWalletBalance !== undefined
                  ? `$${account.totalWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
                  : accountError
                  ? <span className="text-accent-rose">AUTH ERROR</span>
                  : "LOADING..."}
              </div>
            </div>
          </div>

          {/* Bitget Equity */}
          <div className="flex items-center space-x-2 bg-surface px-3 py-2 rounded-lg border border-border text-xs">
            <Wallet className={`w-4 h-4 ${bitgetError ? "text-accent-rose" : "text-cyan-400"}`} />
            <div>
              <div className="text-[10px] text-zinc-500">BITGET EQUITY</div>
              <div className="font-bold text-zinc-200">
                {bitgetAccount?.equity !== undefined
                  ? `$${bitgetAccount.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
                  : bitgetError
                  ? <span className="text-accent-rose">AUTH ERROR</span>
                  : "SYNCING..."}
              </div>
            </div>
          </div>

          {/* Unrealized PnL */}
          <div className="flex items-center space-x-2 bg-surface px-3 py-2 rounded-lg border border-border text-xs">
            <ShieldCheck className="w-4 h-4 text-accent-emerald" />
            <div>
              <div className="text-[10px] text-zinc-500">NET UNREALIZED PnL</div>
              <div className={`font-bold ${(account?.totalUnrealizedProfit || 0) >= 0 ? "text-accent-emerald" : "text-accent-rose"}`}>
                {account ? `${(account.totalUnrealizedProfit || 0) >= 0 ? "+" : ""}$${account.totalUnrealizedProfit?.toFixed(2)} USDT` : "---"}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
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
      </header>

      {/* Account Error / Diagnostic Alert Banner */}
      {(accountError || bitgetError) && (
        <div className="mb-6 p-4 rounded-xl border border-rose-500/40 bg-rose-500/10 backdrop-blur space-y-3 text-xs">
          {accountError && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1 w-full">
                <div className="font-bold text-rose-300 flex items-center gap-1.5">
                  <span>⚠️ Binance Authentication Issue:</span>
                </div>
                <div className="text-zinc-300 font-mono text-[11px] bg-zinc-950/60 p-2 rounded border border-rose-500/20 max-w-3xl overflow-x-auto">
                  {accountError}
                </div>
                {accountError.toLowerCase().includes("restricted location") && (
                  <div className="text-amber-300/90 text-[11px] bg-amber-950/40 border border-amber-500/30 p-2 rounded mt-1">
                    🌍 <strong>Geo-Restriction Detected</strong>: Binance blocks US datacenter IPs (Render Oregon).
                    <br />
                    • <strong>Fix on Render</strong>: In Render Dashboard → Settings → Region → change to <strong>Frankfurt (EU Central)</strong>.
                    <br />
                    • <strong>Run Locally</strong>: Run <code className="text-zinc-200">npm run dev</code> inside <code className="text-zinc-200">web/</code> on your computer (India IP has zero restrictions).
                  </div>
                )}
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
                {bitgetError.toLowerCase().includes("passphrase") && (
                  <div className="text-zinc-400 text-[11px]">
                    Tip: Enter the passphrase <code className="text-cyan-300">ArbitrageBot2026</code> in the Bitget tab inside Vault Settings.
                  </div>
                )}
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

      {/* Grid: 3D Prismatic Core & Control Cockpit */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        {/* Left Column: 3D Visualizer & Telemetry HUD */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <PrismaticCore3D
            spreadBps={wsData.spreadBps}
            isInspecting={isStudioMode}
            onToggleInspect={() => setIsStudioMode(!isStudioMode)}
          />
          <TelemetryHUD
            spreadBps={wsData.spreadBps}
            nextFundingTime={wsData.nextFundingTime}
            clockOffsetMs={633110}
          />
        </div>

        {/* Right Column: Execution Cockpit */}
        <div className="lg:col-span-5">
          <ControlCockpit
            onRefresh={fetchData}
            getVaultHeaders={getVaultHeaders}
            isAutopilotActive={isAutopilotActive}
            onToggleAutopilot={setIsAutopilotActive}
            autopilotState={autopilotState}
            spreadBps={wsData.spreadBps}
          />
        </div>
      </div>

      {/* Spread Comparison Tracker with Live WebSocket Values */}
      <div className="mb-6">
        <SpreadTracker
          binanceFundingRate={wsData.binanceFundingRate}
          bitgetFundingRate={wsData.bitgetFundingRate}
          spreadBps={wsData.spreadBps}
          markPrice={wsData.binancePrice}
        />
      </div>

      {/* Live Positions Table */}
      <div className="mb-6">
        <PositionsTable
          positions={positions}
          onClosePosition={handleClosePosition}
        />
      </div>

      {/* Footer & Telemetry Specs */}
      <footer className="border-t border-border pt-4 mt-8 flex flex-col md:flex-row items-center justify-between text-[11px] text-zinc-500 gap-2">
        <div>
          Autonomous Funding Rate Arbitrage Engine • Sub-250ms Dual WebSockets • Render Free Service Ready
        </div>
        <div className="flex items-center space-x-4">
          <span>Target Latency: &lt;250ms</span>
          <span>•</span>
          <span>Aggressive Fill Chase: 3x Retries / 1.5s</span>
          <span>•</span>
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
      </footer>

      {/* Settings Modal (Client Session Vault) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={fetchData}
      />
    </main>
  );
}
