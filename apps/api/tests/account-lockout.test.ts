import { describe, expect, it, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { sqlPool } from "../src/infrastructure/database/sqlserver.js";
import { SqlUserRepository } from "../src/infrastructure/repositories/sql-user-repository.js";
import { AuthService, DUMMY_BCRYPT_HASH, parseTimeString } from "../src/application/services/auth-service.js";
import bcrypt from "bcryptjs";

// Helper to clean up test data
async function cleanupTestData() {
  const tables = [
    "RefreshTokens",
    "Sessions",
    "PasswordResetTokens",
    "EmailVerificationTokens",
    "UserRoles",
    "Users"
  ];

  for (const table of tables) {
    try {
      await sqlPool.request().query(`DELETE FROM dbo.${table}`);
    } catch {
      // Ignore if table does not exist or empty
    }
  }
}

// Ensure essential roles exist
async function ensureRolesExist() {
  const roles = [
    { id: "11111111-1111-1111-1111-111111111112", name: "admin" },
    { id: "22222222-2222-2222-2222-222222222223", name: "developer" },
    { id: "33333333-3333-3333-3333-333333333334", name: "recruiter" },
    { id: "44444444-4444-4444-4444-444444444445", name: "team_lead" }
  ];

  for (const role of roles) {
    try {
      await sqlPool.request()
        .input("id", role.id)
        .input("name", role.name)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = @id)
          BEGIN
            UPDATE dbo.Roles SET Name = @name WHERE Id = @id;
          END
          ELSE
          BEGIN
            INSERT INTO dbo.Roles (Id, Name) VALUES (@id, @name);
          END
        `);
    } catch {
      // Ignore
    }
  }
}

describe("Phase 4B: Account Lockout & Brute-Force Defense", () => {
  let app: ReturnType<typeof createApp>["app"];
  let userRepo: SqlUserRepository;

  const TEST_USER = {
    id: "99999999-9999-9999-9999-999999999991",
    email: "lockout-test@example.com",
    password: "CorrectPassword123!",
    displayName: "Lockout Test User"
  };

  const UNVERIFIED_USER = {
    id: "99999999-9999-9999-9999-999999999992",
    email: "unverified-lockout@example.com",
    password: "CorrectPassword123!",
    displayName: "Unverified User"
  };

  beforeAll(async () => {
    await sqlPool.connect();
    await ensureRolesExist();
    const container = createApp();
    app = container.app;
    userRepo = new SqlUserRepository();
  });

  beforeEach(async () => {
    await cleanupTestData();

    // Create verified test user
    const passwordHash = await bcrypt.hash(TEST_USER.password, 12);
    await userRepo.save(
      {
        id: TEST_USER.id,
        email: TEST_USER.email,
        displayName: TEST_USER.displayName,
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false
      },
      passwordHash
    );

    // Create unverified test user
    await userRepo.save(
      {
        id: UNVERIFIED_USER.id,
        email: UNVERIFIED_USER.email,
        displayName: UNVERIFIED_USER.displayName,
        roles: ["developer"],
        isEmailVerified: false,
        mfaEnabled: false
      },
      passwordHash
    );
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe("1. Lockout Duration Parsing Unit Tests", () => {
    it("parses valid time strings correctly to milliseconds", () => {
      expect(parseTimeString("30s")).toBe(30_000);
      expect(parseTimeString("15m")).toBe(900_000);
      expect(parseTimeString("1h")).toBe(3_600_000);
      expect(parseTimeString("24h")).toBe(86_400_000);
      expect(parseTimeString("7d")).toBe(604_800_000);
    });

    it("throws on unsupported or malformed time strings", () => {
      expect(() => parseTimeString("invalid")).toThrow(/Unsupported or malformed/);
      expect(() => parseTimeString("15x")).toThrow(/Unsupported or malformed/);
      expect(() => parseTimeString("")).toThrow(/Unsupported or malformed/);
    });
  });

  describe("2. Standard Login & Counter Reset", () => {
    it("successful login returns 200 with tokens and leaves FailedLoginCount at 0", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(TEST_USER.email);

      // Check DB directly
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];
      expect(record.FailedLoginCount).toBe(0);
      expect(record.LockedUntil).toBeNull();
    });

    it("single wrong password increments FailedLoginCount to 1 without locking", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: "WrongPassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "INVALID_CREDENTIALS" });

      // Direct SQL check
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];
      expect(record.FailedLoginCount).toBe(1);
      expect(record.LockedUntil).toBeNull();
    });

    it("successful login after prior failures resets FailedLoginCount to 0 and clears LockedUntil", async () => {
      // 2 failed attempts
      await request(app).post("/api/auth/login").send({ email: TEST_USER.email, password: "Wrong1" });
      await request(app).post("/api/auth/login").send({ email: TEST_USER.email, password: "Wrong2" });

      let result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount FROM dbo.Users WHERE Email = @email");
      expect(result.recordset[0].FailedLoginCount).toBe(2);

      // Successful login
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(res.status).toBe(200);

      // Verify reset in DB
      result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      expect(result.recordset[0].FailedLoginCount).toBe(0);
      expect(result.recordset[0].LockedUntil).toBeNull();
    });
  });

  describe("3. Threshold Triggering & Account Lockout", () => {
    it("reaching MAX_FAILED_LOGIN_ATTEMPTS (5) sets LockedUntil into the future", async () => {
      // Send 5 wrong passwords
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post("/api/auth/login")
          .send({
            email: TEST_USER.email,
            password: `WrongPasswordAttempt${i}`
          });
        // Each failure returns generic INVALID_CREDENTIALS without revealing lockout status
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: "INVALID_CREDENTIALS" });
      }

      // Check DB
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];
      expect(record.FailedLoginCount).toBe(5);
      expect(record.LockedUntil).not.toBeNull();

      const lockedUntilDate = new Date(record.LockedUntil);
      const now = Date.now();
      // Should be locked ~15 minutes into the future
      expect(lockedUntilDate.getTime()).toBeGreaterThan(now + 10 * 60 * 1000);
      expect(lockedUntilDate.getTime()).toBeLessThanOrEqual(now + 16 * 60 * 1000);
    });

    it("subsequent login attempts while locked return 403 ACCOUNT_LOCKED (wrong and valid passwords)", async () => {
      // Lock account with 5 wrong attempts
      for (let i = 1; i <= 5; i++) {
        await request(app).post("/api/auth/login").send({ email: TEST_USER.email, password: "BadPassword" });
      }

      // 6th attempt with wrong password
      const wrongRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: "StillWrongPassword"
        });
      expect(wrongRes.status).toBe(403);
      expect(wrongRes.body).toEqual({ error: "ACCOUNT_LOCKED" });

      // 7th attempt with CORRECT password while still locked -> must still return 403
      const validRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });
      expect(validRes.status).toBe(403);
      expect(validRes.body).toEqual({ error: "ACCOUNT_LOCKED" });
    });

    it("does not execute bcrypt password verification while account is locked", async () => {
      // Manually set LockedUntil to future in DB
      await sqlPool.request()
        .input("email", TEST_USER.email)
        .query(`
          UPDATE dbo.Users
          SET FailedLoginCount = 5,
              LockedUntil = DATEADD(minute, 15, SYSUTCDATETIME())
          WHERE Email = @email
        `);

      const verifySpy = vi.spyOn(AuthService.prototype, "verifyPassword");

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "ACCOUNT_LOCKED" });
      expect(verifySpy).not.toHaveBeenCalled();

      verifySpy.mockRestore();
    });
  });

  describe("4. Lock Expiration & Recovery", () => {
    it("after lock expiration, valid password succeeds and resets the lock state", async () => {
      // Set LockedUntil in the past (expired 5 minutes ago)
      await sqlPool.request()
        .input("email", TEST_USER.email)
        .query(`
          UPDATE dbo.Users
          SET FailedLoginCount = 5,
              LockedUntil = DATEADD(minute, -5, SYSUTCDATETIME())
          WHERE Email = @email
        `);

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: TEST_USER.password
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();

      // Check DB state is completely cleared
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];
      expect(record.FailedLoginCount).toBe(0);
      expect(record.LockedUntil).toBeNull();
    });

    it("after lock expiration, invalid password resets counter to 1 and starts a fresh failure window", async () => {
      // Set LockedUntil in the past (expired 5 minutes ago)
      await sqlPool.request()
        .input("email", TEST_USER.email)
        .query(`
          UPDATE dbo.Users
          SET FailedLoginCount = 5,
              LockedUntil = DATEADD(minute, -5, SYSUTCDATETIME())
          WHERE Email = @email
        `);

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: "StillWrongPassword"
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "INVALID_CREDENTIALS" });

      // Direct SQL check: count resets to 1, LockedUntil is NULL
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];
      expect(record.FailedLoginCount).toBe(1);
      expect(record.LockedUntil).toBeNull();
    });
  });

  describe("5. Nonexistent Email & Timing Attack Protection", () => {
    it("nonexistent email returns 401 INVALID_CREDENTIALS without creating or altering rows", async () => {
      const nonexistentEmail = "ghost-user@nonexistent.domain";

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: nonexistentEmail,
          password: "SomePassword123!"
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "INVALID_CREDENTIALS" });

      // Verify no user record was created
      const result = await sqlPool.request()
        .input("email", nonexistentEmail)
        .query("SELECT COUNT(*) AS total FROM dbo.Users WHERE Email = @email");
      expect(result.recordset[0].total).toBe(0);
    });

    it("nonexistent email verifies against a valid bcrypt dummy hash", async () => {
      const verifySpy = vi.spyOn(AuthService.prototype, "verifyPassword");

      await request(app)
        .post("/api/auth/login")
        .send({
          email: "unknown-user@test.local",
          password: "AnyPassword123!"
        });

      expect(verifySpy).toHaveBeenCalledWith("AnyPassword123!", DUMMY_BCRYPT_HASH);
      // Valid dummy hash format check
      expect(DUMMY_BCRYPT_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);

      verifySpy.mockRestore();
    });

    it("error responses are indistinguishable between invalid password and unknown email", async () => {
      const wrongPasswordRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: TEST_USER.email,
          password: "WrongPassword!"
        });

      const unknownEmailRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: "unknown@nowhere.test",
          password: "WrongPassword!"
        });

      expect(wrongPasswordRes.status).toBe(401);
      expect(unknownEmailRes.status).toBe(401);
      expect(wrongPasswordRes.body).toEqual(unknownEmailRes.body);
    });
  });

  describe("6. Email Verification Interaction", () => {
    it("unverified account with wrong password returns 401 and increments FailedLoginCount", async () => {
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: UNVERIFIED_USER.email,
          password: "WrongPassword!"
        });

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "INVALID_CREDENTIALS" });

      const result = await sqlPool.request()
        .input("email", UNVERIFIED_USER.email)
        .query("SELECT FailedLoginCount FROM dbo.Users WHERE Email = @email");
      expect(result.recordset[0].FailedLoginCount).toBe(1);
    });

    it("unverified account with correct password resets failed logins and returns 403 EMAIL_NOT_VERIFIED", async () => {
      // First introduce a failed attempt
      await request(app).post("/api/auth/login").send({ email: UNVERIFIED_USER.email, password: "Wrong" });

      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: UNVERIFIED_USER.email,
          password: UNVERIFIED_USER.password
        });

      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: "EMAIL_NOT_VERIFIED" });

      // Failed login count was reset because the password was valid
      const result = await sqlPool.request()
        .input("email", UNVERIFIED_USER.email)
        .query("SELECT FailedLoginCount FROM dbo.Users WHERE Email = @email");
      expect(result.recordset[0].FailedLoginCount).toBe(0);
    });
  });

  describe("7. Atomic Concurrency Verification", () => {
    it("handles concurrent failed login attempts atomically in SQL without lost updates", async () => {
      const concurrentAttempts = 6;
      const promises = Array.from({ length: concurrentAttempts }, (_, i) =>
        request(app)
          .post("/api/auth/login")
          .send({
            email: TEST_USER.email,
            password: `ConcurrentWrongPassword_${i}`
          })
      );

      const responses = await Promise.all(promises);

      // All responses should either be 401 (failed credentials) or 403 (if threshold was reached during burst)
      for (const res of responses) {
        expect([401, 403]).toContain(res.status);
      }

      // Check final DB state: count must be at least MAX_FAILED_LOGIN_ATTEMPTS and LockedUntil must be set
      const result = await sqlPool.request()
        .input("email", TEST_USER.email)
        .query("SELECT FailedLoginCount, LockedUntil FROM dbo.Users WHERE Email = @email");
      const record = result.recordset[0];

      expect(record.FailedLoginCount).toBeGreaterThanOrEqual(5);
      expect(record.LockedUntil).not.toBeNull();
      expect(new Date(record.LockedUntil).getTime()).toBeGreaterThan(Date.now());
    });
  });
});
