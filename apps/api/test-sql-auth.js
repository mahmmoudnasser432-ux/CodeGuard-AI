import { env } from "./src/config/env.ts";
import sql from "mssql";

// Test SQL Server Authentication with SA account
async function testSqlAuth() {
  console.log("Testing SQL Server Authentication with SA account...");
  console.log(`  Server: ${env.SQLSERVER_HOST}`);
  console.log(`  Port: ${env.SQLSERVER_PORT}`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: [hidden]`);
  console.log();

  // Determine connection parameters
  const useInstance = !!env.SQLSERVER_INSTANCE;
  const serverString = useInstance
    ? `${env.SQLSERVER_HOST}\\${env.SQLSERVER_INSTANCE}`
    : env.SQLSERVER_HOST;
  const portToUse = useInstance ? undefined : env.SQLSERVER_PORT;

  console.log(`  Server: ${serverString}${useInstance ? '' : `:${portToUse}`}`);
  console.log(`  Instance: ${env.SQLSERVER_INSTANCE || '(default)'}`);
  console.log(`  Port: ${portToUse || '(default when using instance)'}`);
  console.log(`  Database: master`);
  console.log(`  User: sa`);
  console.log(`  Password: [hidden]`);
  console.log();

  const pool = new sql.ConnectionPool({
    server: serverString,
    port: portToUse,
    database: "master", // Connect to master first to test auth
    user: "sa",
    password: "Change_this_password_123", // From env.ts default
    options: {
      encrypt: true,
      trustServerCertificate: env.NODE_ENV !== "production"
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 10_000
    }
  });

  try {
    await pool.connect();
    console.log("✅ Connected successfully with SQL Server Authentication!");

    // Test the connection and create database if needed
    await pool.request().query("IF DB_ID('CodeGuardAI') IS NULL CREATE DATABASE CodeGuardAI");
    console.log("   Ensured CodeGuardAI database exists");

    // Switch to the target database
    await pool.close();

    // Now connect to the actual database
    const pool2 = new sql.ConnectionPool({
      server: `${process.env.SQLSERVER_HOST}\\${process.env.SQLSERVER_INSTANCE}`,
      database: process.env.SQLSERVER_DATABASE,
      user: "sa",
      password: "Change_this_password_123",
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
testSqlAuth().then(result => {
  if (!result.success) {
    process.exit(1);
  }
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});