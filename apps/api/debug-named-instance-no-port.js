// Test connecting to named instance WITHOUT specifying port
import { env } from "./src/config/env.ts";
import sql from "mssql";

console.log("=== TESTING NAMED INSTANCE WITHOUT PORT (relying on SQL Server Browser) ===");

const namedInstanceNoPortConfig = {
  server: "localhost\\\\SQLEXPRESS", // Named instance only
  database: env.SQLSERVER_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production",
    trustedConnection: true
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
};

console.log("Config (no port):");
console.log(JSON.stringify(namedInstanceNoPortConfig, null, 2));

const pool = new sql.ConnectionPool(namedInstanceNoPortConfig);

pool.connect()
  .then(() => {
    console.log("✅ NAMED INSTANCE (NO PORT) CONNECTION SUCCESSFUL!");
    return pool.request().query("SELECT DB_NAME() as database_name, SUSER_SNAME() as user_name, ORIGINAL_LOGIN() as original_login, HOST_NAME() as host_name, @@SERVERNAME as server_name, LOCAL_NETWORK_ADDRESS() as net_addr, LOCAL_TCP_PORT() as tcp_port");
  })
  .then(result => {
    console.log("Connection details:", JSON.stringify(result.recordset[0], null, 2));
    pool.close();
  })
  .catch(err => {
    console.log("❌ NAMED INSTANCE (NO PORT) CONNECTION FAILED:");
    console.log("   Message:", err.message);
    console.log("   Code:", err.code);
    if (err.precedingErrors) {
      console.log("   Preceding errors:", JSON.stringify(err.precedingErrors, null, 2));
    }
    pool.close();
    process.exit(1);
  });