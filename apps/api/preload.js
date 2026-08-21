import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });
// Unset SQLSERVER_USER and SQLSERVER_PASSWORD to prevent mssql/Tedious from using them
// when trustedConnection: true is intended for Windows Integrated Security.
delete process.env.SQLSERVER_USER;
delete process.env.SQLSERVER_PASSWORD;