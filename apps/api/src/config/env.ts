import { config } from "dotenv";
import { z } from "zod";

// Load .env file from project root or candidate paths
config({ path: "../../.env" });
config({ path: ".env" });

export const DEV_DEFAULT_ACCESS_SECRET = "development-access-secret-change-32bytes";
export const DEV_DEFAULT_REFRESH_SECRET = "development-refresh-secret-change-32bytes";

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(5000),
    API_URL: z.string().url().optional(),
    API_BASE_URL: z.string().url().optional(),
    AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
    DATABASE_URL: z.string().optional(),
    DIRECT_URL: z.string().optional(),
    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    CORS_ORIGIN: z.string().optional(),
    JWT_SECRET: z.string().min(24).optional(),
    JWT_ACCESS_SECRET: z.string().min(24).optional(),
    JWT_REFRESH_SECRET: z.string().min(24).optional(),
    JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
    PASSWORD_RESET_EXPIRES_IN: z.string().default("1h"),
    EMAIL_VERIFICATION_EXPIRES_IN: z.string().default("24h"),
    MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    ACCOUNT_LOCKOUT_DURATION: z.string().default("15m"),
    SQLSERVER_HOST: z.string().default("localhost"),
    SQLSERVER_PORT: z.coerce.number().default(54833),
    SQLSERVER_DATABASE: z.string().default("CodeGuardAI"),
    SQLSERVER_USER: z.string().default("sa"),
    SQLSERVER_PASSWORD: z.string().default(""),
    SQLSERVER_ENCRYPT: z.preprocess(
      (val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : val === undefined ? true : Boolean(val)),
      z.boolean()
    ).default(true),
    SQLSERVER_TRUST_SERVER_CERTIFICATE: z.preprocess(
      (val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : Boolean(val)),
      z.boolean()
    ).optional(),
    SQLSERVER_CONNECTION_TIMEOUT: z.coerce.number().int().positive().default(15000),
    SQLSERVER_REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
    SQLSERVER_POOL_MIN: z.coerce.number().int().nonnegative().optional(),
    SQLSERVER_POOL_MAX: z.coerce.number().int().positive().default(20),
    SQLSERVER_POOL_IDLE_TIMEOUT: z.coerce.number().int().positive().default(30000),
    REDIS_URL: z.preprocess(
      (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
      z.string().optional()
    ),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
    // Email configuration
    EMAIL_HOST: z.string().default("localhost"),
    EMAIL_PORT: z.coerce.number().int().default(587),
    EMAIL_USER: z.string().optional(),
    EMAIL_PASSWORD: z.string().optional(),
    EMAIL_FROM: z.string().default("noreply@codeguardai.com"),
    EMAIL_FROM_NAME: z.string().default("CodeGuard AI"),
    EMAIL_SECURE: z.preprocess(
      (val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : Boolean(val)),
      z.boolean()
    ).default(false),
    EMAIL_TLS: z.preprocess(
      (val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : Boolean(val)),
      z.boolean()
    ).default(false),
    // Cookie configuration for refresh tokens
    AUTH_COOKIE_NAME: z.string().default("codeguard_refresh_token"),
    AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
    AUTH_COOKIE_DOMAIN: z.string().optional(),
    AUTH_COOKIE_PATH: z.string().default("/api/auth"),
    AUTH_COOKIE_SECURE: z.preprocess(
      (val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "1" : Boolean(val)),
      z.boolean()
    ).optional(),
    // CSRF Cookie configuration
    CSRF_COOKIE_NAME: z.string().default("codeguard_csrf_token"),
    CSRF_COOKIE_PATH: z.string().default("/"),
  })
  .superRefine((data, ctx) => {
    const isProd = data.NODE_ENV === "production";
    const effectiveApiBaseUrl = data.API_URL || data.API_BASE_URL;
    const effectiveAccessSecret = data.JWT_SECRET || data.JWT_ACCESS_SECRET;

    if (isProd) {
      // 1. API_BASE_URL validation in production
      if (!effectiveApiBaseUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["API_BASE_URL"],
          message: "API_BASE_URL (or API_URL) is required in production for email verification and password reset links.",
        });
      }

      // 2. JWT_ACCESS_SECRET validation in production
      if (!effectiveAccessSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_ACCESS_SECRET"],
          message: "JWT_ACCESS_SECRET (or JWT_SECRET) is required in production.",
        });
      } else if (
        effectiveAccessSecret === DEV_DEFAULT_ACCESS_SECRET ||
        effectiveAccessSecret.includes("development") ||
        effectiveAccessSecret.includes("change-32bytes")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_ACCESS_SECRET"],
          message: "JWT_ACCESS_SECRET in production must not use a predictable development default secret.",
        });
      }

      // 3. JWT_REFRESH_SECRET validation in production
      if (!data.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_REFRESH_SECRET"],
          message: "JWT_REFRESH_SECRET is required in production.",
        });
      } else if (
        data.JWT_REFRESH_SECRET === DEV_DEFAULT_REFRESH_SECRET ||
        data.JWT_REFRESH_SECRET.includes("development") ||
        data.JWT_REFRESH_SECRET.includes("change-32bytes")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_REFRESH_SECRET"],
          message: "JWT_REFRESH_SECRET in production must not use a predictable development default secret.",
        });
      }

      // 4. SQLSERVER_PASSWORD validation in production
      if (!data.SQLSERVER_PASSWORD || data.SQLSERVER_PASSWORD.trim() === "") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SQLSERVER_PASSWORD"],
          message: "SQLSERVER_PASSWORD is required in production.",
        });
      }

      // 5. SQLSERVER_ENCRYPT validation in production
      if (data.SQLSERVER_ENCRYPT !== true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SQLSERVER_ENCRYPT"],
          message: "SQLSERVER_ENCRYPT must be true in production to ensure encrypted database transit.",
        });
      }

      // 6. SQLSERVER_TRUST_SERVER_CERTIFICATE validation in production
      if (data.SQLSERVER_TRUST_SERVER_CERTIFICATE === true) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SQLSERVER_TRUST_SERVER_CERTIFICATE"],
          message: "SQLSERVER_TRUST_SERVER_CERTIFICATE must be false in production. Disabling TLS certificate validation in production is not permitted.",
        });
      }

      // 7. REDIS_URL is required for distributed rate limiting in production
      if (!data.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "REDIS_URL is required in production for distributed rate limiting. Do not default to localhost Redis.",
        });
      } else if (!isRedisConnectionUrl(data.REDIS_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "REDIS_URL must be a redis:// or rediss:// connection URL in production.",
        });
      } else if (isLoopbackRedisUrl(data.REDIS_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["REDIS_URL"],
          message: "REDIS_URL must not point to localhost in production. Use a managed Redis service or an internal Docker/network hostname.",
        });
      }
    }
  });

