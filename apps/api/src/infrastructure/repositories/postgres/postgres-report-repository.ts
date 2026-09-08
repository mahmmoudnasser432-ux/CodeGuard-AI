import pg from "pg";
import type { Report } from "../../../domain/entities/report.js";
import type { ReportRepository } from "../../../domain/repositories/report-repository.js";

export class PostgresReportRepository implements ReportRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async save(report: Report): Promise<Report> {
    const createdAt = report.createdAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "Reports" ("Id", "AnalysisId", "Title", "Format", "StorageUrl", "Content", "CreatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT ("Id") DO UPDATE SET
        "AnalysisId" = EXCLUDED."AnalysisId",
        "Title" = EXCLUDED."Title",
        "Format" = EXCLUDED."Format",
        "StorageUrl" = EXCLUDED."StorageUrl",
        "Content" = EXCLUDED."Content",
        "CreatedAt" = EXCLUDED."CreatedAt"
      `,
      [
        report.id,
        report.analysisId,
        report.title,
        report.format,
        report.storageUrl ?? null,
        report.content ?? null,
        createdAt
      ]
    );

    return report;
  }

  async listByAnalysis(analysisId: string): Promise<Report[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "AnalysisId", "Title", "Format", "StorageUrl", "Content", "CreatedAt"
      FROM "Reports"
      WHERE "AnalysisId" = $1
      ORDER BY "CreatedAt" DESC
      `,
      [analysisId]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      analysisId: record.AnalysisId,
      title: record.Title,
      format: record.Format as any,
      storageUrl: record.StorageUrl ?? undefined,
      content: record.Content ?? undefined,
      createdAt: record.CreatedAt
    }));
  }

  async findById(id: string): Promise<Report | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "AnalysisId", "Title", "Format", "StorageUrl", "Content", "CreatedAt"
      FROM "Reports"
      WHERE "Id" = $1
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      analysisId: record.AnalysisId,
      title: record.Title,
      format: record.Format as any,
      storageUrl: record.StorageUrl ?? undefined,
      content: record.Content ?? undefined,
      createdAt: record.CreatedAt
    };
  }
}
