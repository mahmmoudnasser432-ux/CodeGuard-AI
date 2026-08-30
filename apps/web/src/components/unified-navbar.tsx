"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  Shield,
  LayoutDashboard,
  GitBranch,
  Network,
  FileText,
  HelpCircle,
  Bell,
  LogOut,
  Menu,
  X,
  User
} from "lucide-react";

export function UnifiedNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
    { href: "/repository-analysis", label: "Repositories", icon: GitBranch },
    { href: "/architecture", label: "Architecture Intel", icon: Network },
    { href: "/documentation-generator", label: "AI Docs", icon: FileText },
    { href: "/interview-generator", label: "Interview Platform", icon: HelpCircle },
  ];

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  const getInitials = (name?: string, email?: string) => {
    if (name && name.trim()) {
      const parts = name.trim().split(" ");
      if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      return name.slice(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
      return email.slice(0, 2).toUpperCase();
    }
    return "CG";
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-[#040814]/90 backdrop-blur-md border-b border-cyan-900/30 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* Left: Brand Identity */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="flex items-center gap-2.5 group cursor-pointer text-left focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 p-[1px] shadow-md shadow-cyan-500/20 group-hover:shadow-cyan-400/40 transition">
              <div className="w-full h-full bg-[#050a17] rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-cyber font-bold text-sm sm:text-base text-white tracking-wide leading-tight flex items-center gap-1.5">
                CodeGuard AI
                <span className="hidden sm:inline-block text-[9px] px-1.5 py-0.2 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono">SOC</span>
              </span>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.2)]"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/50 border border-transparent"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Controls: Realtime Telemetry, Notifications & User Info */}
        <div className="flex items-center gap-3">
          {/* Status Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>SOC Defense Active</span>
          </div>

          {/* Notification Center Bell */}
          <div className="relative">
            <button
              onClick={() => setNotificationsOpen(!notificationsOpen)}
              className="p-2 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-cyan-400 hover:border-cyan-500/30 transition cursor-pointer relative"
              title="Security Alerts"
              aria-label="Security Alerts"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_6px_#f97316]"></span>
            </button>

            {/* Notification Dropdown */}
            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#080e1e] border border-cyan-900/40 rounded-xl shadow-2xl p-3 z-50 text-xs space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-semibold text-white">Live SOC Alerts</span>
                  <span className="text-[10px] font-mono text-cyan-400">2 New</span>
                </div>
                <div className="p-2 rounded bg-red-950/30 border border-red-900/30 text-red-300">
                  <div className="font-semibold text-[11px] text-red-200">Critical Port Exposure</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">Microservice auth-proxy detected SSH unauthorized trial</div>
                </div>
                <div className="p-2 rounded bg-cyan-950/30 border border-cyan-900/30 text-cyan-300">
                  <div className="font-semibold text-[11px] text-cyan-200">AI Vulnerability Auto-Patched</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">JWT expiry vulnerability safely neutralized in repo-core</div>
                </div>
              </div>
            )}
          </div>

          {/* User Badge */}
          {isAuthenticated && user ? (
            <div className="hidden md:flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <div className="w-7 h-7 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 flex items-center justify-center text-black font-bold text-xs shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                {getInitials(user.displayName, user.email)}
              </div>
              <div className="text-left leading-tight hidden xl:block">
                <div className="text-xs font-semibold text-slate-200 max-w-[120px] truncate">
                  {user.displayName || user.email.split("@")[0]}
                </div>
                <div className="text-[10px] font-mono text-cyan-400">SecOps Director</div>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex items-center gap-2.5 pl-2 border-l border-slate-800">
              <Link
                href="/login"
                className="text-xs text-cyan-300 hover:text-white transition px-2 py-1 rounded bg-cyan-950/40 border border-cyan-800/40"
              >
                Sign In
              </Link>
            </div>
          )}

          {/* Exit / Logout Action */}
          {isAuthenticated ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-red-950/40 border border-slate-800 hover:border-red-800/60 text-slate-400 hover:text-red-300 text-xs font-medium transition cursor-pointer"
              title="Return to Home / Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit SOC</span>
            </button>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium transition"
              title="Return to Home"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          )}

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-cyan-400"
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="lg:hidden px-4 pt-2 pb-4 border-t border-slate-800/80 bg-[#060c1c] space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-400"}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
export default UnifiedNavbar;
