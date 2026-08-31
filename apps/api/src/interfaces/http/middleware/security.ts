import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "../../../config/env.js";

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
  hsts: env.NODE_ENV === "production" ? { maxAge: 31536000, includeSubDomains: true } : false,
  crossOriginEmbedderPolicy: false,
});

export function isAllowedOrigin(origin: string | undefined, currentEnv = env): boolean {
  if (!origin) return true; // Allow non-browser server-to-server or curl requests

  const isProd = currentEnv.NODE_ENV === "production";

  // In development / test, allow arbitrary localhost / 127.0.0.1
  if (!isProd) {
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  // Explicitly configured frontend URL (e.g. https://codeguard.ai, or http://localhost:3000 in local Docker)
  if (currentEnv.FRONTEND_URL && origin === currentEnv.FRONTEND_URL) {
    return true;
  }

  // Explicitly configured CORS origin(s) (single or comma-separated)
  if (currentEnv.CORS_ORIGIN) {
    const allowedList = currentEnv.CORS_ORIGIN.split(",").map((o) => o.trim());
    if (allowedList.includes(origin)) {
      return true;
    }
  }

  return false;
}

export const corsPolicy = cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-user-id"],
});

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please try again later." },
});
