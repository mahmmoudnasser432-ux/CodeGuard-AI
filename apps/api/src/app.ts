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
import { EmailService } from "./application/services/email-service.js";
import { sqlPool } from "./infrastructure/database/sqlserver.js";
import { getRedisHealth } from "./infrastructure/redis/client.js";
import { env } from "./config/env.js";

const startTime = Date.now();

export function createApp() {
  const app = express();
  const pinoHttpExport = pinoHttpModule as unknown as { default?: () => RequestHandler } & (() => RequestHandler);
  const pinoHttp = pinoHttpExport.default ?? pinoHttpExport;

  // Trust exactly one reverse-proxy/ingress hop (e.g. ALB, Cloudflare, Ingress-NGINX).
  // req.ip is used for client rate-limit identity; the application does not parse X-Forwarded-For directly.
  // The upstream ingress/load balancer must sanitize client-supplied forwarding headers to prevent IP spoofing.
  app.set("trust proxy", 1);

  // Create shared instances
  const emailService = new EmailService();
  const userRepository = new SqlUserRepository();
  const sessionRepository = new SqlSessionRepository();
  const refreshTokenRepository = new SqlRefreshTokenRepository();
  const passwordResetTokenRepository = new SqlPasswordResetTokenRepository();
  const emailVerificationTokenRepository = new SqlEmailVerificationTokenRepository();

  // Create auth service with injected dependencies
  const authService = new AuthService(
    sessionRepository,
    refreshTokenRepository,
    passwordResetTokenRepository,
    emailVerificationTokenRepository,
    userRepository,
    emailService
  );

  app.use(pinoHttp());
  app.use(securityHeaders);
  app.use(corsPolicy);

  // Liveness health endpoint
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "codeguard-api",
      version: "0.1.0",
      uptime: Math.round((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    });
  });

  // Readiness probe checking AI service and database
  app.get("/ready", async (_req, res) => {
    let aiServiceStatus = "unknown";
    try {
      const aiRes = await fetch(`${env.AI_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
      aiServiceStatus = aiRes.ok ? "healthy" : "degraded";
    } catch {
      aiServiceStatus = "unreachable";
    }

    let databaseStatus = "unknown";
    try {
      if (!sqlPool.connected && !sqlPool.connecting) {
        await sqlPool.connect();
      }
      if (sqlPool.connected) {
        const ping = await sqlPool.request().query("SELECT 1 AS isReady");
        databaseStatus = ping.recordset?.[0]?.isReady === 1 ? "healthy" : "degraded";
      } else {
        databaseStatus = "disconnected";
      }
    } catch {
      databaseStatus = "unreachable";
    }

    res.json({
      status: "ready",
      service: "codeguard-api",
      dependencies: {
        aiService: aiServiceStatus,
        database: databaseStatus,
        redis: getRedisHealth(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use(apiRateLimiter);
  app.use(express.json({ limit: "1mb" }));

  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

  // Mount auth routes
  const authRouter = authController(authService, userRepository);
  app.use("/api/auth", authRouter);

  // Mount analysis routes
  app.use("/api/analyses", analysisController(userRepository));

  app.use(errorHandler);

  return {
    app,
    authService,
    userRepository,
    sessionRepository,
    refreshTokenRepository,
    passwordResetTokenRepository,
    emailVerificationTokenRepository
  };
}
