import { sqlPool } from "./infrastructure/database/sqlserver.ts";
import * as fs from "fs";
import * as path from "path";

async function runMigrations() {
  try {
    console.log("Connecting to database...");
    await sqlPool.connect();
    console.log("Connected to database");

    // Get all migration files from the database/migrations directory
    const migrationsDir = path.resolve("../../database/migrations");
    console.log("Looking for migrations in:", migrationsDir);
    const files = fs.readdirSync(migrationsDir);

    // Filter for SQL files and sort them to ensure proper order
    const migrationFiles = files
      .filter(file => file.endsWith(".sql"))
      .sort();

    if (migrationFiles.length === 0) {
      console.log("No migration files found");
      return;
    }

    console.log(`Found ${migrationFiles.length} migration files to process`);

    // Execute each migration file
    for (const file of migrationFiles) {
      console.log(`\nProcessing migration: ${file}`);

      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf8");

      // Split by GO command (SQL Server batch separator) and execute each batch
      const batches = sqlContent.split(/\s+GO\s+/i);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i].trim();
        if (batch) {
          console.log(`  Executing batch ${i + 1}/${batches.length}...`);
          await sqlPool.request().query(batch);
        }
      }

      console.log(`  ✓ Migration ${file} completed`);
    }

    console.log("\n✅ All migrations completed successfully!");
  } catch (error) {
    console.error("❌ Error running migrations:", error);
    throw error;
  } finally {
    await sqlPool.close();
    console.log("Database connection closed");
  }
}

// Run the migration runner if this file is executed directly
// Check if we're being run as a script (not imported as a module)
if (process.argv[1] && process.argv[1].endsWith("migration-runner.ts")) {
  runMigrations().catch(error => {
    console.error("❌ Migration runner failed:", error);
    process.exit(1);
  });
}

export { runMigrations };
