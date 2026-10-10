"use client";

import React, { useState, useEffect } from "react";
import { Server, Activity } from "lucide-react";

interface ServerDaemonIndicatorProps {
  onOpenProfile: () => void;
}

export default function ServerDaemonIndicator({ onOpenProfile }: ServerDaemonIndicatorProps) {
  const [daemonState, setDaemonState] = useState<{
    isRunning: boolean;
    uptimeSeconds: number;
    cyclesCompleted: number;
  }>({
    isRunning: true,
    uptimeSeconds: 0,
    cyclesCompleted: 0,
  });

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/bot/daemon", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.daemon) {
        setDaemonState({
          isRunning: data.daemon.isRunning,
          uptimeSeconds: data.daemon.uptimeSeconds || 0,
          cyclesCompleted: data.daemon.cyclesCompleted || 0,
        });
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = () => {
    const el = document.getElementById("auto-bot-panel-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    } else {
      onOpenProfile();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg border text-[11px] font-mono transition-colors ${
        daemonState.isRunning
          ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/60 hover:bg-emerald-900/40"
          : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:bg-zinc-850"
      }`}
      title="Click to manage 24/7 Server Autonomous Bot"
    >
      <span className="relative flex h-2 w-2">
        {daemonState.isRunning && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            daemonState.isRunning ? "bg-emerald-500" : "bg-zinc-500"
          }`}
        ></span>
      </span>
      <Server className="w-3.5 h-3.5 text-zinc-400" />
      <span className="font-semibold hidden sm:inline">SERVER BOT:</span>
      <span className="font-bold">
        {daemonState.isRunning ? "24/7 ACTIVE" : "PAUSED"}
      </span>
      {daemonState.isRunning && daemonState.cyclesCompleted > 0 && (
        <span className="text-[9px] text-zinc-500 hidden md:inline">
          #{daemonState.cyclesCompleted}
        </span>
      )}
    </button>
  );
}
