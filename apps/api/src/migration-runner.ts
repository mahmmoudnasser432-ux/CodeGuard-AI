import { sqlPool } from "./infrastructure/database/sqlserver.js";
import sql from "mssql";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalizes SQL script content and computes its SHA-256 checksum.
 */
export function computeChecksum(sqlContent: string): string {
  // Normalize line endings and trim trailing whitespace to ensure cross-platform hash stability
  const normalized = sqlContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Splits SQL Server script content into separate batches by 'GO' commands.
 * Handles GO on its own line (case-insensitive, with optional whitespace/line comments).
 */
export function splitSqlBatches(sqlContent: string): string[] {
  const normalized = sqlContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split on lines containing only 'GO' (with optional trailing whitespace or -- comments)
  const batches = normalized
    .split(/^\s*GO\s*(?:--.*)?$/gim)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  return batches.length > 0 ? batches : [normalized.trim()].filter((b) => b.length > 0);
}

/**
 * Discovers the migrations directory across bare-metal, workspace, and Docker environments.
 */
export function resolveMigrationsDir(explicitDir?: string): string {
  if (explicitDir) {
    if (fs.existsSync(explicitDir) && fs.statSync(explicitDir).isDirectory()) {
      return path.resolve(explicitDir);
    }
    throw new Error(`Explicit migrations directory "${explicitDir}" does not exist.`);
  }

  if (process.env.MIGRATIONS_DIR) {
    if (fs.existsSync(process.env.MIGRATIONS_DIR) && fs.statSync(process.env.MIGRATIONS_DIR).isDirectory()) {
      return path.resolve(process.env.MIGRATIONS_DIR);
    }
    throw new Error(`Configured MIGRATIONS_DIR "${process.env.MIGRATIONS_DIR}" does not exist.`);
  }

  const candidatePaths = [
    // Standard workspace paths from src/ or dist/
    path.resolve(__dirname, "../../database/migrations"),
    path.resolve(__dirname, "../../../database/migrations"),
    // Docker container paths
    path.resolve("/app/database/migrations"),
    path.resolve("/app/apps/api/database/migrations"),
    // Relative to working directory
    path.resolve(process.cwd(), "database/migrations"),
    path.resolve(process.cwd(), "../../database/migrations"),
    path.resolve(process.cwd(), "../database/migrations"),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `Migrations directory could not be located. Checked candidate paths:\n` +
    candidatePaths.map((p) => ` - ${p}`).join("\n") +
    `\nSet MIGRATIONS_DIR environment variable to override.`
  );
}

export interface AppliedMigration {
  id: number;
  name: string;
  checksum: string;
  applied_at: Date;
  duration_ms: number;
}

/**
 * Ensures the migration history table dbo._migrations exists in the database.
 */
export async function ensureMigrationHistoryTable(pool: sql.ConnectionPool): Promise<void> {
  const query = `
    IF OBJECT_ID(N'dbo._migrations', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo._migrations (
            id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            name NVARCHAR(255) NOT NULL,
            checksum NVARCHAR(64) NOT NULL,
            applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
            duration_ms INT NOT NULL DEFAULT 0,
            CONSTRAINT UQ_migrations_name UNIQUE (name)
        );
    END;
  `;
  await pool.request().query(query);
}

/**
 * Fetches all applied migrations from dbo._migrations.
 */
export async function getAppliedMigrations(pool: sql.ConnectionPool): Promise<Map<string, AppliedMigration>> {
  const result = await pool.request().query<AppliedMigration>(
    "SELECT id, name, checksum, applied_at, duration_ms FROM dbo._migrations ORDER BY id ASC"
  );

  const appliedMap = new Map<string, AppliedMigration>();
  for (const row of result.recordset) {
    appliedMap.set(row.name, row);
  }
  return appliedMap;
}

/**
 * Executes a single migration's batches inside a SQL transaction and records history on success.
 */
export async function executeMigrationWithTransaction(
  pool: sql.ConnectionPool,
  batches: string[],
  file: string,
  checksum: string
): Promise<number> {
  const startTime = Date.now();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      if (batch) {
        const request = new sql.Request(transaction);
        await request.query(batch);
      }
    }

    const durationMs = Date.now() - startTime;

    // Record successful migration in history table inside the same transaction
    const recordReq = new sql.Request(transaction);
    recordReq.input("name", sql.NVarChar(255), file);
    recordReq.input("checksum", sql.NVarChar(64), checksum);
    recordReq.input("durationMs", sql.Int, durationMs);
    await recordReq.query(
      "INSERT INTO dbo._migrations (name, checksum, duration_ms) VALUES (@name, @checksum, @durationMs)"
    );

    await transaction.commit();
    return durationMs;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {}
    throw err;
  }
}

