export type AnalysisType =
  | "code-review"
  | "security-analysis"
  | "performance-analysis"
  | "documentation-generator"
  | "interview-generator"
  | "repository-analysis"
  | "scoring-engine";

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
}
