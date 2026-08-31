import sql from "mssql";
import { env } from "../../config/env.js";

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
    },
    pool: {
      max: envConfig.SQLSERVER_POOL_MAX,
      min: envConfig.SQLSERVER_POOL_MIN,
      idleTimeoutMillis: envConfig.SQLSERVER_POOL_IDLE_TIMEOUT,
    },
  };
}

export const sqlPool = new sql.ConnectionPool(createPoolConfig(env));