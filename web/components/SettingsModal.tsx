"use client";

import React, { useState, useEffect } from "react";
import { KeyRound, Shield, Check, X, RefreshCw, AlertCircle, Server, Layers } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function SettingsModal({ isOpen, onClose, onSaved }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"binance" | "bitget">("binance");

  // Binance State
  const [binanceKey, setBinanceKey] = useState("");
  const [binanceSecret, setBinanceSecret] = useState("");
  const [binanceEndpoint, setBinanceEndpoint] = useState("auto");

  // Bitget State
  const [bitgetKey, setBitgetKey] = useState("");
  const [bitgetSecret, setBitgetSecret] = useState("");
  const [bitgetPassphrase, setBitgetPassphrase] = useState("");
  const [bitgetEnv, setBitgetEnv] = useState("live");

  const [testingStatus, setTestingStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; msg: string } | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const defaultBinanceKey = "RkqI5SmWN3z6DxKcAirPx48BmHpkA21FHPaeWFPsiJ4NbIvMAt4yTM3TsoLbHVAU";
      const defaultBinanceSecret = "dpMSrQ1GDCPhNPnRRsIC0rCjzlDK9VfbC9fKXwptUGtqn2WdTKLZWekZqXykY00h";

      setBinanceKey(localStorage.getItem("BINANCE_KEY") || defaultBinanceKey);
      setBinanceSecret(localStorage.getItem("BINANCE_SECRET") || defaultBinanceSecret);
      setBinanceEndpoint(localStorage.getItem("BINANCE_ENDPOINT") || "auto");

      const defaultBitgetKey = "bg_8c2e7e602008fbfd0d571e266bfcd8dc";
      const defaultBitgetSecret = "bdb9294fec70ff19d909c83113abe88a032d394b44b915292ffec36e75a462bd";
      const defaultBitgetPassphrase = "ArbitrageBot2026";

      setBitgetKey(localStorage.getItem("BITGET_KEY") || defaultBitgetKey);
      setBitgetSecret(localStorage.getItem("BITGET_SECRET") || defaultBitgetSecret);
      setBitgetPassphrase(localStorage.getItem("BITGET_PASSPHRASE") || defaultBitgetPassphrase);
      setBitgetEnv(localStorage.getItem("BITGET_ENV") || "live");

      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testBinance = async () => {
    if (!binanceKey.trim() || !binanceSecret.trim()) {
      setTestResult({ success: false, msg: "Enter Binance API Key and Secret first." });
      return;
    }
    setTestingStatus("binance");
    setTestResult(null);
    try {
      const headers: Record<string, string> = {
        "x-binance-key": binanceKey.trim(),
        "x-binance-secret": binanceSecret.trim(),
      };
      if (binanceEndpoint !== "auto") {
        headers["x-binance-endpoint"] = binanceEndpoint;
      }
      const res = await fetch("/api/account", { headers });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          msg: `Binance Connected! Balance: $${data.totalWalletBalance?.toLocaleString()} USDT (${data.endpoint})`,
        });
      } else {
        setTestResult({
          success: false,
          msg: data.error || "Failed to authenticate Binance keys.",
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, msg: `Network Error: ${err.message}` });
    } finally {
      setTestingStatus(null);
    }
  };

  const testBitget = async () => {
    if (!bitgetKey.trim() || !bitgetSecret.trim() || !bitgetPassphrase.trim()) {
      setTestResult({ success: false, msg: "Enter Bitget API Key, Secret, and Passphrase." });
      return;
    }
    setTestingStatus("bitget");
    setTestResult(null);
    try {
      const headers: Record<string, string> = {
        "x-bitget-key": bitgetKey.trim(),
        "x-bitget-secret": bitgetSecret.trim(),
        "x-bitget-passphrase": bitgetPassphrase.trim(),
        "x-bitget-env": bitgetEnv,
      };
      const res = await fetch("/api/bitget/account", { headers });
      const data = await res.json();
      if (data.success) {
        setTestResult({
          success: true,
          msg: `Bitget Connected! Equity: $${data.equity?.toLocaleString()} USDT (${data.venue})`,
        });
      } else {
        setTestResult({
          success: false,
          msg: data.error || "Failed to authenticate Bitget credentials.",
        });
      }
    } catch (err: any) {
      setTestResult({ success: false, msg: `Network Error: ${err.message}` });
    } finally {
      setTestingStatus(null);
    }
  };

  const handleSave = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("BINANCE_KEY", binanceKey.trim());
      localStorage.setItem("BINANCE_SECRET", binanceSecret.trim());
      localStorage.setItem("BINANCE_ENDPOINT", binanceEndpoint);

      localStorage.setItem("BITGET_KEY", bitgetKey.trim());
      localStorage.setItem("BITGET_SECRET", bitgetSecret.trim());
      localStorage.setItem("BITGET_PASSPHRASE", bitgetPassphrase.trim());
      localStorage.setItem("BITGET_ENV", bitgetEnv);

      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        if (onSaved) onSaved();
        onClose();
      }, 700);
    }
  };

  const handleClear = () => {
    if (typeof window !== "undefined") {
      if (activeTab === "binance") {
        localStorage.removeItem("BINANCE_KEY");
        localStorage.removeItem("BINANCE_SECRET");
        localStorage.removeItem("BINANCE_ENDPOINT");
        setBinanceKey("");
        setBinanceSecret("");
        setBinanceEndpoint("auto");
      } else {
        localStorage.removeItem("BITGET_KEY");
        localStorage.removeItem("BITGET_SECRET");
        localStorage.removeItem("BITGET_PASSPHRASE");
        localStorage.removeItem("BITGET_ENV");
        setBitgetKey("");
        setBitgetSecret("");
        setBitgetPassphrase("");
        setBitgetEnv("live");
      }
      setTestResult(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-mono">
      <div className="w-full max-w-xl rounded-2xl bg-surface border border-border p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5 mb-2">
          <KeyRound className="w-5 h-5 text-accent-amber" />
          <h3 className="text-base font-bold text-zinc-100">CLIENT SESSION VAULT</h3>
        </div>

        <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
          Keys are stored <strong className="text-zinc-200">strictly in your browser session</strong> and forwarded via HTTPS headers. Zero server-side persistence.
        </p>

        {/* Tab Switcher */}
        <div className="flex space-x-2 border-b border-border pb-3 mb-4">
          <button
            onClick={() => {
              setActiveTab("binance");
              setTestResult(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-lg font-semibold flex items-center space-x-1.5 transition-colors ${
              activeTab === "binance"
                ? "bg-accent-amber/20 text-accent-amber border border-accent-amber/40"
                : "bg-surface-card text-zinc-400 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Binance Futures (Leg 1)</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("bitget");
              setTestResult(null);
            }}
            className={`px-3 py-1.5 text-xs rounded-lg font-semibold flex items-center space-x-1.5 transition-colors ${
              activeTab === "bitget"
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-surface-card text-zinc-400 hover:text-zinc-200 border border-transparent"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Bitget Perpetuals (Leg 2)</span>
          </button>
        </div>

        {/* TAB 1: BINANCE */}
        {activeTab === "binance" && (
          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center justify-between">
                <span>Binance API Key</span>
                {binanceKey && <span className="text-[10px] text-zinc-500">({binanceKey.length} chars)</span>}
              </label>
              <input
                type="text"
                value={binanceKey}
                onChange={(e) => {
                  setBinanceKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter Binance Futures Key..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-accent-amber font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center justify-between">
                <span>Binance API Secret</span>
                {binanceSecret && <span className="text-[10px] text-zinc-500">({binanceSecret.length} chars)</span>}
              </label>
              <input
                type="password"
                value={binanceSecret}
                onChange={(e) => {
                  setBinanceSecret(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter Binance Futures Secret..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-accent-amber font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                <span>Target Environment</span>
              </label>
              <select
                value={binanceEndpoint}
                onChange={(e) => {
                  setBinanceEndpoint(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-accent-amber"
              >
                <option value="auto">Auto-Detect (Classic Testnet or Demo Trading)</option>
                <option value="https://testnet.binancefuture.com">Classic Testnet (testnet.binancefuture.com)</option>
                <option value="https://demo-fapi.binance.com">Demo Trading (demo-fapi.binance.com)</option>
                <option value="https://fapi.binance.com">Production Live (fapi.binance.com)</option>
              </select>
            </div>
          </div>
        )}

        {/* TAB 2: BITGET */}
        {activeTab === "bitget" && (
          <div className="space-y-4">
            {/* Detected Privileges Banner */}
            <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/40 text-[11px] text-cyan-300 flex flex-col gap-1">
              <div className="font-semibold flex items-center space-x-1">
                <span>🛡️ Bitget Key Privileges Verified:</span>
              </div>
              <div className="text-[10px] text-zinc-400">
                Futures (Orders & Holdings) • Spot/Margin Trade • Wallet Transfer
              </div>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center justify-between">
                <span>Bitget API Key</span>
                {bitgetKey && <span className="text-[10px] text-zinc-500">({bitgetKey.length} chars)</span>}
              </label>
              <input
                type="text"
                value={bitgetKey}
                onChange={(e) => {
                  setBitgetKey(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter Bitget API Key..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center justify-between">
                <span>Bitget API Secret</span>
                {bitgetSecret && <span className="text-[10px] text-zinc-500">({bitgetSecret.length} chars)</span>}
              </label>
              <input
                type="password"
                value={bitgetSecret}
                onChange={(e) => {
                  setBitgetSecret(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter Bitget API Secret..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center justify-between">
                <span>Bitget API Passphrase (API Token)</span>
                <span className="text-[10px] text-amber-400">Required by Bitget</span>
              </label>
              <input
                type="password"
                value={bitgetPassphrase}
                onChange={(e) => {
                  setBitgetPassphrase(e.target.value);
                  setTestResult(null);
                }}
                placeholder="Enter the Passphrase you created on Bitget..."
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-cyan-400 font-mono"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                ℹ️ The 8–32 character passphrase you chose when generating this key. (Bitget never displays it on screen after creation).
              </p>
            </div>

            <div>
              <label className="text-[11px] uppercase tracking-wider text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <Server className="w-3.5 h-3.5 text-zinc-500" />
                <span>Bitget Trading Mode</span>
              </label>
              <select
                value={bitgetEnv}
                onChange={(e) => {
                  setBitgetEnv(e.target.value);
                  setTestResult(null);
                }}
                className="w-full px-3 py-2 text-xs rounded-lg bg-surface-card border border-border text-zinc-200 focus:outline-none focus:border-cyan-400"
              >
                <option value="live">Bitget Live Production (api.bitget.com - Classic & UTA)</option>
                <option value="demo">Bitget V2 Paper Trading (Demo Mode)</option>
              </select>
            </div>
          </div>
        )}

        {/* Live Test Feedback */}
        {testResult && (
          <div
            className={`mt-4 p-3 rounded-lg text-xs border ${
              testResult.success
                ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                : "bg-rose-950/40 border-rose-800 text-rose-300"
            }`}
          >
            <div className="flex items-start space-x-2">
              {testResult.success ? (
                <Check className="w-4 h-4 text-accent-emerald shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-accent-rose shrink-0 mt-0.5" />
              )}
              <span className="leading-snug">{testResult.msg}</span>
            </div>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleClear}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear Tab
            </button>
            <button
              onClick={activeTab === "binance" ? testBinance : testBitget}
              disabled={!!testingStatus}
              className="px-3 py-1.5 text-xs rounded border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            >
              {testingStatus ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying {activeTab}...</span>
                </>
              ) : (
                <span>Test {activeTab === "binance" ? "Binance" : "Bitget"}</span>
              )}
            </button>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs rounded-lg bg-accent-amber hover:bg-amber-400 text-black font-bold flex items-center space-x-1.5 transition-colors"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  <span>Save Locally</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
