// Test SQL Auth with detailed error info
import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== TESTING SQL AUTH WITH DETAILED ERROR INFO ===");

const sqlAuthConfig = {
  server: "localhost\\\\SQLEXPRESS",
  database: env.SQLSERVER_DATABASE,
  user: "sa",
  password: "Change_this_password_123", // From env.ts default
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production"
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
};

console.log("SQL Auth Config:");
console.log(JSON.stringify(sqlAuthConfig, null, 2));

const pool = new sql.ConnectionPool(sqlAuthConfig);

pool.connect()
  .then(() => {
    console.log("✅ SQL AUTH CONNECTION SUCCESSFUL!");
    return pool.request().query("SELECT DB_NAME() as database_name, SUSER_SNAME() as user_name");
  })
  .then(result => {
    console.log("Connection details:", JSON.stringify(result.recordset[0], null, 2));
    pool.close();
  })
  .catch(err => {
    console.log("❌ SQL AUTH CONNECTION FAILED:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.code === 'ELOGIN') {
      console.log("   This is a login failure - suggests network connectivity is OK");
    }
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    process.exit(1);
  });