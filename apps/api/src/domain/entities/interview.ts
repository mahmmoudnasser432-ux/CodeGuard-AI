export interface InterviewSession {
  id: string;
  candidateUserId?: string | null;
  recruiterUserId?: string | null;
  repositoryId?: string | null;
  status: "draft" | "active" | "completed" | "cancelled";
  createdAt?: Date;
}

export interface InterviewQuestion {
  id: string;
  interviewSessionId: string;
  prompt: string;
  expectedAnswer: string;
  evaluationCriteria: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
}

export interface InterviewResult {
  id: string;
  interviewSessionId: string;
  technicalScore: number;
  communicationScore: number;
  problemSolvingScore: number;
  recommendation: string;
  createdAt?: Date;
}
