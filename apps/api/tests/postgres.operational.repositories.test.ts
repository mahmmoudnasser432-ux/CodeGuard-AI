import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import { v4 as uuidv4 } from "uuid";
import {
  PostgresInterviewRepository,
  PostgresNotificationRepository,
  PostgresAuditLogRepository,
  PostgresUserRepository,
} from "../src/infrastructure/repositories/postgres/index.js";
import {
  createOperationalRepositories,
} from "../src/infrastructure/repositories/operational-repository-factory.js";
import { SqlInterviewRepository } from "../src/infrastructure/repositories/sql-interview-repository.js";
import { SqlNotificationRepository } from "../src/infrastructure/repositories/sql-notification-repository.js";
import { SqlAuditLogRepository } from "../src/infrastructure/repositories/sql-audit-log-repository.js";
import { runPostgresMigrations } from "../src/infrastructure/database/postgres-migration-runner.js";
import type { InterviewSession, InterviewQuestion, InterviewResult } from "../src/domain/entities/interview.js";
import type { Notification } from "../src/domain/entities/notification.js";
import type { AuditLog } from "../src/domain/entities/audit-log.js";

// ============================================================================
// 1. Static T-SQL Portability Audit
// ============================================================================
describe("Phase 6C-2C: Static T-SQL Portability Audit for Operational Adapters", () => {
  const pgRepoDir = path.resolve(__dirname, "../src/infrastructure/repositories/postgres");

  it("ensures all 3 Phase 6C-2C PostgreSQL repository files exist", () => {
    const files = fs.readdirSync(pgRepoDir);
    expect(files).toContain("postgres-interview-repository.ts");
    expect(files).toContain("postgres-notification-repository.ts");
    expect(files).toContain("postgres-audit-log-repository.ts");
    expect(files).toContain("index.ts");
  });

  it("contains ZERO forbidden T-SQL keywords or constructs in Operational adapters", () => {
    const targetFiles = [
      "postgres-interview-repository.ts",
      "postgres-notification-repository.ts",
      "postgres-audit-log-repository.ts",
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
      "postgres-interview-repository.ts",
      "postgres-notification-repository.ts",
      "postgres-audit-log-repository.ts",
    ];
    for (const file of targetFiles) {
      const content = fs.readFileSync(path.join(pgRepoDir, file), "utf8");
      expect(content).toContain("$1");
      expect(content).toMatch(/"(InterviewSessions|InterviewQuestions|InterviewResults|Notifications|AuditLogs)"/);
      expect(content).not.toMatch(/VALUES\s*\([^)]*@\w+/i);
    }
  });
});

