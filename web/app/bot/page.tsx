"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import AutoBotPanel from "@/components/AutoBotPanel";
import ServerDaemonIndicator from "@/components/ServerDaemonIndicator";
import SettingsModal from "@/components/SettingsModal";
import UserProfileModal from "@/components/UserProfileModal";
import { Bot, ArrowLeft, RefreshCw, KeyRound, User, Terminal, Activity, ShieldCheck } from "lucide-react";

export default function AutoBotPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background text-zinc-100 flex flex-col font-mono">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center space-x-3 text-zinc-400 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-accent-amber" />
            <span>Verifying autonomous daemon authorization...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-zinc-100 flex flex-col font-mono selection:bg-accent-amber/20 selection:text-accent-amber">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-8 pb-24 sm:pb-8 space-y-6">
        {/* Top Header Bar */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center space-x-2 text-xs text-zinc-500 mb-1">
              <Link href="/terminal" className="hover:text-accent-amber transition-colors flex items-center space-x-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Trading Terminal</span>
              </Link>
              <span>/</span>
              <span className="text-zinc-300 font-semibold">24/7 Autonomous Daemon</span>
            </div>
            <div className="flex items-center space-x-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-amber animate-pulse shrink-0" />
              <h1 className="text-base sm:text-lg md:text-xl font-bold tracking-tight uppercase text-zinc-100 flex items-center space-x-2">
                <Bot className="w-5 h-5 text-accent-amber" />
                <span>24/7 SERVER AUTONOMOUS ARBITRAGE BOT</span>
              </h1>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              High-Frequency Multi-Coin Scanner • Sub-Second Opportunity Sniping • Continuous Margin Governance
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-between sm:justify-start">
            <ServerDaemonIndicator onOpenProfile={() => setIsProfileOpen(true)} />

            <Link
              href="/terminal"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
            >
              <Terminal className="w-3.5 h-3.5 text-accent-amber" />
              <span>Cockpit</span>
            </Link>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-surface hover:bg-zinc-800 border border-border text-xs text-zinc-300 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5 text-accent-amber" />
              <span>Vault</span>
            </button>
          </div>
        </header>

        {/* Full Autonomous Arbitrage Bot Cockpit */}
        <div className="w-full">
          <AutoBotPanel />
        </div>
      </main>

      <Footer />

      {/* Settings Modal (Client Session Vault) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSaved={() => {}}
      />

      {/* Institutional User Profile & Bot Settings Modal */}
      <UserProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />
    </div>
  );
}
