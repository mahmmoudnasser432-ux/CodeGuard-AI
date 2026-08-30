"use client";

import React, { useState } from "react";
import Link from "next/link";
import { InterviewQuestion } from "@/types/ui";
import { generateInterview } from "@/lib/api";
import { Sparkles, ChevronRight, CheckCircle2, RefreshCw } from "lucide-react";

export default function InterviewGeneratorPage() {
  const [activeTab, setActiveTab] = useState<"interview" | "candidate" | "questions-bank">("interview");
  const [sliderValue, setSliderValue] = useState<number>(100); // 0 (Easy) to 100 (Expert)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>("q4");
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisMeta, setAnalysisMeta] = useState<{
    provider?: string;
    source?: string;
    model?: string;
    degradationReason?: string | null;
  } | null>(null);

  const initialQuestions: InterviewQuestion[] = [
    {
      id: "q1",
      number: 1,
      category: "Data Structures",
      difficulty: "Easy",
      question: "Explain the difference between an Array and a Linked List in memory allocation and time complexity for insertions.",
      answer: "Arrays allocate contiguous memory blocks providing O(1) random access but O(N) insertions when shifting or resizing. Linked Lists use dynamic heap allocation connected via pointers, providing O(1) insertions given node reference, but O(N) sequential traversal with cache-line overhead.",
    },
    {
      id: "q2",
      number: 2,
      category: "Algorithms",
      difficulty: "Medium",
      question: "How do you detect a cycle in a directed graph using topological sort or DFS coloring?",
      answer: "In DFS, use 3 states: White (unvisited), Gray (currently visiting/in recursion stack), and Black (fully processed). Encountering a Gray node indicates a back-edge and hence a cycle. In Kahn algorithm (BFS), if the topological sort queue exhausts before visiting all vertices, a cycle exists.",
    },
    {
      id: "q3",
      number: 3,
      category: "System Design",
      difficulty: "Hard",
      question: "Design a distributed rate limiter that handles 100,000 requests/second with microsecond latency and global synchronization.",
      answer: "Use Redis Cluster with Sliding Window Log or Token Bucket algorithm implemented in Lua scripts for atomic increments. Employ local in-memory token buffers (e.g. Envoy/Nginx ratelimit filters) with batch synchronization to reduce centralized Redis I/O latency.",
    },
    {
      id: "q4",
      number: 4,
      category: "Distributed Systems",
      difficulty: "Expert",
      question: "Question 4 : In a distributed system, discuss the trade-offs between consistency and availability using the CAP theorem. Provide a real-world scenario for each.",
      answer: `The CAP Theorem establishes that under a network partition (P), a distributed system can either guarantee Consistency (C) or Availability (A):

1. **CP (Consistency + Partition Tolerance)**:
   - **Mechanism**: Rejects writes or blocks reads if quorum cannot reach synchronization consensus (e.g., Paxos/Raft consensus).
   - **Real-world Scenario**: Financial transaction ledger, stock trading engines, or atomic service registries (e.g. etcd, CockroachDB, Google Spanner). In an ATM network split, the ATM halts withdrawals rather than dispensing duplicate cash.

2. **AP (Availability + Partition Tolerance)**:
   - **Mechanism**: Nodes continue to accept writes and serve stale reads independently, resolving divergence subsequently via conflict-free replicated data types (CRDTs) or Last-Write-Wins timestamps.
   - **Real-world Scenario**: Amazon shopping cart, global DNS routing, social media feed likes (e.g. Apache Cassandra, DynamoDB). An e-commerce cart accepts item additions even during a cross-datacenter fiber cut, merging items at checkout.`,
    },
  ];

  const [questions, setQuestions] = useState<InterviewQuestion[]>(initialQuestions);

  const activeQuestion = questions.find((q) => q.id === selectedQuestionId) || questions[questions.length - 1];

  const handleGenerateAiQuestion = async () => {
    setIsGenerating(true);
    const difficultyName = sliderValue < 33 ? "Easy" : sliderValue < 66 ? "Medium" : sliderValue < 90 ? "Hard" : "Expert";
    try {
      const promptCode = `// Topic: Cloud Security & Distributed Systems\n// Difficulty: ${difficultyName}\n// Generate high-caliber technical interview question and comprehensive rubric`;
      const res = await generateInterview({
        code: promptCode,
        language: "python",
        mode: difficultyName.toLowerCase() as any,
      });

      if (res) {
        setAnalysisMeta({
          provider: res.provider,
          source: res.source,
          model: res.model,
          degradationReason: res.degradationReason,
        });
      }

      const nextNum = questions.length + 1;
      const newQ: InterviewQuestion = {
        id: `q${nextNum}`,
        number: nextNum,
        category: "Cloud Security & Systems",
        difficulty: difficultyName as any,
        question: res?.summary || `Question ${nextNum}: How do you design zero-trust mTLS architectures across microservice service meshes?`,
        answer: res?.generatedMarkdown || `Zero Trust architectures require verifying every connection explicitly:\n\n1. **Identity Proof**: SPIFFE/SPIRE cryptographic workload identities issued via short-lived X.509 certs.\n2. **Mutual TLS**: Envoy proxy sidecars establish bidirectional encrypted pipelines with automatic certificate rotation.\n3. **Granular AuthZ**: Open Policy Agent (OPA) evaluates RBAC/ABAC policies per gRPC/HTTP method call.`,
      };

      setQuestions((prev) => [...prev, newQ]);
      setSelectedQuestionId(newQ.id);
      setIsAnswerRevealed(false);
    } catch (e) {
      console.warn("AI generation fallback:", e);
      const nextNum = questions.length + 1;
      const newQ: InterviewQuestion = {
        id: `q${nextNum}`,
        number: nextNum,
        category: "Distributed Consensus",
        difficulty: difficultyName as any,
        question: `Question ${nextNum}: Explain Raft leader election, log replication quorum, and split-vote mitigation.`,
        answer: `In Raft consensus, nodes transition between Follower, Candidate, and Leader states.\n- **Election Timer**: Randomized timeouts (150-300ms) prevent simultaneous candidate split-votes.\n- **Log Quorum**: Leader accepts client commands, appends them locally, and replicates to peers. Once a majority (N/2 + 1) acknowledge, the entry commits.`,
      };
      setQuestions((prev) => [...prev, newQ]);
      setSelectedQuestionId(newQ.id);
      setIsAnswerRevealed(false);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full bg-[#04060d] text-slate-100 flex flex-col justify-between p-4 sm:p-8 relative overflow-x-hidden flex-1">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-blue-900/10 rounded-full blur-[130px] pointer-events-none"></div>
      <div className="absolute top-1/4 right-1/4 w-[400px] h-[400px] bg-red-900/15 rounded-full blur-[130px] pointer-events-none"></div>

      {/* Top Header */}
      <div className="w-full max-w-6xl mx-auto flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <h1
                className="text-xl sm:text-2xl font-bold tracking-wider text-white"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                CodeGuard AI: Technical Assessment Engine
              </h1>
            </div>
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
          </div>

          {/* Navigation tabs */}
          <nav className="flex items-center gap-5 text-xs sm:text-sm font-medium">
            <button
              onClick={() => setActiveTab("interview")}
              className={`transition cursor-pointer ${
                activeTab === "interview"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400 pb-1 shadow-[0_4px_12px_rgba(56,189,248,0.4)]"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Interview Generator
            </button>
            <button
              onClick={() => setActiveTab("candidate")}
              className={`transition cursor-pointer ${
                activeTab === "candidate"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400 pb-1"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Candidate Analysis
            </button>
            <button
              onClick={() => setActiveTab("questions-bank")}
              className={`transition cursor-pointer ${
                activeTab === "questions-bank"
                  ? "text-cyan-400 font-semibold border-b-2 border-cyan-400 pb-1"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Questions Bank
            </button>
          </nav>
        </header>

        {/* Title */}
        <div className="text-center">
          <h2
            className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Interview Generator
          </h2>
        </div>

        {/* Main Grid: Generator Controls & Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start my-4">
          {/* Left / Center Column (8 cols): Difficulty Slider + Question Card */}
          <div className="lg:col-span-8 flex flex-col items-center gap-8">
            {/* Custom Dual-Glow Metallic Slider */}
            <div className="w-full max-w-xl flex flex-col items-center gap-3">
              <span className="text-xs font-cyber tracking-widest text-slate-300 font-semibold uppercase">
                DIFFICULTY
              </span>

              {/* Slider Track with Blue to Red Glow Gradient */}
              <div className="w-full relative flex items-center py-4">
                {/* Glowing Track background */}
                <div className="w-full h-3 rounded-full bg-slate-900 relative overflow-hidden border border-slate-800">
                  <div className="w-full h-full bg-gradient-to-r from-[#0ea5e9] via-[#818cf8] to-[#ef4444] opacity-80"></div>
                </div>

                {/* Left Blue Glow Aura */}
                <div className="absolute -left-2 w-16 h-16 bg-sky-500/30 rounded-full blur-xl pointer-events-none"></div>

                {/* Right Red Glow Aura */}
                <div className="absolute -right-2 w-16 h-16 bg-red-500/40 rounded-full blur-xl pointer-events-none"></div>

                {/* Slider Input */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderValue}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setSliderValue(val);
                    if (val < 25 && questions.length > 0) setSelectedQuestionId("q1");
                    else if (val < 50 && questions.length > 1) setSelectedQuestionId("q2");
                    else if (val < 75 && questions.length > 2) setSelectedQuestionId("q3");
                    else if (questions.length > 3) setSelectedQuestionId("q4");
                  }}
                  className="absolute w-full opacity-0 cursor-pointer h-10 z-20"
                />

                {/* Visual Brushed Metal Thumb Knob */}
                <div
                  className="absolute pointer-events-none metal-knob w-10 h-7 rounded-xl flex items-center justify-center shadow-[0_6px_16px_rgba(0,0,0,0.8),inset_0_1px_2px_rgba(255,255,255,0.9)] transition-all"
                  style={{
                    left: `calc(${sliderValue}% - ${(sliderValue / 100) * 40}px)`,
                  }}
                >
                  <div className="w-1 h-3 bg-slate-400/80 rounded-full"></div>
                </div>
              </div>

              {/* Slider Labels */}
              <div className="w-full flex items-center justify-between text-xs font-semibold px-2">
                <span className="text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.7)]">
                  EASY <span className="text-[10px] text-slate-400 font-normal">(Blue Glow)</span>
                </span>
                <span className="text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]">
                  EXPERT <span className="text-[10px] text-slate-400 font-normal">(Red Glow)</span>
                </span>
              </div>
            </div>

            {/* Center Question Glowing Glass Card */}
            <div className="w-full max-w-2xl bg-gradient-to-b from-[#101426]/90 to-[#0a0d1a]/95 backdrop-blur-xl rounded-[28px] border border-cyan-500/30 p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.1)] flex flex-col items-center text-center gap-6 relative">
              {/* Question Text display */}
              <div className="text-lg sm:text-2xl text-slate-100 font-cyber font-medium leading-relaxed max-w-xl">
                {activeQuestion.question}
              </div>

              {/* Glowing Red Pill Action Button */}
              <div>
                <button
                  onClick={() => setIsAnswerRevealed(!isAnswerRevealed)}
                  className="group px-8 py-3 rounded-full text-slate-100 font-medium text-sm tracking-wide bg-gradient-to-r from-red-600/30 via-red-500/40 to-orange-600/30 backdrop-blur-md border border-red-500/80 shadow-[0_0_30px_rgba(239,68,68,0.45),inset_0_0_15px_rgba(239,68,68,0.25)] hover:shadow-[0_0_40px_rgba(239,68,68,0.75),inset_0_0_20px_rgba(239,68,68,0.4)] hover:border-red-400 transition-all transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <span>{isAnswerRevealed ? "Hide Answer <<" : "Reveal Answer >>"}</span>
                </button>
              </div>

              {/* Expandable Comprehensive Answer Area */}
              {isAnswerRevealed && (
                <div className="w-full mt-4 p-5 rounded-2xl bg-black/60 border border-slate-800 text-left text-xs sm:text-sm text-slate-300 leading-relaxed space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-cyan-400 font-cyber font-semibold text-xs pb-2 border-b border-slate-800">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Comprehensive Technical Rubric & Answer Guide</span>
                  </div>
                  <div className="whitespace-pre-line font-sans text-slate-300">
                    {activeQuestion.answer}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar: Generated Questions List */}
          <div className="lg:col-span-4 bg-[#080d1c]/80 backdrop-blur-md rounded-2xl border border-cyan-500/20 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <span className="text-xs font-cyber tracking-wider text-slate-200 font-semibold">
                Generated Questions
              </span>
              <span className="text-[10px] text-cyan-400 font-mono">
                {questions.length} Items
              </span>
            </div>

            <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
              {questions.map((q) => {
                const isSelected = selectedQuestionId === q.id;
                return (
                  <div
                    key={q.id}
                    onClick={() => {
                      setSelectedQuestionId(q.id);
                      setIsAnswerRevealed(false);
                    }}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? "bg-cyan-950/40 border-cyan-400/80 shadow-[0_0_15px_rgba(56,189,248,0.25)]"
                        : "bg-black/40 border-slate-800 hover:border-slate-700 hover:bg-black/60"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${
                        q.difficulty === "Easy" ? "bg-sky-400 shadow-[0_0_6px_#38bdf8]" :
                        q.difficulty === "Medium" ? "bg-emerald-400 shadow-[0_0_6px_#22c55e]" :
                        q.difficulty === "Hard" ? "bg-amber-400 shadow-[0_0_6px_#f59e0b]" :
                        "bg-red-400 shadow-[0_0_6px_#ef4444]"
                      }`}></span>
                      <span className="text-xs font-medium text-slate-200 truncate">
                        Q{q.number}: {q.category} ({q.difficulty})
                      </span>
                    </div>

                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${
                      isSelected ? "text-cyan-400 translate-x-1" : "text-slate-600"
                    }`} />
                  </div>
                );
              })}
            </div>

            {/* AI Generator Action Button */}
            <div className="pt-2">
              <button
                onClick={handleGenerateAiQuestion}
                disabled={isGenerating}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600/40 to-cyan-600/40 border border-purple-500/50 hover:border-purple-400 text-slate-200 text-xs font-medium transition flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/20 cursor-pointer"
              >
                {isGenerating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-300" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                )}
                <span>Generate Live AI Question</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full py-4 text-center text-[11px] text-slate-600 border-t border-slate-900 bg-[#020409]">
        CodeGuard AI © 2026 &nbsp;|&nbsp; <Link href="/" className="hover:underline">Privacy Policy</Link> &nbsp;|&nbsp; <Link href="/" className="hover:underline">Contact</Link>
      </footer>
    </div>
  );
}
