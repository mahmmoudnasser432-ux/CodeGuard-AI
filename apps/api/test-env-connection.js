// Test connection using the actual environment configuration
import { env } from "./src/config/env.js";
import sql from "mssql";

async function testConnection() {
  console.log("Testing connection with environment configuration:");
  console.log(`  Host: ${env.SQLSERVER_HOST}`);
  console.log(`  Port: ${env.SQLSERVER_PORT}`);
  console.log(`  Database: ${env.SQLSERVER_DATABASE}`);
  console.log(`  User: ${env.SQLSERVER_USER}`);
  console.log(`  Password: ${env.SQLSERVER_PASSWORD}`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: env.SQLSERVER_HOST,
    port: env.SQLSERVER_PORT,
    database: env.SQLSERVER_DATABASE,
    user: env.SQLSERVER_USER,
    password: env.SQLSERVER_PASSWORD,
    options: {
      encrypt: true,
      trustServerCertificate: env.NODE_ENV !== "production"
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully!");

    // Test the connection
    const result = await pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_NAME() as current_user");
    console.log(`   Query result: ${JSON.stringify(result.recordset[0])}`);

    await pool.close();
    return { success: true };
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}`);
    if (err.code) {
      console.log(`   Error code: ${err.code}`);
    }

    try { await pool.close(); } catch (e) {}
    return { success: false, error: err.message };
  }
}

// Run the test
testConnection().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});