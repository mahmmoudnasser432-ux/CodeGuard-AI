import pg from "pg";
import { AnalysisResult } from "../../../domain/entities/analysis.js";
import { AnalysisRepository, UserAnalysisStats } from "../../../domain/repositories/analysis-repository.js";

export class PostgresAnalysisRepository implements AnalysisRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async save(result: AnalysisResult, requestedByUserId: string): Promise<AnalysisResult> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const startedAt = new Date();
      const completedAt = new Date();
      const projectId = result.projectId ?? null;
      const repositoryId = null;
      const status = "completed";
      const title = result.title ?? null;
      const summary = result.summary ?? "";

      await client.query(
        `
        INSERT INTO "Analyses" (
          "Id", "ProjectId", "RepositoryId", "RequestedByUserId",
          "AnalysisType", "Status", "Title", "Summary", "StartedAt", "CompletedAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("Id") DO UPDATE SET
          "ProjectId" = EXCLUDED."ProjectId",
          "RepositoryId" = EXCLUDED."RepositoryId",
          "RequestedByUserId" = EXCLUDED."RequestedByUserId",
          "AnalysisType" = EXCLUDED."AnalysisType",
          "Status" = EXCLUDED."Status",
          "Title" = EXCLUDED."Title",
          "Summary" = EXCLUDED."Summary",
          "CompletedAt" = EXCLUDED."CompletedAt"
        `,
        [
          result.id,
          projectId,
          repositoryId,
          requestedByUserId,
          result.type,
          status,
          title,
          summary,
          startedAt,
          completedAt
        ]
      );

      await client.query(`DELETE FROM "AnalysisScores" WHERE "AnalysisId" = $1`, [result.id]);

      await client.query(
        `
        INSERT INTO "AnalysisScores" (
          "AnalysisId", "OverallScore", "SecurityScore", "QualityScore",
          "PerformanceScore", "MaintainabilityScore", "ReadabilityScore"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          result.id,
          result.scores.overallScore,
          result.scores.securityScore,
          result.scores.qualityScore,
          result.scores.performanceScore,
          result.scores.maintainabilityScore,
          result.scores.readabilityScore
        ]
      );

      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<AnalysisResult | null> {
    const analysisResult = await this.pool.query(
      `
      SELECT a."Id", a."AnalysisType" AS "Type", a."Title", a."Summary",
             a."StartedAt", a."CompletedAt", a."ProjectId", a."RequestedByUserId"
      FROM "Analyses" a
      WHERE a."Id" = $1
      `,
      [id]
    );

    const analysisRecord = analysisResult.rows[0];
    if (!analysisRecord) return null;

    const scoresResult = await this.pool.query(
      `
      SELECT "OverallScore", "SecurityScore", "QualityScore", "PerformanceScore",
             "MaintainabilityScore", "ReadabilityScore"
      FROM "AnalysisScores"
      WHERE "AnalysisId" = $1
      `,
      [id]
    );

    const scoresRecord = scoresResult.rows[0];
    if (!scoresRecord) return null;

    return {
      id: analysisRecord.Id,
      title: analysisRecord.Title ?? "",
      type: analysisRecord.Type as any,
      summary: analysisRecord.Summary ?? "",
      projectId: analysisRecord.ProjectId,
      scores: {
        overallScore: scoresRecord.OverallScore,
        securityScore: scoresRecord.SecurityScore,
        qualityScore: scoresRecord.QualityScore,
        performanceScore: scoresRecord.PerformanceScore,
        maintainabilityScore: scoresRecord.MaintainabilityScore,
        readabilityScore: scoresRecord.ReadabilityScore
      },
      findings: [],
      improvedCode: undefined,
      generatedMarkdown: undefined
    };
  }

  async listByUser(requestedByUserId: string, limit: number = 50, offset: number = 0): Promise<AnalysisResult[]> {
    const analysesResult = await this.pool.query(
      `
      SELECT a."Id", a."AnalysisType" AS "Type", a."Title", a."Summary",
             a."StartedAt", a."CompletedAt", a."ProjectId",
             s."OverallScore", s."SecurityScore", s."QualityScore", s."PerformanceScore",
             s."MaintainabilityScore", s."ReadabilityScore"
      FROM "Analyses" a
      LEFT JOIN "AnalysisScores" s ON a."Id" = s."AnalysisId"
      WHERE a."RequestedByUserId" = $1
      ORDER BY a."StartedAt" DESC
      LIMIT $2 OFFSET $3
      `,
      [requestedByUserId, limit, offset]
    );

    return analysesResult.rows.map((record) => ({
      id: record.Id,
      type: record.Type as any,
      title: record.Title ?? "",
      summary: record.Summary ?? "",
      projectId: record.ProjectId,
      scores: {
        overallScore: record.OverallScore ?? 0,
        securityScore: record.SecurityScore ?? 0,
        qualityScore: record.QualityScore ?? 0,
        performanceScore: record.PerformanceScore ?? 0,
        maintainabilityScore: record.MaintainabilityScore ?? 0,
        readabilityScore: record.ReadabilityScore ?? 0
      },
      findings: [],
      improvedCode: undefined,
      generatedMarkdown: undefined
    }));
  }

  async deleteById(id: string, requestedByUserId: string): Promise<boolean> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const checkResult = await client.query(
        `SELECT "Id" FROM "Analyses" WHERE "Id" = $1 AND "RequestedByUserId" = $2`,
        [id, requestedByUserId]
      );

      if (checkResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      await client.query(`DELETE FROM "AnalysisScores" WHERE "AnalysisId" = $1`, [id]);
      await client.query(`DELETE FROM "Analyses" WHERE "Id" = $1`, [id]);

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserStats(requestedByUserId: string): Promise<UserAnalysisStats> {
    const statsResult = await this.pool.query(
      `
      SELECT
        COUNT(a."Id") AS "TotalAnalyses",
        AVG(s."OverallScore") AS "AvgScore",
        COUNT(DISTINCT a."RepositoryId") AS "ReposScanned",
        COUNT(CASE WHEN a."AnalysisType" = 'documentation-generator' THEN 1 END) AS "DocsGenerated"
      FROM "Analyses" a
      LEFT JOIN "AnalysisScores" s ON a."Id" = s."AnalysisId"
      WHERE a."RequestedByUserId" = $1
      `,
      [requestedByUserId]
    );

    const typeBreakdownResult = await this.pool.query(
      `
      SELECT a."AnalysisType", COUNT(a."Id") AS "Count"
      FROM "Analyses" a
      WHERE a."RequestedByUserId" = $1
      GROUP BY a."AnalysisType"
      `,
      [requestedByUserId]
    );

    const stats = statsResult.rows[0] || {};
    const scoreByType: Record<string, number> = {};
    for (const row of typeBreakdownResult.rows) {
      scoreByType[row.AnalysisType] = Number(row.Count) || 0;
    }

    return {
      totalAnalyses: Number(stats.TotalAnalyses) || 0,
      avgScore: Math.round(Number(stats.AvgScore) || 0),
      reposScanned: Number(stats.ReposScanned) || 0,
      docsGenerated: Number(stats.DocsGenerated) || 0,
      scoreByType
    };
  }

  async findByProjectId(projectId: string): Promise<AnalysisResult[]> {
    const analysesResult = await this.pool.query(
      `
      SELECT a."Id", a."AnalysisType" AS "Type", a."Title", a."Summary",
             a."StartedAt", a."CompletedAt", a."ProjectId",
             s."OverallScore", s."SecurityScore", s."QualityScore", s."PerformanceScore",
             s."MaintainabilityScore", s."ReadabilityScore"
      FROM "Analyses" a
      LEFT JOIN "AnalysisScores" s ON a."Id" = s."AnalysisId"
      WHERE a."ProjectId" = $1
      ORDER BY a."StartedAt" DESC
      `,
      [projectId]
    );

    return analysesResult.rows.map((record) => ({
      id: record.Id,
      type: record.Type as any,
      title: record.Title ?? "",
      summary: record.Summary ?? "",
      projectId: record.ProjectId,
      scores: {
        overallScore: record.OverallScore ?? 0,
        securityScore: record.SecurityScore ?? 0,
        qualityScore: record.QualityScore ?? 0,
        performanceScore: record.PerformanceScore ?? 0,
        maintainabilityScore: record.MaintainabilityScore ?? 0,
        readabilityScore: record.ReadabilityScore ?? 0
      },
      findings: [],
      improvedCode: undefined,
      generatedMarkdown: undefined
    }));
  }
}
