import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  PostgresProjectRepository,
  PostgresAnalysisRepository,
  PostgresReportRepository,
  PostgresUserRepository,
} from "../src/infrastructure/repositories/postgres/index.js";
import {
  createAnalysisProjectRepositories,
} from "../src/infrastructure/repositories/analysis-project-repository-factory.js";
import { SqlProjectRepository } from "../src/infrastructure/repositories/sql-project-repository.js";
import { SqlAnalysisRepository } from "../src/infrastructure/repositories/sql-analysis-repository.js";
import { SqlReportRepository } from "../src/infrastructure/repositories/sql-report-repository.js";
import { runPostgresMigrations } from "../src/infrastructure/database/postgres-migration-runner.js";
import type { Project } from "../src/domain/entities/project.js";
import type { AnalysisResult } from "../src/domain/entities/analysis.js";
import type { Report } from "../src/domain/entities/report.js";

// ============================================================================
// 1. Static T-SQL Portability Audit
// ============================================================================
describe("Phase 6C-2B: Static T-SQL Portability Audit for Analysis & Project Adapters", () => {
  const pgRepoDir = path.resolve(__dirname, "../src/infrastructure/repositories/postgres");

  it("ensures all 3 Phase 6C-2B PostgreSQL repository files exist", () => {
    const files = fs.readdirSync(pgRepoDir);
    expect(files).toContain("postgres-project-repository.ts");
    expect(files).toContain("postgres-analysis-repository.ts");
    expect(files).toContain("postgres-report-repository.ts");
    expect(files).toContain("index.ts");
  });

  it("contains ZERO forbidden T-SQL keywords or constructs in Analysis & Project adapters", () => {
    const targetFiles = [
      "postgres-project-repository.ts",
      "postgres-analysis-repository.ts",
      "postgres-report-repository.ts",
    ];
    const forbiddenPatterns: Array<{ name: string; pattern: RegExp }> = [
      { name: "OUTPUT INSERTED", pattern: /OUTPUT\s+INSERTED/i },
      { name: "MERGE statement", pattern: /\bMERGE\b/i },
      { name: "SYSUTCDATETIME()", pattern: /\bSYSUTCDATETIME\s*\(/i },
      { name: "@@ROWCOUNT", pattern: /@@ROWCOUNT/i },
      { name: "STRING_SPLIT", pattern: /\bSTRING_SPLIT\b/i },
      { name: "dbo. prefix", pattern: /\bdbo\./i },
      { name: "TOP N syntax", pattern: /\bSELECT\s+TOP\s+\d+/i },
      { name: "DATEADD()", pattern: /\bDATEADD\s*\(/i },
      { name: "DATEDIFF()", pattern: /\bDATEDIFF\s*\(/i },
      { name: "NVARCHAR", pattern: /\bNVARCHAR\b/i },
      { name: "DATETIME2", pattern: /\bDATETIME2\b/i },
    ];

    for (const file of targetFiles) {
      const content = fs.readFileSync(path.join(pgRepoDir, file), "utf8");
      for (const { name, pattern } of forbiddenPatterns) {
        const matches = content.match(pattern);
        expect(matches, `File ${file} should not contain forbidden T-SQL construct "${name}"`).toBeNull();
      }
    }
  });

  it("ensures all queries use standard placeholders ($1, $2) and quoted identifiers", () => {
    const targetFiles = [
      "postgres-project-repository.ts",
      "postgres-analysis-repository.ts",
      "postgres-report-repository.ts",
    ];
    for (const file of targetFiles) {
      const content = fs.readFileSync(path.join(pgRepoDir, file), "utf8");
      expect(content).toContain("$1");
      expect(content).toMatch(/"(Projects|Analyses|AnalysisScores|Reports)"/);
      expect(content).not.toMatch(/VALUES\s*\([^)]*@\w+/i);
    }
  });
});

// ============================================================================
// 2. Factory & Pool Ownership Unit Tests
// ============================================================================
describe("Phase 6C-2B: Analysis Project Repository Factory & Pool Ownership", () => {
  it("defaults to SQL Server repository implementations when no dialect is specified", () => {
    const repos = createAnalysisProjectRepositories();
    expect(repos.projectRepository).toBeInstanceOf(SqlProjectRepository);
    expect(repos.analysisRepository).toBeInstanceOf(SqlAnalysisRepository);
    expect(repos.reportRepository).toBeInstanceOf(SqlReportRepository);
  });

  it("returns SQL Server repository implementations when dialect='sqlserver'", () => {
    const repos = createAnalysisProjectRepositories("sqlserver");
    expect(repos.projectRepository).toBeInstanceOf(SqlProjectRepository);
    expect(repos.analysisRepository).toBeInstanceOf(SqlAnalysisRepository);
    expect(repos.reportRepository).toBeInstanceOf(SqlReportRepository);
  });

  it("throws a descriptive error if dialect='postgres' but postgresPool is omitted", () => {
    expect(() => createAnalysisProjectRepositories("postgres")).toThrowError(
      /A shared pg\.Pool instance is required when creating PostgreSQL analysis and project repositories/
    );
  });

  it("injects the identical shared pool into all 3 repositories when dialect='postgres'", () => {
    const mockPool = {} as pg.Pool;
    const repos = createAnalysisProjectRepositories("postgres", mockPool);
    expect(repos.projectRepository).toBeInstanceOf(PostgresProjectRepository);
    expect(repos.analysisRepository).toBeInstanceOf(PostgresAnalysisRepository);
    expect(repos.reportRepository).toBeInstanceOf(PostgresReportRepository);

    expect((repos.projectRepository as any).pool).toBe(mockPool);
    expect((repos.analysisRepository as any).pool).toBe(mockPool);
    expect((repos.reportRepository as any).pool).toBe(mockPool);
  });

  it("strictly enforces non-null pool in each repository constructor", () => {
    expect(() => new PostgresProjectRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresProjectRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresAnalysisRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresAnalysisRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresReportRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresReportRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
  });

  it("rejects unsupported dialects cleanly", () => {
    expect(() => createAnalysisProjectRepositories("sqlite" as any)).toThrowError(/Unsupported database dialect/);
  });
});

// ============================================================================
// 3. PostgreSQL Live Integration Suite
// ============================================================================
const pgHost = process.env.POSTGRES_HOST ?? "127.0.0.1";
const pgPort = parseInt(process.env.POSTGRES_PORT ?? "54329", 10);
const pgDb = process.env.POSTGRES_DATABASE ?? "codeguard_test";
const pgUser = process.env.POSTGRES_USER ?? "codeguard";
const pgPassword = process.env.POSTGRES_PASSWORD ?? "TestPassword123!";

describe("Phase 6C-2B: PostgreSQL Live Analysis & Project Repository Integration", () => {
  let pool: pg.Pool | null = null;
  let isDbAvailable = false;
  let userRepo: PostgresUserRepository;
  let projectRepo: PostgresProjectRepository;
  let analysisRepo: PostgresAnalysisRepository;
  let reportRepo: PostgresReportRepository;

  beforeAll(async () => {
    try {
      pool = new pg.Pool({
        host: pgHost,
        port: pgPort,
        database: pgDb,
        user: pgUser,
        password: pgPassword,
        connectionTimeoutMillis: 3000,
      });

      const client = await pool.connect();
      client.release();
      isDbAvailable = true;

      const migrationsDir = path.resolve(__dirname, "../../../database/postgres/migrations");
      await runPostgresMigrations(migrationsDir, pool);

      userRepo = new PostgresUserRepository(pool);
      const repos = createAnalysisProjectRepositories("postgres", pool);
      projectRepo = repos.projectRepository as PostgresProjectRepository;
      analysisRepo = repos.analysisRepository as PostgresAnalysisRepository;
      reportRepo = repos.reportRepository as PostgresReportRepository;
    } catch {
      isDbAvailable = false;
      if (pool) {
        await pool.end().catch(() => {});
        pool = null;
      }
    }
  });

  afterAll(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  describe("PostgresProjectRepository", () => {
    it("creates, updates, retrieves, and lists projects by owner", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      // Create owner user
      const ownerId = uuidv4();
      await userRepo.save({
        id: ownerId,
        email: `project_owner_${ownerId.slice(0, 8)}@example.com`,
        displayName: "Project Owner",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      // 1. Save new project (insert)
      const projectId1 = uuidv4();
      const project1: Project = {
        id: projectId1,
        ownerUserId: ownerId,
        name: "CodeGuard AI Core",
        description: "Core AI analysis service",
      };
      const saved1 = await projectRepo.save(project1);
      expect(saved1.id).toBe(projectId1);

      // 2. Retrieve by ID
      const retrieved = await projectRepo.findById(projectId1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(projectId1);
      expect(retrieved?.name).toBe("CodeGuard AI Core");
      expect(retrieved?.description).toBe("Core AI analysis service");
      expect(retrieved?.ownerUserId).toBe(ownerId);
      expect(retrieved?.createdAt).toBeInstanceOf(Date);

      // 3. Update existing project (upsert)
      await projectRepo.save({
        id: projectId1,
        ownerUserId: ownerId,
        name: "CodeGuard AI Core - Updated",
        description: null,
      });
      const updated = await projectRepo.findById(projectId1);
      expect(updated?.name).toBe("CodeGuard AI Core - Updated");
      expect(updated?.description).toBeUndefined();

      // 4. Save second project for owner to test listByOwner ordering
      const projectId2 = uuidv4();
      await projectRepo.save({
        id: projectId2,
        ownerUserId: ownerId,
        name: "CodeGuard AI Web",
        description: "Web frontend",
        createdAt: new Date(Date.now() + 5000), // Newer
      });

      const ownerProjects = await projectRepo.listByOwner(ownerId);
      expect(ownerProjects.length).toBe(2);
      expect(ownerProjects[0].id).toBe(projectId2); // Newest first
      expect(ownerProjects[1].id).toBe(projectId1);

      // 5. findById with non-existent id
      const missing = await projectRepo.findById(uuidv4());
      expect(missing).toBeNull();
    });
  });

  describe("PostgresAnalysisRepository", () => {
    it("creates analysis with scores in a transaction and retrieves it", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `analysis_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Analysis User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const projectId = uuidv4();
      await projectRepo.save({
        id: projectId,
        ownerUserId: userId,
        name: "Analysis Test Project",
      });

      const analysisId = uuidv4();
      const analysis: AnalysisResult = {
        id: analysisId,
        title: "Test Security Review",
        type: "security-analysis",
        summary: "Zero vulnerabilities detected in scan",
        projectId,
        scores: {
          overallScore: 92,
          securityScore: 95,
          qualityScore: 90,
          performanceScore: 88,
          maintainabilityScore: 94,
          readabilityScore: 93,
        },
        findings: [],
      };

      const saved = await analysisRepo.save(analysis, userId);
      expect(saved.id).toBe(analysisId);

      const found = await analysisRepo.findById(analysisId);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(analysisId);
      expect(found?.title).toBe("Test Security Review");
      expect(found?.type).toBe("security-analysis");
      expect(found?.summary).toBe("Zero vulnerabilities detected in scan");
      expect(found?.scores.overallScore).toBe(92);
      expect(found?.scores.securityScore).toBe(95);
      expect(found?.scores.qualityScore).toBe(90);
      expect(found?.scores.performanceScore).toBe(88);
      expect(found?.scores.maintainabilityScore).toBe(94);
      expect(found?.scores.readabilityScore).toBe(93);
      expect(found?.findings).toEqual([]);
    });

    it("updates analysis and overwrites scores inside transaction", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `update_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Update User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const analysisId = uuidv4();
      await analysisRepo.save(
        {
          id: analysisId,
          title: "Initial Analysis",
          type: "code-review",
          summary: "Initial run",
          scores: {
            overallScore: 60,
            securityScore: 60,
            qualityScore: 60,
            performanceScore: 60,
            maintainabilityScore: 60,
            readabilityScore: 60,
          },
          findings: [],
        },
        userId
      );

      // Update with new scores and title
      await analysisRepo.save(
        {
          id: analysisId,
          title: "Updated Analysis",
          type: "code-review",
          summary: "Refactored and improved",
          scores: {
            overallScore: 98,
            securityScore: 99,
            qualityScore: 97,
            performanceScore: 96,
            maintainabilityScore: 98,
            readabilityScore: 100,
          },
          findings: [],
        },
        userId
      );

      const updated = await analysisRepo.findById(analysisId);
      expect(updated?.title).toBe("Updated Analysis");
      expect(updated?.summary).toBe("Refactored and improved");
      expect(updated?.scores.overallScore).toBe(98);
      expect(updated?.scores.readabilityScore).toBe(100);
    });

    it("lists analyses by user with pagination and ordering", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `list_user_${userId.slice(0, 8)}@example.com`,
        displayName: "List User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const id1 = uuidv4();
      const id2 = uuidv4();
      const id3 = uuidv4();

      await analysisRepo.save(
        {
          id: id1,
          title: "Run 1",
          type: "code-review",
          summary: "First",
          scores: { overallScore: 70, securityScore: 70, qualityScore: 70, performanceScore: 70, maintainabilityScore: 70, readabilityScore: 70 },
          findings: [],
        },
        userId
      );

      await analysisRepo.save(
        {
          id: id2,
          title: "Run 2",
          type: "performance-analysis",
          summary: "Second",
          scores: { overallScore: 80, securityScore: 80, qualityScore: 80, performanceScore: 80, maintainabilityScore: 80, readabilityScore: 80 },
          findings: [],
        },
        userId
      );

      await analysisRepo.save(
        {
          id: id3,
          title: "Run 3",
          type: "documentation-generator",
          summary: "Third",
          scores: { overallScore: 90, securityScore: 90, qualityScore: 90, performanceScore: 90, maintainabilityScore: 90, readabilityScore: 90 },
          findings: [],
        },
        userId
      );

      const page1 = await analysisRepo.listByUser(userId, 2, 0);
      expect(page1.length).toBe(2);

      const page2 = await analysisRepo.listByUser(userId, 2, 2);
      expect(page2.length).toBe(1);

      // Verify no overlap between pages
      const page1Ids = page1.map((a) => a.id);
      expect(page1Ids).not.toContain(page2[0].id);
    });

    it("verifies deleteById ownership security and cascading score deletion", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const ownerId = uuidv4();
      const attackerId = uuidv4();

      await userRepo.save({
        id: ownerId,
        email: `owner_${ownerId.slice(0, 8)}@example.com`,
        displayName: "Owner",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      await userRepo.save({
        id: attackerId,
        email: `attacker_${attackerId.slice(0, 8)}@example.com`,
        displayName: "Attacker",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const analysisId = uuidv4();
      await analysisRepo.save(
        {
          id: analysisId,
          title: "Protected Analysis",
          type: "security-analysis",
          summary: "Secret scan",
          scores: { overallScore: 85, securityScore: 85, qualityScore: 85, performanceScore: 85, maintainabilityScore: 85, readabilityScore: 85 },
          findings: [],
        },
        ownerId
      );

      // Attacker attempts deletion -> returns false
      const unauthorizedResult = await analysisRepo.deleteById(analysisId, attackerId);
      expect(unauthorizedResult).toBe(false);

      // Record still exists
      const stillExists = await analysisRepo.findById(analysisId);
      expect(stillExists).not.toBeNull();

      // Owner deletes -> returns true
      const authorizedResult = await analysisRepo.deleteById(analysisId, ownerId);
      expect(authorizedResult).toBe(true);

      // Record is gone
      const deletedAnalysis = await analysisRepo.findById(analysisId);
      expect(deletedAnalysis).toBeNull();
    });

    it("computes accurate user dashboard statistics with getUserStats", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `stats_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Stats User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      await analysisRepo.save(
        {
          id: uuidv4(),
          title: "CR 1",
          type: "code-review",
          summary: "Code review",
          scores: { overallScore: 80, securityScore: 80, qualityScore: 80, performanceScore: 80, maintainabilityScore: 80, readabilityScore: 80 },
          findings: [],
        },
        userId
      );

      await analysisRepo.save(
        {
          id: uuidv4(),
          title: "CR 2",
          type: "code-review",
          summary: "Second code review",
          scores: { overallScore: 90, securityScore: 90, qualityScore: 90, performanceScore: 90, maintainabilityScore: 90, readabilityScore: 90 },
          findings: [],
        },
        userId
      );

      await analysisRepo.save(
        {
          id: uuidv4(),
          title: "Doc 1",
          type: "documentation-generator",
          summary: "Doc gen",
          scores: { overallScore: 85, securityScore: 85, qualityScore: 85, performanceScore: 85, maintainabilityScore: 85, readabilityScore: 85 },
          findings: [],
        },
        userId
      );

      const stats = await analysisRepo.getUserStats(userId);
      expect(stats.totalAnalyses).toBe(3);
      expect(stats.avgScore).toBe(85); // (80 + 90 + 85) / 3 = 85
      expect(stats.docsGenerated).toBe(1);
      expect(stats.scoreByType["code-review"]).toBe(2);
      expect(stats.scoreByType["documentation-generator"]).toBe(1);
    });

    it("lists analyses by project via findByProjectId", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `project_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Project User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const projectId = uuidv4();
      await projectRepo.save({
        id: projectId,
        ownerUserId: userId,
        name: "Shared Project",
      });

      const a1 = uuidv4();
      const a2 = uuidv4();

      await analysisRepo.save(
        {
          id: a1,
          projectId,
          title: "Analysis 1",
          type: "code-review",
          summary: "Sum 1",
          scores: { overallScore: 75, securityScore: 75, qualityScore: 75, performanceScore: 75, maintainabilityScore: 75, readabilityScore: 75 },
          findings: [],
        },
        userId
      );

      await analysisRepo.save(
        {
          id: a2,
          projectId,
          title: "Analysis 2",
          type: "security-analysis",
          summary: "Sum 2",
          scores: { overallScore: 85, securityScore: 85, qualityScore: 85, performanceScore: 85, maintainabilityScore: 85, readabilityScore: 85 },
          findings: [],
        },
        userId
      );

      const projectAnalyses = await analysisRepo.findByProjectId(projectId);
      expect(projectAnalyses.length).toBe(2);
      expect(projectAnalyses.some((a) => a.id === a1)).toBe(true);
      expect(projectAnalyses.some((a) => a.id === a2)).toBe(true);
    });

    it("TRANSACTION SAFETY: rolls back analysis insertion if score check constraint fails", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `rollback_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Rollback User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const analysisId = uuidv4();
      const invalidAnalysis: AnalysisResult = {
        id: analysisId,
        title: "Constraint Violation Analysis",
        type: "code-review",
        summary: "This will fail check constraint",
        scores: {
          overallScore: 150, // CHECK constraint BETWEEN 0 AND 100 will fail!
          securityScore: 90,
          qualityScore: 90,
          performanceScore: 90,
          maintainabilityScore: 90,
          readabilityScore: 90,
        },
        findings: [],
      };

      await expect(analysisRepo.save(invalidAnalysis, userId)).rejects.toThrow();

      // Verify transaction rollback: analysis row MUST NOT exist
      const checkAnalysis = await analysisRepo.findById(analysisId);
      expect(checkAnalysis).toBeNull();
    });
  });

  describe("PostgresReportRepository", () => {
    it("creates, updates, retrieves, and lists reports by analysis", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `report_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Report User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const analysisId = uuidv4();
      await analysisRepo.save(
        {
          id: analysisId,
          title: "Report Parent Analysis",
          type: "code-review",
          summary: "Analysis for reports",
          scores: { overallScore: 88, securityScore: 88, qualityScore: 88, performanceScore: 88, maintainabilityScore: 88, readabilityScore: 88 },
          findings: [],
        },
        userId
      );

      // 1. Save new report
      const reportId1 = uuidv4();
      const report1: Report = {
        id: reportId1,
        analysisId,
        title: "Executive Security Summary",
        format: "pdf",
        storageUrl: "https://storage.example.com/reports/exec.pdf",
        content: "Executive report content",
      };
      await reportRepo.save(report1);

      // 2. Retrieve by ID
      const retrieved = await reportRepo.findById(reportId1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(reportId1);
      expect(retrieved?.analysisId).toBe(analysisId);
      expect(retrieved?.title).toBe("Executive Security Summary");
      expect(retrieved?.format).toBe("pdf");
      expect(retrieved?.storageUrl).toBe("https://storage.example.com/reports/exec.pdf");
      expect(retrieved?.content).toBe("Executive report content");

      // 3. Update existing report
      await reportRepo.save({
        id: reportId1,
        analysisId,
        title: "Executive Security Summary - Updated",
        format: "markdown",
        storageUrl: null,
        content: "# Executive Summary (Updated)",
      });

      const updated = await reportRepo.findById(reportId1);
      expect(updated?.title).toBe("Executive Security Summary - Updated");
      expect(updated?.format).toBe("markdown");
      expect(updated?.storageUrl).toBeUndefined();
      expect(updated?.content).toBe("# Executive Summary (Updated)");

      // 4. Save second report to verify listByAnalysis
      const reportId2 = uuidv4();
      await reportRepo.save({
        id: reportId2,
        analysisId,
        title: "Technical JSON Report",
        format: "json",
        content: '{"details": true}',
      });

      const reports = await reportRepo.listByAnalysis(analysisId);
      expect(reports.length).toBe(2);
      expect(reports.some((r) => r.id === reportId1)).toBe(true);
      expect(reports.some((r) => r.id === reportId2)).toBe(true);

      // 5. findById for missing report
      const missing = await reportRepo.findById(uuidv4());
      expect(missing).toBeNull();
    });
  });
});
