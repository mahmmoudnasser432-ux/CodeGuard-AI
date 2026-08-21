import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test Windows Authentication using the EXACT same parameters that worked in sqlcmd
async function testNodeWindowsAuthVerified() {
  console.log("Testing Node.js Windows Authentication with verified working parameters...");
  console.log(`  Server: tcp:localhost,54833`);
  console.log(`  Database: master`);
  console.log(`  Authentication: Windows Integrated Security`);
  console.log(`  Trust server certificate: true`);
  console.log();

  const connectionString = `Server=tcp:localhost,54833;Database=master;Integrated Security=true;TrustServerCertificate=true;`;

  const pool = new sql.ConnectionPool(connectionString, {
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with Node.js Windows Authentication (verified params)!");

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
testNodeWindowsAuthVerified().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});