// ============================================================================
// 2. Factory & Pool Ownership Unit Tests
// ============================================================================
describe("Phase 6C-2C: Operational Repository Factory & Pool Ownership", () => {
  it("defaults to SQL Server repository implementations when no dialect is specified", () => {
    const repos = createOperationalRepositories();
    expect(repos.interviewRepository).toBeInstanceOf(SqlInterviewRepository);
    expect(repos.notificationRepository).toBeInstanceOf(SqlNotificationRepository);
    expect(repos.auditLogRepository).toBeInstanceOf(SqlAuditLogRepository);
  });

  it("returns SQL Server repository implementations when dialect='sqlserver'", () => {
    const repos = createOperationalRepositories("sqlserver");
    expect(repos.interviewRepository).toBeInstanceOf(SqlInterviewRepository);
    expect(repos.notificationRepository).toBeInstanceOf(SqlNotificationRepository);
    expect(repos.auditLogRepository).toBeInstanceOf(SqlAuditLogRepository);
  });

  it("throws a descriptive error if dialect='postgres' but postgresPool is omitted", () => {
    expect(() => createOperationalRepositories("postgres")).toThrowError(
      /A shared pg\.Pool instance is required when creating PostgreSQL operational repositories/
    );
  });

  it("injects the identical shared pool into all 3 repositories when dialect='postgres'", () => {
    const mockPool = {} as pg.Pool;
    const repos = createOperationalRepositories("postgres", mockPool);
    expect(repos.interviewRepository).toBeInstanceOf(PostgresInterviewRepository);
    expect(repos.notificationRepository).toBeInstanceOf(PostgresNotificationRepository);
    expect(repos.auditLogRepository).toBeInstanceOf(PostgresAuditLogRepository);

    expect((repos.interviewRepository as any).pool).toBe(mockPool);
    expect((repos.notificationRepository as any).pool).toBe(mockPool);
    expect((repos.auditLogRepository as any).pool).toBe(mockPool);
  });

  it("strictly enforces non-null pool in each repository constructor", () => {
    expect(() => new PostgresInterviewRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresInterviewRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresNotificationRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresNotificationRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresAuditLogRepository(undefined as any)).toThrowError(/PostgreSQL pool is required/);
    expect(() => new PostgresAuditLogRepository(null as any)).toThrowError(/PostgreSQL pool is required/);
  });

  it("rejects unsupported dialects cleanly", () => {
    expect(() => createOperationalRepositories("sqlite" as any)).toThrowError(/Unsupported database dialect/);
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

describe("Phase 6C-2C: PostgreSQL Live Operational Repository Integration", () => {
  let pool: pg.Pool | null = null;
  let isDbAvailable = false;
  let userRepo: PostgresUserRepository;
  let interviewRepo: PostgresInterviewRepository;
  let notificationRepo: PostgresNotificationRepository;
  let auditLogRepo: PostgresAuditLogRepository;

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
      const repos = createOperationalRepositories("postgres", pool);
      interviewRepo = repos.interviewRepository as PostgresInterviewRepository;
      notificationRepo = repos.notificationRepository as PostgresNotificationRepository;
      auditLogRepo = repos.auditLogRepository as PostgresAuditLogRepository;
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

  describe("PostgresInterviewRepository", () => {
    it("creates, updates, and retrieves interview sessions", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const candidateId = uuidv4();
      const recruiterId = uuidv4();

      await userRepo.save({
        id: candidateId,
        email: `candidate_${candidateId.slice(0, 8)}@example.com`,
        displayName: "Candidate User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      await userRepo.save({
        id: recruiterId,
        email: `recruiter_${recruiterId.slice(0, 8)}@example.com`,
        displayName: "Recruiter User",
        roles: ["recruiter"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      // 1. Save new session
      const sessionId = uuidv4();
      const session: InterviewSession = {
        id: sessionId,
        title: "Senior Backend Engineer Technical Screen",
        candidateUserId: candidateId,
        recruiterUserId: recruiterId,
        status: "active",
      };

      const saved = await interviewRepo.saveSession(session);
      expect(saved.id).toBe(sessionId);

      // 2. Retrieve session
      const retrieved = await interviewRepo.findSessionById(sessionId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(sessionId);
      expect(retrieved?.title).toBe("Senior Backend Engineer Technical Screen");
      expect(retrieved?.candidateUserId).toBe(candidateId);
      expect(retrieved?.recruiterUserId).toBe(recruiterId);
      expect(retrieved?.status).toBe("active");
      expect(retrieved?.createdAt).toBeInstanceOf(Date);

      // 3. Update session status (upsert)
      await interviewRepo.saveSession({
        id: sessionId,
        title: "Senior Backend Engineer Technical Screen - Completed",
        candidateUserId: candidateId,
        recruiterUserId: recruiterId,
        status: "completed",
      });

      const updated = await interviewRepo.findSessionById(sessionId);
      expect(updated?.title).toBe("Senior Backend Engineer Technical Screen - Completed");
      expect(updated?.status).toBe("completed");

      // 4. Non-existent session returns null
      const missing = await interviewRepo.findSessionById(uuidv4());
      expect(missing).toBeNull();
    });

    it("manages interview questions transactionally with addQuestions", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const sessionId = uuidv4();
      await interviewRepo.saveSession({
        id: sessionId,
        title: "Questions Test Session",
        status: "active",
      });

      const q1Id = uuidv4();
      const q2Id = uuidv4();
      const questionsBatch1: InterviewQuestion[] = [
        {
          id: q1Id,
          interviewSessionId: sessionId,
          prompt: "Explain PostgreSQL connection pooling.",
          expectedAnswer: "Clients connect to poolers to reuse established server connections.",
          evaluationCriteria: "Demonstrates knowledge of resource limits and connection costs.",
          difficulty: "medium",
        },
        {
          id: q2Id,
          interviewSessionId: sessionId,
          prompt: "What is an index scan vs sequential scan?",
          expectedAnswer: "Index scans traverse B-tree pages; seq scans read heap sequentially.",
          evaluationCriteria: "Understands planner cost and selectivity.",
          difficulty: "hard",
        },
      ];

      // Insert initial batch
      const added1 = await interviewRepo.addQuestions(sessionId, questionsBatch1);
      expect(added1.length).toBe(2);

      // Overwrite with single new question (transactional replace)
      const q3Id = uuidv4();
      const questionsBatch2: InterviewQuestion[] = [
        {
          id: q3Id,
          interviewSessionId: sessionId,
          prompt: "Explain transaction isolation levels in SQL.",
          expectedAnswer: "Read committed, Repeatable read, Serializable prevent various anomalies.",
          evaluationCriteria: "Explains dirty reads, non-repeatable reads, phantom reads.",
          difficulty: "expert",
        },
      ];

      const added2 = await interviewRepo.addQuestions(sessionId, questionsBatch2);
      expect(added2.length).toBe(1);

      // Empty batch returns empty array without error
      const emptyResult = await interviewRepo.addQuestions(sessionId, []);
      expect(emptyResult).toEqual([]);
    });

    it("saves interview results and verifies score check constraints", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const sessionId = uuidv4();
      await interviewRepo.saveSession({
        id: sessionId,
        title: "Results Test Session",
        status: "completed",
      });

      const resultId = uuidv4();
      const resultData: InterviewResult = {
        id: resultId,
        interviewSessionId: sessionId,
        technicalScore: 95,
        communicationScore: 88,
        problemSolvingScore: 92,
        recommendation: "Strong Hire: Exceptional systems architecture knowledge.",
      };

      const savedResult = await interviewRepo.saveResult(resultData);
      expect(savedResult.id).toBe(resultId);
      expect(savedResult.technicalScore).toBe(95);

      // Verify check constraint on scores > 100
      const invalidResult: InterviewResult = {
        id: uuidv4(),
        interviewSessionId: sessionId,
        technicalScore: 105, // CHECK BETWEEN 0 AND 100 will fail
        communicationScore: 80,
        problemSolvingScore: 80,
        recommendation: "Invalid score",
      };

      await expect(interviewRepo.saveResult(invalidResult)).rejects.toThrow();
    });
  });

  describe("PostgresNotificationRepository", () => {
    it("creates, retrieves, lists by user, and marks notifications as read", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `notif_user_${userId.slice(0, 8)}@example.com`,
        displayName: "Notification User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      // 1. Create notification
      const notifId1 = uuidv4();
      const notif1: Notification = {
        id: notifId1,
        userId,
        type: "security_alert",
        title: "Critical Dependency Vulnerability Detected",
        body: "CVE-2026-9999 requires immediate attention.",
      };

      const saved = await notificationRepo.save(notif1);
      expect(saved.id).toBe(notifId1);

      // 2. Retrieve by ID
      const retrieved = await notificationRepo.findById(notifId1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(notifId1);
      expect(retrieved?.title).toBe("Critical Dependency Vulnerability Detected");
      expect(retrieved?.readAt).toBeUndefined();

      // 3. Create second notification
      const notifId2 = uuidv4();
      await notificationRepo.save({
        id: notifId2,
        userId,
        type: "system",
        title: "Welcome to CodeGuard AI",
        body: "Your account is active.",
      });

      // 4. List all notifications for user
      const allNotifs = await notificationRepo.listByUser(userId);
      expect(allNotifs.length).toBe(2);

      // 5. Mark first notification as read
      await notificationRepo.markAsRead(notifId1);

      const afterRead = await notificationRepo.findById(notifId1);
      expect(afterRead?.readAt).toBeInstanceOf(Date);

      // 6. List with unreadOnly = true
      const unreadNotifs = await notificationRepo.listByUser(userId, true);
      expect(unreadNotifs.length).toBe(1);
      expect(unreadNotifs[0].id).toBe(notifId2);

      // 7. Non-existent notification returns null
      const missing = await notificationRepo.findById(uuidv4());
      expect(missing).toBeNull();
    });
  });

  describe("PostgresAuditLogRepository", () => {
    it("creates audit logs and retrieves them by actor and entity", async (ctx) => {
      if (!isDbAvailable) {
        ctx.skip();
        return;
      }

      const actorId = uuidv4();
      await userRepo.save({
        id: actorId,
        email: `actor_${actorId.slice(0, 8)}@example.com`,
        displayName: "Audit Actor",
        roles: ["admin"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const entityId = uuidv4();
      const entityType = "Project";

      const logId1 = uuidv4();
      const log1: AuditLog = {
        id: logId1,
        actorUserId: actorId,
        eventType: "project.created",
        entityType,
        entityId,
        ipAddress: "192.168.1.100",
        userAgent: "CodeGuard-CLI/1.0",
        metadata: JSON.stringify({ projectName: "Security Audit" }),
      };

      await auditLogRepo.save(log1);

      // 1. Retrieve by ID
      const retrieved = await auditLogRepo.findById(logId1);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(logId1);
      expect(retrieved?.actorUserId).toBe(actorId);
      expect(retrieved?.eventType).toBe("project.created");
      expect(retrieved?.entityType).toBe(entityType);
      expect(retrieved?.entityId).toBe(entityId);
      expect(retrieved?.ipAddress).toBe("192.168.1.100");
      expect(retrieved?.metadata).toContain("Security Audit");

      // 2. Create second log by same actor for different entity
      const logId2 = uuidv4();
      await auditLogRepo.save({
        id: logId2,
        actorUserId: actorId,
        eventType: "user.role_assigned",
        entityType: "User",
        entityId: uuidv4(),
        createdAt: new Date(Date.now() + 2000), // Newer
      });

      // 3. List by actor with limit
      const actorLogs = await auditLogRepo.listByActor(actorId, 10);
      expect(actorLogs.length).toBe(2);
      expect(actorLogs[0].id).toBe(logId2); // Chronological newest first

      // Limit test
      const limitedLogs = await auditLogRepo.listByActor(actorId, 1);
      expect(limitedLogs.length).toBe(1);
      expect(limitedLogs[0].id).toBe(logId2);

      // 4. List by entity
      const entityLogs = await auditLogRepo.listByEntity(entityType, entityId);
      expect(entityLogs.length).toBe(1);
      expect(entityLogs[0].id).toBe(logId1);
    });
  });
});
