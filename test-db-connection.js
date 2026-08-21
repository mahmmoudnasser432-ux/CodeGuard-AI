import { config } from "dotenv";
import sql from "mssql";
import { env } from "./apps/api/src/config/env.ts";

// Load .env file (if exists)
config();

console.log("Environment variables:");
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`SQLSERVER_INSTANCE: ${env.SQLSERVER_INSTANCE}`);
console.log(`SQLSERVER_DATABASE: ${env.SQLSERVER_DATABASE}`);

async function testConnection() {
  console.log("\nTesting database connection...");

  const pool = new sql.ConnectionPool({
    server: `localhost\\${env.SQLSERVER_INSTANCE}`,
    database: env.SQLSERVER_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: env.NODE_ENV !== "production",
      trustedConnection: true
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

testConnection().then(result => {
  if (!result.success) {
    process.exit(1);
  }
  console.log("\n✅ Database connection test passed!");
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});