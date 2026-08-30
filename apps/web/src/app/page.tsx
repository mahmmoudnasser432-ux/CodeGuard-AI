"use client";

import React from "react";
import Link from "next/link";
import { ParticleWaveBackground } from "@/components/canvas/ParticleWaveBackground";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between overflow-hidden bg-[#030508]">
      {/* Background Cyber Particle Wave */}
      <div className="absolute inset-0 z-0">
        <ParticleWaveBackground />
      </div>

      {/* Top Header Bar */}
      <header className="relative z-10 w-full px-8 py-6 flex items-center justify-between max-w-7xl mx-auto">
        <Link
          href="/"
          className="text-white text-lg font-cyber font-semibold tracking-wider flex items-center gap-2"
        >
          CodeGuard AI
        </Link>

        <div className="flex items-center gap-4 sm:gap-6 text-sm">
          <Link
            href="/dashboard"
            className="text-slate-300 hover:text-white transition tracking-wide cursor-pointer hidden sm:inline"
          >
            Features
          </Link>
          <Link
            href="/documentation-generator"
            className="text-slate-300 hover:text-white transition tracking-wide cursor-pointer hidden sm:inline"
          >
            Docs
          </Link>
          <Link
            href="/register"
            className="text-slate-300 hover:text-cyan-300 font-medium transition tracking-wide cursor-pointer text-xs sm:text-sm"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="relative px-5 sm:px-6 py-2 rounded-full text-black font-semibold text-xs sm:text-sm bg-white hover:bg-slate-100 transition shadow-[0_0_25px_rgba(255,255,255,0.75)] hover:shadow-[0_0_35px_rgba(255,255,255,0.95)] transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Main Hero Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-4 -mt-8">
        {/* Massive Bold Display Headline */}
        <h1
          className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-extrabold text-white tracking-tight select-none drop-shadow-[0_15px_35px_rgba(0,0,0,0.8)]"
          style={{
            fontFamily: "'Space Grotesk', 'Plus Jakarta Sans', sans-serif",
            letterSpacing: '-0.02em',
            textShadow: '0 4px 20px rgba(0,0,0,0.6)'
          }}
        >
          SECURE THE FUTURE
        </h1>

        {/* Center Glowing Action Button */}
        <div className="mt-14 sm:mt-16">
          <Link
            href="/repository-analysis"
            className="group relative inline-flex items-center px-10 py-3.5 rounded-full text-slate-100 font-medium text-base tracking-wide bg-[#0a1124]/70 backdrop-blur-md border border-cyan-400/60 shadow-[0_0_35px_rgba(56,189,248,0.5),inset_0_0_20px_rgba(56,189,248,0.25)] hover:shadow-[0_0_50px_rgba(56,189,248,0.8),inset_0_0_30px_rgba(56,189,248,0.4)] hover:border-cyan-300 transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span className="relative z-10 flex items-center gap-2">
              Initialize Scan
            </span>
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/20 via-blue-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </Link>
        </div>

        {/* Feature quick links */}
        <div className="mt-16 flex flex-wrap justify-center gap-4 text-xs text-slate-400">
          <span className="px-3 py-1 rounded-full bg-black/40 border border-slate-800 backdrop-blur-sm">
            🛡️ Zero-Day AI Defense
          </span>
          <span className="px-3 py-1 rounded-full bg-black/40 border border-slate-800 backdrop-blur-sm">
            🌐 Global Repository Topology
          </span>
          <span className="px-3 py-1 rounded-full bg-black/40 border border-slate-800 backdrop-blur-sm">
            ⚡ Automated Architecture Intelligence
          </span>
        </div>
      </main>

      {/* Subtle bottom padding */}
      <div className="relative z-10 py-4 text-center text-[11px] text-slate-600">
        CodeGuard AI Security Architecture • Powered by Next-Gen AI
      </div>
    </div>
  );
}
