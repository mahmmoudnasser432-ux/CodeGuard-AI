import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test using the EXACT connection string that works in sqlcmd
async function testNodeExactConnectionString() {
  console.log("Testing Node.js mssql with exact working connection string...");
  console.log(`  Connection string: Server=tcp:localhost,54833;Database=${process.env.SQLSERVER_DATABASE};User ID=testuser;Password=TestPass123!;TrustServerCertificate=true;`);
  console.log();

  const connectionString = `Server=tcp:localhost,54833;Database=${process.env.SQLSERVER_DATABASE};User ID=testuser;Password=TestPass123!;TrustServerCertificate=true;`;

  const pool = new sql.ConnectionPool(connectionString, {
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with Node.js mssql using exact connection string!");

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
testNodeExactConnectionString().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});