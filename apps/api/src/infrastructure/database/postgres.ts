import pg from "pg";
import { env } from "../../config/env.js";

const { Pool } = pg;

/**
 * Logical failure categories for PostgreSQL connection & operation errors.
 */
export type PostgresErrorCategory =
  | "TLS_CERTIFICATE_ERROR"
  | "AUTHENTICATION_FAILED"
  | "NETWORK_OR_FIREWALL_TIMEOUT"
  | "DATABASE_NOT_FOUND"
  | "CONNECTION_CLOSED"
  | "GENERAL_DATABASE_ERROR";

export interface PostgresDiagnosticResult {
  category: PostgresErrorCategory;
  sanitizedMessage: string;
  safeMetadata: {
    host: string;
    port: number;
    database: string;
    ssl: boolean;
    errorCode: string | null;
  };
}

/**
 * Sanitizes and classifies a PostgreSQL error without leaking credentials, passwords, or raw tokens.
 */
export function classifyPostgresError(
  error: unknown,
  envConfig: typeof env = env
): PostgresDiagnosticResult {
  const err = error as Record<string, any> | null | undefined;
  const rawCode: string = String(err?.code || err?.originalError?.code || "");
  const rawMessage: string = String(
    err?.message || err?.originalError?.message || error || "Unknown database error"
  );

  // Redact potential credential leakage in error messages
  const sanitizedMessage = rawMessage
    .replace(/(password|pwd|secret|token|apiKey|api_key)\s*=\s*['"]?[^;\s'"]+['"]?/gi, "$1=[REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]+(@)/gi, "$1[REDACTED]$2")
    .replace(/(Bearer\s+)[A-Za-z0-9-_.]+/gi, "$1[REDACTED]");

  let category: PostgresErrorCategory = "GENERAL_DATABASE_ERROR";
  const lowerMsg = sanitizedMessage.toLowerCase();

  if (
    rawCode === "08001" ||
    rawCode === "08006" ||
    rawCode === "ETIMEDOUT" ||
    rawCode === "ESOCKET" ||
    rawCode === "ECONNREFUSED" ||
    rawCode === "ENOTFOUND" ||
    rawCode === "EHOSTUNREACH" ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("connect econnrefused") ||
    lowerMsg.includes("failed to connect")
  ) {
    category = "NETWORK_OR_FIREWALL_TIMEOUT";
  } else if (
    rawCode.includes("TLS") ||
    rawCode.includes("CERT") ||
    lowerMsg.includes("certificate") ||
    lowerMsg.includes("self signed") ||
    lowerMsg.includes("unable to verify") ||
    lowerMsg.includes("hostname/ip does not match")
  ) {
    category = "TLS_CERTIFICATE_ERROR";
  } else if (
    rawCode === "28P01" || // invalid_password
    rawCode === "28000" || // invalid_authorization_specification
    lowerMsg.includes("password authentication failed") ||
    lowerMsg.includes("authentication failed")
  ) {
    category = "AUTHENTICATION_FAILED";
  } else if (
    rawCode === "3D000" || // invalid_catalog_name (database does not exist)
    (lowerMsg.includes("database") && lowerMsg.includes("does not exist"))
  ) {
    category = "DATABASE_NOT_FOUND";
  } else if (
    rawCode === "57P01" || // admin_shutdown
    rawCode === "ECONNRESET" ||
    lowerMsg.includes("connection terminated") ||
    lowerMsg.includes("connection closed")
  ) {
    category = "CONNECTION_CLOSED";
  }

  return {
    category,
    sanitizedMessage,
    safeMetadata: {
      host: envConfig.POSTGRES_HOST || "localhost",
      port: Number(envConfig.POSTGRES_PORT) || 5432,
      database: envConfig.POSTGRES_DATABASE || "",
      ssl: envConfig.POSTGRES_SSL ?? true,
      errorCode: rawCode || null,
    },
  };
}

/**
 * Builds a validated pg.PoolConfig from environment configuration.
 */
export function createPostgresPoolConfig(envConfig: typeof env = env): pg.PoolConfig {
  const isProd = envConfig.NODE_ENV === "production";
  return {
    host: envConfig.POSTGRES_HOST,
    port: envConfig.POSTGRES_PORT,
    database: envConfig.POSTGRES_DATABASE,
    user: envConfig.POSTGRES_USER,
    password: envConfig.POSTGRES_PASSWORD,
    ssl: envConfig.POSTGRES_SSL ? { rejectUnauthorized: isProd } : false,
    max: envConfig.POSTGRES_POOL_MAX,
    min: envConfig.POSTGRES_POOL_MIN,
    connectionTimeoutMillis: envConfig.POSTGRES_CONNECTION_TIMEOUT,
    idleTimeoutMillis: envConfig.POSTGRES_IDLE_TIMEOUT,
  };
}

/**
 * Creates and returns a new pg.Pool with error handling and logging.
 */
export function createPostgresPool(envConfig: typeof env = env): pg.Pool {
  const pool = new Pool(createPostgresPoolConfig(envConfig));

  pool.on("error", (err) => {
    const diagnostic = classifyPostgresError(err, envConfig);
    console.error(`[PostgreSQL Pool Error] ${diagnostic.category}: ${diagnostic.sanitizedMessage}`);
  });

  return pool;
}
