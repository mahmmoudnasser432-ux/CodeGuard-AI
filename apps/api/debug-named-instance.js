// Test connecting to the named instance that works in SSMS
import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== TESTING NAMED INSTANCE CONFIGURATION (like SSMS) ===");

// This mimics what SSMS does with localhost\SQLEXPRESS
const namedInstanceConfig = {
  server: "localhost\\\\SQLEXPRESS", // Note: double backslash for JS string
  database: env.SQLSERVER_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production",
    trustedConnection: true // Windows Integrated Security
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
};

console.log("Named Instance Config:");
console.log(JSON.stringify(namedInstanceConfig, null, 2));

const pool = new sql.ConnectionPool(namedInstanceConfig);

pool.connect()
  .then(() => {
    console.log("✅ NAMED INSTANCE CONNECTION SUCCESSFUL!");
    return pool.request().query("SELECT DB_NAME() as database_name, SUSER_SNAME() as user_name, ORIGINAL_LOGIN() as original_login, HOST_NAME() as host_name, @@SERVERNAME as server_name");
  })
  .then(result => {
    console.log("Connection details:", JSON.stringify(result.recordset[0], null, 2));
    pool.close();
  })
  .catch(err => {
    console.log("❌ NAMED INSTANCE CONNECTION FAILED:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    process.exit(1);
  });