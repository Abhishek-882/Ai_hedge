"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bot,
  Power,
  Play,
  Pause,
  Settings,
  Activity,
  ShieldCheck,
  Zap,
  ArrowRight,
  RefreshCw,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  DollarSign,
  Maximize2,
  XCircle,
  HelpCircle,
  Radio,
  Sparkles,
  Gauge,
  TrendingUp,
  Download,
  Trash2,
  Plus,
  Edit2,
  Lock,
  Unlock,
  FileText,
  Save,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import { formatCountdown } from "@/lib/settlementTime";

const BROWSER_VAULT_KEY = "ai_hedge_bot_vault_v1";

interface BotConfig {
  enabled: boolean;
  minSpreadBps: number;
  maxPriceDivergencePct: number;
  balanceAllocationPct: number;
  leverageMode: "MAX_PER_COIN" | "CUSTOM";
  customLeverage: number;
  maxSimultaneousHedges: number;
  maxMarginCapUsdt?: number;
  postSettlementWaitSeconds: number;
  closeMaxPriceDivergencePct: number;
  scanIntervalSeconds: number;
  timingMode?: "FUNDING_SNIPER_1M" | "CONTINUOUS_SPREAD";
}

interface ActiveBotHedge {
  id: string;
  symbol: string;
  direction: "SHORT_BINANCE_LONG_BITGET" | "LONG_BINANCE_SHORT_BITGET";
  quantity: string;
  notionalUsdt: number;
  binanceLeverage: number;
  bitgetLeverage: number;
  entrySpreadBps: number;
  entryBinancePrice: number;
  entryBitgetPrice: number;
  entryDivergencePct: number;
  entryTime: number;
  fundingSettlementTime: number;
  status: "ACTIVE" | "WAITING_PRICE_PARITY" | "CLOSING" | "CLOSED" | "FAILED_UNWOUND";
  pnl?: number;
}

interface BotLog {
  timestamp: string;
  message: string;
  level: "info" | "success" | "warn" | "error";
}

interface BotSetFile {
  id: string;
  fileName: string;
  name: string;
  description: string;
  config: BotConfig;
  contentText: string;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

interface BotInstance {
  id: string;
  name: string;
  activeSetFileName: string;
  enabled: boolean;
  maxMarginCapUsdt: number;
  config: BotConfig;
  flattenedCoinsBlacklist: string[];
  activeHedges: ActiveBotHedge[];
  completedHedges: ActiveBotHedge[];
  statusText: string;
  lastEvaluatedCandidate?: {
    symbol: string;
    spreadBps: number;
    divergencePct: number;
    secondsToFunding: number;
    qualified: boolean;
    reason: string;
  } | null;
  createdAt: number;
  updatedAt: number;
}

interface BotDaemonState {
  isRunning: boolean;
  runInBackgroundWhenClosed: boolean;
  startedAt: number;
  lastCycleAt: number;
  cyclesCompleted: number;
  uptimeSeconds: number;
  statusText: string;
  activeBotId: string;
  bots: BotInstance[];
  setFiles: BotSetFile[];
  logs: BotLog[];
  config?: BotConfig;
  activeHedges?: ActiveBotHedge[];
}

export default function AutoBotPanel() {
  const [daemon, setDaemon] = useState<BotDaemonState | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(true);

  // Modals & Panels
  const [isCreateBotModalOpen, setIsCreateBotModalOpen] = useState(false);
  const [isRenameBotModalOpen, setIsRenameBotModalOpen] = useState(false);
  const [isSaveSetModalOpen, setIsSaveSetModalOpen] = useState(false);
  const [isSetManagerOpen, setIsSetManagerOpen] = useState(false);

  // New Bot Form
  const [newBotName, setNewBotName] = useState("");
  const [newBotSetPreset, setNewBotSetPreset] = useState("conservative_5bps_sniper.set");
  const [newBotMarginCap, setNewBotMarginCap] = useState<number>(500);

  // Rename Bot Form
  const [renameBotName, setRenameBotName] = useState("");

  // Save Set File Form
  const [saveSetFileName, setSaveSetFileName] = useState("");
  const [saveSetName, setSaveSetName] = useState("");
  const [saveSetDescription, setSaveSetDescription] = useState("");

  // Manual Lock Symbol Form
  const [manualLockSymbol, setManualLockSymbol] = useState("");

  // Active Bot Form Config State
  const [minSpreadBps, setMinSpreadBps] = useState<number>(5.0);
  const [maxPriceDivergencePct, setMaxPriceDivergencePct] = useState<number>(0.03);
  const [balanceAllocationPct, setBalanceAllocationPct] = useState<number>(20);
  const [leverageMode, setLeverageMode] = useState<"MAX_PER_COIN" | "CUSTOM">("MAX_PER_COIN");
  const [customLeverage, setCustomLeverage] = useState<number>(50);
  const [maxSimultaneousHedges, setMaxSimultaneousHedges] = useState<number>(3);
  const [maxMarginCapUsdt, setMaxMarginCapUsdt] = useState<number>(500);
  const [closeMaxPriceDivergencePct, setCloseMaxPriceDivergencePct] = useState<number>(0.03);
  const [timingMode, setTimingMode] = useState<"FUNDING_SNIPER_1M" | "CONTINUOUS_SPREAD">("FUNDING_SNIPER_1M");
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [hudNotice, setHudNotice] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());

  const showToast = (msg: string) => {
    setHudNotice(msg);
    setTimeout(() => setHudNotice(null), 3500);
  };

  // Keep live countdown timer ticking
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeBot =
    daemon?.bots?.find((b) => b.id === daemon.activeBotId) ||
    daemon?.bots?.[0] ||
    null;

