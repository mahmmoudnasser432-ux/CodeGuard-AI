import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test Windows Authentication to the CodeGuardAI database using verified server settings
async function testNodeWindowsAuthDB() {
  console.log("Testing Node.js Windows Authentication to CodeGuardAI database...");
  console.log(`  Server: tcp:localhost,54833`);
  console.log(`  Database: CodeGuardAI`);
  console.log(`  Authentication: Windows Integrated Security`);
  console.log(`  Trust server certificate: true`);
  console.log();

  const connectionString = `Server=tcp:localhost,54833;Database=CodeGuardAI;Integrated Security=true;TrustServerCertificate=true;`;

  const pool = new sql.ConnectionPool(connectionString, {
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with Node.js Windows Authentication to CodeGuardAI!");

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
testNodeWindowsAuthDB().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});