import type { Report } from "../entities/report.js";

export interface ReportRepository {
  save(report: Report): Promise<Report>;
  listByAnalysis(analysisId: string): Promise<Report[]>;
}
