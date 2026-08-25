"use client";

import React, { useState } from "react";
import { analyzeRepository, AnalysisResponse } from "@/lib/api";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Textarea } from "@/components/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import SourceBadge from "@/components/source-badge";
import { GitBranch, Play, Code2 } from "lucide-react";

export default function RepositoryAnalysisPage() {
  const [repoName, setRepoName] = useState("auth-microservice");
  const [branch, setBranch] = useState("main");
  const [code, setCode] = useState(`// Repository entrypoint module
import express from 'express';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' });
  const token = jwt.sign({ sub: username }, 'HARDCODED_JWT_SECRET');
  res.json({ token });
});

export default app;
`);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeRepository({
        code,
        language: "typescript",
        mode: "expert",
        repositoryContext: {
          name: repoName,
          branch,
        },
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to analyze repository.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <GitBranch className="h-8 w-8 text-primary" />
          Repository Architecture Analysis
        </h1>
        <p className="text-muted-foreground">
          Perform multi-file architectural analysis, dependency tree security validation, and maintainability indexing.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Repository Context</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Repository Name</label>
                  <Input value={repoName} onChange={(e) => setRepoName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium">Branch</label>
                  <Input value={branch} onChange={(e) => setBranch(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground font-medium">Code / Manifest</label>
                <Textarea
                  rows={14}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="font-mono text-xs bg-muted/30 mt-1"
                />
              </div>

              <Button onClick={handleAnalyze} disabled={loading || !code.trim()} className="w-full gap-2">
                {loading ? "Analyzing Architecture..." : <><Play className="h-4 w-4" /> Run Repository Analysis</>}
              </Button>
              {error && (
                <div className="p-3 text-sm rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-6 space-y-4">
          {result ? (
            <div className="space-y-4">
              <SourceBadge
                source={result.source}
                provider={result.provider}
                model={result.model}
                degradationReason={result.degradationReason}
              />
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Repository Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-3">
                  <p>{result.summary}</p>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs pt-2">
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Maintainability</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.maintainabilityScore}</div>
                    </div>
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Security</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.securityScore}</div>
                    </div>
                    <div className="p-2 rounded bg-muted/40 border">
                      <div className="text-muted-foreground">Readability</div>
                      <div className="font-semibold text-foreground text-sm">{result.scores.readabilityScore}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {result.findings && result.findings.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Architecture Findings ({result.findings.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {result.findings.map((f, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-muted/30 space-y-1 text-xs">
                        <div className="font-semibold text-foreground">{f.title}</div>
                        <p className="text-muted-foreground">{f.description}</p>
                        {f.recommendation && <div className="text-primary pt-1">Action: {f.recommendation}</div>}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[350px] border-dashed">
              <div className="text-center p-6 space-y-2">
                <Code2 className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">
                  Run a repository analysis to evaluate architecture patterns and component health.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
