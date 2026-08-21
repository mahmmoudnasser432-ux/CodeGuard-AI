import { sqlPool } from "./src/infrastructure/database/sqlserver.ts";

console.log("Testing sqlPool connection...");
sqlPool.connect()
  .then(() => {
    console.log("✅ Connected successfully!");
    return sqlPool.request().query("SELECT 1 as test, DB_NAME() as databaseName");
  })
  .then(result => {
    console.log("   Query result:", JSON.stringify(result.recordset[0]));
    sqlPool.close();
  })
  .catch(err => {
    console.log("❌ Connection failed:", err.message);
    if (err.code) console.log("   Error code:", err.code);
    sqlPool.close();
  });
