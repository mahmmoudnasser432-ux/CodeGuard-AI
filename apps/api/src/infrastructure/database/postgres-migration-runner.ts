import pg from "pg";
import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import { createPostgresPool } from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Normalizes SQL script content and computes its SHA-256 checksum.
 */
export function computeChecksum(sqlContent: string): string {
  const normalized = sqlContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Discovers the PostgreSQL migrations directory across workspace, local, and Docker environments.
 */
export function resolvePostgresMigrationsDir(explicitDir?: string): string {
  if (explicitDir) {
    if (fs.existsSync(explicitDir) && fs.statSync(explicitDir).isDirectory()) {
      return path.resolve(explicitDir);
    }
    throw new Error(`Explicit migrations directory "${explicitDir}" does not exist.`);
  }

  if (process.env.POSTGRES_MIGRATIONS_DIR) {
    if (fs.existsSync(process.env.POSTGRES_MIGRATIONS_DIR) && fs.statSync(process.env.POSTGRES_MIGRATIONS_DIR).isDirectory()) {
      return path.resolve(process.env.POSTGRES_MIGRATIONS_DIR);
    }
    throw new Error(`Configured POSTGRES_MIGRATIONS_DIR "${process.env.POSTGRES_MIGRATIONS_DIR}" does not exist.`);
  }

  const candidatePaths = [
    // Standard workspace paths
    path.resolve(__dirname, "../../../../database/postgres/migrations"),
    path.resolve(__dirname, "../../../database/postgres/migrations"),
    path.resolve(__dirname, "../../database/postgres/migrations"),
    // Docker container paths
    path.resolve("/app/database/postgres/migrations"),
    path.resolve("/app/apps/api/database/postgres/migrations"),
    // Relative to process working directory
    path.resolve(process.cwd(), "database/postgres/migrations"),
    path.resolve(process.cwd(), "../../database/postgres/migrations"),
    path.resolve(process.cwd(), "../database/postgres/migrations"),
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
  }

  throw new Error(
    `PostgreSQL migrations directory could not be located. Checked candidate paths:\n` +
      candidatePaths.map((p) => ` - ${p}`).join("\n") +
      `\nSet POSTGRES_MIGRATIONS_DIR environment variable to override.`
  );
}

export interface AppliedPostgresMigration {
  id: number;
  name: string;
  checksum: string;
  applied_at: Date;
  duration_ms: number;
}

export interface PostgresMigrationResult {
  applied: string[];
  skipped: string[];
  total: number;
}

// Fixed 64-bit integer advisory lock key derived from hash
export const MIGRATION_ADVISORY_LOCK_QUERY = "SELECT pg_advisory_lock(hashtext('codeguard_api_postgres_migrations'));";
export const MIGRATION_ADVISORY_UNLOCK_QUERY = "SELECT pg_advisory_unlock(hashtext('codeguard_api_postgres_migrations'));";

/**
 * Ensures the migration history table public._migrations exists in the database.
 */
export async function ensurePostgresMigrationHistoryTable(
  client: { query: (sql: string, params?: any[]) => Promise<any> }
): Promise<void> {
  const query = `
    CREATE TABLE IF NOT EXISTS public._migrations (
        id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        duration_ms INT NOT NULL DEFAULT 0
    );
  `;
  await client.query(query);
}

/**
 * Fetches all applied migrations from public._migrations.
 */
export async function getAppliedPostgresMigrations(
  client: { query: (sql: string, params?: any[]) => Promise<any> }
): Promise<Map<string, AppliedPostgresMigration>> {
  const result = await client.query(
    "SELECT id, name, checksum, applied_at, duration_ms FROM public._migrations ORDER BY id ASC;"
  );

  const appliedMap = new Map<string, AppliedPostgresMigration>();
  for (const row of result.rows || []) {
    appliedMap.set(row.name, row);
  }
  return appliedMap;
}

/**
 * Executes a single migration inside a transaction and records history on success.
 */
export async function executePostgresMigration(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  sqlContent: string,
  file: string,
  checksum: string
): Promise<number> {
  const startTime = Date.now();

  await client.query("BEGIN;");
  try {
    // Execute migration SQL body
    await client.query(sqlContent);

    const durationMs = Date.now() - startTime;

    // Record migration in history table within the same transaction
    await client.query(
      `INSERT INTO public._migrations (name, checksum, duration_ms) VALUES ($1, $2, $3);`,
      [file, checksum, durationMs]
    );

    await client.query("COMMIT;");
    return durationMs;
  } catch (error) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // ignore rollback secondary failure
    }
    throw error;
  }
}

