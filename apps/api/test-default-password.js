// Test with the default password from env.ts
import sql from "mssql";

async function testDefaultPassword() {
  console.log("Testing connection with default password from env.ts...");
  console.log(`  Server: localhost`);
  console.log(`  Port: 54833`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: Change_this_password_123`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: "localhost",
    port: 54833,
    database: "master",
    user: "sa",
    password: "Change_this_password_123",
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
    console.log("✅ Connected successfully with default password!");

    // Test the connection and create database if needed
    await pool.request().query("IF DB_ID('CodeGuardAI') IS NULL CREATE DATABASE CodeGuardAI");
    console.log("   Ensured CodeGuardAI database exists");

    // Switch to the target database
    await pool.close();

    // Now connect to the actual database
    const pool2 = new sql.ConnectionPool({
      server: "localhost",
      port: 54833,
      database: "CodeGuardAI",
      user: "sa",
      password: "Change_this_password_123",
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

    await pool2.connect();
    console.log("✅ Connected to CodeGuardAI database!");

    // Test query
    const result = await pool2.request().query("SELECT 1 as test, DB_NAME() as databaseName");
    console.log(`   Query result: ${JSON.stringify(result.recordset[0])}`);

    await pool2.close();
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
testDefaultPassword().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});