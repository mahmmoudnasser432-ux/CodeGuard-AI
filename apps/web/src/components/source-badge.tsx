"use client";

import React from "react";
import { AnalysisSource } from "@/lib/api";

interface SourceBadgeProps {
  source?: AnalysisSource;
  provider?: string;
  model?: string;
  degradationReason?: string;
  className?: string;
}

export default function SourceBadge({
  source = "REAL_GEMINI",
  provider = "google-gemini",
  model,
  degradationReason,
  className = "",
}: SourceBadgeProps) {
  let badgeStyle = "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
  let label = "GOOGLE GEMINI";

  if (source === "REAL_OPENAI") {
    badgeStyle = "bg-sky-500/10 text-sky-400 border-sky-500/30";
    label = "OPENAI";
  } else if (source === "REAL_OPENROUTER") {
    badgeStyle = "bg-purple-500/10 text-purple-400 border-purple-500/30";
    label = "OPENROUTER";
  } else if (source === "FALLBACK_ANALYZER") {
    badgeStyle = "bg-amber-500/10 text-amber-400 border-amber-500/30";
    label = "FALLBACK ANALYZER";
  } else if (source === "QUOTA_EXCEEDED") {
    badgeStyle = "bg-rose-500/10 text-rose-400 border-rose-500/30";
    label = "QUOTA EXCEEDED";
  }

  const isFailover = degradationReason && degradationReason.toLowerCase().includes("failover");

  return (
    <div className={`flex flex-col gap-2 p-3 rounded-lg border bg-card/60 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Active Provider:</span>
          <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${badgeStyle}`}>
            {label}
          </span>
          {isFailover && (
            <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              ⚡ Failover Activated
            </span>
          )}
        </div>
        {provider && (
          <span className="text-xs text-muted-foreground">
            Provider: <span className="font-mono text-foreground font-medium">{provider}</span>
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground border-t border-border/20 pt-1.5">
        {model && (
          <span>
            Model: <span className="font-mono text-foreground">{model}</span>
          </span>
        )}
        {degradationReason && (
          <span className="text-amber-400/90 font-medium">
            {degradationReason}
          </span>
        )}
      </div>
    </div>
  );
}
