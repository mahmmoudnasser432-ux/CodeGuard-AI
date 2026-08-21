import sql from "mssql";
import { env } from "./src/config/env.ts";

console.log('Environment variables from process.env:');
console.log('SQLSERVER_HOST:', process.env.SQLSERVER_HOST);
console.log('SQLSERVER_PORT:', process.env.SQLSERVER_PORT);
console.log('SQLSERVER_DATABASE:', process.env.SQLSERVER_DATABASE);
console.log('SQLSERVER_USER:', process.env.SQLSERVER_USER);
console.log('SQLSERVER_PASSWORD:', process.env.SQLSERVER_PASSWORD);

console.log('\nEnv object from schema:');
console.log(env);

const pool = new sql.ConnectionPool({
  server: env.SQLSERVER_HOST,
  port: env.SQLSERVER_PORT,
  database: env.SQLSERVER_DATABASE,
  options: {
    encrypt: true,
    trustServerCertificate: env.NODE_ENV !== "production",
    trustedConnection: true // Use Windows Integrated Security
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30_000
  }
});

console.log('\nPool config:', pool.config);

pool.connect().then(() => {
  console.log('Connected successfully');
  return pool.close();
}).catch(err => {
  console.error('Connection error:', err);
  process.exit(1);
});