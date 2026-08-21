import { sqlPool } from './src/infrastructure/database/sqlserver.ts';
async function clear() {
  await sqlPool.connect();
  await sqlPool.request().query('DELETE FROM dbo.UserRoles');
  await sqlPool.request().query('DELETE FROM dbo.Roles');
  console.log('Cleared UserRoles and Roles tables');
  await sqlPool.close();
}
clear().catch(console.error);
