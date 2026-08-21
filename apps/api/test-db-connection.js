import sql from "mssql";

// Try to connect to SQL Server Express instance using Windows Integrated Security
const server = "localhost\\SQLEXPRESS"; // Named instance format
const database = "CodeGuardAI"; // Will be created if doesn't exist

async function testWindowsAuth() {
  console.log(`\nTrying to connect to ${server} using Windows Integrated Security...`);

  const pool = new sql.ConnectionPool({
    server: server, // Named instance format
    // Don't specify port for named instances - let the driver find it via SQL Browser
    database: database,
    options: {
      encrypt: true,
      trustServerCertificate: true,
      trustedConnection: true // Windows Integrated Security
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log(`✅ Connected successfully to ${server} using Windows Integrated Security!`);

    // Test the connection and get user info
    const result = await pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_NAME() as current_user, IS_SRVROLEMEMBER('sysadmin') as is_sysadmin");
    console.log(`   Query result: ${JSON.stringify(result.recordset[0])}`);

    await pool.close();
    return { success: true };
  } catch (err) {
    // Handle different error types
    if (err.code === 'LOGIN_FAILED') {
      console.log(`❌ Windows Authentication failed - your Windows user may not have access to SQL Server`);
    } else if (err.code === 'ETIMEOUT') {
      console.log(`❌ Connection timeout - server may not be listening`);
    } else if (err.code === 'ESOCKET') {
      console.log(`❌ Failed to connect to socket - server may not be running or accessible`);
    } else {
      console.log(`❅ Connection error: ${err.message}`);
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
  console.log("Testing SQL Server Express (localhost\\SQLEXPRESS) with Windows Integrated Security...");
  console.log("====================================================================================");

  const result = await testWindowsAuth();

  if (result.success) {
    console.log(`\n🎯 SUCCESS: Connected using Windows Integrated Security!`);
    console.log("\nYou can configure your application to use Windows Authentication by:");
    console.log("1. Setting trustedConnection: true in the connection config");
    console.log("2. Removing user and password from the connection configuration");
    console.log("3. Ensuring your Windows user has appropriate permissions on SQL Server");
  } else {
    console.log("\n❌ Could not connect using Windows Integrated Security.");
    console.log("\nNext steps to try:");
    console.log("1. Run your development tools (VS Code, terminal) as Administrator");
    console.log("2. Add your Windows user to SQL Server sysadmin role via SQL Server Management Studio");
    console.log("3. Enable mixed mode authentication and set a known sa password");
    console.log("4. Use SQL Server Configuration Manager to verify the SQLEXPRESS instance is running");
    console.log("5. As a last resort, consider using SQLite for development and switch to SQL Server in production");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});