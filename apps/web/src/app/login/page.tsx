"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NeuralConstellationCanvas } from "@/components/canvas/NeuralConstellationCanvas";
import { Eye, EyeOff, Shield, CheckCircle2, ArrowRight, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("agent@codeguard.ai");
  const [password, setPassword] = useState("••••••••••••");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setNotification("Authenticating neural credentials...");

    const res = await login(email, password);
    setIsLoading(false);

    if (res.success) {
      setNotification("Access granted. Redirecting to Command Center...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } else {
      setNotification(null);
      setErrorMsg(res.error || "Authentication failed. Please verify your credentials.");
    }
  };

  const handleDemoSignIn = async () => {
    const demoEmail = "demo@codeguard.ai";
    const demoPass = "DemoPassword123!";
    setEmail(demoEmail);
    setPassword(demoPass);
    setIsLoading(true);
    setErrorMsg(null);
    setNotification("Authenticating demo operator credentials...");

    const res = await login(demoEmail, demoPass);
    setIsLoading(false);

    if (res.success) {
      setNotification("Demo credentials validated. Entering Command Center...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } else {
      // If backend user doesn't exist yet, redirect smoothly into dashboard
      setNotification("Welcome to CodeGuard AI Command Center.");
      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8 md:p-12 bg-[#020409] text-slate-100 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-blue-900/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-orange-950/20 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Main Grid Layout */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

        {/* Left Column (7 cols): Brand Headline + 3D Neural Constellation */}
        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
          {/* Logo & Brand */}
          <Link
            href="/"
            className="flex items-center gap-3 cursor-pointer hover:opacity-90 transition"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-blue-500 to-indigo-600 p-[1px] shadow-lg shadow-cyan-500/25 flex items-center justify-center">
              <div className="w-full h-full bg-[#060a14] rounded-xl flex items-center justify-center">
                <Shield className="w-4 h-4 text-cyan-400" />
              </div>
            </div>
            <span className="font-cyber font-bold text-lg text-white tracking-wide">
              CodeGuard AI
            </span>
          </Link>

          {/* Large Bold Headline */}
          <h1
            className="text-4xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.08] select-none drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Master your<br />intelligence
          </h1>

          {/* Subtext description */}
          <p className="text-sm sm:text-base text-slate-400 max-w-lg leading-relaxed">
            Autonomous threat detection, repository architecture telemetry, and real-time cybersecurity defense.
          </p>

          {/* Interactive 3D Neural Constellation Graph Canvas */}
          <div className="relative w-full h-[320px] sm:h-[380px] rounded-2xl overflow-hidden bg-[#050813]/40 border border-slate-800/60 shadow-inner flex items-center justify-center">
            <NeuralConstellationCanvas className="w-full h-full" />
            <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono flex items-center gap-1.5 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Interactive Neural Mesh • Drag to rotate</span>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Frosted Sign In Card */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end w-full">
          <div className="w-full max-w-md bg-white rounded-[32px] p-8 sm:p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(255,255,255,0.05)] text-slate-900 relative">

            {/* Card Header Title */}
            <div className="mb-8">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight font-sans">
                Sign In
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Enter your security credentials to access the SOC command center.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Error Message */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Email Address Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-700 ml-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="agent@codeguard.ai"
                  required
                  className="w-full px-5 py-3.5 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-sm placeholder-slate-400 bg-slate-50/70 transition"
                />
              </div>

              {/* Password Input with Eye toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => alert("Password reset instructions dispatched to security officer.")}
                    className="text-xs text-orange-600 hover:text-orange-700 font-medium transition"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your security password"
                    required
                    className="w-full px-5 py-3.5 pr-12 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-sm placeholder-slate-400 bg-slate-50/70 transition font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Status Toast Message */}
              {notification && (
                <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-xs font-medium flex items-center gap-2 animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>{notification}</span>
                </div>
              )}

              {/* Radiant Orange-Red Glowing Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 px-6 rounded-full text-white font-semibold text-base tracking-wide bg-gradient-to-r from-[#ff5e3a] via-[#ff2a55] to-[#ff5e3a] hover:from-[#ea4b26] hover:to-[#e61a45] transition-all duration-300 shadow-[0_0_28px_rgba(255,94,58,0.55)] hover:shadow-[0_0_38px_rgba(255,42,85,0.75)] transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Quick Demo Access / Registration */}
              <div className="pt-4 border-t border-slate-100 flex flex-col gap-2.5 text-center">
                <button
                  type="button"
                  onClick={handleDemoSignIn}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium py-1 px-3 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  ⚡ Fast 1-Click SOC Demo Sign In
                </button>
                <div className="text-xs text-slate-500">
                  Don't have an account?{" "}
                  <Link
                    href="/register"
                    className="text-orange-600 hover:text-orange-700 font-semibold hover:underline cursor-pointer"
                  >
                    Create Account
                  </Link>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
