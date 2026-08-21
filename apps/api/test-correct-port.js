import sql from "mssql";

async function testConnection() {
  console.log("Testing connection to SQL Server on dynamic port 54833...");
  console.log(`  Host: localhost`);
  console.log(`  Port: 54833`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: (from env)`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: "localhost",
    port: 54833,
    database: "master",
    user: "sa",
    password: "YourStrong!Pass123", // From current config
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