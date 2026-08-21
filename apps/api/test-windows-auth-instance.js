import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test Windows Authentication using instance name
async function testWindowsAuthInstance() {
  console.log("Testing Windows Authentication with instance name...");
  console.log(`  Server: ${process.env.SQLSERVER_HOST}`);
  console.log(`  Instance: SQLEXPRESS`);
  console.log(`  Database: ${process.env.SQLSERVER_DATABASE}`);
  console.log(`  Using Windows Integrated Security: true`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: `${process.env.SQLSERVER_HOST}\\SQLEXPRESS`,
    database: process.env.SQLSERVER_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: process.env.NODE_ENV !== "production",
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
    console.log("✅ Connected successfully with Windows Authentication (using instance name)!");

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
testWindowsAuthInstance().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});