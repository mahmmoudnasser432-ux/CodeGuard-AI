"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Card from "@/components/card";
import Icon from "@/components/icon";
import Button from "@/components/button";
import { useApi } from "@/lib/api";
import { useAuth as useAuthHook } from "@/lib/auth-context";
import { AnalysisResult, UserAnalysisStats } from "@/lib/api";

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuthHook();
  const { getRecentAnalyses, getAnalysisStats, deleteAnalysis } = useApi();
  const [stats, setStats] = useState<UserAnalysisStats>({
    totalAnalyses: 0,
    avgScore: 0,
    reposScanned: 0,
    docsGenerated: 0,
    scoreByType: {},
  });
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [statsRes, analysesRes] = await Promise.all([
        getAnalysisStats(),
        getRecentAnalyses(20, 0),
      ]);

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }
      if (analysesRes.success && analysesRes.data) {
        setAnalyses(analysesRes.data.items || []);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoadingData(false);
    }
  }, [getAnalysisStats, getRecentAnalyses]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this analysis record?")) return;

    setDeletingId(id);
    const res = await deleteAnalysis(id);
    setDeletingId(null);

    if (res.success) {
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      setStats((prev) => ({
        ...prev,
        totalAnalyses: Math.max(0, prev.totalAnalyses - 1),
      }));
    } else {
      alert("Failed to delete analysis record.");
    }
  };

  const formatAnalysisType = (type: string) => {
    return type
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/30 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Icon icon="activity" size={24} />
            </div>
            Engineering Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAuthenticated && user
              ? `Welcome back, ${user.displayName || user.email}. Overview of your security posture and code insights.`
              : "Overview of system analyses, static security findings, and AI metrics."}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/code-analysis">
            <Button className="flex items-center gap-1.5 text-sm">
              <Icon icon="code" size={16} /> New Analysis
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Analyses</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Icon icon="activity" size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {loadingData ? "..." : stats.totalAnalyses}
            </span>
            <span className="text-xs text-muted-foreground">runs</span>
          </div>
        </Card>

        <Card className="p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Avg Quality Score</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Icon icon="trending-up" size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-emerald-400">
              {loadingData ? "..." : `${stats.avgScore}%`}
            </span>
            <span className="text-xs text-muted-foreground">average</span>
          </div>
        </Card>

        <Card className="p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Repositories Scanned</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Icon icon="git-branch" size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {loadingData ? "..." : stats.reposScanned}
            </span>
            <span className="text-xs text-muted-foreground">repos</span>
          </div>
        </Card>

        <Card className="p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Docs Generated</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Icon icon="file-text" size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight">
              {loadingData ? "..." : stats.docsGenerated}
            </span>
            <span className="text-xs text-muted-foreground">documents</span>
          </div>
        </Card>
      </div>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Link href="/code-analysis" className="group">
          <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 group-hover:scale-105 transition-transform">
                <Icon icon="shield" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Security Audit</h3>
                <p className="text-xs text-muted-foreground">Scan for OWASP vulnerabilities</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/repository-analysis" className="group">
          <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 group-hover:scale-105 transition-transform">
                <Icon icon="git-branch" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Repo Scanner</h3>
                <p className="text-xs text-muted-foreground">Full codebase architectural analysis</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/documentation-generator" className="group">
          <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 group-hover:scale-105 transition-transform">
                <Icon icon="file-text" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Doc Generator</h3>
                <p className="text-xs text-muted-foreground">Automated API & specs markdown</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/interview-generator" className="group">
          <Card className="p-4 hover:border-primary/50 transition-all cursor-pointer h-full">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform">
                <Icon icon="pie-chart" size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Interview Q&A</h3>
                <p className="text-xs text-muted-foreground">Rubrics and code review questions</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Analysis History Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Icon icon="clock" size={20} className="text-primary" />
            Analysis History & Records
          </h2>
          <button
            onClick={() => fetchDashboardData()}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Refresh
          </button>
        </div>

        <Card className="overflow-hidden border border-border/30">
          {loadingData ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              Loading analysis history...
            </div>
          ) : analyses.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="inline-flex p-3 rounded-full bg-accent text-muted-foreground">
                <Icon icon="activity" size={24} />
              </div>
              <h3 className="text-sm font-semibold">No analysis records yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Run your first security scan or documentation generation to see reports populate here.
              </p>
              <Link href="/code-analysis" className="inline-block pt-2">
                <Button className="text-xs">Run First Analysis</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-accent/40 text-muted-foreground uppercase border-b border-border/30">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Summary</th>
                    <th className="px-4 py-3 font-semibold">Overall Score</th>
                    <th className="px-4 py-3 font-semibold">Security</th>
                    <th className="px-4 py-3 font-semibold">Quality</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {analyses.map((item) => (
                    <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                      <td className="px-4 py-3.5 font-medium whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20 font-mono text-[11px]">
                          {formatAnalysisType(item.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground/80 max-w-xs truncate">
                        {item.summary || "No summary provided"}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className={`font-semibold ${
                          (item.scores?.overallScore ?? 0) >= 80
                            ? "text-emerald-400"
                            : (item.scores?.overallScore ?? 0) >= 50
                            ? "text-amber-400"
                            : "text-rose-400"
                        }`}>
                          {item.scores?.overallScore ?? 0}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {item.scores?.securityScore ?? 0}%
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground whitespace-nowrap">
                        {item.scores?.qualityScore ?? 0}%
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="px-2.5 py-1 text-[11px] font-medium rounded text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all disabled:opacity-50"
                        >
                          {deletingId === item.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
