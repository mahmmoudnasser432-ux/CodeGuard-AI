// Debug the exact connection configuration being used
import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== ENVIRONMENT VARIABLES ===");
console.log(`SQLSERVER_HOST: ${env.SQLSERVER_HOST}`);
console.log(`SQLSERVER_PORT: ${env.SQLSERVER_PORT}`);
console.log(`SQLSERVER_DATABASE: ${env.SQLSERVER_DATABASE}`);
console.log(`NODE_ENV: ${env.NODE_ENV}`);

console.log("\n=== CONNECTION CONFIGURATION FROM src/infrastructure/database/sqlserver.ts ===");
const config = {
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
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

console.log(JSON.stringify(config, null, 2));

console.log("\n=== CONNECTION STRING ANALYSIS ===");
console.log(`Connecting to: ${config.server}:${config.port || '(default)'}`);
console.log(`Database: ${config.database}`);
console.log(`Windows Auth (trustedConnection): ${config.options.trustedConnection}`);
console.log(`Encrypt: ${config.options.encrypt}`);
console.log(`Trust Server Certificate: ${config.options.trustServerCertificate}`);

console.log("\n=== TESTING THIS EXACT CONFIGURATION ===");
const pool = new sql.ConnectionPool(config);

pool.connect()
  .then(() => {
    console.log("✅ CONNECTION SUCCESSFUL!");
    return pool.request().query("SELECT DB_NAME() as database_name, SUSER_SNAME() as user_name, ORIGINAL_LOGIN() as original_login, HOST_NAME() as host_name");
  })
  .then(result => {
    console.log("Connection details:", JSON.stringify(result.recordset[0], null, 2));
    pool.close();
  })
  .catch(err => {
    console.log("❌ CONNECTION FAILED:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    process.exit(1);
  });