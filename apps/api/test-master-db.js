// Test connecting to master database first
import sql from "mssql";

async function testMasterDb() {
  console.log("Testing connection to master database on port 54833...");
  console.log();

  const pool = new sql.ConnectionPool({
    server: "localhost",
    port: 54833,
    database: "master", // Connect to master first
    user: "sa",
    password: "YourStrong!Pass123",
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
    console.log("✅ Connected to master database!");

    // Test basic query
    const result = await pool.request().query("SELECT 1 as test");
    console.log(`   Basic query: ${JSON.stringify(result.recordset[0])}`);

    // Check if we can see databases
    const dbResult = await pool.request().query("SELECT name FROM sys.databases WHERE name = 'CodeGuardAI'");
    console.log(`   CodeGuardAI database exists: ${dbResult.recordset.length > 0}`);

    await pool.close();
    return { success: true };
  } catch (err) {
    console.log(`❌ Connection to master failed: ${err.message}`);
    if (err.code) {
      console.log(`   Error code: ${err.code}`);
    }

    try { await pool.close(); } catch (e) {}
    return { success: false, error: err.message };
  }
}

// Run the test
testMasterDb().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});