/**
 * Creates a PostgreSQL pool tailored for executing migrations.
 * Prefers explicit migrator credentials (POSTGRES_MIGRATOR_URL / MIGRATION_DATABASE_URL
 * or POSTGRES_MIGRATION_USER / POSTGRES_MIGRATION_PASSWORD), falling back to createPostgresPool().
 */
export function createMigratorPostgresPool(): pg.Pool {
  const migratorUrl = process.env.POSTGRES_MIGRATOR_URL || process.env.MIGRATION_DATABASE_URL;
  const isProd = process.env.NODE_ENV === "production";
  const sslVal = process.env.POSTGRES_SSL;
  const ssl = sslVal === "false" || sslVal === "0" ? false : { rejectUnauthorized: isProd };

  if (migratorUrl && migratorUrl.trim() !== "") {
    return new pg.Pool({
      connectionString: migratorUrl,
      ssl,
    });
  }

  if (process.env.POSTGRES_MIGRATION_USER && process.env.POSTGRES_MIGRATION_PASSWORD) {
    return new pg.Pool({
      host: process.env.POSTGRES_HOST || "localhost",
      port: Number(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DATABASE || "codeguard",
      user: process.env.POSTGRES_MIGRATION_USER,
      password: process.env.POSTGRES_MIGRATION_PASSWORD,
      ssl,
    });
  }

  return createPostgresPool();
}

export interface SchemaVerificationResult {
  verified: boolean;
  totalMigrations: number;
  appliedMigrations: number;
}

/**
 * Validates the PostgreSQL database schema state using strictly read-only queries (zero DDL).
 * Safe to execute by least-privilege runtime users (codeguard_app) that lack DDL / CREATE permissions.
 */
export async function verifyPostgresSchema(
  pool?: pg.Pool,
  explicitDir?: string
): Promise<SchemaVerificationResult> {
  const resolvedDir = resolvePostgresMigrationsDir(explicitDir);
  const activePool = pool ?? createPostgresPool();
  const client = await activePool.connect();

  try {
    // 1. Verify that public._migrations table exists without attempting DDL
    const tableCheck = await client.query(
      "SELECT to_regclass('public._migrations') AS table_exists;"
    );
    const tableExists = tableCheck.rows && tableCheck.rows[0]?.table_exists !== null;

    if (!tableExists) {
      throw new Error(
        `[Postgres Schema Verification] [FATAL] Database schema is uninitialized: 'public._migrations' table does not exist.\n` +
          `  The runtime user operates with least privilege (DML only) and cannot execute DDL.\n` +
          `  Apply database migrations using 'codeguard_migrator' (e.g. via 'npm run migrate:postgres') before starting the API.`
      );
    }

    // 2. Fetch applied migrations using read-only SELECT
    const appliedMap = await getAppliedPostgresMigrations(client);

    // 3. Scan disk migration files in deterministic sequence
    const files = fs
      .readdirSync(resolvedDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    // 4. Verify that each migration file has been applied with a matching checksum
    const pending: string[] = [];
    for (const file of files) {
      const filePath = path.join(resolvedDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const checksum = computeChecksum(content);

      if (!appliedMap.has(file)) {
        pending.push(file);
      } else {
        const recorded = appliedMap.get(file)!;
        if (recorded.checksum !== checksum) {
          throw new Error(
            `[Postgres Schema Verification] [FATAL] Checksum mismatch for migration "${file}"!\n` +
              `  Recorded checksum : ${recorded.checksum}\n` +
              `  Current checksum  : ${checksum}\n` +
              `  Applied migrations cannot be modified. Create a new migration file instead.`
          );
        }
      }
    }

    if (pending.length > 0) {
      throw new Error(
        `[Postgres Schema Verification] [FATAL] Database schema is out of date: ${pending.length} pending migration(s) detected.\n` +
          `  Pending migrations:\n` +
          pending.map((f) => `    - ${f}`).join("\n") +
          `\n  The runtime user cannot execute DDL. Apply pending migrations with 'codeguard_migrator' before starting the API.`
      );
    }

    return {
      verified: true,
      totalMigrations: files.length,
      appliedMigrations: files.length,
    };
  } finally {
    client.release();
    if (!pool) {
      await activePool.end();
    }
  }
}

/**
 * Runs all pending PostgreSQL migrations in deterministic order with advisory locking.
 */
export async function runPostgresMigrations(
  migrationsDir?: string,
  pool?: pg.Pool,
  executor: typeof executePostgresMigration = executePostgresMigration
): Promise<PostgresMigrationResult> {
  const resolvedDir = resolvePostgresMigrationsDir(migrationsDir);
  console.log(`[Postgres Migration] Scanning migrations directory: ${resolvedDir}`);

  const activePool = pool ?? createMigratorPostgresPool();
  const client = await activePool.connect();

  let lockAcquired = false;
  try {
    // Acquire PostgreSQL advisory lock for safe concurrency across replicas
    await client.query(MIGRATION_ADVISORY_LOCK_QUERY);
    lockAcquired = true;

    // Ensure migration history table exists
    await ensurePostgresMigrationHistoryTable(client);

    // Fetch applied migrations
    const appliedMap = await getAppliedPostgresMigrations(client);

    // Read and sort migration files deterministically
    const files = fs
      .readdirSync(resolvedDir)
      .filter((f) => f.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

    console.log(`[Postgres Migration] Found ${files.length} migration files in sequence:`);
    files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));

    const result: PostgresMigrationResult = {
      applied: [],
      skipped: [],
      total: files.length,
    };

    for (const file of files) {
      const filePath = path.join(resolvedDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const checksum = computeChecksum(content);

      if (appliedMap.has(file)) {
        const recorded = appliedMap.get(file)!;
        if (recorded.checksum !== checksum) {
          throw new Error(
            `[Postgres Migration] [FATAL] Checksum mismatch for migration "${file}"!\n` +
              `  Recorded checksum : ${recorded.checksum}\n` +
              `  Current checksum  : ${checksum}\n` +
              `  Applied migrations cannot be modified. Create a new migration file instead.`
          );
        }
        console.log(`[Postgres Migration] [SKIP] ${file} (already applied at ${recorded.applied_at})`);
        result.skipped.push(file);
      } else {
        console.log(`[Postgres Migration] [APPLYING] ${file}...`);
        const duration = await executor(client, content, file, checksum);
        console.log(`[Postgres Migration] [DONE] ${file} (${duration}ms)`);
        result.applied.push(file);
      }
    }

    console.log(
      `\n✅ PostgreSQL Migration summary: ${result.applied.length} applied, ${result.skipped.length} skipped, ${result.total} total.`
    );
    return result;
  } catch (error) {
    console.error("❌ PostgreSQL migration execution failed:", error);
    throw error;
  } finally {
    if (lockAcquired) {
      try {
        await client.query(MIGRATION_ADVISORY_UNLOCK_QUERY);
      } catch (unlockErr) {
        console.error("Warning: Failed to release PostgreSQL advisory lock:", unlockErr);
      }
    }
    client.release();
    if (!pool) {
      await activePool.end();
    }
  }
}

// Auto-run when executed directly via tsx or node
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("postgres-migration-runner.ts") ||
    process.argv[1].endsWith("postgres-migration-runner.js") ||
    pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url);

if (isMain) {
  runPostgresMigrations()
    .then(() => {
      console.log("PostgreSQL migration process completed successfully.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("PostgreSQL migration process failed:", error.message || error);
      process.exit(1);
    });
}
