import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Test SQL Server Authentication with SA and wrong password to see if we get auth error vs connection error
async function testNodeSaWrongPassword() {
  console.log("Testing Node.js SQL Server Authentication with SA and wrong password...");
  console.log(`  Server: ${process.env.SQLSERVER_HOST}`);
  console.log(`  Port: ${process.env.SQLSERVER_PORT}`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: wrong_password_intentionally`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: parseInt(process.env.SQLSERVER_PORT),
    database: "master",
    user: "sa",
    password: "wrong_password_intentionally",
    options: {
      encrypt: true,
      trustServerCertificate: process.env.NODE_ENV !== "production"
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("❌ Unexpectedly connected with wrong password!");
    await pool.close();
    return { success: false, error: "Should have failed with wrong password" };
  } catch (err) {
    console.log(`❌ Connection failed: ${err.message}`);
    if (err.code) {
      console.log(`   Error code: ${err.code}`);
    }
    // If we get a login failed error, that means we got past the network layer
    if (err.code === 'ELOGIN') {
      console.log(`   ✅ Got past network layer - this is a credentials error, not connection error`);
      return { success: true, error: err.message }; // Return success because we got past network
    } else {
      console.log(`   ❌ Failed at network layer`);
      return { success: false, error: err.message };
    }
  }
}

// Run the test
testNodeSaWrongPassword().then(result => {
  if (result.success) {
    console.log(`\n✅ SUCCESS: Got past network layer - issue is credentials, not connectivity`);
  } else {
    console.log(`\n❌ FAILURE: Cannot get past network layer - fundamental connectivity issue`);
  }
  process.exit(result.success ? 0 : 1);
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});