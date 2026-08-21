import { config } from "dotenv";
import sql from "mssql";
import { hostname } from "os";

// Load .env file
config();

// Get computer name
const computerName = hostname();
console.log(`Computer name: ${computerName}`);

// Test Windows Authentication using computer name
async function testNodeWindowsAuthComputerName() {
  console.log("Testing Node.js Windows Authentication using computer name...");
  console.log(`  Server: ${computerName}\\SQLEXPRESS`);
  console.log(`  Database: ${process.env.SQLSERVER_DATABASE}`);
  console.log(`  Using Windows Integrated Security: true`);
  console.log(`  Trust server certificate: true`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: `${computerName}\\SQLEXPRESS`,
    database: process.env.SQLSERVER_DATABASE,
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
    console.log("✅ Connected successfully with Node.js Windows Authentication (computer name)!");

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
testNodeWindowsAuthComputerName().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});