"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { CircuitBoardBackground } from "@/components/canvas/CircuitBoardBackground";
import { RepositoryItem } from "@/types/ui";
import { analyzeRepository } from "@/lib/api";
import { Cpu, Atom, Brain, GitBranch } from "lucide-react";

function GithubIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function RepositoryAnalysisPage() {
  const router = useRouter();
  const [repoInput, setRepoInput] = useState("Project-Odyssey");
  const [selectedRepo, setSelectedRepo] = useState<string>("Project-Odyssey");
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(65);
  const [analysisMeta, setAnalysisMeta] = useState<{
    provider?: string;
    source?: string;
    model?: string;
    degradationReason?: string | null;
  } | null>(null);

  const recentRepos: RepositoryItem[] = [
    {
      id: "1",
      name: "Project-Odyssey",
      type: "github",
      status: "secure",
      healthScore: 98,
      lastScanned: "2 hours ago",
    },
    {
      id: "2",
      name: "CyberCore-API",
      type: "api",
      status: "warning",
      healthScore: 84,
      lastScanned: "Yesterday",
    },
    {
      id: "3",
      name: "Quantum-Engine",
      type: "quantum",
      status: "secure",
      healthScore: 95,
      lastScanned: "3 days ago",
    },
    {
      id: "4",
      name: "Neuro-Net-Platform",
      type: "ai",
      status: "critical",
      healthScore: 72,
      lastScanned: "1 week ago",
    },
  ];

  const handleSelectRepo = (name: string) => {
    setSelectedRepo(name);
    setRepoInput(name);
  };

  const handleStartScan = async () => {
    setIsScanning(true);
    setScanProgress(10);

    // Run backend analysis concurrently
    const analysisPromise = analyzeRepository({
      code: `// Repository target: ${repoInput || selectedRepo}\nimport express from "express";\nconst app = express();\nexport default app;`,
      language: "typescript",
      mode: "expert",
      repositoryContext: {
        name: repoInput || selectedRepo,
      },
    }).then((res) => {
      if (res) {
        setAnalysisMeta({
          provider: res.provider,
          source: res.source,
          model: res.model,
          degradationReason: res.degradationReason,
        });
      }
      return res;
    }).catch((err) => {
      console.warn("Backend repo scan fallback:", err);
      return null;
    });

    let current = 15;
    const interval = setInterval(async () => {
      current += 20;
      if (current >= 100) {
        clearInterval(interval);
        setScanProgress(100);
        await analysisPromise;
        setTimeout(() => {
          setIsScanning(false);
          router.push("/architecture");
        }, 500);
      } else {
        setScanProgress(current);
      }
    }, 250);
  };

  const getRepoIcon = (type: RepositoryItem["type"]) => {
    switch (type) {
      case "github":
        return <GithubIcon className="w-6 h-6 text-slate-300" />;
      case "api":
        return <Cpu className="w-6 h-6 text-cyan-400" />;
      case "quantum":
        return <Atom className="w-6 h-6 text-purple-400" />;
      case "ai":
        return <Brain className="w-6 h-6 text-pink-400" />;
      default:
        return <GitBranch className="w-6 h-6 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#04060d] text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-hidden flex-1">
      {/* Dynamic Circuit Board Canvas Background */}
      <CircuitBoardBackground />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-start gap-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono uppercase tracking-widest text-cyan-400">
            INTELLIGENCE PROTOCOL 0.4
          </span>
        </div>

        <h1
          className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-300 via-purple-300 to-pink-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.4)]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Repository Intelligence Initiation
        </h1>
        {analysisMeta && (
          <div className="flex flex-wrap items-center gap-2 text-xs mt-1 text-slate-400">
            <span className="text-slate-500 font-medium">Provider:</span>
            <span className="text-emerald-400 font-mono font-semibold">{analysisMeta.provider}</span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400 font-mono">{analysisMeta.source}</span>
            {analysisMeta.model && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-purple-400 font-mono">{analysisMeta.model}</span>
              </>
            )}
            {analysisMeta.degradationReason && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400 text-[11px]">{analysisMeta.degradationReason}</span>
              </>
            )}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-4xl mx-auto my-auto flex flex-col items-center gap-8 text-center">
        {/* Central Glowing Input Capsule */}
        <div className="w-full max-w-2xl relative">
          <div className="relative rounded-full p-[2px] bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 shadow-[0_0_35px_rgba(168,85,247,0.45),inset_0_0_15px_rgba(56,189,248,0.25)]">
            <div className="relative flex items-center bg-[#070c1b]/90 backdrop-blur-xl rounded-full px-6 py-4">
              <input
                type="text"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="Connect your architecture."
                className="w-full bg-transparent text-xl sm:text-2xl text-slate-100 placeholder-slate-400 font-cyber focus:outline-none tracking-wide text-center"
              />
              <span className="animate-pulse text-cyan-400 font-light text-2xl">|</span>
            </div>
          </div>
        </div>

        {/* Recent Repos Grid */}
        <div className="w-full bg-[#070d1e]/70 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-5 shadow-2xl">
          <div className="text-left text-xs font-cyber tracking-wider text-slate-400 uppercase mb-3">
            Recent Repos
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {recentRepos.map((repo) => {
              const isSelected = selectedRepo === repo.name;
              return (
                <div
                  key={repo.id}
                  onClick={() => handleSelectRepo(repo.name)}
                  className={`p-4 rounded-xl border transition-all flex flex-col items-center text-center gap-3 cursor-pointer ${
                    isSelected
                      ? "bg-cyan-950/40 border-cyan-400/80 shadow-[0_0_20px_rgba(56,189,248,0.3)]"
                      : "bg-black/40 border-slate-800 hover:border-slate-700 hover:bg-black/60"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-slate-900/80 border border-slate-700/50 flex items-center justify-center shadow-inner">
                    {getRepoIcon(repo.type)}
                  </div>

                  <span className="text-xs font-semibold text-slate-200 truncate w-full font-mono">
                    {repo.name}
                  </span>

                  <div className="flex items-center gap-2 w-full justify-between pt-1 border-t border-slate-800/80">
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        repo.status === "secure" ? "bg-emerald-400 shadow-[0_0_6px_#22c55e]" :
                        repo.status === "warning" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" : "bg-red-400 shadow-[0_0_6px_#ef4444]"
                      }`}></span>
                      <span className="text-[10px] text-slate-400">{repo.healthScore}%</span>
                    </div>

                    <button
                      type="button"
                      className={`text-[11px] px-2.5 py-0.5 rounded-full font-medium transition ${
                        isSelected
                          ? "bg-cyan-500 text-black font-bold shadow-sm shadow-cyan-400"
                          : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {isSelected ? "Selected" : "Select"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scanning Sequence Progress Bar & Button */}
        <div className="w-full max-w-xl flex flex-col items-center gap-4">
          <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-[1px]">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(168,85,247,0.8)]"
              style={{ width: `${isScanning ? scanProgress : 65}%` }}
            ></div>
          </div>

          <button
            onClick={handleStartScan}
            disabled={isScanning}
            className="group relative px-8 py-3 rounded-full text-slate-100 font-medium text-sm tracking-wide bg-[#090f22]/90 backdrop-blur-md border border-purple-400/80 shadow-[0_0_30px_rgba(168,85,247,0.4),inset_0_0_15px_rgba(217,70,239,0.2)] hover:shadow-[0_0_40px_rgba(168,85,247,0.7),inset_0_0_20px_rgba(217,70,239,0.35)] hover:border-purple-300 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isScanning ? (
                <>
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-white rounded-full animate-spin"></div>
                  Analyzing Syntax Trees ({scanProgress}%)...
                </>
              ) : (
                "Initiate Scanning Sequence"
              )}
            </span>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-[11px] text-slate-600">
        CodeGuard AI Architecture Engine • Node Topology & AST Parsing
      </footer>
    </div>
  );
}
