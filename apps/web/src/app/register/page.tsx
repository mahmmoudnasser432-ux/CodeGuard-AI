"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { NeuralConstellationCanvas } from "@/components/canvas/NeuralConstellationCanvas";
import { Eye, EyeOff, Shield, CheckCircle2, ArrowRight, UserCheck, AlertCircle } from "lucide-react";

export default function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("SecOps Lead");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify your security key.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    setNotification("Provisioning neural security node & tenant workspace...");

    const res = await register(email, password, fullName || undefined);
    setIsLoading(false);

    if (res.success) {
      setNotification("Account successfully initialized! Entering SOC...");
      setTimeout(() => {
        router.push("/dashboard");
      }, 500);
    } else {
      setNotification(null);
      setErrorMsg(res.error || "Failed to create account. Please try again.");
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-8 md:p-12 bg-[#020409] text-slate-100 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-10 left-10 w-[500px] h-[500px] bg-blue-900/15 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-[500px] h-[500px] bg-orange-950/20 rounded-full blur-[140px] pointer-events-none"></div>

      {/* Main Grid Layout */}
      <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">

        {/* Left Column (6 cols): Brand + Neural Mesh */}
        <div className="lg:col-span-6 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
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
            className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.08] select-none drop-shadow-[0_10px_25px_rgba(0,0,0,0.8)]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Join the autonomous<br />defense network
          </h1>

          {/* Subtext description */}
          <p className="text-sm sm:text-base text-slate-400 max-w-lg leading-relaxed">
            Instantly deploy neural vulnerability detection across multi-tier repositories, automated CI/CD safeguards, and intelligent AI audits.
          </p>

          {/* Interactive 3D Neural Constellation Graph Canvas */}
          <div className="relative w-full h-[280px] sm:h-[340px] rounded-2xl overflow-hidden bg-[#050813]/40 border border-slate-800/60 shadow-inner flex items-center justify-center">
            <NeuralConstellationCanvas className="w-full h-full" />
            <div className="absolute bottom-3 left-4 text-[10px] text-slate-500 font-mono flex items-center gap-1.5 pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
              <span>Live Neural Mesh • 3D Realtime Interaction</span>
            </div>
          </div>
        </div>

        {/* Right Column (6 cols): Frosted Sign Up Card */}
        <div className="lg:col-span-6 flex justify-center lg:justify-end w-full">
          <div className="w-full max-w-lg bg-white rounded-[32px] p-7 sm:p-9 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9),0_0_30px_rgba(255,255,255,0.05)] text-slate-900 relative">

            {/* Card Header */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/70 text-orange-700 text-xs font-semibold mb-2">
                <UserCheck className="w-3.5 h-3.5" />
                <span>SOC Tier-1 Access</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-sans">
                Create Account
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Initialize your developer profile or security operations workspace.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Error Alert */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Full Name & Role Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 ml-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Alex Vance"
                    required
                    className="w-full px-4 py-2.5 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-xs sm:text-sm placeholder-slate-400 bg-slate-50/70 transition"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 ml-1">
                    Primary Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-xs sm:text-sm bg-slate-50/70 transition"
                  >
                    <option value="SecOps Lead">SecOps Lead</option>
                    <option value="Security Engineer">Security Engineer</option>
                    <option value="DevSecOps Architect">DevSecOps Architect</option>
                    <option value="Full-Stack Developer">Full-Stack Developer</option>
                    <option value="CISO / Director">CISO / Director</option>
                  </select>
                </div>
              </div>

              {/* Work Email Address */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 ml-1">
                  Work Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex.vance@company.io"
                  required
                  className="w-full px-4 py-2.5 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-xs sm:text-sm placeholder-slate-400 bg-slate-50/70 transition"
                />
              </div>

              {/* Password and Confirm Password Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 ml-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 chars"
                      required
                      minLength={8}
                      className="w-full px-4 py-2.5 pr-10 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-xs sm:text-sm placeholder-slate-400 bg-slate-50/70 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition p-1"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 ml-1">
                    Confirm Password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2.5 rounded-full border border-slate-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none text-slate-800 text-xs sm:text-sm placeholder-slate-400 bg-slate-50/70 transition font-mono"
                  />
                </div>
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer pt-1 ml-1">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  required
                  className="mt-0.5 rounded text-orange-500 focus:ring-orange-400 accent-orange-500"
                />
                <span>
                  I agree to CodeGuard AI's <span className="text-orange-600 font-medium">Security Protocols</span> and <span className="text-orange-600 font-medium">Terms of Service</span>.
                </span>
              </label>

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
                  className="w-full py-3.5 px-6 rounded-full text-white font-semibold text-sm sm:text-base tracking-wide bg-gradient-to-r from-[#ff5e3a] via-[#ff2a55] to-[#ff5e3a] hover:from-[#ea4b26] hover:to-[#e61a45] transition-all duration-300 shadow-[0_0_28px_rgba(255,94,58,0.55)] hover:shadow-[0_0_38px_rgba(255,42,85,0.75)] transform hover:scale-[1.01] active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span>Create SOC Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>

              {/* Back to Sign In Link */}
              <div className="pt-3 border-t border-slate-100 text-center text-xs text-slate-500">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="text-orange-600 hover:text-orange-700 font-semibold hover:underline cursor-pointer"
                >
                  Sign In
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
