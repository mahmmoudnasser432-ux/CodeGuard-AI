import { config } from "dotenv";
import { z } from "zod";

// Load .env file from project root
config({ path: "../../.env" });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  AI_SERVICE_URL: z.string().url().default("http://localhost:8000"),
  JWT_ACCESS_SECRET: z.string().min(24).default("development-access-secret-change"),
  JWT_REFRESH_SECRET: z.string().min(24).default("development-refresh-secret-change"),
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
  REDIS_URL: z.string().default("redis://localhost:6379")
});

export const env = envSchema.parse(process.env);