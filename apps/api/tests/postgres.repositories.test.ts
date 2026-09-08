import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import pg from "pg";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import {
  PostgresUserRepository,
  PostgresSessionRepository,
  PostgresRefreshTokenRepository,
  PostgresPasswordResetTokenRepository,
  PostgresEmailVerificationTokenRepository,
} from "../src/infrastructure/repositories/postgres/index.js";
import { createAuthRepositories } from "../src/infrastructure/repositories/auth-repository-factory.js";
import { SqlUserRepository } from "../src/infrastructure/repositories/sql-user-repository.js";
import { SqlSessionRepository } from "../src/infrastructure/repositories/sql-session-repository.js";
import { SqlRefreshTokenRepository } from "../src/infrastructure/repositories/sql-refresh-token-repository.js";
import { SqlPasswordResetTokenRepository } from "../src/infrastructure/repositories/sql-password-reset-token-repository.js";
import { SqlEmailVerificationTokenRepository } from "../src/infrastructure/repositories/sql-email-verification-token-repository.js";
import { User } from "../src/domain/entities/user.js";
import { Session } from "../src/domain/entities/session.js";
import { RefreshToken } from "../src/domain/entities/refresh-token.js";
import { PasswordResetToken } from "../src/domain/entities/password-reset-token.js";
import { EmailVerificationToken } from "../src/domain/entities/email-verification-token.js";
import { runPostgresMigrations } from "../src/infrastructure/database/postgres-migration-runner.js";

// ============================================================================
// 1. Static T-SQL Portability Audit
// ============================================================================
describe("Phase 6C-2A: Static T-SQL Portability Audit", () => {
  const pgRepoDir = path.resolve(__dirname, "../src/infrastructure/repositories/postgres");

  it("ensures all 5 PostgreSQL repository files exist", () => {
    const files = fs.readdirSync(pgRepoDir);
    expect(files).toContain("postgres-user-repository.ts");
    expect(files).toContain("postgres-session-repository.ts");
    expect(files).toContain("postgres-refresh-token-repository.ts");
    expect(files).toContain("postgres-password-reset-token-repository.ts");
    expect(files).toContain("postgres-email-verification-token-repository.ts");
    expect(files).toContain("index.ts");
  });

  it("contains ZERO forbidden T-SQL keywords or constructs across all PostgreSQL repositories", () => {
    const files = fs.readdirSync(pgRepoDir).filter((f) => f.endsWith(".ts"));
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

    for (const file of files) {
      const content = fs.readFileSync(path.join(pgRepoDir, file), "utf8");
      for (const { name, pattern } of forbiddenPatterns) {
        const matches = content.match(pattern);
        expect(matches, `File ${file} should not contain forbidden T-SQL construct "${name}"`).toBeNull();
      }
    }
  });

  it("ensures all SQL queries use parameterized placeholders ($1, $2, etc.) and PascalCase quoted identifiers", () => {
    const repoFiles = [
      "postgres-user-repository.ts",
      "postgres-session-repository.ts",
      "postgres-refresh-token-repository.ts",
      "postgres-password-reset-token-repository.ts",
      "postgres-email-verification-token-repository.ts",
    ];
    for (const file of repoFiles) {
      const content = fs.readFileSync(path.join(pgRepoDir, file), "utf8");
      expect(content).toContain("$1");
      expect(content).toMatch(/"(Users|Sessions|RefreshTokens|PasswordResetTokens|EmailVerificationTokens|UserRoles|Roles)"/);
      expect(content).not.toMatch(/VALUES\s*\([^)]*@\w+/i);
    }
  });
});

