import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("Testing Windows Integrated Security with instance name...");
const pool = new sql.ConnectionPool({
  server: `${env.SQLSERVER_HOST}\SQLEXPRESS`,
  database: "master",
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production",
    trustedConnection: true // Use Windows Integrated Security
  }
});

pool.connect()
  .then(() => {
    console.log("✅ Connected successfully with Windows Auth + instance!");
    return pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_SNAME() as user");
  })
  .then(result => {
    console.log("   Query result:", JSON.stringify(result.recordset[0]));
    pool.close();
  })
  .catch(err => {
    console.log("❌ Connection failed:", err.message);
    if (err.code) console.log("   Error code:", err.code);
  });
