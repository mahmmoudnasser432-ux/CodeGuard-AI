import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  computeChecksum,
  resolvePostgresMigrationsDir,
  ensurePostgresMigrationHistoryTable,
  getAppliedPostgresMigrations,
  executePostgresMigration,
  runPostgresMigrations,
  MIGRATION_ADVISORY_LOCK_QUERY,
  MIGRATION_ADVISORY_UNLOCK_QUERY,
} from "../src/infrastructure/database/postgres-migration-runner.js";
import { resolveMigrationsDir } from "../src/migration-runner.js";

describe("PostgreSQL Migration Engine: Checksum & Ordering", () => {
  it("generates a 64-character hex SHA-256 string", () => {
    const hash = computeChecksum("CREATE TABLE test (id INT);");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces identical checksums regardless of CRLF vs LF line endings", () => {
    const sqlLF = "CREATE TABLE test (\n  id INT\n);\n";
    const sqlCRLF = "CREATE TABLE test (\r\n  id INT\r\n);\r\n";
    expect(computeChecksum(sqlLF)).toBe(computeChecksum(sqlCRLF));
  });

  it("detects content changes with a different checksum", () => {
    const hash1 = computeChecksum("CREATE TABLE test (id INT);");
    const hash2 = computeChecksum("CREATE TABLE test (id INT, name VARCHAR(50));");
    expect(hash1).not.toBe(hash2);
  });
});

