// Simple test connection using known values from .env.example
import sql from "mssql";
import { config } from "dotenv";
config(); // Load .env file if it exists

async function testConnection() {
  console.log("Testing connection with values from .env.example:");
  console.log(`  Host: ${process.env.SQLSERVER_HOST || 'localhost'}`);
  console.log(`  Port: ${process.env.SQLSERVER_PORT || 1433}`);
  console.log(`  Database: ${process.env.SQLSERVER_DATABASE || 'CodeGuardAI'}`);
  console.log(`  User: ${process.env.SQLSERVER_USER || 'sa'}`);
  console.log(`  Password: ${process.env.SQLSERVER_PASSWORD || '(hidden)'}`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST || "localhost",
    port: parseInt(process.env.SQLSERVER_PORT) || 1433,
    database: process.env.SQLSERVER_DATABASE || "CodeGuardAI",
    user: process.env.SQLSERVER_USER || "sa",
    password: process.env.SQLSERVER_PASSWORD || "Change_this_password_123",
    options: {
      encrypt: true,
      trustServerCertificate: true
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