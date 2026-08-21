import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test Windows Authentication using connection string format
async function testNodeWindowsAuthConnectionString() {
  console.log("Testing Node.js Windows Authentication using connection string format...");
  console.log(`  Connection string: Server=tcp:${process.env.SQLSERVER_HOST},${process.env.SQLSERVER_PORT};Database=${process.env.SQLSERVER_DATABASE};Integrated Security=true;TrustServerCertificate=true;`);
  console.log();

  const connectionString = `Server=tcp:${process.env.SQLSERVER_HOST},${process.env.SQLSERVER_PORT};Database=${process.env.SQLSERVER_DATABASE};Integrated Security=true;TrustServerCertificate=true;`;

  const pool = new sql.ConnectionPool(connectionString, {
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with Node.js Windows Authentication (connection string)!");

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
testNodeWindowsAuthConnectionString().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});