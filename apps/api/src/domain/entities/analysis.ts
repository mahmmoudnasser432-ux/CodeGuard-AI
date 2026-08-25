export type AnalysisType =
  | "code-review"
  | "security-analysis"
  | "performance-analysis"
  | "documentation-generator"
  | "interview-generator"
  | "repository-analysis"
  | "scoring-engine";

export type AnalysisSource =
  | "REAL_GEMINI"
  | "REAL_OPENAI"
  | "REAL_OPENROUTER"
  | "FALLBACK_ANALYZER"
  | "QUOTA_EXCEEDED";

export interface AnalysisScore {
  overallScore: number;
  securityScore: number;
  qualityScore: number;
  performanceScore: number;
  maintainabilityScore: number;
  readabilityScore: number;
}

export interface AnalysisFinding {
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  description: string;
  recommendation: string;
  line?: number;
}

export interface AnalysisResult {
  id: string;
  title: string;
  type: AnalysisType;
  summary: string;
  scores: AnalysisScore;
  findings: AnalysisFinding[];
  improvedCode?: string;
  generatedMarkdown?: string;
  projectId?: string;
  source?: AnalysisSource;
  analysisSource?: AnalysisSource;
  provider?: string;
  model?: string;
  degradationReason?: string;
}
