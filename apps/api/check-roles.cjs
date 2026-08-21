const { sqlPool } = require('./src/infrastructure/database/sqlserver.ts');

async function check() {
  try {
    await sqlPool.connect();
    const result = await sqlPool.request().query('SELECT Id, Name FROM dbo.Roles ORDER BY Id');
    console.log('Roles:', JSON.stringify(result.recordset, null, 2));
  } catch (error) {
    console.error('Error checking roles:', error);
  } finally {
    await sqlPool.close();
  }
}

check().catch(console.error);