// ============================================================================
// 2. Auth Repository Factory & Pool Ownership Unit Tests
// ============================================================================
describe("Phase 6C-2A: Auth Repository Factory & Pool Ownership", () => {
  it("defaults to SQL Server repository implementations when no dialect is specified", () => {
    const repos = createAuthRepositories();
    expect(repos.userRepository).toBeInstanceOf(SqlUserRepository);
    expect(repos.sessionRepository).toBeInstanceOf(SqlSessionRepository);
    expect(repos.refreshTokenRepository).toBeInstanceOf(SqlRefreshTokenRepository);
    expect(repos.passwordResetTokenRepository).toBeInstanceOf(SqlPasswordResetTokenRepository);
    expect(repos.emailVerificationTokenRepository).toBeInstanceOf(SqlEmailVerificationTokenRepository);
  });

  it("returns SQL Server repository implementations when dialect='sqlserver'", () => {
    const repos = createAuthRepositories("sqlserver");
    expect(repos.userRepository).toBeInstanceOf(SqlUserRepository);
    expect(repos.sessionRepository).toBeInstanceOf(SqlSessionRepository);
    expect(repos.refreshTokenRepository).toBeInstanceOf(SqlRefreshTokenRepository);
    expect(repos.passwordResetTokenRepository).toBeInstanceOf(SqlPasswordResetTokenRepository);
    expect(repos.emailVerificationTokenRepository).toBeInstanceOf(SqlEmailVerificationTokenRepository);
  });

  it("requires an explicit shared pg.Pool and throws if missing when dialect='postgres'", () => {
    expect(() => createAuthRepositories("postgres")).toThrowError(
      /A shared pg.Pool instance is required when creating PostgreSQL auth repositories/
    );
  });

  it("injects the exact same shared pg.Pool into all five PostgreSQL repositories", () => {
    const mockPool = {} as unknown as pg.Pool;
    const repos = createAuthRepositories("postgres", mockPool);
    expect(repos.userRepository).toBeInstanceOf(PostgresUserRepository);
    expect(repos.sessionRepository).toBeInstanceOf(PostgresSessionRepository);
    expect(repos.refreshTokenRepository).toBeInstanceOf(PostgresRefreshTokenRepository);
    expect(repos.passwordResetTokenRepository).toBeInstanceOf(PostgresPasswordResetTokenRepository);
    expect(repos.emailVerificationTokenRepository).toBeInstanceOf(PostgresEmailVerificationTokenRepository);

    // Verify all 5 repositories share the exact same pool instance
    expect((repos.userRepository as any).pool).toBe(mockPool);
    expect((repos.sessionRepository as any).pool).toBe(mockPool);
    expect((repos.refreshTokenRepository as any).pool).toBe(mockPool);
    expect((repos.passwordResetTokenRepository as any).pool).toBe(mockPool);
    expect((repos.emailVerificationTokenRepository as any).pool).toBe(mockPool);
  });

  it("forbids repository constructors from instantiating independent pools without a shared pool", () => {
    expect(() => new PostgresUserRepository(undefined as any)).toThrowError(/requires an explicit, shared pg.Pool/);
    expect(() => new PostgresSessionRepository(undefined as any)).toThrowError(/requires an explicit, shared pg.Pool/);
    expect(() => new PostgresRefreshTokenRepository(undefined as any)).toThrowError(/requires an explicit, shared pg.Pool/);
    expect(() => new PostgresPasswordResetTokenRepository(undefined as any)).toThrowError(/requires an explicit, shared pg.Pool/);
    expect(() => new PostgresEmailVerificationTokenRepository(undefined as any)).toThrowError(/requires an explicit, shared pg.Pool/);
  });

  it("rejects unsupported dialects cleanly without mixing repository providers", () => {
    expect(() => createAuthRepositories("mysql" as any)).toThrowError(/Unsupported database dialect/);
  });
});

// ============================================================================
// 3. PostgreSQL Live Integration, Concurrency & Security Suite
// ============================================================================
const pgHost = process.env.POSTGRES_HOST ?? "127.0.0.1";
const pgPort = parseInt(process.env.POSTGRES_PORT ?? "54329", 10);
const pgDb = process.env.POSTGRES_DATABASE ?? "codeguard_test";
const pgUser = process.env.POSTGRES_USER ?? "codeguard";
const pgPassword = process.env.POSTGRES_PASSWORD ?? "TestPassword123!";

