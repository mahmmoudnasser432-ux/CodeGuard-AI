import sql from "mssql";

// Try to connect directly to localhost:1433 (standard SQL Server port)
const server = "localhost";
const port = 1433;
const database = "CodeGuardAI"; // Will be created if doesn't exist

async function testDirectConnection() {
  console.log(`\nTrying to connect to ${server}:${port} directly...`);

  const pool = new sql.ConnectionPool({
    server: server,
    port: port,
    database: database,
    user: "sa",
    password: "YourStrong!Pass123", // Try the password from env.ts
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
    console.log(`✅ Connected successfully to ${server}:${port}!`);

    // Test the connection and get user info
    const result = await pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_NAME() as current_user");
    console.log(`   Query result: ${JSON.stringify(result.recordset[0])}`);

    await pool.close();
    return { success: true };
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}`);
    if (err.code) {
      console.log(`   Error code: ${err.code}`);
    }

    try {
      await pool.close();
    } catch (e) {
      // Ignore errors on close
    }
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log("Testing direct connection to localhost:1433 (standard SQL Server port)...");
  console.log("====================================================================================");

  const result = await testDirectConnection();

  if (result.success) {
    console.log(`\n🎯 SUCCESS: Connected using direct TCP connection!`);
  } else {
    console.log("\n❌ Could not connect using direct TCP connection.");
    console.log("\nThis suggests either:");
    console.log("1. SQL Server is not listening on port 1433");
    console.log("2. The sa password is incorrect");
    console.log("3. SQL Server is not allowing SQL Server authentication");
    console.log("4. There's a network/firewall issue");
  }
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});