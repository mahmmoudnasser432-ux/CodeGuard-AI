import express from "express";
import type { RequestHandler } from "express";
import * as pinoHttpModule from "pino-http";
import swaggerUi from "swagger-ui-express";
import { analysisController } from "./interfaces/http/controllers/analysis-controller.js";
import { authController } from "./interfaces/http/controllers/auth-controller.js";
import { errorHandler } from "./interfaces/http/middleware/error-handler.js";
import { apiRateLimiter, corsPolicy, securityHeaders } from "./interfaces/http/middleware/security.js";
import { openApiDocument } from "./interfaces/http/openapi.js";
import { SqlUserRepository } from "./infrastructure/repositories/sql-user-repository.js";
import { SqlSessionRepository } from "./infrastructure/repositories/sql-session-repository.js";
import { SqlRefreshTokenRepository } from "./infrastructure/repositories/sql-refresh-token-repository.js";
import { SqlPasswordResetTokenRepository } from "./infrastructure/repositories/sql-password-reset-token-repository.js";
import { SqlEmailVerificationTokenRepository } from "./infrastructure/repositories/sql-email-verification-token-repository.js";
import { AuthService } from "./application/services/auth-service.js";

export function createApp() {
  const app = express();
  const pinoHttpExport = pinoHttpModule as unknown as { default?: () => RequestHandler } & (() => RequestHandler);
  const pinoHttp = pinoHttpExport.default ?? pinoHttpExport;

  app.use(pinoHttp());
  app.use(securityHeaders);
  app.use(corsPolicy);
  app.use(apiRateLimiter);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "codeguard-api" });
  });

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // Initialize repositories
  const userRepository = new SqlUserRepository();
  const sessionRepository = new SqlSessionRepository();
  const refreshTokenRepository = new SqlRefreshTokenRepository();
  const passwordResetTokenRepository = new SqlPasswordResetTokenRepository();
  const emailVerificationTokenRepository = new SqlEmailVerificationTokenRepository();

  // Initialize auth service
  const authService = new AuthService(
    sessionRepository,
    refreshTokenRepository,
    passwordResetTokenRepository,
    emailVerificationTokenRepository
  );

  // Initialize auth controller
  const authRouter = authController(authService, userRepository);

  // Mount auth routes
  app.use("/api/auth", authRouter);

  // Mount analysis routes
  app.use("/api/analyses", analysisController());

  app.use(errorHandler);

  return app;
}
