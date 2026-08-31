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
    REDIS_URL: z.string().default("redis://localhost:6379"),
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
    }
  });

export function parseEnv(rawEnv: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const parsed = envSchema.parse(rawEnv);

  const effectiveApiBaseUrl = parsed.API_URL || parsed.API_BASE_URL || "http://localhost:5000";
  const effectiveAccessSecret = parsed.JWT_SECRET || parsed.JWT_ACCESS_SECRET || DEV_DEFAULT_ACCESS_SECRET;
  const effectiveRefreshSecret = parsed.JWT_REFRESH_SECRET || DEV_DEFAULT_REFRESH_SECRET;

  return {
    ...parsed,
    API_BASE_URL: effectiveApiBaseUrl,
    JWT_ACCESS_SECRET: effectiveAccessSecret,
    JWT_REFRESH_SECRET: effectiveRefreshSecret,
  };
}

export const env = parseEnv(process.env);
