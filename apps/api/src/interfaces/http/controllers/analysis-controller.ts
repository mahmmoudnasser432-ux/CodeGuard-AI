import { Router, type Request, type Response, type NextFunction } from "express";
import type { AnalysisType } from "../../../domain/entities/analysis.js";
import type { User } from "../../../domain/entities/user.js";
import type { UserRepository } from "../../../domain/repositories/user-repository.js";
import { codeAnalysisRequestSchema } from "../../../application/dto/analysis.dto.js";
import { AiAnalysisService } from "../../../application/services/ai-analysis-service.js";
import { SqlAnalysisRepository } from "../../../infrastructure/repositories/sql-analysis-repository.js";
import { optionalAuthenticate, authenticate } from "../middleware/auth.js";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

const analysisTypes: AnalysisType[] = [
  "code-review",
  "security-analysis",
  "performance-analysis",
  "documentation-generator",
  "interview-generator",
  "repository-analysis",
  "scoring-engine"
];

async function ensureSystemUser(userRepository: UserRepository): Promise<User> {
  const existing = await userRepository.findById(SYSTEM_USER_ID);
  if (existing) {
    return existing;
  }

  return userRepository.save({
    id: SYSTEM_USER_ID,
    email: "system@codeguard.local",
    displayName: "CodeGuard System User",
    roles: ["admin", "developer"],
    isEmailVerified: true,
    mfaEnabled: false
  });
}

async function resolveRequestedByUserId(req: Request, userRepository: UserRepository): Promise<string> {
  const headerUserId = req.header("x-user-id");
  const candidateUserId = req.user?.sub ?? headerUserId ?? null;

  if (candidateUserId) {
    const user = await userRepository.findById(candidateUserId);
    if (user) {
      return user.id;
    }
  }

  const systemUser = await ensureSystemUser(userRepository);
  return systemUser.id;
}

export function analysisController(userRepository: UserRepository) {
  const router = Router();
  const aiService = new AiAnalysisService();
  const repository = new SqlAnalysisRepository();

  // GET /api/analyses - List recent analyses for current user
  router.get("/", optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await resolveRequestedByUserId(req, userRepository);
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;

      const items = await repository.listByUser(userId, limit, offset);
      res.json({
        items,
        limit,
        offset,
        count: items.length
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analyses/stats - Get dashboard statistics for current user
  router.get("/stats", optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = await resolveRequestedByUserId(req, userRepository);
      const stats = await repository.getUserStats(userId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analyses/:id - Get single analysis details
  router.get("/:id", optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const analysis = await repository.findById(id);

      if (!analysis) {
        res.status(404).json({ error: "ANALYSIS_NOT_FOUND" });
        return;
      }

      res.json(analysis);
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/analyses/:id - Delete single analysis
  router.delete("/:id", optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const userId = await resolveRequestedByUserId(req, userRepository);
      const deleted = await repository.deleteById(id, userId);

      if (!deleted) {
        res.status(404).json({ error: "ANALYSIS_NOT_FOUND_OR_UNAUTHORIZED" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Analysis execution endpoints
  for (const type of analysisTypes) {
    router.post(`/${type}`, optionalAuthenticate, async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = codeAnalysisRequestSchema.parse(req.body);
        const result = await aiService.analyze(type, dto);
        const requestedByUserId = await resolveRequestedByUserId(req, userRepository);
        const saved = await repository.save(result, requestedByUserId);
        res.status(200).json(saved);
      } catch (error) {
        next(error);
      }
    });
  }

  return router;
}
