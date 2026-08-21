import sql from "mssql";

const testConfigs = [
  {
    name: "localhost\\SQLEXPRESS with Windows Auth",
    config: {
      server: "localhost\\SQLEXPRESS",
      database: "master",
      options: {
        encrypt: true,
        trustServerCertificate: true,
        trustedConnection: true
      }
    }
  },
  {
    name: "localhost\\SQLEXPRESS with sa credentials",
    config: {
      server: "localhost\\SQLEXPRESS",
      database: "master",
      user: "sa",
      password: "YourStrong!Pass123",
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    }
  },
  {
    name: "localhost\\SQLEXPRESS:1433 with sa (explicit port)",
    config: {
      server: "localhost\\SQLEXPRESS",
      port: 1433,
      database: "master",
      user: "sa",
      password: "YourStrong!Pass123",
      options: {
        encrypt: true,
        trustServerCertificate: true
      }
    }
  },
  {
    name: "localhost\\SQLEXPRESS via Named Pipes",
    config: {
      server: "localhost\\SQLEXPRESS",
      database: "master",
      user: "sa",
      password: "YourStrong!Pass123",
      options: {
        encrypt: true,
        trustServerCertificate: true
      },
      // Try to force named pipes
      domain: "localhost",
      connectionTimeout: 15000
    }
  }
];

async function testConnection(name, config) {
  console.log(`\n🧪 Testing: ${name}`);
  const pool = new sql.ConnectionPool(config);

  try {
    await pool.connect();
    console.log(`✅ SUCCESS: Connected with ${name}`);

    // Test query
    const result = await pool.request().query("SELECT @@VERSION as version");
    console.log(`   Version: ${result.recordset[0].version.substring(0, 50)}...`);

    await pool.close();
    return true;
  } catch (err) {
    console.log(`❌ FAILED: ${name}`);
    console.log(`   Error: ${err.message}`);
    if (err.code) console.log(`   Code: ${err.code}`);

    try { await pool.close(); } catch (e) {}
    return false;
  }
}

async function runAllTests() {
  console.log("Testing various connection string formats for SQL Server SQLEXPRESS...");
  console.log("====================================================================================");

  let successCount = 0;
  for (const test of testConfigs) {
    const success = await testConnection(test.name, test.config);
    if (success) successCount++;
  }

  console.log(`\n📊 Results: ${successCount}/${testConfigs.length} connection attempts succeeded`);

  if (successCount > 0) {
    console.log("\n🎉 At least one connection method worked!");
    console.log("Update your sqlserver.ts configuration to use the working connection string.");
  } else {
    console.log("\n💥 All connection attempts failed.");
    console.log("\nTroubleshooting steps:");
    console.log("1. Verify SQL Server (SQLEXPRESS) is actually running: services.msc");
    console.log("2. Check SQL Server Configuration Manager for enabled protocols");
    console.log("3. Verify Windows Firewall isn't blocking SQL Server");
    console.log("4. Try connecting with SQL Server Management Studio (SSMS)");
    console.log("5. As fallback, consider using SQLite for development");
  }
}

runAllTests().catch(console.error);