export function isRedisConnectionUrl(value: string): boolean {
  return value.startsWith("redis://") || value.startsWith("rediss://");
}

export function isLoopbackRedisUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function parseEnv(rawEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(rawEnv);

  const effectiveApiBaseUrl = parsed.API_URL || parsed.API_BASE_URL || "http://localhost:5000";
  const effectiveAccessSecret = parsed.JWT_SECRET || parsed.JWT_ACCESS_SECRET || DEV_DEFAULT_ACCESS_SECRET;
  const effectiveRefreshSecret = parsed.JWT_REFRESH_SECRET || DEV_DEFAULT_REFRESH_SECRET;
  const isProd = parsed.NODE_ENV === "production";

  const effectiveTrustServerCert =
    parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE !== undefined
      ? parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE
      : !isProd; // false in production (strict TLS), true in development/test

  const effectivePoolMin =
    parsed.SQLSERVER_POOL_MIN !== undefined
      ? parsed.SQLSERVER_POOL_MIN
      : isProd ? 2 : 0;

  const effectiveCookieSecure =
    parsed.AUTH_COOKIE_SECURE !== undefined
      ? parsed.AUTH_COOKIE_SECURE
      : isProd;

  return {
    ...parsed,
    API_BASE_URL: effectiveApiBaseUrl,
    JWT_ACCESS_SECRET: effectiveAccessSecret,
    JWT_REFRESH_SECRET: effectiveRefreshSecret,
    SQLSERVER_TRUST_SERVER_CERTIFICATE: effectiveTrustServerCert,
    SQLSERVER_POOL_MIN: effectivePoolMin,
    AUTH_COOKIE_SECURE: effectiveCookieSecure,
  };
}

export const env = parseEnv(process.env);
