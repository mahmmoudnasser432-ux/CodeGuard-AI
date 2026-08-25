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

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Allow non-browser server-to-server or curl requests

  // Development localhost
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  // Configured frontend URL or CORS origin
  if (env.FRONTEND_URL && origin === env.FRONTEND_URL) {
    return true;
  }
  if (env.CORS_ORIGIN && origin === env.CORS_ORIGIN) {
    return true;
  }

  // Vercel deployment preview and production domains
  if (/^https:\/\/.*\.vercel\.app$/.test(origin) || /^https:\/\/codeguard.*\.vercel\.app$/.test(origin)) {
    return true;
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
