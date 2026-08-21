import sql from "mssql";

async function testInstanceName() {
  console.log("Testing connection using instance name (let SQL Browser find the port)...");
  console.log(`  Server: localhost\\SQLEXPRESS`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: (from env)`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: "localhost\\SQLEXPRESS",
    database: "master",
    user: "sa",
    password: "YourStrong!Pass123",
    options: {
      encrypt: true,
      trustServerCertificate: true
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 15_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully using instance name!");

    // Test the connection
    const result = await pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_NAME() as current_user");
    console.log(`   Query result: ${JSON.stringify(result.recordset[0])}`);

    // Also get the actual port being used
    const portResult = await pool.request().query("SELECT local_net_address, local_tcp_port FROM sys.dm_exec_connections WHERE session_id = @@SPID");
    console.log(`   Connection details: ${JSON.stringify(portResult.recordset[0])}`);

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
testInstanceName().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});