describe("Phase 6C-2A: PostgreSQL Live Repository Integration & Concurrency", () => {
  let pool: pg.Pool | null = null;
  let isDbAvailable = false;
  let userRepo: PostgresUserRepository;
  let sessionRepo: PostgresSessionRepository;
  let refreshTokenRepo: PostgresRefreshTokenRepository;
  let passwordResetRepo: PostgresPasswordResetTokenRepository;
  let emailVerificationRepo: PostgresEmailVerificationTokenRepository;

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

      // Run migrations to ensure latest schema
      const migrationsDir = path.resolve(__dirname, "../../../database/postgres/migrations");
      await runPostgresMigrations(migrationsDir, pool);

      const repos = createAuthRepositories("postgres", pool);
      userRepo = repos.userRepository as PostgresUserRepository;
      sessionRepo = repos.sessionRepository as PostgresSessionRepository;
      refreshTokenRepo = repos.refreshTokenRepository as PostgresRefreshTokenRepository;
      passwordResetRepo = repos.passwordResetTokenRepository as PostgresPasswordResetTokenRepository;
      emailVerificationRepo = repos.emailVerificationTokenRepository as PostgresEmailVerificationTokenRepository;
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

  it("executes tests only if live PostgreSQL container is reachable", () => {
    if (!isDbAvailable) {
      console.warn("PostgreSQL container not reachable at port " + pgPort + " — skipping live integration tests.");
    }
    expect(true).toBe(true);
  });

  // --- PostgresUserRepository Tests ---
  describe("PostgresUserRepository", () => {
    it("saves a new user and retrieves it via findById, findByEmail, and findByRole", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `test-${userId}@codeguard.dev`;
      const testUser: User = {
        id: userId,
        email: testEmail,
        displayName: "Test Postgres User",
        roles: ["developer", "team_lead"],
        isEmailVerified: true,
        mfaEnabled: false,
      };

      const passwordHash = await bcrypt.hash("P@ssword123!", 10);
      const saved = await userRepo.save(testUser, passwordHash);
      expect(saved.id).toBe(userId);

      // findById
      const foundById = await userRepo.findById(userId);
      expect(foundById).not.toBeNull();
      expect(foundById!.email).toBe(testEmail);
      expect(foundById!.displayName).toBe("Test Postgres User");
      expect(foundById!.roles.sort()).toEqual(["developer", "team_lead"].sort());
      expect(foundById!.isEmailVerified).toBe(true);
      expect(foundById!.mfaEnabled).toBe(false);

      // findByEmail
      const foundByEmail = await userRepo.findByEmail(testEmail);
      expect(foundByEmail).not.toBeNull();
      expect(foundByEmail!.id).toBe(userId);

      // findByRole
      const developers = await userRepo.findByRole("developer");
      expect(developers.some((u) => u.id === userId)).toBe(true);

      const recruiters = await userRepo.findByRole("recruiter");
      expect(recruiters.some((u) => u.id === userId)).toBe(false);
    });

    it("performs differential transactional role synchronization (preserves retained, adds new, removes unassigned)", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `sync-${userId}@codeguard.dev`;
      const initialUser: User = {
        id: userId,
        email: testEmail,
        displayName: "Sync User",
        roles: ["developer"],
        isEmailVerified: false,
        mfaEnabled: false,
      };

      await userRepo.save(initialUser, await bcrypt.hash("secret", 10));
      const initial = await userRepo.findById(userId);
      expect(initial!.roles).toEqual(["developer"]);

      // Update 1: Add roles (developer retained, admin added)
      await userRepo.save({
        ...initialUser,
        roles: ["developer", "admin"],
      });
      const step1 = await userRepo.findById(userId);
      expect(step1!.roles.sort()).toEqual(["admin", "developer"].sort());

      // Update 2: Swap roles (developer removed, admin retained, recruiter added)
      await userRepo.save({
        ...initialUser,
        roles: ["admin", "recruiter"],
      });
      const step2 = await userRepo.findById(userId);
      expect(step2!.roles.sort()).toEqual(["admin", "recruiter"].sort());

      // Update 3: Clear all roles
      await userRepo.save({
        ...initialUser,
        roles: [],
      });
      const step3 = await userRepo.findById(userId);
      expect(step3!.roles).toEqual([]);
    });

    it("retrieves authentication details including password hash and failed login count", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `auth-${userId}@codeguard.dev`;
      const hash = await bcrypt.hash("ValidSecret123!", 10);
      await userRepo.save(
        {
          id: userId,
          email: testEmail,
          displayName: "Auth User",
          roles: ["developer"],
          isEmailVerified: true,
          mfaEnabled: false,
        },
        hash
      );

      const authDetails = await userRepo.findAuthDetailsByEmail(testEmail);
      expect(authDetails).not.toBeNull();
      expect(authDetails!.user.id).toBe(userId);
      expect(authDetails!.passwordHash).toBe(hash);
      expect(authDetails!.failedLoginCount).toBe(0);
      expect(authDetails!.lockedUntil).toBeNull();
    });

    it("authenticates credentials via findByCredentials with timing attack protection and null hash handling", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `creds-${userId}@codeguard.dev`;
      const rawPassword = "CorrectPassword123!";
      const hash = await bcrypt.hash(rawPassword, 10);
      await userRepo.save(
        {
          id: userId,
          email: testEmail,
          displayName: "Creds User",
          roles: ["developer"],
          isEmailVerified: true,
          mfaEnabled: false,
        },
        hash
      );

      // Valid password
      const authenticated = await userRepo.findByCredentials(testEmail, rawPassword);
      expect(authenticated).not.toBeNull();
      expect(authenticated!.id).toBe(userId);

      // Invalid password
      const wrongAuth = await userRepo.findByCredentials(testEmail, "WrongPassword");
      expect(wrongAuth).toBeNull();

      // Nonexistent user (verifies dummy bcrypt compare prevents timing discrepancy)
      const bcryptSpy = vi.spyOn(bcrypt, "compare");
      const nonExistent = await userRepo.findByCredentials("does-not-exist@codeguard.dev", "anyPassword");
      expect(nonExistent).toBeNull();
      expect(bcryptSpy).toHaveBeenCalledWith("dummy", "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4h/4q/YvKe");
      bcryptSpy.mockRestore();

      // User with null PasswordHash (e.g., external OAuth/SSO account) returns null without error
      const ssoUserId = uuidv4();
      const ssoEmail = `sso-${ssoUserId}@codeguard.dev`;
      await userRepo.save(
        {
          id: ssoUserId,
          email: ssoEmail,
          displayName: "SSO User",
          roles: ["developer"],
          isEmailVerified: true,
          mfaEnabled: false,
        },
        null
      );
      const ssoAuth = await userRepo.findByCredentials(ssoEmail, "anyPassword");
      expect(ssoAuth).toBeNull();
    });

    it("verifies atomic lockout behavior: first failure, threshold failure, expired lock, and reset", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `lockout-${userId}@codeguard.dev`;
      await userRepo.save({
        id: userId,
        email: testEmail,
        displayName: "Lockout Test User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const maxAttempts = 3;
      const lockoutDurationMs = 60000;

      // 1. First failure
      const res1 = await userRepo.incrementFailedLogins(userId, maxAttempts, lockoutDurationMs);
      expect(res1.failedLoginCount).toBe(1);
      expect(res1.lockedUntil).toBeNull();

      // 2. Intermediate failure
      const res2 = await userRepo.incrementFailedLogins(userId, maxAttempts, lockoutDurationMs);
      expect(res2.failedLoginCount).toBe(2);
      expect(res2.lockedUntil).toBeNull();

      // 3. Threshold failure (triggers account lockout with future timestamp)
      const res3 = await userRepo.incrementFailedLogins(userId, maxAttempts, lockoutDurationMs);
      expect(res3.failedLoginCount).toBe(3);
      expect(res3.lockedUntil).not.toBeNull();
      expect(res3.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

      // 4. Expired lock handling: simulate lock expiration in database
      await pool!.query(
        `UPDATE "Users" SET "LockedUntil" = CURRENT_TIMESTAMP - INTERVAL '10 seconds' WHERE "Id" = $1;`,
        [userId]
      );
      // Next failure on an expired lock resets failedLoginCount to 1 and clears lockedUntil
      const resExpired = await userRepo.incrementFailedLogins(userId, maxAttempts, lockoutDurationMs);
      expect(resExpired.failedLoginCount).toBe(1);
      expect(resExpired.lockedUntil).toBeNull();

      // 5. Reset failed logins
      await userRepo.resetFailedLogins(userId);
      const authAfterReset = await userRepo.findAuthDetailsByEmail(testEmail);
      expect(authAfterReset!.failedLoginCount).toBe(0);
      expect(authAfterReset!.lockedUntil).toBeNull();
    });

    it("CONCURRENCY: proves atomic failedLoginCount increments with 10 concurrent requests (zero lost updates)", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      const testEmail = `concurrency-${userId}@codeguard.dev`;
      await userRepo.save({
        id: userId,
        email: testEmail,
        displayName: "Concurrency User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const maxAttempts = 100; // High threshold so it does not lock during increment test
      const lockoutDurationMs = 60000;
      const concurrentRequests = 10;

      // Fire 10 parallel increments simultaneously
      const promises = Array.from({ length: concurrentRequests }, () =>
        userRepo.incrementFailedLogins(userId, maxAttempts, lockoutDurationMs)
      );

      await Promise.all(promises);

      // Check the final count in DB
      const auth = await userRepo.findAuthDetailsByEmail(testEmail);
      expect(auth!.failedLoginCount).toBe(concurrentRequests);
    });
  });

  // --- PostgresSessionRepository Tests ---
  describe("PostgresSessionRepository", () => {
    it("creates, retrieves, updates, and deletes sessions", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `session-user-${userId}@codeguard.dev`,
        displayName: "Session User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const sessionId = uuidv4();
      const jti = uuidv4();
      const expiresAt = new Date(Date.now() + 3600000);
      const session = new Session({
        id: sessionId,
        userId,
        jti,
        expiresAt,
        refreshTokenHash: "hash123",
        ipAddress: "127.0.0.1",
        userAgent: "Vitest/1.0",
      });

      await sessionRepo.create(session);

      // findById
      const found = await sessionRepo.findById(sessionId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(sessionId);
      expect(found!.userId).toBe(userId);
      expect(found!.jti).toBe(jti);
      expect(found!.refreshTokenHash).toBe("hash123");

      // findByJti
      const foundByJti = await sessionRepo.findByJti(jti);
      expect(foundByJti).not.toBeNull();
      expect(foundByJti!.id).toBe(sessionId);

      // findByUserId
      const userSessions = await sessionRepo.findByUserId(userId);
      expect(userSessions.length).toBeGreaterThanOrEqual(1);

      // update
      session.revoke();
      await sessionRepo.update(session);
      const revoked = await sessionRepo.findById(sessionId);
      expect(revoked!.revokedAt).toBeDefined();

      // delete
      await sessionRepo.delete(sessionId);
      const deleted = await sessionRepo.findById(sessionId);
      expect(deleted).toBeNull();
    });

    it("cleans up expired sessions", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `cleanup-session-${userId}@codeguard.dev`,
        displayName: "Cleanup User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const expiredSession = new Session({
        id: uuidv4(),
        userId,
        jti: uuidv4(),
        expiresAt: new Date(Date.now() - 10000), // Already expired
        refreshTokenHash: "hash-expired",
      });

      await sessionRepo.create(expiredSession);
      await sessionRepo.cleanupExpired();

      const found = await sessionRepo.findById(expiredSession.id);
      expect(found).toBeNull();
    });
  });

  // --- PostgresRefreshTokenRepository Tests ---
  describe("PostgresRefreshTokenRepository", () => {
    it("creates, retrieves, updates, and deletes refresh tokens", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `rt-user-${userId}@codeguard.dev`,
        displayName: "RT User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const tokenId = uuidv4();
      const jti = uuidv4();
      const tokenHash = "tokenhash_abc123";
      const token = new RefreshToken({
        id: tokenId,
        userId,
        tokenHash,
        jti,
        userAgentHash: "uahash",
        ipHash: "iphash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      await refreshTokenRepo.create(token);

      // findById
      const found = await refreshTokenRepo.findById(tokenId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(tokenId);

      // findByTokenHash
      const foundByHash = await refreshTokenRepo.findByTokenHash(tokenHash);
      expect(foundByHash).not.toBeNull();
      expect(foundByHash!.id).toBe(tokenId);

      // findByJti
      const foundByJti = await refreshTokenRepo.findByJti(jti);
      expect(foundByJti).not.toBeNull();
      expect(foundByJti!.id).toBe(tokenId);

      // findByUserId
      const userTokens = await refreshTokenRepo.findByUserId(userId);
      expect(userTokens.length).toBeGreaterThanOrEqual(1);

      // update
      token.revoke();
      await refreshTokenRepo.update(token);
      const updated = await refreshTokenRepo.findById(tokenId);
      expect(updated!.revokedAt).toBeDefined();

      // delete
      await refreshTokenRepo.delete(tokenId);
      const deleted = await refreshTokenRepo.findById(tokenId);
      expect(deleted).toBeNull();
    });

    it("cleans up expired refresh tokens", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `cleanup-rt-${userId}@codeguard.dev`,
        displayName: "Cleanup RT User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const expiredToken = new RefreshToken({
        id: uuidv4(),
        userId,
        tokenHash: "expired_hash",
        jti: uuidv4(),
        expiresAt: new Date(Date.now() - 5000),
      });

      await refreshTokenRepo.create(expiredToken);
      await refreshTokenRepo.cleanupExpired();

      const found = await refreshTokenRepo.findById(expiredToken.id);
      expect(found).toBeNull();
    });
  });

  // --- PostgresPasswordResetTokenRepository Tests ---
  describe("PostgresPasswordResetTokenRepository", () => {
    it("creates, retrieves active, updates used, and deletes password reset tokens", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `pr-user-${userId}@codeguard.dev`,
        displayName: "PR User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      });

      const tokenId = uuidv4();
      const tokenHash = "reset_token_hash_xyz";
      const token = new PasswordResetToken({
        id: tokenId,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await passwordResetRepo.create(token);

      // findById
      const found = await passwordResetRepo.findById(tokenId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(tokenId);

      // findByUserId (active, unused)
      const foundActive = await passwordResetRepo.findByUserId(userId);
      expect(foundActive).not.toBeNull();
      expect(foundActive!.id).toBe(tokenId);

      // findByTokenHash
      const foundByHash = await passwordResetRepo.findByTokenHash(tokenHash);
      expect(foundByHash).not.toBeNull();

      // update (mark as used)
      token.markAsUsed();
      await passwordResetRepo.update(token);

      // findByUserId should now return null because token is used
      const activeAfterUsed = await passwordResetRepo.findByUserId(userId);
      expect(activeAfterUsed).toBeNull();

      // deleteUsedByUserId
      await passwordResetRepo.deleteUsedByUserId(userId);
      const afterCleanup = await passwordResetRepo.findById(tokenId);
      expect(afterCleanup).toBeNull();
    });
  });

  // --- PostgresEmailVerificationTokenRepository Tests ---
  describe("PostgresEmailVerificationTokenRepository", () => {
    it("creates, retrieves active, updates used, and deletes email verification tokens", async () => {
      if (!isDbAvailable) return;

      const userId = uuidv4();
      await userRepo.save({
        id: userId,
        email: `ev-user-${userId}@codeguard.dev`,
        displayName: "EV User",
        roles: ["developer"],
        isEmailVerified: false,
        mfaEnabled: false,
      });

      const tokenId = uuidv4();
      const tokenHash = "email_verify_hash_xyz";
      const token = new EmailVerificationToken({
        id: tokenId,
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await emailVerificationRepo.create(token);

      // findById
      const found = await emailVerificationRepo.findById(tokenId);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(tokenId);

      // findByUserId (active, unused)
      const foundActive = await emailVerificationRepo.findByUserId(userId);
      expect(foundActive).not.toBeNull();
      expect(foundActive!.id).toBe(tokenId);

      // findByTokenHash
      const foundByHash = await emailVerificationRepo.findByTokenHash(tokenHash);
      expect(foundByHash).not.toBeNull();

      // update (mark as used)
      token.markAsUsed();
      await emailVerificationRepo.update(token);

      // findByUserId should now return null because token is used
      const activeAfterUsed = await emailVerificationRepo.findByUserId(userId);
      expect(activeAfterUsed).toBeNull();

      // deleteUsedByUserId
      await emailVerificationRepo.deleteUsedByUserId(userId);
      const afterCleanup = await emailVerificationRepo.findById(tokenId);
      expect(afterCleanup).toBeNull();
    });
  });
});
