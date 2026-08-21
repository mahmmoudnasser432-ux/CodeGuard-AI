// Test connecting with NO authentication specified
import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== TESTING NAMED INSTANCE WITH NO AUTH ===");

const noAuthConfig = {
  server: "localhost\\\\SQLEXPRESS",
  database: env.SQLSERVER_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production"
    // NOT setting trustedConnection - no auth specified
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
};

console.log("Config (no auth):");
console.log(JSON.stringify(noAuthConfig, null, 2));

const pool = new sql.ConnectionPool(noAuthConfig);

pool.connect()
  .then(() => {
    console.log("✅ NO AUTH CONNECTION SUCCESSFUL (unexpected)!");

    return pool.request().query("SELECT DB_NAME() as database_name, SUSER_SNAME() as user_name");
  })
  .then(result => {
    console.log("Connection details:", JSON.stringify(result.recordset[0], null, 2));
    pool.close();
  })
  .catch(err => {
    console.log("❌ NO AUTH CONNECTION FAILED:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    // Don't exit - just show the result
  });