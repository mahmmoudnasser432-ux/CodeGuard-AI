import { Router } from "express";
import type { AnalysisType } from "../../../domain/entities/analysis.js";
import { codeAnalysisRequestSchema } from "../../../application/dto/analysis.dto.js";
import { AiAnalysisService } from "../../../application/services/ai-analysis-service.js";
import { SqlAnalysisRepository } from "../../../infrastructure/repositories/sql-analysis-repository.js";

const analysisTypes: AnalysisType[] = [
  "code-review",
  "security-analysis",
  "performance-analysis",
  "documentation-generator",
  "interview-generator",
  "repository-analysis",
  "scoring-engine"
];

export function analysisController() {
  const router = Router();
  const aiService = new AiAnalysisService();
  const repository = new SqlAnalysisRepository();

  for (const type of analysisTypes) {
    router.post(`/${type}`, async (req, res, next) => {
      try {
        const dto = codeAnalysisRequestSchema.parse(req.body);
        const result = await aiService.analyze(type, dto);
        // For now, we'll use a hardcoded user ID since auth isn't fully implemented yet
        // In a real implementation, this would come from the authenticated user
        const requestedByUserId = req.headers['x-user-id'] as string || '00000000-0000-0000-0000-000000000001';
        const saved = await repository.save(result, requestedByUserId);
        res.status(201).json(saved);
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
