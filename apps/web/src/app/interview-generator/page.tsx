"use client";

import React, { useState } from "react";
import { generateInterview, AnalysisResponse } from "@/lib/api";
import { Button } from "@/components/button";
import { Textarea } from "@/components/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import SourceBadge from "@/components/source-badge";
import { UserCheck, Sparkles, Copy, Check } from "lucide-react";

export default function InterviewGeneratorPage() {
  const [code, setCode] = useState(`def find_median_sorted_arrays(nums1, nums2):
    # O(log(min(m, n))) binary search partition
    if len(nums1) > len(nums2):
        nums1, nums2 = nums2, nums1
    m, n = len(nums1), len(nums2)
    imin, imax, half_len = 0, m, (m + n + 1) // 2
    while imin <= imax:
        i = (imin + imax) // 2
        j = half_len - i
        if i < m and nums2[j-1] > nums1[i]:
            imin = i + 1
        elif i > 0 and nums1[i-1] > nums2[j]:
            imax = i - 1
        else:
            # Partition reached
            max_of_left = max(nums1[i-1] if i > 0 else float('-inf'),
                              nums2[j-1] if j > 0 else float('-inf'))
            if (m + n) % 2 == 1:
                return max_of_left
            min_of_right = min(nums1[i] if i < m else float('inf'),
                               nums2[j] if j < n else float('inf'))
            return (max_of_left + min_of_right) / 2.0
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
      const res = await generateInterview({
        code,
        language,
        mode: "expert",
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Failed to generate interview questions.");
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
          <UserCheck className="h-8 w-8 text-primary" />
          Technical Interview Question Generator
        </h1>
        <p className="text-muted-foreground">
          Auto-formulate deep technical interview questions, grading rubrics, and conceptual inquiry based on source code.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Code Base / Algorithm</CardTitle>
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
                placeholder="Paste code or algorithmic function..."
              />
              <Button onClick={handleGenerate} disabled={loading || !code.trim()} className="w-full gap-2">
                {loading ? "Formulating Questions..." : <><Sparkles className="h-4 w-4" /> Generate Interview Prep</>}
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
                    <CardTitle className="text-base">Interview Inquiry & Evaluation Guide</CardTitle>
                    <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
                      {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy Guide</>}
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
                <UserCheck className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">
                  Submit code to generate targeted interview questions, complexity tests, and grading rubrics.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