export type MigrationExecutor = typeof executeMigrationWithTransaction;

/**
 * Core migration runner: executes pending migrations deterministically and idempotently.
 */
export async function runMigrations(
  customMigrationsDir?: string,
  pool: sql.ConnectionPool = sqlPool,
  executor: MigrationExecutor = executeMigrationWithTransaction
): Promise<{
  applied: string[];
  skipped: string[];
  total: number;
}> {
  let shouldClosePool = false;

  try {
    if (!pool.connected) {
      console.log("[Migration] Connecting to database...");
      await pool.connect();
      shouldClosePool = true;
      console.log("[Migration] Database connection established.");
    }

    const migrationsDir = resolveMigrationsDir(customMigrationsDir);
    console.log(`[Migration] Scanning migrations directory: ${migrationsDir}`);

    const files = fs.readdirSync(migrationsDir);
    const sqlFiles = files
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));

    if (sqlFiles.length === 0) {
      console.log("[Migration] No .sql migration files found.");
      return { applied: [], skipped: [], total: 0 };
    }

    console.log(`[Migration] Found ${sqlFiles.length} migration files in sequence:`);
    sqlFiles.forEach((f, idx) => console.log(`  ${idx + 1}. ${f}`));

    // Ensure migration history table exists
    await ensureMigrationHistoryTable(pool);
    const appliedMigrations = await getAppliedMigrations(pool);

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const file of sqlFiles) {
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, "utf8");
      const currentChecksum = computeChecksum(sqlContent);

      const existing = appliedMigrations.get(file);

      if (existing) {
        if (existing.checksum === currentChecksum) {
          console.log(`[Migration] [SKIP] ${file} (already applied at ${new Date(existing.applied_at).toISOString()})`);
          skipped.push(file);
          continue;
        } else {
          const errorMsg =
            `[Migration] [FATAL] Checksum mismatch for migration "${file}"!\n` +
            `  Recorded checksum : ${existing.checksum}\n` +
            `  Current checksum  : ${currentChecksum}\n` +
            `  Applied migrations cannot be modified. Create a new migration file instead.`;
          console.error(errorMsg);
          throw new Error(errorMsg);
        }
      }

      // Execute pending migration
      console.log(`[Migration] [APPLYING] ${file}...`);
      const batches = splitSqlBatches(sqlContent);

      const durationMs = await executor(pool, batches, file, currentChecksum);
      console.log(`[Migration] [DONE] ${file} (${durationMs}ms)`);
      applied.push(file);
    }

    console.log(
      `\n✅ Migration summary: ${applied.length} applied, ${skipped.length} skipped, ${sqlFiles.length} total.`
    );
    return { applied, skipped, total: sqlFiles.length };
  } catch (error) {
    console.error("❌ Migration execution failed:", error);
    throw error;
  } finally {
    if (shouldClosePool) {
      await pool.close();
      console.log("[Migration] Database connection closed.");
    }
  }
}

// Auto-run when executed directly via tsx or node
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("migration-runner.ts") ||
    process.argv[1].endsWith("migration-runner.js") ||
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);

if (isMain) {
  runMigrations()
    .then(() => {
      console.log("Migration process completed.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration process failed:", error.message || error);
      process.exit(1);
    });
}
