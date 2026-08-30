"use client";

import React, { useState } from "react";
import { GeodesicSphereCanvas } from "@/components/canvas/GeodesicSphereCanvas";
import { TrendingUp, Radio } from "lucide-react";

export default function ArchitecturePage() {
  const [activeTab, setActiveTab] = useState<"overview" | "repositories" | "insights">("overview");

  return (
    <div className="w-full bg-[#050811] text-slate-100 flex flex-col justify-between overflow-x-hidden relative flex-1">
      {/* Background circuit ambient traces */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-900/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-purple-900/10 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-6 flex-1 flex flex-col">
        {/* Top Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <h1 className="font-cyber font-bold text-base sm:text-lg text-slate-100">
              System Architecture & Threat Hotspots
            </h1>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium">
            <button
              onClick={() => setActiveTab("overview")}
              className={`pb-1 transition-all cursor-pointer ${
                activeTab === "overview"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("repositories")}
              className={`pb-1 transition-all cursor-pointer ${
                activeTab === "repositories"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dependencies
            </button>
            <button
              onClick={() => setActiveTab("insights")}
              className={`pb-1 transition-all cursor-pointer ${
                activeTab === "insights"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Telemetry
            </button>
          </nav>
        </div>

        {/* Page Title & Subtitle */}
        <div className="text-center my-8 space-y-2">
          <h1
            className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            System Architecture Intelligence
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Deep-dive analysis of repository health and structural integrity.
          </p>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          <div className="text-xs font-semibold text-slate-300 font-cyber tracking-wider">
            Repository Analysis Results
          </div>

          {/* Card 1: Risk Hotspot Map */}
          <div className="bg-[#090e1d]/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold text-slate-200">Risk Hotspot Map</span>

              {/* Legend: High Risk (Red), Medium Risk (Yellow/Orange), Healthy (Green) */}
              <div className="flex items-center gap-4 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]"></span>
                  <span>High Risk</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b]"></span>
                  <span>Medium Risk</span>
                </div>
                <div className="flex items-center gap-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_#22c55e]"></span>
                  <span>Healthy</span>
                </div>
              </div>
            </div>

            {/* Interactive World Risk Topo Map with Arcs */}
            <div className="relative w-full h-[190px] sm:h-[220px] bg-[#050813] rounded-xl overflow-hidden border border-slate-800/80 flex items-center justify-center">
              {/* World outline SVG */}
              <svg className="w-full h-full opacity-40" viewBox="0 0 800 360">
                <path
                  d="M150,80 Q220,60 250,110 T180,240 T100,160 Z M450,70 Q520,50 600,100 T580,220 T440,180 Z M650,200 Q720,180 750,260 T680,310 Z M260,200 Q320,190 350,290 T280,330 Z"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.25)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <path
                  d="M 230 140 Q 340 70 410 120"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  opacity="0.8"
                />
                <path
                  d="M 410 120 Q 480 90 530 150"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.8"
                  opacity="0.8"
                />
                <path
                  d="M 230 140 Q 300 220 530 150"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
                <path
                  d="M 530 150 Q 590 190 640 180"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth="1.5"
                  opacity="0.7"
                />
              </svg>

              {/* Pulsating Hotspot Pins */}
              {/* Data Access Layer (Red) */}
              <div className="absolute top-[38%] left-[26%] flex flex-col items-center">
                <div className="bg-black/80 backdrop-blur-sm border border-slate-700 rounded px-2 py-0.5 text-[9px] text-slate-200 mb-1">
                  Data Access Layer
                </div>
                <div className="relative">
                  <span className="w-3.5 h-3.5 rounded-full bg-red-500/30 animate-ping absolute -inset-0.5"></span>
                  <span className="w-3 h-3 rounded-full bg-red-500 block shadow-[0_0_10px_#ef4444]"></span>
                </div>
              </div>

              {/* Authentication Service (Orange) */}
              <div className="absolute top-[32%] left-[52%] flex flex-col items-center">
                <div className="bg-black/80 backdrop-blur-sm border border-slate-700 rounded px-2 py-0.5 text-[9px] text-slate-200 mb-1">
                  Authentication Service
                </div>
                <div className="relative">
                  <span className="w-3 h-3 rounded-full bg-amber-500 block shadow-[0_0_10px_#f59e0b]"></span>
                </div>
              </div>

              {/* Legacy Modules (Orange/Red) */}
              <div className="absolute bottom-[24%] left-[55%] flex flex-col items-center">
                <div className="relative mb-1">
                  <span className="w-3 h-3 rounded-full bg-amber-500 block shadow-[0_0_10px_#f59e0b]"></span>
                </div>
                <div className="bg-black/80 backdrop-blur-sm border border-slate-700 rounded px-2 py-0.5 text-[9px] text-slate-200">
                  Legacy Modules
                </div>
              </div>

              {/* Healthy Edge Node (Green) */}
              <div className="absolute top-[48%] right-[20%] flex flex-col items-center">
                <div className="relative">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 block shadow-[0_0_8px_#22c55e]"></span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Architecture Quality (Geodesic 3D Sphere + Grade A+) */}
          <div className="bg-[#090e1d]/90 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-200">Architecture Quality</span>
              <p className="text-[11px] text-slate-400">Microservice decoupling & structural cohesion</p>
            </div>

            <div className="flex items-center gap-8">
              {/* 3D Geodesic Molecular Sphere Canvas */}
              <div className="w-28 h-28 relative">
                <GeodesicSphereCanvas className="w-full h-full" />
              </div>

              {/* Grade A+ Display */}
              <div className="text-right">
                <div className="text-5xl font-extrabold text-cyan-400 font-cyber drop-shadow-[0_0_15px_rgba(56,189,248,0.6)]">
                  A+
                </div>
                <div className="text-xs font-semibold text-slate-200 mt-1">
                  Robust & Scalable Architecture
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Technical Debt (Massive Metallic "420 kg") */}
          <div className="bg-[#090e1d]/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl flex flex-col items-center justify-center text-center relative overflow-hidden">
            {/* Top row badge */}
            <div className="w-full flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-200">Technical Debt</span>
              <div className="flex items-center gap-1 text-[11px] text-red-400 font-medium">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Increased this month</span>
              </div>
            </div>

            {/* Massive Metallic "420 kg" text */}
            <div
              className="text-6xl sm:text-8xl font-black tracking-tight metallic-text select-none my-2"
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                textShadow: '0 8px 24px rgba(0,0,0,0.9), 0 2px 4px rgba(255,255,255,0.2)'
              }}
            >
              420 kg
            </div>

            <div className="text-xs text-slate-400 font-medium">
              Technical Debt Weight
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-[11px] text-slate-600 border-t border-slate-900 bg-[#03060c]">
        © 2026 CodeGuard AI. All rights reserved.
      </footer>
    </div>
  );
}
