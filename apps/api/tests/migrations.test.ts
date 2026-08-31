import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeChecksum,
  splitSqlBatches,
  resolveMigrationsDir,
  ensureMigrationHistoryTable,
  getAppliedMigrations,
  runMigrations,
} from "../src/migration-runner.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("Migration Engine: Checksum Calculation", () => {
  it("generates a 64-character hex SHA-256 string", () => {
    const hash = computeChecksum("CREATE TABLE Test (Id INT);");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces identical checksums regardless of CRLF vs LF line endings", () => {
    const sqlLF = "CREATE TABLE Test (\n  Id INT\n);\n";
    const sqlCRLF = "CREATE TABLE Test (\r\n  Id INT\r\n);\r\n";
    expect(computeChecksum(sqlLF)).toBe(computeChecksum(sqlCRLF));
  });

  it("detects content changes with a different checksum", () => {
    const hash1 = computeChecksum("CREATE TABLE Test (Id INT);");
    const hash2 = computeChecksum("CREATE TABLE Test (Id INT, Name VARCHAR(50));");
    expect(hash1).not.toBe(hash2);
  });
});

describe("Migration Engine: SQL Batch Parser (splitSqlBatches)", () => {
  it("returns single batch when no GO separator is present", () => {
    const sql = "CREATE TABLE Users (Id INT PRIMARY KEY);";
    const batches = splitSqlBatches(sql);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toBe("CREATE TABLE Users (Id INT PRIMARY KEY);");
  });

  it("splits SQL statements on standalone GO lines", () => {
    const sql = `
CREATE TABLE Table1 (Id INT);
GO
CREATE TABLE Table2 (Id INT);
GO
CREATE TABLE Table3 (Id INT);
`;
    const batches = splitSqlBatches(sql);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toBe("CREATE TABLE Table1 (Id INT);");
    expect(batches[1]).toBe("CREATE TABLE Table2 (Id INT);");
    expect(batches[2]).toBe("CREATE TABLE Table3 (Id INT);");
  });

  it("handles case-insensitivity and comments on GO lines", () => {
    const sql = `
CREATE TABLE Table1 (Id INT);
go -- batch 1 separator
CREATE TABLE Table2 (Id INT);
GO
CREATE TABLE Table3 (Id INT);
`;
    const batches = splitSqlBatches(sql);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toBe("CREATE TABLE Table1 (Id INT);");
    expect(batches[1]).toBe("CREATE TABLE Table2 (Id INT);");
    expect(batches[2]).toBe("CREATE TABLE Table3 (Id INT);");
  });

  it("does not split when GO appears inside a string literal or identifier", () => {
    const sql = `
INSERT INTO AuditLogs (Action) VALUES ('USER_LOGOUT');
SELECT * FROM Category WHERE Name = 'GOOD';
`;
    const batches = splitSqlBatches(sql);
    expect(batches).toHaveLength(1);
  });
});

describe("Migration Engine: Path Resolution", () => {
  it("resolves the actual database/migrations directory in the repository", () => {
    const resolved = resolveMigrationsDir();
    expect(fs.existsSync(resolved)).toBe(true);
    expect(fs.statSync(resolved).isDirectory()).toBe(true);

    const files = fs.readdirSync(resolved);
    expect(files.some((f) => f.endsWith(".sql"))).toBe(true);
  });

  it("throws descriptive error when explicit directory cannot be found", () => {
    expect(() => resolveMigrationsDir("C:\\nonexistent_dir_123456")).toThrow(/Explicit migrations directory/);
  });
});

