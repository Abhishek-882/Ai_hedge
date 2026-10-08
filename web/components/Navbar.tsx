"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck, User, LogOut, Terminal, History, Home, Lock, Sparkles } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ email: string; role: string; username: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAuth = async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      const data = await res.json();
      if (data.success && data.isLoggedIn && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuth();
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      setUser(null);
      router.push("/login");
    } catch {
      router.push("/login");
    }
  };

  const navLinks = [
    { href: "/", label: "Intro", icon: Home },
    { href: "/terminal", label: "Cockpit", icon: Terminal },
    { href: "/history", label: "History", icon: History },
    { href: "/profile", label: "Profile", icon: User },
  ];

  return (
    <nav className="w-full bg-[#0d0d10]/95 backdrop-blur-md border-b border-border sticky top-0 z-50 font-mono">
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-14 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link href="/" className="flex items-center space-x-2.5 group">
          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-accent-amber font-bold text-xs group-hover:border-amber-400 transition-colors">
            Δ
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-wider text-zinc-100 uppercase group-hover:text-accent-amber transition-colors">
              AI-HEDGE // QUANT
            </span>
            <span className="text-[9px] text-zinc-500 font-normal">
              Delta-Neutral Arbitrage
            </span>
          </div>
        </Link>

        {/* Center Nav Links */}
        <div className="hidden sm:flex items-center space-x-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? "bg-zinc-800 text-accent-amber border border-zinc-700 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-accent-amber" : "text-zinc-500"}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right Auth & Profile Bar */}
        <div className="flex items-center space-x-2.5">
          {!loading && user ? (
            <div className="flex items-center space-x-2">
              <Link
                href="/profile"
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  user.role === "admin"
                    ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                    : "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
                <span className="font-semibold text-[11px]">
                  {user.role === "admin" ? "Admin" : user.username || "Trader"}
                </span>
                <span className="text-[10px] text-zinc-400 opacity-80 hidden md:inline">
                  ({user.role === "admin" ? "Master Key" : "Custom Keys"})
                </span>
              </Link>

              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg bg-surface hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 border border-border hover:border-rose-900/40 text-xs transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : !loading ? (
            <Link
              href="/login"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-accent-amber hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-colors shadow-sm"
            >
              <Lock className="w-3 h-3" />
              <span>Sign In / Join</span>
            </Link>
          ) : null}
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      <div className="sm:hidden flex items-center justify-around border-t border-border/60 py-1 bg-surface px-2">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center space-x-1 py-1 px-2 text-[11px] rounded ${
                isActive ? "text-accent-amber font-bold" : "text-zinc-400"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
