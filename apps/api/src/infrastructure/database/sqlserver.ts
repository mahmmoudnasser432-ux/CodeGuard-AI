import sql from "mssql";
import { env } from "../../config/env.ts";

export const sqlPool = new sql.ConnectionPool({
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
  database: env.SQLSERVER_DATABASE,
  user: env.SQLSERVER_USER,
  password: env.SQLSERVER_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production"
    // trustedConnection: false // Using SQL Authentication instead of Windows Integrated Security
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
});