import { InterviewQuestion, InterviewResult, InterviewSession } from "../entities/interview.ts";

export interface InterviewRepository {
  saveSession(session: InterviewSession): Promise<InterviewSession>;
  addQuestions(sessionId: string, questions: InterviewQuestion[]): Promise<InterviewQuestion[]>;
  saveResult(result: InterviewResult): Promise<InterviewResult>;
  findSessionById(id: string): Promise<InterviewSession | null>;
}
