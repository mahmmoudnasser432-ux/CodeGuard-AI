import { sqlPool } from "../database/sqlserver.js";
import { AnalysisResult } from "../../domain/entities/analysis.js";
import { AnalysisRepository, UserAnalysisStats } from "../../domain/repositories/analysis-repository.js";

export class SqlAnalysisRepository implements AnalysisRepository {
  async save(result: AnalysisResult, requestedByUserId: string): Promise<AnalysisResult> {
    const pool = await sqlPool.connect();

    // Start a transaction
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      const startedAt = new Date();
      const completedAt = new Date();
      const analysisSqlParameters = {
        id: result.id,
        projectId: result.projectId ?? null,
        repositoryId: null,
        requestedByUserId,
        type: result.type,
        status: "completed",
        title: result.title ?? null,
        summary: result.summary ?? "",
        startedAt,
        completedAt
      };

      console.log("ANALYSIS SQL PARAMETERS:", analysisSqlParameters);

      // Insert or update the analysis
      await transaction.request()
        .input('id', analysisSqlParameters.id)
        .input('projectId', analysisSqlParameters.projectId)
        .input('repositoryId', analysisSqlParameters.repositoryId)
        .input('requestedByUserId', analysisSqlParameters.requestedByUserId)
        .input('type', analysisSqlParameters.type)
        .input('status', analysisSqlParameters.status)
        .input('title', analysisSqlParameters.title)
        .input('summary', analysisSqlParameters.summary)
        .input('startedAt', analysisSqlParameters.startedAt)
        .input('completedAt', analysisSqlParameters.completedAt)
        .query(`
          MERGE dbo.Analyses AS target
          USING (SELECT @id as Id, @projectId as ProjectId, @repositoryId as RepositoryId,
                    @requestedByUserId as RequestedByUserId, @type as AnalysisType,
                    @status as Status, @title as Title, @summary as Summary, @startedAt as StartedAt,
                    @completedAt as CompletedAt) AS source
          ON target.Id = source.Id
          WHEN MATCHED THEN
            UPDATE SET
              ProjectId = source.ProjectId,
              RepositoryId = source.RepositoryId,
              RequestedByUserId = source.RequestedByUserId,
              AnalysisType = source.AnalysisType,
              Status = source.Status,
              Title = source.Title,
              Summary = source.Summary,
              CompletedAt = source.CompletedAt
          WHEN NOT MATCHED THEN
            INSERT (Id, ProjectId, RepositoryId, RequestedByUserId, AnalysisType, Status, Title, Summary, StartedAt, CompletedAt)
            VALUES (source.Id, source.ProjectId, source.RepositoryId, source.RequestedByUserId, source.AnalysisType, source.Status, source.Title, source.Summary, source.StartedAt, source.CompletedAt);
        `);

      // Delete existing scores for this analysis (if any)
      await transaction.request()
        .input('analysisId', result.id)
        .query(`DELETE FROM dbo.AnalysisScores WHERE AnalysisId = @analysisId`);

      // Insert the analysis scores
      await transaction.request()
        .input('analysisId', result.id)
        .input('overallScore', result.scores.overallScore)
        .input('securityScore', result.scores.securityScore)
        .input('qualityScore', result.scores.qualityScore)
        .input('performanceScore', result.scores.performanceScore)
        .input('maintainabilityScore', result.scores.maintainabilityScore)
        .input('readabilityScore', result.scores.readabilityScore)
        .query(`
          INSERT INTO dbo.AnalysisScores (AnalysisId, OverallScore, SecurityScore, QualityScore,
                                          PerformanceScore, MaintainabilityScore, ReadabilityScore)
          VALUES (@analysisId, @overallScore, @securityScore, @qualityScore,
                  @performanceScore, @maintainabilityScore, @readabilityScore);
        `);

      await transaction.commit();
      return result;
    } catch (error) {
      console.error("ANALYSIS SQL ERROR:", error);
      await transaction.rollback();
      throw error;
    }
  }

  async findById(id: string): Promise<AnalysisResult | null> {
    const pool = await sqlPool.connect();

    const analysisResult = await pool.request()
      .input('id', id)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId, a.RequestedByUserId
        FROM dbo.Analyses a
        WHERE a.Id = @id
      `);

    const analysisRecord = analysisResult.recordset[0];
    if (!analysisRecord) return null;

    const scoresResult = await pool.request()
      .input('id', id)
      .query(`
        SELECT OverallScore, SecurityScore, QualityScore, PerformanceScore,
               MaintainabilityScore, ReadabilityScore
        FROM dbo.AnalysisScores
        WHERE AnalysisId = @id
      `);

    const scoresRecord = scoresResult.recordset[0];
    if (!scoresRecord) return null;

    return {
      id: analysisRecord.Id,
      title: analysisRecord.Title ?? '',
      type: analysisRecord.Type as any,
      summary: analysisRecord.Summary ?? '',
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
    const pool = await sqlPool.connect();

    const analysesResult = await pool.request()
      .input('userId', requestedByUserId)
      .input('limit', limit)
      .input('offset', offset)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId,
               s.OverallScore, s.SecurityScore, s.QualityScore, s.PerformanceScore,
               s.MaintainabilityScore, s.ReadabilityScore
        FROM dbo.Analyses a
        LEFT JOIN dbo.AnalysisScores s ON a.Id = s.AnalysisId
        WHERE a.RequestedByUserId = @userId
        ORDER BY a.StartedAt DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);

    const results: AnalysisResult[] = [];

    for (const record of analysesResult.recordset) {
      results.push({
        id: record.Id,
        type: record.Type as any,
        title: record.Title ?? '',
        summary: record.Summary ?? '',
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
      });
    }

    return results;
  }

  async deleteById(id: string, requestedByUserId: string): Promise<boolean> {
    const pool = await sqlPool.connect();
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Check ownership
      const checkResult = await transaction.request()
        .input('id', id)
        .input('userId', requestedByUserId)
        .query(`SELECT Id FROM dbo.Analyses WHERE Id = @id AND RequestedByUserId = @userId`);

      if (checkResult.recordset.length === 0) {
        await transaction.rollback();
        return false;
      }

      // Delete scores first
      await transaction.request()
        .input('analysisId', id)
        .query(`DELETE FROM dbo.AnalysisScores WHERE AnalysisId = @analysisId`);

      // Delete analysis
      await transaction.request()
        .input('id', id)
        .query(`DELETE FROM dbo.Analyses WHERE Id = @id`);

      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getUserStats(requestedByUserId: string): Promise<UserAnalysisStats> {
    const pool = await sqlPool.connect();

    const statsResult = await pool.request()
      .input('userId', requestedByUserId)
      .query(`
        SELECT 
          COUNT(a.Id) as TotalAnalyses,
          AVG(CAST(s.OverallScore AS FLOAT)) as AvgScore,
          COUNT(DISTINCT a.RepositoryId) as ReposScanned,
          COUNT(CASE WHEN a.AnalysisType = 'documentation-generator' THEN 1 END) as DocsGenerated
        FROM dbo.Analyses a
        LEFT JOIN dbo.AnalysisScores s ON a.Id = s.AnalysisId
        WHERE a.RequestedByUserId = @userId
      `);

    const typeBreakdownResult = await pool.request()
      .input('userId', requestedByUserId)
      .query(`
        SELECT a.AnalysisType, COUNT(a.Id) as Count
        FROM dbo.Analyses a
        WHERE a.RequestedByUserId = @userId
        GROUP BY a.AnalysisType
      `);

    const stats = statsResult.recordset[0] || {};
    const scoreByType: Record<string, number> = {};
    for (const row of typeBreakdownResult.recordset) {
      scoreByType[row.AnalysisType] = row.Count;
    }

    return {
      totalAnalyses: stats.TotalAnalyses || 0,
      avgScore: Math.round(stats.AvgScore || 0),
      reposScanned: stats.ReposScanned || 0,
      docsGenerated: stats.DocsGenerated || 0,
      scoreByType
    };
  }

  async findByProjectId(projectId: string): Promise<AnalysisResult[]> {
    const pool = await sqlPool.connect();

    const analysesResult = await pool.request()
      .input('projectId', projectId)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId,
               s.OverallScore, s.SecurityScore, s.QualityScore, s.PerformanceScore,
               s.MaintainabilityScore, s.ReadabilityScore
        FROM dbo.Analyses a
        LEFT JOIN dbo.AnalysisScores s ON a.Id = s.AnalysisId
        WHERE a.ProjectId = @projectId
        ORDER BY a.StartedAt DESC
      `);

    const results: AnalysisResult[] = [];

    for (const record of analysesResult.recordset) {
      results.push({
        id: record.Id,
        type: record.Type as any,
        title: record.Title ?? '',
        summary: record.Summary ?? '',
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
      });
    }

    return results;
  }
}
