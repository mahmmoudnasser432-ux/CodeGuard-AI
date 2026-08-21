import { config } from "dotenv";
import sql from "mssql";

// Load .env file
config();

// Common SA passwords to try
const saPasswords = [
  "", // Empty password
  "Change_this_password_123", // From env.ts
  "Password123",
  "admin",
  "root",
  "sa",
  "Mssql_123",
  "Sql2019!",
  "P@ssw0rd",
  "Admin123"
];

async function testSaPassword(password) {
  console.log(`Testing SA with password: "${password}" (length: ${password.length})`);

  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: parseInt(process.env.SQLSERVER_PORT),
    database: "master",
    user: "sa",
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: process.env.NODE_ENV !== "production"
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 5_000
    }
  });

  try {
    await pool.connect();
    console.log(`✅ SUCCESS: SA authentication works with password: "${password}"`);
    await pool.close();
    return { success: true, password };
  } catch (err) {
    if (err.code === 'ELOGIN') {
      console.log(`   ❌ Login failed for user 'sa'`);
      return { success: false };
    } else {
      console.log(`   ❌ Unexpected error: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

async function testAllPasswords() {
  console.log("Testing various SA passwords...\n");

  for (const password of saPasswords) {
    const result = await testSaPassword(password);
    if (result.success) {
      console.log(`\n🎉 Found working SA password: "${result.password}"`);
      // Update the env.ts or .env with this password
      return result.password;
    }
    console.log(""); // Empty line between attempts
  }

  console.log("❌ None of the tested SA passwords worked.");
  return null;
}

// Run the test
testAllPasswords().then(password => {
  if (password) {
    console.log(`\n✅ Recommended: Update SA password to: "${password}"`);
  } else {
    console.log(`\n💡 Suggestion: SA account may be disabled or Mixed Mode authentication may be off.`);
  }
  process.exit(password ? 0 : 1);
}).catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});