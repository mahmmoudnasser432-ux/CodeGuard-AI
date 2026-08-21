import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("Testing SQL Server Authentication with new credentials...");
console.log(`  Server: ${env.SQLSERVER_HOST}`);
console.log(`  Port: ${env.SQLSERVER_PORT}`);
console.log(`  Database: ${env.SQLSERVER_DATABASE}`);
console.log(`  User: ${env.SQLSERVER_USER}`);
console.log(`  Password: [hidden]`);

const pool = new sql.ConnectionPool({
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
  database: env.SQLSERVER_DATABASE,
  user: env.SQLSERVER_USER,
  password: env.SQLSERVER_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production"
  }
});

pool.connect()
  .then(() => {
    console.log("✅ Connected successfully with SQL Server Authentication!");
    return pool.request().query("SELECT 1 as test, DB_NAME() as databaseName, SUSER_SNAME() as userName");
  })
  .then(result => {
    console.log("   Query result:", JSON.stringify(result.recordset[0]));
    pool.close();
  })
  .catch(err => {
    console.log(`❌ Connection failed: ${err.message}`);
    if (err.code) {
      console.log(`   Error code: ${err.code}`);
    }
    pool.close();
    process.exit(1);
  });