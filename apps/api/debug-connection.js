import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== Testing Exact Migration Configuration ===");
// This is from src/infrastructure/database/sqlserver.ts
const pool = new sql.ConnectionPool({
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
  database: env.SQLSERVER_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production",
    trustedConnection: true // <- This is Windows Auth
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
});

console.log("Connection config:");
console.log("  server:", env.SQLSERVER_HOST);
console.log("  port:", env.SQLSERVER_PORT);
console.log("  database:", env.SQLSERVER_DATABASE);
console.log("  options.encrypt: true");
console.log("  options.trustServerCertificate:", env.NODE_ENV !== "production");
console.log("  options.trustedConnection: true");
console.log();

pool.connect()
  .then(() => {
    console.log("✅ Migration-style connection succeeded!");
    return pool.request().query("SELECT DB_NAME() as db, SUSER_SNAME() as user, ORIGINAL_LOGIN() as originalUser");
  })
  .then(result => {
    console.log("   Result:", JSON.stringify(result.recordset[0]));
    pool.close();
  })
  .catch(err => {
    console.log("❌ Migration-style connection failed:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    process.exit(1);
  });