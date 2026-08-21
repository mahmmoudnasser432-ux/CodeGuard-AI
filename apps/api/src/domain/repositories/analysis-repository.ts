import { AnalysisResult } from "../entities/analysis.ts";

export interface AnalysisRepository {
  save(result: AnalysisResult, requestedByUserId: string): Promise<AnalysisResult>;
  findById(id: string): Promise<AnalysisResult | null>;
  listByUser(requestedByUserId: string): Promise<AnalysisResult[]>;
}
