import { sqlPool } from "../database/sqlserver.js";
import { InterviewQuestion, InterviewResult, InterviewSession } from "../../domain/entities/interview.js";
import { InterviewRepository } from "../../domain/repositories/interview-repository.js";

export class SqlInterviewRepository implements InterviewRepository {
  async saveSession(session: InterviewSession): Promise<InterviewSession> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', session.id)
      .input('title', session.title)
      .input('candidateUserId', session.candidateUserId ?? null)
      .input('recruiterUserId', session.recruiterUserId ?? null)
      .input('repositoryId', session.repositoryId ?? null)
      .input('status', session.status)
      .input('createdAt', session.createdAt ?? new Date())
      .query(`
        MERGE dbo.InterviewSessions AS target
        USING (SELECT @id as Id, @title as Title, @candidateUserId as CandidateUserId,
                  @recruiterUserId as RecruiterUserId, @repositoryId as RepositoryId,
                  @status as Status, @createdAt as CreatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            CandidateUserId = source.CandidateUserId,
            RecruiterUserId = source.RecruiterUserId,
            RepositoryId = source.RepositoryId,
            Status = source.Status,
            Title = source.Title,
            CreatedAt = source.CreatedAt
        WHEN NOT MATCHED THEN
          INSERT INTO dbo.Interviews (Id, Title, CandidateUserId, RecruiterUserId, RepositoryId, Status, CreatedAt)
          VALUES (source.Id, source.Title, source.CandidateUserId, source.RecruiterUserId,
                  source.RepositoryId, source.Status, source.CreatedAt);
      `);

    return session;
  }

  async addQuestions(sessionId: string, questions: InterviewQuestion[]): Promise<InterviewQuestion[]> {
    if (questions.length === 0) return [];

    const pool = await sqlPool.connect();

    // Start a transaction
    const transaction = pool.transaction();
    await transaction.begin();

    try {
      // Delete existing questions for this session
      await transaction.request()
        .input('sessionId', sessionId)
        .query(`DELETE FROM dbo.InterviewQuestions WHERE InterviewSessionId = @sessionId`);

      // Insert new questions
      const insertedQuestions: InterviewQuestion[] = [];
      for (const question of questions) {
        await transaction.request()
          .input('id', question.id)
          .input('sessionId', sessionId)
          .input('prompt', question.prompt)
          .input('expectedAnswer', question.expectedAnswer)
          .input('evaluationCriteria', question.evaluationCriteria)
          .input('difficulty', question.difficulty)
          .query(`
            INSERT INTO dbo.InterviewQuestions (Id, InterviewSessionId, Prompt, ExpectedAnswer,
                                                EvaluationCriteria, Difficulty)
            VALUES (@id, @sessionId, @prompt, @expectedAnswer, @evaluationCriteria, @difficulty);
          `);

        insertedQuestions.push(question);
      }

      await transaction.commit();
      return insertedQuestions;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async saveResult(result: InterviewResult): Promise<InterviewResult> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', result.id)
      .input('sessionId', result.interviewSessionId)
      .input('technicalScore', result.technicalScore)
      .input('communicationScore', result.communicationScore)
      .input('problemSolvingScore', result.problemSolvingScore)
      .input('recommendation', result.recommendation)
      .input('createdAt', result.createdAt ?? new Date())
      .query(`
        MERGE dbo.InterviewResults AS target
        USING (SELECT @id as Id, @sessionId as InterviewSessionId,
                  @technicalScore as TechnicalScore, @communicationScore as CommunicationScore,
                  @problemSolvingScore as ProblemSolvingScore, @recommendation as Recommendation,
                  @createdAt as CreatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            InterviewSessionId = source.InterviewSessionId,
            TechnicalScore = source.TechnicalScore,
            CommunicationScore = source.CommunicationScore,
            ProblemSolvingScore = source.ProblemSolvingScore,
            Recommendation = source.Recommendation,
            CreatedAt = source.CreatedAt
        WHEN NOT MATCHED THEN
          INSERT INTO dbo.InterviewResults (Id, InterviewSessionId, TechnicalScore, CommunicationScore,
                  ProblemSolvingScore, Recommendation, CreatedAt)
          VALUES (source.Id, source.InterviewSessionId, source.TechnicalScore,
                  source.CommunicationScore, source.ProblemSolvingScore, source.Recommendation,
                  source.CreatedAt);
      `);

    return result;
  }

  async findSessionById(id: string): Promise<InterviewSession | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, Title, CandidateUserId, RecruiterUserId, RepositoryId, Status, CreatedAt
        FROM dbo.InterviewSessions
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return {
      id: record.Id,
      title: record.Title,
      candidateUserId: record.CandidateUserId ?? undefined,
      recruiterUserId: record.RecruiterUserId ?? undefined,
      repositoryId: record.RepositoryId ?? undefined,
      status: record.Status as any, // Status is stored as NVARCHAR in DB
      createdAt: record.CreatedAt
    };
  }
}