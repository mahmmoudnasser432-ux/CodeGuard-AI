import type { Request } from "express";
import rateLimit, { MemoryStore, type Store } from "express-rate-limit";
import { env } from "../../../config/env.js";
import { createDistributedRateLimitStore, RATE_LIMIT_KEY_PREFIX } from "../../../infrastructure/redis/rate-limit-store.js";

export { RATE_LIMIT_KEY_PREFIX };

const SECRET_HEADER_NAMES = ["authorization", "cookie", "x-csrf-token"];

/**
 * Client identity for rate limiting is Express `req.ip`.
 * That value honors `app.set("trust proxy", 1)` — only the first trusted reverse-proxy hop
 * is used. Raw `X-Forwarded-For` is never read directly, so untrusted/malformed forwarded
 * headers cannot select an arbitrary key unless a trusted proxy is actually in front of the API.
 * Keys never include credentials, cookies, JWTs, or CSRF tokens.
 */
export function buildClientRateLimitKey(req: Request): string {
  const ip = typeof req.ip === "string" && req.ip.trim().length > 0 ? req.ip.trim() : "unknown";
  for (const headerName of SECRET_HEADER_NAMES) {
    if (ip.toLowerCase().includes(headerName)) {
      return "unknown";
    }
  }
  return ip;
}

export function createRateLimitStore(options?: {
  sendCommand?: (...args: string[]) => Promise<string | number | boolean | Array<string | number | boolean>>;
  isRedisReady?: () => boolean;
  forceMemory?: boolean;
}): Store {
  if (options?.forceMemory) {
    return new MemoryStore();
  }
  return createDistributedRateLimitStore({
    sendCommand: options?.sendCommand,
    isReady: options?.isRedisReady,
  });
}

export function createApiRateLimiter(options?: {
  windowMs?: number;
  limit?: number;
  store?: Store;
  sendCommand?: (...args: string[]) => Promise<string | number | boolean | Array<string | number | boolean>>;
  isRedisReady?: () => boolean;
  forceMemory?: boolean;
}) {
  const windowMs = options?.windowMs ?? env.RATE_LIMIT_WINDOW_MS;
  const limit = options?.limit ?? env.RATE_LIMIT_MAX_REQUESTS;
  const store =
    options?.store ??
    createRateLimitStore({
      sendCommand: options?.sendCommand,
      isRedisReady: options?.isRedisReady,
      forceMemory: options?.forceMemory,
    });

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    store,
    keyGenerator: (req) => buildClientRateLimitKey(req),
    message: { error: "TOO_MANY_REQUESTS", message: "Rate limit exceeded. Please try again later." },
    validate: { xForwardedForHeader: false, default: true },
  });
}

export const apiRateLimiter = createApiRateLimiter();
