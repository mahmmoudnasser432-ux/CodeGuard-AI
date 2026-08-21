import { config } from "./dist/config/env.js";
import { ConnectionPool } from "mssql";

async function verifyTables() {
  // Create connection pool using the same config as the application
  const sqlConfig = {
    server: config.SQLSERVER_HOST,
    port: config.SQLSERVER_PORT,
    database: config.SQLSERVER_DATABASE,
    user: config.SQLSERVER_USER,
    password: config.SQLSERVER_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: config.NODE_ENV !== "production"
    },
    pool: {
      max: 20,
      min: 0,
      idleTimeoutMillis: 30_000
    }
  };

  const pool = new ConnectionPool(sqlConfig);

  try {
    await pool.connect();
    console.log('Connected to database');

    // Check if our new tables exist
    const tablesToCheck = ['RefreshTokens', 'PasswordResetTokens', 'EmailVerificationTokens'];

    for (const tableName of tablesToCheck) {
      const result = await pool.request().query(
        `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'`
      );
      const exists = result.recordset[0].count > 0;
      console.log(`${tableName} table exists:`, exists);
    }

    // Also check that Sessions table still has Jti column
    const jtiResult = await pool.request().query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'Jti'"
    );
    console.log('Sessions table has Jti column:', jtiResult.recordset[0].count > 0);

  } catch (error) {
    console.error('Error verifying tables:', error);
  } finally {
    await pool.close();
    console.log('Database connection closed');
  }
}

verifyTables();