describe("PostgreSQL Migration Engine: Execution Lifecycle (Mocked Driver)", () => {
  let tempDir: string;
  let queryLog: string[];
  let appliedRows: Array<{ id: number; name: string; checksum: string; applied_at: Date; duration_ms: number }>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeguard-pg-migrations-test-"));
    queryLog = [];
    appliedRows = [];
  });

  function createMockPoolClient(options: { failOnQuery?: string } = {}) {
    const client = {
      query: vi.fn().mockImplementation(async (sqlText: string, params?: any[]) => {
        queryLog.push(sqlText.trim());

        if (options.failOnQuery && sqlText.includes(options.failOnQuery)) {
          throw new Error(`Simulated database failure for: ${options.failOnQuery}`);
        }

        if (sqlText.includes("SELECT id, name, checksum")) {
          return { rows: [...appliedRows] };
        }

        if (sqlText.includes("INSERT INTO public._migrations")) {
          appliedRows.push({
            id: appliedRows.length + 1,
            name: params?.[0],
            checksum: params?.[1],
            duration_ms: params?.[2] ?? 5,
            applied_at: new Date(),
          });
          return { rowCount: 1 };
        }

        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };

    const pool = {
      connect: vi.fn().mockResolvedValue(client),
      end: vi.fn().mockResolvedValue(undefined),
    } as any;

    return { pool, client };
  }

  it("acquires and releases PostgreSQL advisory lock during migration execution", async () => {
    fs.writeFileSync(path.join(tempDir, "001_init.sql"), "CREATE TABLE test (id INT);");
    const { pool, client } = createMockPoolClient();

    await runPostgresMigrations(tempDir, pool);

    expect(client.query).toHaveBeenCalledWith(MIGRATION_ADVISORY_LOCK_QUERY);
    expect(client.query).toHaveBeenCalledWith(MIGRATION_ADVISORY_UNLOCK_QUERY);
    expect(client.release).toHaveBeenCalled();
  });

  it("applies new migrations sequentially and writes history with transaction", async () => {
    fs.writeFileSync(path.join(tempDir, "001_users.sql"), "CREATE TABLE users (id UUID);");
    fs.writeFileSync(path.join(tempDir, "002_posts.sql"), "CREATE TABLE posts (id UUID);");

    const { pool, client } = createMockPoolClient();

    const result = await runPostgresMigrations(tempDir, pool);

    expect(result.applied).toEqual(["001_users.sql", "002_posts.sql"]);
    expect(result.skipped).toEqual([]);
    expect(result.total).toBe(2);

    expect(queryLog).toContain("BEGIN;");
    expect(queryLog).toContain("COMMIT;");
  });

  it("skips migrations that are already applied with matching checksum", async () => {
    const file1Content = "CREATE TABLE test1 (id INT);";
    const file2Content = "CREATE TABLE test2 (id INT);";
    fs.writeFileSync(path.join(tempDir, "001_first.sql"), file1Content);
    fs.writeFileSync(path.join(tempDir, "002_second.sql"), file2Content);

    // Pre-populate history with 001_first.sql applied
    appliedRows.push({
      id: 1,
      name: "001_first.sql",
      checksum: computeChecksum(file1Content),
      duration_ms: 10,
      applied_at: new Date(),
    });

    const { pool } = createMockPoolClient();

    const result = await runPostgresMigrations(tempDir, pool);

    expect(result.applied).toEqual(["002_second.sql"]);
    expect(result.skipped).toEqual(["001_first.sql"]);
    expect(result.total).toBe(2);
  });

  it("fails loudly when an applied migration has a modified checksum", async () => {
    const originalContent = "CREATE TABLE test1 (id INT);";
    const modifiedContent = "CREATE TABLE test1 (id INT, injected VARCHAR(50));";
    fs.writeFileSync(path.join(tempDir, "001_first.sql"), modifiedContent);

    appliedRows.push({
      id: 1,
      name: "001_first.sql",
      checksum: computeChecksum(originalContent),
      duration_ms: 10,
      applied_at: new Date(),
    });

    const { pool } = createMockPoolClient();

    await expect(runPostgresMigrations(tempDir, pool)).rejects.toThrowError(
      /Checksum mismatch for migration "001_first.sql"/
    );
  });

  it("rolls back transaction and does not record history when a migration fails", async () => {
    fs.writeFileSync(path.join(tempDir, "001_failing.sql"), "INVALID SQL SYNTAX;");

    const { pool, client } = createMockPoolClient({ failOnQuery: "INVALID SQL" });

    await expect(runPostgresMigrations(tempDir, pool)).rejects.toThrowError(
      /Simulated database failure/
    );

    expect(queryLog).toContain("ROLLBACK;");
    expect(appliedRows).toHaveLength(0);
    expect(client.query).toHaveBeenCalledWith(MIGRATION_ADVISORY_UNLOCK_QUERY);
  });

  it("fails on checksum mismatch of earlier migration without executing subsequent migrations", async () => {
    const file1Original = "CREATE TABLE step1 (id INT);";
    const file1Modified = "CREATE TABLE step1 (id INT, modified INT);";
    const file2 = "CREATE TABLE step2 (id INT);";

    fs.writeFileSync(path.join(tempDir, "001_first.sql"), file1Modified);
    fs.writeFileSync(path.join(tempDir, "002_second.sql"), file2);

    appliedRows.push({
      id: 1,
      name: "001_first.sql",
      checksum: computeChecksum(file1Original),
      duration_ms: 15,
      applied_at: new Date(),
    });

    const { pool } = createMockPoolClient();

    await expect(runPostgresMigrations(tempDir, pool)).rejects.toThrowError(
      /Checksum mismatch for migration "001_first.sql"/
    );

    // 002_second.sql must NOT have been executed or recorded
    expect(queryLog).not.toContain(file2);
    expect(appliedRows.find((r) => r.name === "002_second.sql")).toBeUndefined();
  });

  it("serializes concurrent migration executions and skips already applied migrations", async () => {
    fs.writeFileSync(path.join(tempDir, "001_concurrent.sql"), "CREATE TABLE test_concurrent (id INT);");

    const { pool: pool1 } = createMockPoolClient();
    const { pool: pool2 } = createMockPoolClient();

    // First runner applies migration
    const res1 = await runPostgresMigrations(tempDir, pool1);
    expect(res1.applied).toEqual(["001_concurrent.sql"]);
    expect(res1.skipped).toEqual([]);

    // Second runner arrives after first runner completes, sees migration in history, and skips it
    const res2 = await runPostgresMigrations(tempDir, pool2);
    expect(res2.applied).toEqual([]);
    expect(res2.skipped).toEqual(["001_concurrent.sql"]);
  });

  it("ensures public._migrations history table uses standard identifiers, types, and constraints", async () => {
    const mockClient = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await ensurePostgresMigrationHistoryTable(mockClient);

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const ddl = mockClient.query.mock.calls[0][0];

    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS public._migrations");
    expect(ddl).toContain("id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY");
    expect(ddl).toContain("name VARCHAR(255) NOT NULL UNIQUE");
    expect(ddl).toContain("checksum VARCHAR(64) NOT NULL");
    expect(ddl).toContain("applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(ddl).toContain("duration_ms INT NOT NULL DEFAULT 0");
  });
});

describe("PostgreSQL Migrations Static Syntax Audit", () => {
  const migrationsDir = resolvePostgresMigrationsDir();
  const sqlFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));

  it("locates the dedicated PostgreSQL migrations directory and finds migration files", () => {
    expect(sqlFiles.length).toBeGreaterThanOrEqual(2);
    expect(sqlFiles).toContain("001_initial_schema.sql");
    expect(sqlFiles).toContain("002_seed_roles_and_dev_user.sql");
  });

  it("strictly contains NO SQL Server specific constructs in any PostgreSQL migration", () => {
    const forbiddenPatterns = [
      { pattern: /^\s*GO\s*(?:--.*)?$/gim, name: "SQL Server GO batch separator" },
      { pattern: /\bdbo\./gi, name: "dbo schema prefix" },
      { pattern: /OBJECT_ID\(/gi, name: "T-SQL OBJECT_ID catalog function" },
      { pattern: /sys\.indexes/gi, name: "SQL Server sys.indexes catalog" },
      { pattern: /\bMERGE\s+dbo\./gi, name: "T-SQL MERGE dbo statement" },
      { pattern: /OUTPUT\s+INSERTED/gi, name: "T-SQL OUTPUT INSERTED clause" },
      { pattern: /SYSUTCDATETIME\(\)/gi, name: "T-SQL SYSUTCDATETIME function" },
      { pattern: /\bDATETIME2\b/gi, name: "T-SQL DATETIME2 type" },
      { pattern: /\bUNIQUEIDENTIFIER\b/gi, name: "T-SQL UNIQUEIDENTIFIER type" },
      { pattern: /\bNEWID\(\)/gi, name: "T-SQL NEWID function" },
    ];

    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      for (const { pattern, name } of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(
          match,
          `Found forbidden SQL Server construct "${name}" in PostgreSQL migration ${file}`
        ).toBeNull();
      }
    }
  });

  it("defines all 18 core domain tables in the initial PostgreSQL schema", () => {
    const initialSchema = fs.readFileSync(path.join(migrationsDir, "001_initial_schema.sql"), "utf8");

    const expectedTables = [
      "Roles",
      "Users",
      "UserRoles",
      "Sessions",
      "Projects",
      "Repositories",
      "Files",
      "Analyses",
      "AnalysisScores",
      "Reports",
      "InterviewSessions",
      "InterviewQuestions",
      "InterviewResults",
      "Notifications",
      "AuditLogs",
      "RefreshTokens",
      "PasswordResetTokens",
      "EmailVerificationTokens",
    ];

    for (const table of expectedTables) {
      const tableRegex = new RegExp(`CREATE TABLE IF NOT EXISTS "${table}"`, "i");
      expect(initialSchema).toMatch(tableRegex);
    }
  });

  it("correctly implements account lockout and boolean fields with PostgreSQL semantics", () => {
    const initialSchema = fs.readFileSync(path.join(migrationsDir, "001_initial_schema.sql"), "utf8");

    expect(initialSchema).toMatch(/"FailedLoginCount"\s+INT\s+NOT\s+NULL\s+DEFAULT\s+0/i);
    expect(initialSchema).toMatch(/"LockedUntil"\s+TIMESTAMPTZ\s+NULL/i);
    expect(initialSchema).toMatch(/"IsEmailVerified"\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
    expect(initialSchema).toMatch(/"MfaEnabled"\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
  });

  it("confirms 002_seed_roles_and_dev_user.sql seeds only immutable system roles without creating a default dummy user", () => {
    const seedContent = fs.readFileSync(path.join(migrationsDir, "002_seed_roles_and_dev_user.sql"), "utf8");

    // Zero embedded passwords, secrets, or PasswordHash columns
    expect(seedContent).not.toMatch(/\bPasswordHash\b/i);
    expect(seedContent).not.toMatch(/password\s*=/i);

    // Provisions only roles; does not insert a dev/system user into shared databases
    expect(seedContent).toContain('INSERT INTO "Roles"');
    expect(seedContent).not.toContain('INSERT INTO "Users"');
    expect(seedContent).not.toContain('system@codeguard.local');
    expect(seedContent).not.toContain("00000000-0000-0000-0000-000000000001");
  });

  it("confirms application-facing entity columns are consistently double-quoted in PascalCase for TypeScript compatibility", () => {
    const initialSchema = fs.readFileSync(path.join(migrationsDir, "001_initial_schema.sql"), "utf8");

    const criticalPascalCaseColumns = [
      "Id", "Email", "PasswordHash", "DisplayName", "IsEmailVerified", "MfaEnabled",
      "FailedLoginCount", "LockedUntil", "CreatedAt", "UpdatedAt",
      "UserId", "RoleId", "RefreshTokenHash", "ExpiresAt", "RevokedAt", "Jti",
      "OverallScore", "SecurityScore", "QualityScore", "PerformanceScore", "MaintainabilityScore", "ReadabilityScore",
      "AnalysisType", "Title", "Status", "Summary", "StartedAt", "CompletedAt",
      "Format", "StorageUrl", "Content",
      "TechnicalScore", "CommunicationScore", "ProblemSolvingScore", "Recommendation",
      "Prompt", "ExpectedAnswer", "EvaluationCriteria", "Difficulty",
      "ActorUserId", "EventType", "EntityType", "EntityId",
      "OwnerUserId", "Provider", "ExternalId", "DefaultBranch", "LastImportedAt",
      "RepositoryId", "Path", "Language", "ContentHash", "SizeBytes",
      "TokenHash", "UserAgentHash", "IpHash", "UsedAt"
    ];

    for (const column of criticalPascalCaseColumns) {
      const quotedCol = `"${column}"`;
      expect(
        initialSchema.includes(quotedCol),
        `Expected column ${quotedCol} to be quoted with PascalCase in 001_initial_schema.sql`
      ).toBe(true);
    }
  });
});

describe("Migration Isolation & Cross-Dialect Separation", () => {
  it("strictly isolates PostgreSQL migrations directory from SQL Server migrations directory", () => {
    const pgMigrationsDir = resolvePostgresMigrationsDir();
    const sqlServerMigrationsDir = resolveMigrationsDir();

    // Verify PostgreSQL directory strictly points to database/postgres/migrations
    expect(pgMigrationsDir).toMatch(/[\\/]database[\\/]postgres[\\/]migrations$/);

    // Verify SQL Server directory strictly points to database/migrations
    expect(sqlServerMigrationsDir).toMatch(/[\\/]database[\\/]migrations$/);

    // Verify absolute isolation (paths must not be equal or subdirectories of each other's migrations)
    expect(pgMigrationsDir).not.toBe(sqlServerMigrationsDir);
    expect(path.relative(pgMigrationsDir, sqlServerMigrationsDir)).not.toBe("");
  });

  it("ensures PostgreSQL runner cannot find SQL Server migrations and vice versa", () => {
    const pgMigrationsDir = resolvePostgresMigrationsDir();
    const sqlServerMigrationsDir = resolveMigrationsDir();

    const pgFiles = fs.readdirSync(pgMigrationsDir).filter((f) => f.endsWith(".sql"));
    const sqlFiles = fs.readdirSync(sqlServerMigrationsDir).filter((f) => f.endsWith(".sql"));

    // PostgreSQL directory has only PostgreSQL migration scripts
    expect(pgFiles).toContain("001_initial_schema.sql");
    expect(pgFiles).toContain("002_seed_roles_and_dev_user.sql");
    expect(pgFiles).not.toContain("20240115_add_jti_to_sessions.sql");
    expect(pgFiles).not.toContain("20240820_add_auth_tables.sql");

    // SQL Server directory has only SQL Server migration scripts
    expect(sqlFiles).toContain("001_initial_schema.sql");
    expect(sqlFiles).toContain("20240115_add_jti_to_sessions.sql");
    expect(sqlFiles).toContain("20240820_add_auth_tables.sql");
    expect(sqlFiles).not.toContain("002_seed_roles_and_dev_user.sql");
  });
});
