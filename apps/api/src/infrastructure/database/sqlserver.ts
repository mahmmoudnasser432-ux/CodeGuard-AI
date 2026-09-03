import sql from "mssql";
import { env } from "../../config/env.js";

/**
 * Logical failure categories for SQL Server connection & operation errors.
 */
export type SqlErrorCategory =
  | "TLS_CERTIFICATE_ERROR"
  | "AUTHENTICATION_FAILED"
  | "NETWORK_OR_FIREWALL_TIMEOUT"
  | "DATABASE_NOT_FOUND"
  | "CONNECTION_CLOSED"
  | "GENERAL_DATABASE_ERROR";

export interface SqlDiagnosticResult {
  category: SqlErrorCategory;
  sanitizedMessage: string;
  safeMetadata: {
    host: string;
    port: number;
    database: string;
    encrypt: boolean;
    trustServerCertificate: boolean;
    serverName: string | null;
    errorCode: string | null;
  };
}

/**
 * Sanitizes and classifies a SQL Server error without leaking credentials, passwords, or raw tokens.
 */
export function classifySqlError(error: unknown, envConfig: typeof env = env): SqlDiagnosticResult {
  const err = error as Record<string, any> | null | undefined;
  const rawCode: string = String(err?.code || err?.originalError?.code || "");
  const rawMessage: string = String(err?.message || err?.originalError?.message || error || "Unknown database error");

  // Redact any potential credential leakage in error messages
  const sanitizedMessage = rawMessage
    .replace(/(password|pwd|secret)=[^;]+/gi, "$1=[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9-_.]+/gi, "$1[REDACTED]");

  let category: SqlErrorCategory = "GENERAL_DATABASE_ERROR";

  const lowerMsg = sanitizedMessage.toLowerCase();
  if (
    rawCode.includes("TLS") ||
    rawCode.includes("CERT") ||
    lowerMsg.includes("certificate") ||
    lowerMsg.includes("self signed") ||
    lowerMsg.includes("unable to verify") ||
    lowerMsg.includes("hostname/ip does not match") ||
    lowerMsg.includes("altnames") ||
    lowerMsg.includes("servername")
  ) {
    category = "TLS_CERTIFICATE_ERROR";
  } else if (rawCode === "ELOGIN" || lowerMsg.includes("login failed") || lowerMsg.includes("authentication")) {
    category = "AUTHENTICATION_FAILED";
  } else if (
    rawCode === "ETIMEOUT" ||
    rawCode === "ESOCKET" ||
    rawCode === "ECONNREFUSED" ||
    rawCode === "ENOTFOUND" ||
    rawCode === "EHOSTUNREACH" ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("connect econnrefused") ||
    lowerMsg.includes("failed to connect")
  ) {
    category = "NETWORK_OR_FIREWALL_TIMEOUT";
  } else if (rawCode === "EDATABASE" || lowerMsg.includes("cannot open database")) {
    category = "DATABASE_NOT_FOUND";
  } else if (rawCode === "ECONNCLOSED" || lowerMsg.includes("connection closed")) {
    category = "CONNECTION_CLOSED";
  }

  return {
    category,
    sanitizedMessage,
    safeMetadata: {
      host: envConfig.SQLSERVER_HOST,
      port: Number(envConfig.SQLSERVER_PORT),
      database: envConfig.SQLSERVER_DATABASE,
      encrypt: envConfig.SQLSERVER_ENCRYPT ?? true,
      trustServerCertificate: envConfig.SQLSERVER_TRUST_SERVER_CERTIFICATE ?? false,
      serverName: envConfig.SQLSERVER_SERVER_NAME ?? null,
      errorCode: rawCode || null,
    },
  };
}

/**
 * Builds a validated mssql connection pool configuration object from environment settings.
 */
export function createPoolConfig(envConfig: typeof env): sql.config {
  return {
    server: envConfig.SQLSERVER_HOST,
    port: envConfig.SQLSERVER_PORT,
    database: envConfig.SQLSERVER_DATABASE,
    user: envConfig.SQLSERVER_USER,
    password: envConfig.SQLSERVER_PASSWORD,
    connectionTimeout: envConfig.SQLSERVER_CONNECTION_TIMEOUT,
    requestTimeout: envConfig.SQLSERVER_REQUEST_TIMEOUT,
    options: {
      encrypt: envConfig.SQLSERVER_ENCRYPT,
      trustServerCertificate: envConfig.SQLSERVER_TRUST_SERVER_CERTIFICATE,
      connectTimeout: envConfig.SQLSERVER_CONNECTION_TIMEOUT,
      requestTimeout: envConfig.SQLSERVER_REQUEST_TIMEOUT,
      ...(envConfig.SQLSERVER_SERVER_NAME ? { serverName: envConfig.SQLSERVER_SERVER_NAME } : {}),
    },
    pool: {
      max: envConfig.SQLSERVER_POOL_MAX,
      min: envConfig.SQLSERVER_POOL_MIN,
      idleTimeoutMillis: envConfig.SQLSERVER_POOL_IDLE_TIMEOUT,
    },
  };
}

export const sqlPool = new sql.ConnectionPool(createPoolConfig(env));

sqlPool.on("error", (err) => {
  const diagnostic = classifySqlError(err, env);
  console.error(`[SQL Server Pool Error] ${diagnostic.category}: ${diagnostic.sanitizedMessage}`);
});