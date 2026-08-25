"use client";

import React, { useState } from "react";
import { generateDocumentation, AnalysisResponse } from "@/lib/api";
import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import SourceBadge from "@/components/source-badge";
import { BookOpen, Sparkles, Copy, Check } from "lucide-react";

export default function DocumentationGeneratorPage() {
  const [code, setCode] = useState(`class RateLimiter:
    """Token bucket rate limiter implementation."""
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity
        self.refill_rate = refill_rate
        self.tokens = capacity
        self.last_refill = time.time()

    def allow_request(self) -> bool:
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
`);
  const [language, setLanguage] = useState("python");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateDocumentation({
        code,
        language,
        mode: "expert",
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to generate documentation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.generatedMarkdown) {
      navigator.clipboard.writeText(result.generatedMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-8 w-8 text-primary" />
          AI Documentation Generator
        </h1>
        <p className="text-muted-foreground">
          Auto-generate comprehensive markdown documentation, API specifications, and architectural overviews.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Input Code</CardTitle>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="python">Python</option>
                  <option value="typescript">TypeScript</option>
                  <option value="javascript">JavaScript</option>
                  <option value="go">Go</option>
                </select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={16}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono text-xs bg-muted/30"
                placeholder="Paste code or class to document..."
              />
              <Button onClick={handleGenerate} disabled={loading || !code.trim()} className="w-full gap-2">
                {loading ? "Generating Documentation..." : <><Sparkles className="h-4 w-4" /> Generate Markdown Docs</>}
              </Button>
              {error && (
                <div className="p-3 text-sm rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-7 space-y-4">
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
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Generated Markdown Documentation</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                      {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy Markdown</>}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="p-4 rounded-lg bg-muted/30 border font-mono text-xs whitespace-pre-wrap leading-relaxed max-h-[500px] overflow-y-auto">
                    {result.generatedMarkdown || result.summary}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[350px] border-dashed">
              <div className="text-center p-6 space-y-2">
                <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">
                  Submit your code to generate documentation.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
