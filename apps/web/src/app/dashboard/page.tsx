"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GlobalGlobeCanvas } from "@/components/canvas/GlobalGlobeCanvas";
import { SecurityAlert, ThreatFeedItem } from "@/types/ui";
import { useApi, AnalysisResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  Search,
  Code,
  Settings,
  LogOut,
  Radio,
  Activity,
  Database,
  ChevronRight,
  RefreshCw,
  X
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout } = useAuth();
  const { getAnalysisStats, getRecentAnalyses } = useApi();
  const [activeNav, setActiveNav] = useState<"overview" | "threat-hunting" | "code-analysis" | "settings">("overview");
  const [threatCount, setThreatCount] = useState(42);
  const [codeQuality, setCodeQuality] = useState(96);
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [recentAnalyses, setRecentAnalyses] = useState<AnalysisResult[]>([]);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [statsRes, analysesRes] = await Promise.all([
        getAnalysisStats(),
        getRecentAnalyses(10, 0),
      ]);

      if (statsRes.success && statsRes.data) {
        if (statsRes.data.avgScore > 0) {
          setCodeQuality(Math.round(statsRes.data.avgScore));
        }
        if (statsRes.data.totalAnalyses > 0) {
          setThreatCount(Math.max(12, statsRes.data.totalAnalyses * 3));
        }
      }

      if (analysesRes.success && analysesRes.data?.items) {
        setRecentAnalyses(analysesRes.data.items);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    }
  }, [getAnalysisStats, getRecentAnalyses]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const defaultAlerts: SecurityAlert[] = [
    {
      id: "1",
      type: "critical",
      title: "SQL Injection Attempt",
      timeAgo: "2 mins ago",
      detail: "Source: 192.168.1.45 • Endpoint: /api/v2/auth/query",
      color: "#ef4444",
    },
    {
      id: "2",
      type: "warning",
      title: "Dependency Vulnerability",
      timeAgo: "15 mins ago",
      detail: "Package: lodash@4.17.20 (Prototype Pollution CVE-2020-8203)",
      color: "#f97316",
    },
    {
      id: "3",
      type: "info",
      title: "AI Vulnerability Auto-Patched",
      timeAgo: "1 hour ago",
      detail: "JWT expiry vulnerability safely neutralized in repo-core",
      color: "#38bdf8",
    },
  ];

  const threatFeed: ThreatFeedItem[] = [
    { id: "1", title: "New Zero-Day Exploit in OpenSSL", severity: "critical", date: "Today" },
    { id: "2", title: "AI-Powered Phishing Attacks on the Rise", severity: "high", date: "Today" },
    { id: "3", title: "Patch Released for Critical CVE-2024-1234", severity: "medium", date: "Yesterday" },
  ];

  const handleSignOut = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="w-full bg-[#040711] text-slate-100 flex flex-col justify-between overflow-x-hidden relative flex-1">
      {/* Ambient background glows */}
      <div className="absolute top-10 left-1/3 w-[500px] h-[350px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-1/4 w-[400px] h-[300px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Main Container */}
      <div className="w-full max-w-[1550px] mx-auto px-4 sm:px-6 py-4 flex-1 flex flex-col">
        {/* Top Header Bar matching SOC Dashboard aesthetic */}
        <div className="flex items-center justify-between pb-3 border-b border-cyan-500/10">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            <span className="font-cyber text-xs tracking-[0.2em] text-cyan-300 font-semibold uppercase">
              LIVE SOC COMMAND CENTER
            </span>
          </div>

          <div className="text-right flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              SEC-ZONE: 01-ALPHA • ACTIVE THREAT MITIGATION
            </span>
            <Link
              href="/repository-analysis"
              className="px-3 py-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"
            >
              <span>+ Quick Scan</span>
            </Link>
          </div>
        </div>

        {/* Dashboard Grid Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4">
          {/* Left Navigation Sidebar */}
          <div className="lg:col-span-2 flex lg:flex-col justify-between bg-[#080d1a]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-3 shadow-xl">
            <div className="flex lg:flex-col gap-2 w-full">
              <button
                onClick={() => setActiveNav("overview")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  activeNav === "overview"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(56,189,248,0.2)]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Shield className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline">Security Overview</span>
              </button>

              <Link
                href="/architecture"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  activeNav === "threat-hunting"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Search className="w-4 h-4 text-slate-400" />
                <span className="hidden sm:inline">Threat Hunting</span>
              </Link>

              <Link
                href="/repository-analysis"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  activeNav === "code-analysis"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Code className="w-4 h-4 text-slate-400" />
                <span className="hidden sm:inline">Code Analysis</span>
              </Link>

              <button
                onClick={() => setActiveNav("settings")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  activeNav === "settings"
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition mt-auto cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>

          {/* Center & Right Content Area (10 cols) */}
          <div className="lg:col-span-10 flex flex-col gap-4">
            {/* Top Metric Cards: Active Threats & Code Quality */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: ACTIVE THREATS */}
              <div className="relative overflow-hidden bg-gradient-to-r from-[#0a152d]/90 to-[#0c1020]/90 backdrop-blur-md rounded-2xl border border-cyan-500/30 p-5 shadow-2xl flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-[11px] font-cyber tracking-widest text-cyan-300 font-semibold uppercase">
                    ACTIVE THREATS
                  </div>
                  <div className="text-4xl sm:text-5xl font-extrabold text-cyan-400 font-cyber drop-shadow-[0_0_12px_rgba(56,189,248,0.5)]">
                    {threatCount}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    BubbledotICG-FinePos
                  </div>
                </div>

                {/* SVG Sparkline & Warning Icon */}
                <div className="flex flex-col items-end gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center shadow-lg shadow-red-500/30">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  </div>
                  {/* Wave sparkline */}
                  <svg className="w-36 h-12 overflow-visible" viewBox="0 0 140 40">
                    <path
                      d="M0,25 Q20,10 40,28 T80,18 T120,32 T140,15"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                    />
                    <path
                      d="M0,25 Q20,10 40,28 T80,18 T120,32 T140,15 L140,40 L0,40 Z"
                      fill="url(#threatGrad)"
                      opacity="0.35"
                    />
                    <defs>
                      <linearGradient id="threatGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#c084fc" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              {/* Card 2: CODE QUALITY */}
              <div className="relative overflow-hidden bg-gradient-to-r from-[#0f112e]/90 to-[#080d1c]/90 backdrop-blur-md rounded-2xl border border-purple-500/30 p-5 shadow-2xl flex items-center justify-between">
                <div className="space-y-1">
                  <div className="text-[11px] font-cyber tracking-widest text-purple-300 font-semibold uppercase">
                    CODE QUALITY
                  </div>
                  <div className="text-4xl sm:text-5xl font-extrabold text-purple-300 font-cyber drop-shadow-[0_0_12px_rgba(192,132,252,0.5)]">
                    {codeQuality}%
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    BubbledotICG-FinePos
                  </div>
                </div>

                {/* Speedometer Radial Gauge */}
                <div className="flex flex-col items-end gap-1">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  {/* Gauge Arc */}
                  <svg className="w-28 h-14" viewBox="0 0 100 50">
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 10 50 A 40 40 0 0 1 90 50"
                      fill="none"
                      stroke="url(#gaugeGrad)"
                      strokeWidth="8"
                      strokeDasharray="125"
                      strokeDashoffset="12"
                      strokeLinecap="round"
                    />
                    <line
                      x1="50"
                      y1="50"
                      x2="78"
                      y2="20"
                      stroke="#22c55e"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <circle cx="50" cy="50" r="4" fill="#ffffff" />
                    <defs>
                      <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="60%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#22c55e" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            </div>

            {/* Center Section: GLOBAL REPOSITORY NETWORK 3D Globe */}
            <div className="relative bg-[#060b17]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-4 shadow-2xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-1">
                <span className="text-[11px] font-cyber tracking-widest text-slate-300 font-semibold uppercase flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  GLOBAL REPOSITORY NETWORK
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Real-Time Node Mesh
                </span>
              </div>

              {/* 3D Globe Canvas */}
              <div className="w-full h-[280px] sm:h-[320px] relative">
                <GlobalGlobeCanvas className="w-full h-full" />
              </div>
            </div>

            {/* Bottom Row of Cards: RECENT ALERTS, THREAT INTELLIGENCE FEED, SYSTEM STATUS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: RECENT ALERTS */}
              <div className="bg-[#080d1c]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-4 shadow-xl flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[11px] font-cyber tracking-widest text-slate-300 font-semibold uppercase">
                    RECENT ALERTS
                  </span>
                  <button
                    onClick={fetchDashboardData}
                    className="text-slate-500 hover:text-cyan-400 transition"
                    title="Refresh Data"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs">
                  {defaultAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      onClick={() => setSelectedAlert(alert)}
                      className="p-2 rounded-lg bg-black/40 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition flex items-start gap-2"
                    >
                      <span
                        className="w-2 h-2 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: alert.color, boxShadow: `0 0 6px ${alert.color}` }}
                      ></span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-slate-200 font-medium">
                          <span>{alert.title}</span>
                          <span className="text-[10px] text-slate-500">{alert.timeAgo}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 truncate">{alert.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 2: THREAT INTELLIGENCE FEED */}
              <div className="bg-[#080d1c]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-4 shadow-xl flex flex-col justify-between">
                <div className="text-[11px] font-cyber tracking-widest text-slate-300 font-semibold uppercase mb-3">
                  THREAT INTELLIGENCE FEED
                </div>

                <div className="space-y-2 text-xs">
                  {threatFeed.map((item) => (
                    <Link
                      key={item.id}
                      href="/architecture"
                      className="p-2 rounded-lg bg-black/40 border border-slate-800 hover:border-purple-500/40 transition flex items-center justify-between block"
                    >
                      <span className="text-slate-300 text-[11px] font-medium leading-tight">
                        {item.title}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0 ml-2" />
                    </Link>
                  ))}
                </div>
              </div>

              {/* Card 3: SYSTEM STATUS */}
              <div className="bg-[#080d1c]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-4 shadow-xl flex flex-col justify-between">
                <div className="text-[11px] font-cyber tracking-widest text-slate-300 font-semibold uppercase mb-3">
                  SYSTEM STATUS
                </div>

                <div className="space-y-3 text-xs">
                  {/* AI Engine: Online */}
                  <div>
                    <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3 text-cyan-400" />
                        AI Engine: Online
                      </span>
                      <span className="text-cyan-400 font-mono font-bold">100%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full w-full shadow-[0_0_8px_rgba(56,189,248,0.7)]"></div>
                    </div>
                  </div>

                  {/* Threat Detection: Active */}
                  <div>
                    <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                      <span className="flex items-center gap-1.5">
                        <Shield className="w-3 h-3 text-emerald-400" />
                        Threat Detection: Active
                      </span>
                      <span className="text-emerald-400 font-mono font-bold">94%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full w-[94%] shadow-[0_0_8px_rgba(16,185,129,0.7)]"></div>
                    </div>
                  </div>

                  {/* Data Analysis: Processing */}
                  <div>
                    <div className="flex items-center justify-between text-slate-300 text-[11px] mb-1">
                      <span className="flex items-center gap-1.5">
                        <Database className="w-3 h-3 text-purple-400" />
                        Data Analysis: Processing
                      </span>
                      <span className="text-purple-400 font-mono font-bold">78%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full w-[78%] shadow-[0_0_8px_rgba(168,85,247,0.7)]"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Alert Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#0a1022] border border-cyan-500/40 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedAlert.color }}></span>
                <h3 className="font-semibold text-white text-sm">{selectedAlert.title}</h3>
              </div>
              <button
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs text-slate-300">
              <p><span className="text-slate-500">Timestamp:</span> {selectedAlert.timeAgo}</p>
              <p><span className="text-slate-500">Diagnostic Details:</span> {selectedAlert.detail}</p>
              <p><span className="text-slate-500">Severity:</span> <span className="uppercase font-mono font-bold" style={{ color: selectedAlert.color }}>{selectedAlert.type}</span></p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Dismiss Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="w-full py-3 text-center text-[11px] text-slate-500 border-t border-slate-900 bg-[#020409]">
        © 2026 CodeGuard AI. All rights reserved. | <Link href="/" className="hover:underline">Privacy Policy</Link> | <Link href="/" className="hover:underline">Terms of Service</Link>
      </footer>
    </div>
  );
}
