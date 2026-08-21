import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test SQL Server Authentication with the newly created login
async function testNodeSqlAuthNewLogin() {
  console.log("Testing Node.js SQL Server Authentication with new login...");
  console.log(`  Server: ${process.env.SQLSERVER_HOST}`);
  console.log(`  Port: ${process.env.SQLSERVER_PORT}`);
  console.log(`  Database: ${process.env.SQLSERVER_DATABASE}`);
  console.log(`  User: testuser`);
  console.log(`  Password: [hidden]`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: parseInt(process.env.SQLSERVER_PORT),
    database: process.env.SQLSERVER_DATABASE,
    user: "testuser",
    password: "TestPass123!",
    options: {
      encrypt: true,
      trustServerCertificate: process.env.NODE_ENV !== "production"
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with Node.js SQL Server Authentication (new login)!");

    // Test the connection
    const result = await pool.request().query("SELECT 1 as test, DB_NAME() as databaseName");
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
testNodeSqlAuthNewLogin().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});