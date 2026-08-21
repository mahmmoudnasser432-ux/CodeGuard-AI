import { sqlPool } from "../database/sqlserver.ts";
import { AnalysisResult } from "../../domain/entities/analysis.ts";
import { AnalysisRepository } from "../../domain/repositories/analysis-repository.ts";

export class SqlAnalysisRepository implements AnalysisRepository {
  async save(result: AnalysisResult, requestedByUserId: string): Promise<AnalysisResult> {
    const pool = await sqlPool.connect();

    // Start a transaction
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Insert or update the analysis
      await transaction.request()
        .input('id', result.id)
        .input('projectId', result.projectId ?? null) // ProjectId is nullable in the schema
        .input('repositoryId', null) // RepositoryId is nullable in the schema
        .input('requestedByUserId', requestedByUserId)
        .input('type', result.type)
        .input('status', 'completed') // Assuming completed for now
        .input('title', result.title)
        .input('summary', result.summary)
        .input('startedAt', new Date()) // For simplicity, using now
        .input('completedAt', new Date())
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
            VALUES (source.Id, source.ProjectId, source.RepositoryId, source.RequestedByUserId,
                    source.AnalysisType, source.Status, source.Title, source.Summary, source.StartedAt, source.CompletedAt);
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
      await transaction.rollback();
      throw error;
    }
  }

  async findById(id: string): Promise<AnalysisResult | null> {
    const pool = await sqlPool.connect();

    // Get the analysis
    const analysisResult = await pool.request()
      .input('id', id)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId
        FROM dbo.Analyses a
        WHERE a.Id = @id
      `);

    const analysisRecord = analysisResult.recordset[0];
    if (!analysisRecord) return null;

    // Get the analysis scores
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

    // For now, we'll return empty findings and no improvedCode/generatedMarkdown
    // These would need to be stored in separate tables if required
    return {
      id: analysisRecord.Id,
      title: analysisRecord.Title ?? '',
      type: analysisRecord.Type as any, // Type is stored as NVARCHAR in DB
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
      findings: [], // Would need to be retrieved from a findings table if implemented
      improvedCode: undefined,
      generatedMarkdown: undefined
    };
  }

  async listByUser(requestedByUserId: string): Promise<AnalysisResult[]> {
    const pool = await sqlPool.connect();

    // Get analyses for the user
    const analysesResult = await pool.request()
      .input('userId', requestedByUserId)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId
        FROM dbo.Analyses a
        WHERE a.RequestedByUserId = @userId
        ORDER BY a.StartedAt DESC
      `);

    const results: AnalysisResult[] = [];

    for (const analysisRecord of analysesResult.recordset) {
      // Get the analysis scores for each analysis
      const scoresResult = await pool.request()
        .input('analysisId', analysisRecord.Id)
        .query(`
          SELECT OverallScore, SecurityScore, QualityScore, PerformanceScore,
                 MaintainabilityScore, ReadabilityScore
          FROM dbo.AnalysisScores
          WHERE AnalysisId = @analysisId
        `);

      const scoresRecord = scoresResult.recordset[0];
      if (!scoresRecord) continue;

      results.push({
        id: analysisRecord.Id,
        type: analysisRecord.Type as any,
        title: analysisRecord.Title ?? '',
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
        findings: [], // Would need to be retrieved from a findings table if implemented
        improvedCode: undefined,
        generatedMarkdown: undefined
      });
    }

    return results;
  }

  async findByProjectId(projectId: string): Promise<AnalysisResult[]> {
    const pool = await sqlPool.connect();

    // Get analyses for the project
    const analysesResult = await pool.request()
      .input('projectId', projectId)
      .query(`
        SELECT a.Id, a.AnalysisType as Type, a.Title, a.Summary, a.StartedAt, a.CompletedAt, a.ProjectId
        FROM dbo.Analyses a
        WHERE a.ProjectId = @projectId
        ORDER BY a.StartedAt DESC
      `);

    const results: AnalysisResult[] = [];

    for (const analysisRecord of analysesResult.recordset) {
      // Get the analysis scores for each analysis
      const scoresResult = await pool.request()
        .input('analysisId', analysisRecord.Id)
        .query(`
          SELECT OverallScore, SecurityScore, QualityScore, PerformanceScore,
                 MaintainabilityScore, ReadabilityScore
          FROM dbo.AnalysisScores
          WHERE AnalysisId = @analysisId
        `);

      const scoresRecord = scoresResult.recordset[0];
      if (!scoresRecord) continue;

      results.push({
        id: analysisRecord.Id,
        type: analysisRecord.Type as any,
        title: analysisRecord.Title ?? '',
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
        findings: [], // Would need to be retrieved from a findings table if implemented
        improvedCode: undefined,
        generatedMarkdown: undefined
      });
    }

    return results;
  }
}