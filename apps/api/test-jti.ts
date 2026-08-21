import { sqlPool } from "./infrastructure/database/sqlserver.ts";

async function test() {
  try {
    await sqlPool.connect();
    const result = await sqlPool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'Jti'");
    console.log('Jti column exists:', result.recordset.length > 0);
    console.log('Count:', result.recordset.length);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sqlPool.close();
  }
}

test();