describe("Migration Engine: Idempotent Execution & History Tracking", () => {
  let mockQueries: string[] = [];
  let appliedRecords: Array<{ id: number; name: string; checksum: string; applied_at: Date; duration_ms: number }> = [];
  let tempDir: string;

  beforeEach(() => {
    mockQueries = [];
    appliedRecords = [];
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codeguard-migrations-test-"));
  });

  function createMockPoolAndExecutor(options: { failOnBatch?: string } = {}) {
    const mockRequest = {
      input: vi.fn().mockReturnThis(),
      query: vi.fn().mockImplementation(async (q: string) => {
        mockQueries.push(q);
        if (q.includes("SELECT id, name, checksum")) {
          return { recordset: [...appliedRecords] };
        }
        return { recordset: [], rowsAffected: [1] };
      }),
    };

    const pool = {
      connected: true,
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      request: vi.fn().mockReturnValue(mockRequest),
    } as any;

    const mockExecutor = vi.fn().mockImplementation(async (_pool, batches: string[], file: string, checksum: string) => {
      for (const batch of batches) {
        if (options.failOnBatch && batch.includes(options.failOnBatch)) {
          throw new Error(`Simulated failure on batch: ${options.failOnBatch}`);
        }
      }
      appliedRecords.push({
        id: appliedRecords.length + 1,
        name: file,
        checksum,
        applied_at: new Date(),
        duration_ms: 10,
      });
      return 10;
    });

    return { pool, mockRequest, mockExecutor };
  }

  it("applies new migrations and records them in history", async () => {
    fs.writeFileSync(path.join(tempDir, "001_first.sql"), "CREATE TABLE Test1 (Id INT);");
    fs.writeFileSync(path.join(tempDir, "002_second.sql"), "CREATE TABLE Test2 (Id INT);");

    const { pool, mockExecutor } = createMockPoolAndExecutor();

    const result = await runMigrations(tempDir, pool, mockExecutor);
    expect(result.applied).toEqual(["001_first.sql", "002_second.sql"]);
    expect(result.skipped).toEqual([]);
    expect(result.total).toBe(2);
    expect(mockExecutor).toHaveBeenCalledTimes(2);
  });

  it("skips migrations that are already applied with identical checksum", async () => {
    const file1Content = "CREATE TABLE Test1 (Id INT);";
    const file2Content = "CREATE TABLE Test2 (Id INT);";
    fs.writeFileSync(path.join(tempDir, "001_first.sql"), file1Content);
    fs.writeFileSync(path.join(tempDir, "002_second.sql"), file2Content);

    // Pre-populate history with 001_first.sql applied
    appliedRecords = [
      {
        id: 1,
        name: "001_first.sql",
        checksum: computeChecksum(file1Content),
        applied_at: new Date(),
        duration_ms: 15,
      },
    ];

    const { pool, mockExecutor } = createMockPoolAndExecutor();

    const result = await runMigrations(tempDir, pool, mockExecutor);
    expect(result.applied).toEqual(["002_second.sql"]);
    expect(result.skipped).toEqual(["001_first.sql"]);
    expect(result.total).toBe(2);
    expect(mockExecutor).toHaveBeenCalledTimes(1);
  });

  it("fails loudly when an applied migration has a modified checksum", async () => {
    const originalContent = "CREATE TABLE Test1 (Id INT);";
    const modifiedContent = "CREATE TABLE Test1 (Id INT, InjectedColumn INT);";
    fs.writeFileSync(path.join(tempDir, "001_first.sql"), modifiedContent);

    appliedRecords = [
      {
        id: 1,
        name: "001_first.sql",
        checksum: computeChecksum(originalContent),
        applied_at: new Date(),
        duration_ms: 15,
      },
    ];

    const { pool, mockExecutor } = createMockPoolAndExecutor();

    await expect(runMigrations(tempDir, pool, mockExecutor)).rejects.toThrowError(/Checksum mismatch for migration "001_first.sql"/);
  });

  it("aborts execution when a migration batch fails", async () => {
    fs.writeFileSync(
      path.join(tempDir, "001_failing.sql"),
      "CREATE TABLE Test1 (Id INT);\nGO\nINVALID SQL SYNTAX HERE;\n"
    );

    const { pool, mockExecutor } = createMockPoolAndExecutor({ failOnBatch: "INVALID SQL SYNTAX" });

    await expect(runMigrations(tempDir, pool, mockExecutor)).rejects.toThrowError(/Simulated failure/);
  });
});
