import { sqlPool } from "../database/sqlserver.js";
import { Report } from "../../domain/entities/report.js";
import { ReportRepository } from "../../domain/repositories/report-repository.js";

export class SqlReportRepository implements ReportRepository {
  async save(report: Report): Promise<Report> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', report.id)
      .input('analysisId', report.analysisId)
      .input('title', report.title)
      .input('format', report.format)
      .input('storageUrl', report.storageUrl ?? null)
      .input('content', report.content ?? null)
      .input('createdAt', report.createdAt ?? new Date())
      .query(`
        MERGE dbo.Reports AS target
        USING (SELECT @id as Id, @analysisId as AnalysisId, @title as Title, @format as Format,
                  @storageUrl as StorageUrl, @content as Content, @createdAt as CreatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            AnalysisId = source.AnalysisId,
            Title = source.Title,
            Format = source.Format,
            StorageUrl = source.StorageUrl,
            Content = source.Content,
            CreatedAt = source.CreatedAt
        WHEN NOT MATCHED THEN
          INSERT INTO dbo.Reports (Id, AnalysisId, Title, Format, StorageUrl, Content, CreatedAt)
          VALUES (source.Id, source.AnalysisId, source.Title, source.Format, source.StorageUrl,
                  source.Content, source.CreatedAt);
      `);

    return report;
  }

  async listByAnalysis(analysisId: string): Promise<Report[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('analysisId', analysisId)
      .query(`
        SELECT Id, AnalysisId, Title, Format, StorageUrl, Content, CreatedAt
        FROM dbo.Reports
        WHERE AnalysisId = @analysisId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      analysisId: record.AnalysisId,
      title: record.Title,
      format: record.Format as any, // Format is stored as NVARCHAR in DB
      storageUrl: record.StorageUrl ?? undefined,
      content: record.Content ?? undefined,
      createdAt: record.CreatedAt
    }));
  }

  async findById(id: string): Promise<Report | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, AnalysisId, Title, Format, StorageUrl, Content, CreatedAt
        FROM dbo.Reports
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return {
      id: record.Id,
      analysisId: record.AnalysisId,
      title: record.Title,
      format: record.Format as any, // Format is stored as NVARCHAR in DB
      storageUrl: record.StorageUrl ?? undefined,
      content: record.Content ?? undefined,
      createdAt: record.CreatedAt
    };
  }
}