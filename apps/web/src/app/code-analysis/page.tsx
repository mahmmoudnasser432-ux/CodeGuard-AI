"use client";

import React, { useState } from "react";
import { analyzeCode, AnalysisResponse } from "@/lib/api";
import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/card";
import SourceBadge from "@/components/source-badge";
import { ShieldCheck, Play, CheckCircle2, AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

export default function CodeAnalysisPage() {
  const [code, setCode] = useState(`import os
import psycopg2

def get_user_data(user_id):
    # Potential SQL Injection vulnerability for testing
    query = "SELECT * FROM users WHERE id = '" + user_id + "'"
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cursor = conn.cursor()
    cursor.execute(query)
    return cursor.fetchall()
`);
  const [language, setLanguage] = useState("python");
  const [mode, setMode] = useState<"standard" | "expert">("expert");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeCode({
        code,
        language,
        mode,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to analyze code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-primary" />
          Code Security & Vulnerability Analysis
        </h1>
        <p className="text-muted-foreground">
          Perform multi-provider static security analysis, code quality auditing, and vulnerability detection.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Form */}
        <div className="lg:col-span-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Source Code</CardTitle>
                <div className="flex gap-2">
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="python">Python</option>
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="go">Go</option>
                    <option value="java">Java</option>
                  </select>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as any)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    <option value="expert">Expert Mode</option>
                    <option value="standard">Standard Mode</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={16}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-xs bg-muted/30"
                placeholder="Paste code to analyze..."
              />
              <Button onClick={handleAnalyze} disabled={loading || !code.trim()} className="w-full gap-2">
                {loading ? (
                  <>Analyzing with Multi-Provider Engine...</>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Run Security Analysis
                  </>
                )}
              </Button>
              {error && (
                <div className="p-3 text-sm rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-6 space-y-4">
          {result ? (
            <div className="space-y-4">
              <SourceBadge
                source={result.source}
                provider={result.provider}
                model={result.model}
                degradationReason={result.degradationReason}
              />

              {/* Overall Score */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Security & Quality Scores</span>
                    <span className="text-2xl font-bold text-primary font-mono">
                      {result.scores.overallScore}/100
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Security</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.securityScore}</div>
                    </div>
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Quality</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.qualityScore}</div>
                    </div>
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Performance</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.performanceScore}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Findings */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Findings ({result.findings.length})</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {result.findings.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-400 p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
                      <CheckCircle2 className="h-4 w-4" /> No severe vulnerabilities detected.
                    </div>
                  ) : (
                    result.findings.map((f, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {f.severity === "high" || f.severity === "critical" ? (
                              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                            )}
                            {f.title}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-muted border">
                            {f.severity}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{f.description}</p>
                        {f.recommendation && (
                          <div className="text-primary font-medium pt-1">
                            Recommendation: {f.recommendation}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Improved Code */}
              {result.improvedCode && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" /> Remediated Code
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="p-3 rounded bg-muted font-mono text-xs overflow-x-auto">
                      <code>{result.improvedCode}</code>
                    </pre>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[350px] border-dashed">
              <div className="text-center p-6 space-y-2">
                <ShieldCheck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">
                  Run an analysis to view vulnerability insights, metrics, and remediation keys.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
