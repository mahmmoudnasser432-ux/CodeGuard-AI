import { config } from "dotenv";
import { z } from "zod";

// Load .env file from project root or candidate paths
config({ path: "../../.env" });
config({ path: ".env" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_URL: z.string().url().optional(),
  API_BASE_URL: z.string().url().default("http://localhost:5000"),
  AI_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
  CORS_ORIGIN: z.string().optional(),
  JWT_SECRET: z.string().min(24).optional(),
  JWT_ACCESS_SECRET: z.string().min(24).default("development-access-secret-change-32bytes"),
  JWT_REFRESH_SECRET: z.string().min(24).default("development-refresh-secret-change-32bytes"),
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
});

const parsed = envSchema.parse(process.env);

// Normalize alias values
export const env = {
  ...parsed,
  API_BASE_URL: parsed.API_URL || parsed.API_BASE_URL,
  JWT_ACCESS_SECRET: parsed.JWT_SECRET || parsed.JWT_ACCESS_SECRET,
};
