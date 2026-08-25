import { AnalysisResult } from "../entities/analysis.js";

export interface UserAnalysisStats {
  totalAnalyses: number;
  avgScore: number;
  reposScanned: number;
  docsGenerated: number;
  scoreByType: Record<string, number>;
}

export interface AnalysisRepository {
  save(result: AnalysisResult, requestedByUserId: string): Promise<AnalysisResult>;
  findById(id: string): Promise<AnalysisResult | null>;
  listByUser(requestedByUserId: string, limit?: number, offset?: number): Promise<AnalysisResult[]>;
  deleteById(id: string, requestedByUserId: string): Promise<boolean>;
  getUserStats(requestedByUserId: string): Promise<UserAnalysisStats>;
}
