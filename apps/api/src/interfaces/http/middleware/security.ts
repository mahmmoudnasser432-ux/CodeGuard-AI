import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

export const corsPolicy = cors({
  origin: [/^http:\/\/localhost:\d+$/],
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
});

export const apiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});
