import { sqlPool } from "./src/infrastructure/database/sqlserver.ts";

async function verifyTables() {
  try {
    await sqlPool.connect();

    // Check if our new tables exist
    const tablesToCheck = ['RefreshTokens', 'PasswordResetTokens', 'EmailVerificationTokens'];

    for (const tableName of tablesToCheck) {
      const result = await sqlPool.request().query(
        `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}'`
      );
      const exists = result.recordset[0].count > 0;
      console.log(`${tableName} table exists:`, exists);
    }

    // Also check that Sessions table still has Jti column
    const jtiResult = await sqlPool.request().query(
      "SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Sessions' AND COLUMN_NAME = 'Jti'"
    );
    console.log('Sessions table has Jti column:', jtiResult.recordset[0].count > 0);

  } catch (error) {
    console.error('Error verifying tables:', error);
  } finally {
    await sqlPool.close();
  }
}

verifyTables();