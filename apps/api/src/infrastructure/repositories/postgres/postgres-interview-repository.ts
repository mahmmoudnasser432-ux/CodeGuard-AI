import pg from "pg";
import { InterviewQuestion, InterviewResult, InterviewSession } from "../../../domain/entities/interview.js";
import { InterviewRepository } from "../../../domain/repositories/interview-repository.js";

export class PostgresInterviewRepository implements InterviewRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async saveSession(session: InterviewSession): Promise<InterviewSession> {
    const createdAt = session.createdAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "InterviewSessions" ("Id", "CandidateUserId", "RecruiterUserId", "RepositoryId", "Title", "Status", "CreatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT ("Id") DO UPDATE SET
        "CandidateUserId" = EXCLUDED."CandidateUserId",
        "RecruiterUserId" = EXCLUDED."RecruiterUserId",
        "RepositoryId" = EXCLUDED."RepositoryId",
        "Title" = EXCLUDED."Title",
        "Status" = EXCLUDED."Status",
        "CreatedAt" = EXCLUDED."CreatedAt";
      `,
      [
        session.id,
        session.candidateUserId ?? null,
        session.recruiterUserId ?? null,
        session.repositoryId ?? null,
        session.title ?? null,
        session.status,
        createdAt,
      ]
    );

    return session;
  }

  async addQuestions(sessionId: string, questions: InterviewQuestion[]): Promise<InterviewQuestion[]> {
    if (questions.length === 0) return [];

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      await client.query(`DELETE FROM "InterviewQuestions" WHERE "InterviewSessionId" = $1;`, [sessionId]);

      for (const question of questions) {
        await client.query(
          `
          INSERT INTO "InterviewQuestions" ("Id", "InterviewSessionId", "Prompt", "ExpectedAnswer", "EvaluationCriteria", "Difficulty")
          VALUES ($1, $2, $3, $4, $5, $6);
          `,
          [
            question.id,
            sessionId,
            question.prompt,
            question.expectedAnswer,
            question.evaluationCriteria,
            question.difficulty,
          ]
        );
      }

      await client.query("COMMIT;");
      return questions;
    } catch (error) {
      await client.query("ROLLBACK;").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async saveResult(result: InterviewResult): Promise<InterviewResult> {
    const createdAt = result.createdAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "InterviewResults" ("Id", "InterviewSessionId", "TechnicalScore", "CommunicationScore", "ProblemSolvingScore", "Recommendation", "CreatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT ("Id") DO UPDATE SET
        "InterviewSessionId" = EXCLUDED."InterviewSessionId",
        "TechnicalScore" = EXCLUDED."TechnicalScore",
        "CommunicationScore" = EXCLUDED."CommunicationScore",
        "ProblemSolvingScore" = EXCLUDED."ProblemSolvingScore",
        "Recommendation" = EXCLUDED."Recommendation",
        "CreatedAt" = EXCLUDED."CreatedAt";
      `,
      [
        result.id,
        result.interviewSessionId,
        result.technicalScore,
        result.communicationScore,
        result.problemSolvingScore,
        result.recommendation,
        createdAt,
      ]
    );

    return result;
  }

  async findSessionById(id: string): Promise<InterviewSession | null> {
    const queryResult = await this.pool.query(
      `
      SELECT "Id", "Title", "CandidateUserId", "RecruiterUserId", "RepositoryId", "Status", "CreatedAt"
      FROM "InterviewSessions"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = queryResult.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      title: record.Title ?? "",
      candidateUserId: record.CandidateUserId ?? undefined,
      recruiterUserId: record.RecruiterUserId ?? undefined,
      repositoryId: record.RepositoryId ?? undefined,
      status: record.Status as any,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    };
  }
}