  const hasAttemptedVaultSyncRef = React.useRef<boolean>(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/daemon", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.daemon) {
        let serverDaemon = data.daemon;

        // Auto-restore from Browser Vault if server was reset to default
        if (!hasAttemptedVaultSyncRef.current && typeof window !== "undefined") {
          hasAttemptedVaultSyncRef.current = true;
          try {
            const rawVault = localStorage.getItem(BROWSER_VAULT_KEY);
            if (rawVault) {
              const vault = JSON.parse(rawVault);
              const isServerOnlyDefault =
                serverDaemon.bots?.length === 1 &&
                serverDaemon.bots[0].name === "Conservative Funding Sniper" &&
                (serverDaemon.bots[0].activeHedges?.length || 0) === 0;

              const clientHasCustom =
                Array.isArray(vault.bots) &&
                (vault.bots.length > 1 ||
                  vault.bots[0]?.name !== "Conservative Funding Sniper" ||
                  (Array.isArray(vault.setFiles) && vault.setFiles.length > 2));

              if (isServerOnlyDefault && clientHasCustom) {
                const restoreRes = await fetch("/api/bot/daemon", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "sync_restore_vault",
                    bots: vault.bots,
                    setFiles: vault.setFiles,
                    activeBotId: vault.activeBotId,
                  }),
                });
                const restoreData = await restoreRes.json();
                if (restoreData.success && restoreData.daemon) {
                  serverDaemon = restoreData.daemon;
                  showToast("🛡️ Browser Vault: Restored your saved bots & presets to server!");
                }
              }
            }
          } catch {}
        }

        // Always mirror current valid state into browser vault
        if (typeof window !== "undefined" && serverDaemon.bots && serverDaemon.bots.length > 0) {
          try {
            localStorage.setItem(
              BROWSER_VAULT_KEY,
              JSON.stringify({
                bots: serverDaemon.bots,
                setFiles: serverDaemon.setFiles || [],
                activeBotId: serverDaemon.activeBotId,
                savedAt: Date.now(),
              })
            );
          } catch {}
        }

        setDaemon(serverDaemon);
        const curBot =
          serverDaemon.bots?.find((b: any) => b.id === serverDaemon.activeBotId) ||
          serverDaemon.bots?.[0];

        if (curBot && !isConfigOpen) {
          setMinSpreadBps(curBot.config?.minSpreadBps ?? 5.0);
          setMaxPriceDivergencePct(curBot.config?.maxPriceDivergencePct ?? 0.03);
          setBalanceAllocationPct(curBot.config?.balanceAllocationPct ?? 20);
          setLeverageMode(curBot.config?.leverageMode ?? "MAX_PER_COIN");
          setCustomLeverage(curBot.config?.customLeverage ?? 50);
          setMaxSimultaneousHedges(curBot.config?.maxSimultaneousHedges ?? 3);
          setMaxMarginCapUsdt(curBot.maxMarginCapUsdt ?? curBot.config?.maxMarginCapUsdt ?? 500);
          setCloseMaxPriceDivergencePct(curBot.config?.closeMaxPriceDivergencePct ?? 0.03);
          setTimingMode(curBot.config?.timingMode ?? "FUNDING_SNIPER_1M");
        }
      }
    } catch {}
  }, [isConfigOpen]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Master Daemon Toggle
  const toggleMasterDaemon = async () => {
    if (!daemon) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_daemon" }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(data.daemon.isRunning ? "Master Daemon Running 24/7" : "Master Daemon Paused");
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  // Toggle specific bot
  const toggleActiveBot = async () => {
    if (!activeBot) return;
    setLoading(true);
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "toggle_bot",
          botId: activeBot.id,
          enabled: !activeBot.enabled,
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Bot "${activeBot.name}" is now ${!activeBot.enabled ? "ACTIVE" : "PAUSED"}`);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleSelectBot = async (botId: string) => {
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "select_active_bot", botId }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
      }
    } catch {}
  };

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim()) return;
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_bot",
          name: newBotName.trim(),
          setFileName: newBotSetPreset,
          maxMarginCapUsdt: newBotMarginCap,
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        setIsCreateBotModalOpen(false);
        setNewBotName("");
        showToast(`Created bot "${newBotName.trim()}" successfully!`);
      }
    } catch {}
  };

  const handleRenameBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot || !renameBotName.trim()) return;
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "edit_bot",
          botId: activeBot.id,
          updates: { name: renameBotName.trim() },
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        setIsRenameBotModalOpen(false);
        showToast(`Bot renamed to "${renameBotName.trim()}"`);
      }
    } catch {}
  };

  const handleDeleteBot = async (botId: string, botName: string) => {
    if ((daemon?.bots?.length ?? 0) <= 1) {
      showToast("Cannot delete the only bot instance.");
      return;
    }
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_bot", botId }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Deleted bot "${botName}"`);
      }
    } catch {}
  };

  const handleApplySetFile = async (fileName: string) => {
    if (!activeBot || !fileName) return;
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "apply_set_file",
          botId: activeBot.id,
          fileName,
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Loaded preset "${fileName}" into "${activeBot.name}"`);
      }
    } catch {}
  };

  const handleSaveSetFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot || !saveSetFileName.trim()) return;
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_set_file",
          botId: activeBot.id,
          fileName: saveSetFileName.trim(),
          name: saveSetName.trim() || saveSetFileName.trim(),
          description: saveSetDescription.trim() || "Custom user quantitative preset",
          config: {
            minSpreadBps,
            maxPriceDivergencePct,
            balanceAllocationPct,
            leverageMode,
            customLeverage,
            maxSimultaneousHedges,
            maxMarginCapUsdt,
            closeMaxPriceDivergencePct,
            timingMode,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        setIsSaveSetModalOpen(false);
        setSaveSetFileName("");
        setSaveSetName("");
        setSaveSetDescription("");
        showToast(`Saved Strategy Preset to disk!`);
      }
    } catch {}
  };

  const handleDeleteSetFile = async (fileName: string) => {
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_set_file", fileName }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Deleted preset file "${fileName}"`);
      }
    } catch {}
  };

  const handleDownloadSetFile = (fileName: string) => {
    window.open(`/api/bot/daemon?action=download_set_file&fileName=${encodeURIComponent(fileName)}`, "_blank");
  };

  const handleExportFleetBackup = () => {
    if (!daemon) return;
    const backupData = {
      version: 1,
      appName: "AI-Hedge Dual-Exchange Arbitrage",
      exportedAt: new Date().toISOString(),
      activeBotId: daemon.activeBotId,
      bots: daemon.bots,
      setFiles: daemon.setFiles,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai_hedge_fleet_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Downloaded full Fleet & Strategy Presets backup JSON!");
  };

  const handleImportFleetBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const parsed = JSON.parse(evt.target?.result as string);
        if (parsed && (Array.isArray(parsed.bots) || Array.isArray(parsed.setFiles))) {
          const res = await fetch("/api/bot/daemon", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync_restore_vault",
              bots: parsed.bots,
              setFiles: parsed.setFiles,
              activeBotId: parsed.activeBotId,
            }),
          });
          const data = await res.json();
          if (data.success && data.daemon) {
            setDaemon(data.daemon);
            try {
              localStorage.setItem(
                BROWSER_VAULT_KEY,
                JSON.stringify({
                  bots: data.daemon.bots,
                  setFiles: data.daemon.setFiles,
                  activeBotId: data.daemon.activeBotId,
                  savedAt: Date.now(),
                })
              );
            } catch {}
            showToast("Restored all bots and presets from backup!");
          }
        } else {
          showToast("Invalid backup JSON format.");
        }
      } catch {
        showToast("Failed to parse backup JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleResetBotMemory = async () => {
    if (!activeBot) return;
    if (!activeBot.flattenedCoinsBlacklist || activeBot.flattenedCoinsBlacklist.length === 0) {
      showToast(`Memory already clean! All coins eligible.`);
      return;
    }
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset_bot_memory", botId: activeBot.id }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Cleared all flatten memory locks for "${activeBot.name}"!`);
      }
    } catch {}
  };

  const handleManualLockCoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBot || !manualLockSymbol.trim()) return;
    const sym = manualLockSymbol.trim().toUpperCase();
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock_coin", symbol: sym, botId: activeBot.id }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        setManualLockSymbol("");
        showToast(`Locked ${sym} in bot "${activeBot.name}"`);
      }
    } catch {}
  };

  const handleUnlockCoin = async (symbol: string) => {
    if (!activeBot) return;
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unlock_coin", symbol, botId: activeBot.id }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast(`Unlocked ${symbol} for bot "${activeBot.name}"`);
      }
    } catch {}
  };

  const handleSaveConfig = async () => {
    if (!activeBot) return;
    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_config",
          botId: activeBot.id,
          config: {
            minSpreadBps,
            maxPriceDivergencePct,
            balanceAllocationPct,
            leverageMode,
            customLeverage,
            maxSimultaneousHedges,
            maxMarginCapUsdt,
            closeMaxPriceDivergencePct,
            timingMode,
          },
        }),
      });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemon(data.daemon);
        showToast("Bot settings saved & persisted to disk!");
      }
    } catch {
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleForceScan = async () => {
    try {
      await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "force_scan" }),
      });
      fetchStatus();
      showToast("Manual scan cycle triggered!");
    } catch {}
  };

  const handleForceCloseHedge = async (id: string, symbol: string) => {
    if (!activeBot) return;
    try {
      await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close_hedge", hedgeId: id, symbol, botId: activeBot.id }),
      });
      fetchStatus();
      showToast(`Force closed ${symbol} in bot "${activeBot.name}"`);
    } catch {}
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/bot/daemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_logs" }),
      });
      fetchStatus();
      showToast("Audit stream cleared");
    } catch {}
  };

  const isMasterRunning = Boolean(daemon?.isRunning);
  const isBotActive = Boolean(isMasterRunning && activeBot?.enabled);
  const topCandidate = activeBot?.lastEvaluatedCandidate;
  const currentSpread = topCandidate?.spreadBps || 0;
  const targetThreshold = activeBot?.config?.minSpreadBps || 5.0;
  const corridorPct = Math.min(100, Math.max(8, (currentSpread / 25) * 100));

  // Compute Margin Usage for active bot
  const currentBotMargin = (activeBot?.activeHedges || []).reduce((sum, h) => {
    const lev = h.binanceLeverage || 20;
    return sum + h.notionalUsdt / lev;
  }, 0);
  const botMarginCap = activeBot?.maxMarginCapUsdt || 500;
  const marginUsagePct = Math.min(100, (currentBotMargin / botMarginCap) * 100);

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-500 overflow-hidden font-mono p-4 sm:p-6 shadow-2xl ${
        isBotActive
          ? "border-emerald-500/40 bg-gradient-to-b from-zinc-950 via-zinc-900/90 to-zinc-950 shadow-emerald-500/10 ring-1 ring-emerald-500/20"
          : "border-border bg-surface"
      }`}
    >
      {/* Toast Notification Banner */}
      {hudNotice && (
        <div className="absolute top-3 right-4 z-50 bg-emerald-950/90 border border-emerald-500/60 text-emerald-200 text-xs px-3.5 py-1.5 rounded-lg shadow-xl shadow-emerald-950/50 flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span className="font-semibold">{hudNotice}</span>
        </div>
      )}

      {/* Radiant Ambient Spotlight */}
      <div
        className={`absolute -top-32 -right-32 w-96 h-96 rounded-full blur-[110px] pointer-events-none transition-opacity duration-700 ${
          isBotActive ? "bg-emerald-500/15 opacity-100" : "bg-zinc-700/10 opacity-40"
        }`}
      />
      <div
        className={`absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-[110px] pointer-events-none transition-opacity duration-700 ${
          isBotActive ? "bg-cyan-500/10 opacity-100" : "bg-zinc-700/5 opacity-20"
        }`}
      />

      {/* ─────────────────────────────────────────────────────────────
          1. MULTI-BOT TABBED ROSTER BAR
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-border/70 relative z-10">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto max-w-full py-1">
          {(daemon?.bots || []).map((bot) => {
            const isSelected = bot.id === (activeBot?.id || daemon?.activeBotId);
            const isRunning = isMasterRunning && bot.enabled;

            return (
              <div
                key={bot.id}
                className={`group flex items-center space-x-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-zinc-800 text-zinc-100 border-emerald-500/60 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30"
                    : "bg-surface-card hover:bg-zinc-800/60 text-zinc-400 border-border"
                }`}
                onClick={() => handleSelectBot(bot.id)}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isRunning ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"
                  }`}
                />
                <span className="font-bold tracking-tight">{bot.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 text-zinc-400 border border-zinc-800 font-mono">
                  {bot.activeHedges?.length || 0}/{bot.config?.maxSimultaneousHedges || 3}
                </span>

                {(daemon?.bots?.length ?? 0) > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteBot(bot.id, bot.name);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity p-0.5"
                    title={`Delete ${bot.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            onClick={() => {
              setNewBotName(`Bot ${(daemon?.bots?.length ?? 0) + 1}`);
              setIsCreateBotModalOpen(true);
            }}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-dashed border-zinc-700 hover:border-emerald-500/60 text-zinc-400 hover:text-emerald-400 text-xs font-bold transition-all bg-zinc-900/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>NEW BOT</span>
          </button>
        </div>

        {/* Global Master Daemon Switch & Vault Status */}
        <div className="flex items-center space-x-2">
          <span className="hidden md:inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-300 font-semibold" title="Roster and strategy presets persistently backed up in Browser Vault">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Vault Synced</span>
          </span>
          <span className="text-[11px] font-semibold text-zinc-400 hidden sm:inline">
            MASTER DAEMON 24/7:
          </span>
          <button
            onClick={toggleMasterDaemon}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1.5 border transition-all ${
              isMasterRunning
                ? "bg-emerald-950/80 text-emerald-300 border-emerald-600/80 shadow-sm shadow-emerald-500/20"
                : "bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            <span>{isMasterRunning ? "SERVER ON" : "SERVER PAUSED"}</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          2. ACTIVE BOT COCKPIT HEADER & SET FILE CONTROLS
          ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-border/80 relative z-10">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center space-x-2">
              <Bot className={`w-5 h-5 ${isBotActive ? "text-emerald-400" : "text-zinc-500"}`} />
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-zinc-100 flex items-center gap-2">
                <span>BOT: {activeBot?.name || "PRIMARY BOT"}</span>
                <button
                  onClick={() => {
                    setRenameBotName(activeBot?.name || "");
                    setIsRenameBotModalOpen(true);
                  }}
                  className="text-zinc-500 hover:text-accent-amber p-1 transition-colors"
                  title="Rename this bot"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </h2>
            </div>

            {/* Set File Badge & Quick Selector */}
            <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300">
              <FileText className="w-3.5 h-3.5 text-accent-cyan" />
              <span className="text-zinc-500 font-semibold text-[10px]">SET:</span>
              <select
                value={activeBot?.activeSetFileName || "conservative_5bps_sniper.set"}
                onChange={(e) => handleApplySetFile(e.target.value)}
                className="bg-transparent text-accent-cyan font-bold outline-none cursor-pointer pr-1"
              >
                {(daemon?.setFiles || []).map((sf) => (
                  <option key={sf.fileName} value={sf.fileName} className="bg-zinc-900 text-zinc-200">
                    {sf.name} ({sf.fileName})
                  </option>
                ))}
              </select>
            </div>

            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border tracking-wider transition-colors ${
                isBotActive
                  ? "bg-emerald-950/80 text-emerald-400 border-emerald-700/70 shadow-sm shadow-emerald-500/20"
                  : "bg-zinc-900 text-zinc-500 border-zinc-800"
              }`}
            >
              {isBotActive ? "ACTIVE (SCANNING)" : "PAUSED"}
            </span>
          </div>

          <p className="text-xs text-zinc-400 max-w-3xl leading-relaxed">
            Running preset <strong className="text-zinc-200">{activeBot?.activeSetFileName}</strong>.
            Target spread &ge;{targetThreshold} bps, parity tolerance &le;
            {activeBot?.config?.maxPriceDivergencePct ?? 0.03}%, mode:{" "}
            <span className="text-accent-amber font-semibold">
              {activeBot?.config?.timingMode === "CONTINUOUS_SPREAD" ? "Continuous Spread" : "Funding Sniper (<1m)"}
            </span>
            . Margin Cap: ${botMarginCap} USDT.
          </p>
        </div>

        {/* Set File Quick Buttons & Power Toggle */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <button
            onClick={() => {
              setSaveSetFileName(`${activeBot?.name?.toLowerCase().replace(/\s+/g, "_") || "strategy"}.set`);
              setSaveSetName(activeBot?.name || "Custom Preset");
              setIsSaveSetModalOpen(true);
            }}
            className="px-2.5 py-2 rounded-xl bg-surface-card hover:bg-zinc-800 border border-border text-xs text-zinc-300 font-semibold flex items-center space-x-1.5 transition-all"
            title="Save current bot parameters as a .set preset file"
          >
            <Save className="w-3.5 h-3.5 text-accent-amber" />
            <span className="hidden sm:inline">Save .set</span>
          </button>

          <button
            onClick={() => handleDownloadSetFile(activeBot?.activeSetFileName || "conservative_5bps_sniper.set")}
            className="px-2.5 py-2 rounded-xl bg-surface-card hover:bg-zinc-800 border border-border text-xs text-zinc-300 font-semibold flex items-center space-x-1.5 transition-all"
            title="Download MetaTrader-style key-value .set file"
          >
            <Download className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="hidden sm:inline">Download .set</span>
          </button>

          <button
            onClick={() => setIsSetManagerOpen(true)}
            className="px-2.5 py-2 rounded-xl bg-surface-card hover:bg-zinc-800 border border-border text-xs text-zinc-300 font-semibold flex items-center space-x-1.5 transition-all"
            title="Manage all .set presets"
          >
            <FolderOpen className="w-3.5 h-3.5 text-zinc-400" />
            <span className="hidden sm:inline">Presets</span>
          </button>

          <button
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              isConfigOpen
                ? "bg-amber-500/20 text-accent-amber border-amber-500/60"
                : "bg-surface-card hover:bg-zinc-800 border-border text-zinc-300"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Config</span>
            {isConfigOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          <button
            onClick={toggleActiveBot}
            disabled={loading}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all shadow-xl active:scale-95 ${
              isBotActive
                ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/60 ring-2 ring-rose-400/50"
                : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60 ring-2 ring-emerald-400/60"
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isBotActive ? "PAUSE THIS BOT" : "START THIS BOT"}</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. HARD MARGIN CAP ALLOCATION BAR
          ───────────────────────────────────────────────────────────── */}
      <div className="mt-3 p-3 rounded-xl bg-zinc-950/60 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <DollarSign className="w-4 h-4 text-emerald-400" />
          <div>
            <span className="text-zinc-400 font-semibold text-[11px]">HARD USDT MARGIN CAP:</span>
            <div className="font-bold text-zinc-200">
              ${currentBotMargin.toFixed(1)} / ${botMarginCap} USDT
              <span className="text-[10px] text-zinc-500 font-normal ml-1.5">
                ({marginUsagePct.toFixed(1)}% allocated across {activeBot?.activeHedges?.length || 0} hedges)
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 max-w-xs">
          <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800">
            <div
              className={`h-full transition-all duration-500 ${
                marginUsagePct > 90
                  ? "bg-rose-500"
                  : marginUsagePct > 60
                  ? "bg-amber-400"
                  : "bg-emerald-400"
              }`}
              style={{ width: `${marginUsagePct}%` }}
            />
          </div>
        </div>

        <button
          onClick={handleForceScan}
          disabled={!isBotActive}
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 font-semibold flex items-center space-x-1.5 self-start sm:self-auto disabled:opacity-40"
        >
          <RefreshCw className="w-3 h-3" />
          <span>FORCE SCAN</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. PER-BOT FLATTEN MEMORY LOCK INSPECTOR
          ───────────────────────────────────────────────────────────── */}
      <div className="mt-3 p-3.5 rounded-xl bg-zinc-950/80 border border-border/80 relative">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center space-x-2">
            <Lock className="w-3.5 h-3.5 text-accent-amber" />
            <span className="text-[11px] font-bold text-zinc-200 uppercase tracking-wide">
              FLATTEN MEMORY LOCK // COIN BLACKLIST
            </span>
            <span className="text-[10px] px-2 py-0.2 rounded-full bg-amber-500/10 text-accent-amber border border-amber-500/30 font-semibold">
              {activeBot?.flattenedCoinsBlacklist?.length || 0} LOCKED
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleManualLockCoin} className="flex items-center space-x-1">
              <input
                type="text"
                placeholder="SYMBOL (e.g. BTCUSDT)"
                value={manualLockSymbol}
                onChange={(e) => setManualLockSymbol(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-[10px] text-zinc-100 uppercase font-mono outline-none focus:border-amber-500 w-36"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[10px] font-bold"
              >
                + LOCK COIN
              </button>
            </form>

            <button
              onClick={handleResetBotMemory}
              className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 text-rose-300 text-[10px] font-bold flex items-center space-x-1 transition-all active:scale-95"
              title="Clear all memory locks for this bot"
            >
              <RefreshCw className="w-3 h-3" />
              <span>FORCE RESET BOT MEMORY</span>
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400 leading-relaxed mb-2.5">
          Coins flattened by this bot are permanently locked from autonomous re-entry to prevent repetitive churn, until unlocked individually or memory is force reset.
        </p>

        {(!activeBot?.flattenedCoinsBlacklist || activeBot.flattenedCoinsBlacklist.length === 0) ? (
          <div className="py-1 px-2.5 rounded-lg bg-zinc-900/60 border border-dashed border-zinc-800 text-[11px] text-emerald-400/90 flex items-center space-x-2 font-mono">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>All dual-exchange universe coins eligible. No memory locks active for &quot;{activeBot?.name}&quot;.</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {activeBot.flattenedCoinsBlacklist.map((coin) => (
              <span
                key={coin}
                className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-rose-950/30 border border-rose-800/50 text-rose-300 text-[11px] font-bold font-mono"
              >
                <span>{coin}</span>
                <button
                  onClick={() => handleUnlockCoin(coin)}
                  className="hover:text-rose-100 p-0.5"
                  title={`Unlock ${coin}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. OPPORTUNITY CORRIDOR RADAR
          ───────────────────────────────────────────────────────────── */}
      <div className="mt-4 p-3.5 rounded-xl bg-zinc-950/70 border border-border/80 space-y-2 relative">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Gauge className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="text-[11px] font-bold text-zinc-300 uppercase">
              LIVE OPPORTUNITY CORRIDOR RADAR ({activeBot?.name})
            </span>
            {topCandidate?.symbol && (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-accent-amber font-mono font-bold">
                {topCandidate.symbol}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-[10px] font-mono">
            <span className="text-zinc-500">
              ENTRY TRIGGER: <strong className="text-accent-amber">{targetThreshold} bps</strong>
            </span>
            <span className="text-zinc-500">
              CURRENT TOP: <strong className={currentSpread >= targetThreshold ? "text-emerald-400" : "text-zinc-300"}>{currentSpread.toFixed(1)} bps</strong>
            </span>
          </div>
        </div>

        <div className="w-full bg-zinc-900 rounded-full h-2.5 overflow-hidden border border-zinc-800 relative">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              currentSpread >= targetThreshold
                ? "bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-sm shadow-emerald-500/50"
                : "bg-gradient-to-r from-amber-500 to-amber-400"
            }`}
            style={{ width: `${corridorPct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[9px] text-zinc-500 uppercase">
          <span>0 bps (Flat)</span>
          <span className="text-accent-amber font-bold">Target &ge; {targetThreshold} bps Trigger</span>
          <span>15 bps (Prime)</span>
          <span>25+ bps (Extreme)</span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. TELEMETRY STATS GRID
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs font-mono">
        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>BOT STATUS</span>
            <Radio className={`w-3 h-3 ${isBotActive ? "text-emerald-400 animate-pulse" : "text-zinc-600"}`} />
          </div>
          <div className="font-bold text-zinc-200 truncate mt-1 text-[11px]">
            {activeBot?.statusText || "INITIALIZING..."}
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>ACTIVE HEDGES</span>
            <Layers className="w-3 h-3 text-accent-amber" />
          </div>
          <div className="flex items-center space-x-1.5 mt-1">
            <span className="font-bold text-accent-amber text-base">
              {activeBot?.activeHedges?.length ?? 0}
            </span>
            <span className="text-zinc-500 text-[10px]">
              / {activeBot?.config?.maxSimultaneousHedges ?? 3} MAX
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>TOTAL CYCLES</span>
            <Activity className="w-3 h-3 text-accent-cyan" />
          </div>
          <div className="font-bold text-zinc-200 mt-1">
            #{daemon?.cyclesCompleted ?? 0}
            <span className="text-[10px] text-zinc-500 font-normal ml-1">
              ({daemon?.uptimeSeconds ?? 0}s up)
            </span>
          </div>
        </div>

        <div className="bg-surface-card p-3 rounded-xl border border-border hover:border-zinc-700 transition-colors">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>TOP CANDIDATE</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-accent-amber font-mono font-bold">
              {activeBot?.config?.timingMode === "CONTINUOUS_SPREAD" ? "⚡ CONT" : "⏳ SNIPER"}
            </span>
          </div>
          <div className="font-bold text-zinc-200 mt-1 text-[11px] truncate">
            {topCandidate?.symbol ? (
              <div className="flex items-center space-x-1.5">
                <span
                  className={
                    topCandidate.qualified ? "text-emerald-400 font-bold" : "text-zinc-300 font-bold"
                  }
                >
                  {topCandidate.symbol}
                </span>
                <span className="text-zinc-500 text-[10px]">
                  ({topCandidate.spreadBps}bps · {topCandidate.divergencePct}% div)
                </span>
              </div>
            ) : (
              <span className="text-zinc-500">Scanning pairs...</span>
            )}
          </div>
          {topCandidate && (
            <div
              className={`text-[9px] mt-1 truncate ${
                topCandidate.reason?.includes("[LOCKED IN MEMORY]")
                  ? "text-rose-400 font-bold"
                  : "text-zinc-400"
              }`}
              title={topCandidate.reason}
            >
              {topCandidate.reason}
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          7. CONFIGURATION DRAWER (PER-BOT)
          ───────────────────────────────────────────────────────────── */}
      {isConfigOpen && (
        <div className="mt-4 p-4 rounded-xl bg-surface-card border border-border/80 space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-2">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-accent-amber" />
              <span className="text-xs font-black uppercase text-zinc-200">
                BOT PARAMETERS: {activeBot?.name}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400">
              Active Strategy Set: <strong>{activeBot?.activeSetFileName}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            {/* Timing Mode */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                EXECUTION TIMING MODE
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTimingMode("FUNDING_SNIPER_1M")}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                    timingMode === "FUNDING_SNIPER_1M"
                      ? "bg-amber-500/20 text-accent-amber border-amber-500/60 shadow-sm"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  ⏳ Funding Sniper (&lt;1m)
                </button>
                <button
                  type="button"
                  onClick={() => setTimingMode("CONTINUOUS_SPREAD")}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                    timingMode === "CONTINUOUS_SPREAD"
                      ? "bg-cyan-500/20 text-accent-cyan border-cyan-500/60 shadow-sm"
                      : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  ⚡ Continuous Spread
                </button>
              </div>
            </div>

            {/* Min Spread */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                MIN SPREAD THRESHOLD (BPS)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="50"
                value={minSpreadBps}
                onChange={(e) => setMinSpreadBps(parseFloat(e.target.value) || 5.0)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-500 outline-none"
              />
            </div>

            {/* Price Divergence Tolerance */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                PRICE PARITY TOLERANCE (%)
              </label>
              <input
                type="number"
                step="0.005"
                min="0.005"
                max="1.0"
                value={maxPriceDivergencePct}
                onChange={(e) => setMaxPriceDivergencePct(parseFloat(e.target.value) || 0.03)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-500 outline-none"
              />
              <div className="flex gap-1 pt-1">
                {[0.01, 0.02, 0.03, 0.05, 0.1].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setMaxPriceDivergencePct(pct)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${
                      maxPriceDivergencePct === pct
                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/60"
                        : "bg-zinc-900 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            {/* Hard Margin Cap */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                HARD MARGIN CAP (USDT)
              </label>
              <input
                type="number"
                step="50"
                min="50"
                max="100000"
                value={maxMarginCapUsdt}
                onChange={(e) => setMaxMarginCapUsdt(parseFloat(e.target.value) || 500)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-500 outline-none"
              />
              <p className="text-[9px] text-zinc-500">
                Pauses new entries for this bot if margin reaches ceiling.
              </p>
            </div>

            {/* Balance Allocation */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                BALANCE ALLOCATION (% PER HEDGE)
              </label>
              <input
                type="number"
                step="5"
                min="5"
                max="50"
                value={balanceAllocationPct}
                onChange={(e) => setBalanceAllocationPct(parseFloat(e.target.value) || 20)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-500 outline-none"
              />
            </div>

            {/* Max Concurrent Hedges */}
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-semibold block uppercase">
                MAX SIMULTANEOUS HEDGES
              </label>
              <input
                type="number"
                step="1"
                min="1"
                max="10"
                value={maxSimultaneousHedges}
                onChange={(e) => setMaxSimultaneousHedges(parseInt(e.target.value, 10) || 3)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-100 text-xs focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={handleSaveConfig}
              disabled={isSavingConfig}
              className="px-6 py-2.5 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-black text-xs flex items-center space-x-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSavingConfig ? "SAVING..." : "SAVE BOT CONFIGURATION"}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          8. ACTIVE HEDGES (PER-BOT)
          ───────────────────────────────────────────────────────────── */}
      <div className="mt-5 pt-4 border-t border-border/80">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-accent-amber" />
            <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
              ACTIVE HEDGES: {activeBot?.name} ({activeBot?.activeHedges?.length ?? 0} /{" "}
              {activeBot?.config?.maxSimultaneousHedges ?? 3})
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Unwinds automatically on basis convergence
          </span>
        </div>

        {(!activeBot?.activeHedges || activeBot.activeHedges.length === 0) ? (
          <div className="p-5 rounded-xl bg-surface-card border border-border/80 text-center text-xs text-zinc-400 space-y-1.5">
            <div className="font-bold text-zinc-300">NO ACTIVE HEDGES IN THIS BOT</div>
            <p className="text-[11px] text-zinc-500 max-w-xl mx-auto">
              {isBotActive
                ? `Bot "${activeBot?.name}" is actively scanning opportunities matching preset ${activeBot?.activeSetFileName}. Hedges will trigger automatically.`
                : `Bot is currently paused. Click "START THIS BOT" above to begin autonomous execution.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {activeBot.activeHedges.map((hedge) => {
              const diffMs = hedge.fundingSettlementTime - nowMs;
              const hasSettled = diffMs <= 0;
              const isWaitingParity = hedge.status === "WAITING_PRICE_PARITY";

              return (
                <div
                  key={hedge.id}
                  className={`p-4 rounded-xl border text-xs space-y-2.5 relative transition-all duration-300 ${
                    isWaitingParity
                      ? "bg-amber-950/20 border-accent-amber/70 shadow-lg shadow-amber-500/10"
                      : "bg-surface-card border-border hover:border-zinc-700"
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-zinc-100 text-sm tracking-tight">{hedge.symbol}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-accent-amber border border-amber-500/30 font-semibold">
                        {hedge.direction === "SHORT_BINANCE_LONG_BITGET"
                          ? "Short BN / Long BG"
                          : "Long BN / Short BG"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleForceCloseHedge(hedge.id, hedge.symbol)}
                      className="text-rose-400 hover:text-rose-200 text-[10px] font-bold px-2 py-1 rounded-lg border border-rose-800/60 bg-rose-950/40 active:scale-95 transition-all"
                      title="Force immediate dual-close"
                    >
                      FORCE CLOSE
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[11px] font-mono">
                    <div>
                      <div className="text-zinc-500 text-[9px]">SIZE &amp; NOTIONAL</div>
                      <div className="font-bold text-zinc-200">
                        {hedge.quantity} (${hedge.notionalUsdt} USDT)
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">ENTRY SPREAD</div>
                      <div className="font-bold text-accent-amber">
                        {hedge.entrySpreadBps} bps ({hedge.entryDivergencePct}% div)
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">LEVERAGE</div>
                      <div className="font-bold text-zinc-300">
                        BN: {hedge.binanceLeverage}x / BG: {hedge.bitgetLeverage}x
                      </div>
                    </div>
                    <div>
                      <div className="text-zinc-500 text-[9px]">SETTLEMENT COUNTDOWN</div>
                      <div
                        className={`font-bold ${
                          hasSettled ? "text-emerald-400 animate-pulse" : "text-cyan-400"
                        }`}
                      >
                        {hasSettled ? "SETTLED ✓" : formatCountdown(hedge.fundingSettlementTime, nowMs)}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-semibold">Status:</span>
                    <span
                      className={`font-black uppercase tracking-wider ${
                        isWaitingParity
                          ? "text-accent-amber animate-pulse"
                          : hasSettled
                          ? "text-accent-emerald"
                          : "text-accent-cyan"
                      }`}
                    >
                      {isWaitingParity
                        ? "WAITING FOR PRICE PARITY TO CLOSE"
                        : hasSettled
                        ? "FEE SETTLING..."
                        : "HARVESTING FUNDING"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          9. 24/7 AUDIT STREAM
          ───────────────────────────────────────────────────────────── */}
      <div className="mt-5 pt-3.5 border-t border-border/80">
        <div className="w-full flex flex-wrap items-center justify-between text-xs text-zinc-400 py-1 gap-2">
          <button
            onClick={() => setIsLogsOpen(!isLogsOpen)}
            className="flex items-center space-x-2 text-zinc-300 hover:text-zinc-100 transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-accent-cyan" />
            <span className="font-bold uppercase">24/7 AUTONOMOUS BOT AUDIT STREAM</span>
            <span className="text-[10px] text-zinc-500 font-normal">
              ({daemon?.logs?.length ?? 0} events)
            </span>
            {isLogsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center space-x-2 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-800/40 text-emerald-400 font-mono flex items-center gap-1 font-semibold">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              AUTO-SAVED TO DISK
            </span>

            <a
              href="/api/bot/logs?download=1"
              download
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-semibold transition-colors flex items-center gap-1"
              title="Download persistent audit stream for diagnosis"
            >
              <Download className="w-3 h-3 text-accent-cyan" />
              <span>DOWNLOAD LOGS</span>
            </a>

            <button
              onClick={handleClearLogs}
              className="px-2 py-1 rounded bg-zinc-850 hover:bg-rose-950/60 hover:text-rose-300 border border-zinc-700 text-zinc-400 transition-colors flex items-center gap-1"
              title="Clear log stream view"
            >
              <Trash2 className="w-3 h-3" />
              <span>CLEAR</span>
            </button>
          </div>
        </div>

        {isLogsOpen && (
          <div className="mt-2.5 bg-zinc-950 p-3.5 rounded-xl border border-border/80 font-mono text-[11px] max-h-52 overflow-y-auto space-y-1.5 scrollbar-thin shadow-inner">
            {(!daemon?.logs || daemon.logs.length === 0) ? (
              <div className="text-zinc-600 text-center py-2">No log entries recorded yet.</div>
            ) : (
              daemon.logs.map((log, i) => {
                let badgeClass = "text-zinc-400";
                if (log.level === "success") badgeClass = "text-emerald-400 font-bold";
                else if (log.level === "warn") badgeClass = "text-amber-400";
                else if (log.level === "error") badgeClass = "text-rose-400 font-bold";

                return (
                  <div key={i} className="flex items-start space-x-2.5 py-0.5">
                    <span className="text-zinc-600 shrink-0 text-[10px]">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={badgeClass}>{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          10. MODALS: NEW BOT, RENAME BOT, SAVE SET, SET PRESET MANAGER
          ───────────────────────────────────────────────────────────── */}

      {/* Modal: New Bot */}
      {isCreateBotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-sm text-zinc-100">CREATE NEW TRADING BOT</h3>
              </div>
              <button onClick={() => setIsCreateBotModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBot} className="space-y-3.5 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">BOT NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Continuous High-Yield Hunter"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">INITIAL STRATEGY PRESET (.SET)</label>
                <select
                  value={newBotSetPreset}
                  onChange={(e) => setNewBotSetPreset(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                >
                  {(daemon?.setFiles || []).map((sf) => (
                    <option key={sf.fileName} value={sf.fileName}>
                      {sf.name} ({sf.fileName})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">HARD MARGIN CAP (USDT)</label>
                <input
                  type="number"
                  min="50"
                  max="100000"
                  step="50"
                  value={newBotMarginCap}
                  onChange={(e) => setNewBotMarginCap(parseFloat(e.target.value) || 500)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateBotModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/50"
                >
                  Create Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rename Bot */}
      {isRenameBotModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="font-bold text-sm text-zinc-100">RENAME BOT</h3>
              <button onClick={() => setIsRenameBotModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRenameBot} className="space-y-3.5 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">NEW BOT NAME</label>
                <input
                  type="text"
                  required
                  value={renameBotName}
                  onChange={(e) => setRenameBotName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenameBotModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold"
                >
                  Save Name
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Save As .set File */}
      {isSaveSetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2">
                <Save className="w-5 h-5 text-accent-cyan" />
                <h3 className="font-bold text-sm text-zinc-100">SAVE STRATEGY SET FILE (.SET)</h3>
              </div>
              <button onClick={() => setIsSaveSetModalOpen(false)} className="text-zinc-400 hover:text-zinc-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSetFile} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">FILE NAME (.set)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. aggressive_scalper_5bps.set"
                  value={saveSetFileName}
                  onChange={(e) => setSaveSetFileName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">DISPLAY NAME</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aggressive Scalper 5bps"
                  value={saveSetName}
                  onChange={(e) => setSaveSetName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1 font-semibold">DESCRIPTION</label>
                <textarea
                  rows={2}
                  placeholder="Describe strategy setup or timing conditions"
                  value={saveSetDescription}
                  onChange={(e) => setSaveSetDescription(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSaveSetModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 font-semibold hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold shadow-lg shadow-cyan-900/50"
                >
                  Save Preset (.set)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Presets Library Manager */}
      {isSetManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#101014] border border-zinc-800 rounded-xl p-5 max-w-2xl w-full space-y-4 shadow-2xl max-h-[85vh] flex flex-col font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <FolderOpen className="w-4 h-4 text-accent-amber" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-zinc-100">
                    Strategy Presets (.set)
                  </h3>
                </div>
                <p className="text-[10px] text-zinc-500">
                  Target Bot: <strong className="text-zinc-300">{activeBot?.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsSetManagerOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-2 pr-1">
              {(daemon?.setFiles || []).map((sf) => {
                const isCurrentBotActive = activeBot?.activeSetFileName?.toLowerCase() === sf.fileName?.toLowerCase();

                return (
                  <div
                    key={sf.fileName}
                    className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                      isCurrentBotActive
                        ? "bg-amber-500/5 border-amber-500/30"
                        : "bg-zinc-950/80 border-zinc-800/90 hover:border-zinc-700"
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-zinc-100 text-xs">{sf.name}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                          {sf.fileName}
                        </span>
                        {sf.isBuiltIn && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700 font-semibold">
                            Built-in
                          </span>
                        )}
                        {isCurrentBotActive && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-accent-amber border border-amber-500/30 font-bold">
                            Active
                          </span>
                        )}
                      </div>

                      {/* Compact parameters chips */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-400">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                          Spread: &ge;{sf.config?.minSpreadBps} bps
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                          Parity: &le;{sf.config?.maxPriceDivergencePct}%
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800">
                          Cap: ${sf.config?.maxMarginCapUsdt || 500}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-cyan-400">
                          {sf.config?.timingMode === "CONTINUOUS_SPREAD" ? "Continuous" : "Sniper"}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-1.5 shrink-0 self-end sm:self-center">
                      {isCurrentBotActive ? (
                        <span className="px-3 py-1.5 rounded-lg bg-zinc-900 text-accent-amber border border-amber-500/30 font-bold text-[11px]">
                          Loaded ✓
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            handleApplySetFile(sf.fileName);
                            setIsSetManagerOpen(false);
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-[11px] transition-all active:scale-95 shadow-sm"
                        >
                          Load
                        </button>
                      )}

                      <button
                        onClick={() => handleDownloadSetFile(sf.fileName)}
                        className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 hover:border-zinc-700 transition-colors"
                        title="Download .set file"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      {!sf.isBuiltIn && (
                        <button
                          onClick={() => handleDeleteSetFile(sf.fileName)}
                          className="p-1.5 rounded-lg bg-zinc-900 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-800/60 transition-colors"
                          title="Delete custom preset"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleExportFleetBackup}
                  className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-accent-cyan border border-zinc-800 text-xs font-semibold flex items-center space-x-1.5 transition-all"
                  title="Export full backup JSON containing all bots and custom presets"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Fleet (.json)</span>
                </button>
                <label className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-accent-amber border border-zinc-800 text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import Backup</span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportFleetBackup}
                    className="hidden"
                  />
                </label>
              </div>
              <button
                onClick={() => setIsSetManagerOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
