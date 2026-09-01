import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp } from "../src/app.js";
import { sqlPool } from "../src/infrastructure/database/sqlserver.js";
import { SqlUserRepository } from "../src/infrastructure/repositories/sql-user-repository.js";
import { SqlSessionRepository } from "../src/infrastructure/repositories/sql-session-repository.js";
import { SqlRefreshTokenRepository } from "../src/infrastructure/repositories/sql-refresh-token-repository.js";
import { SqlPasswordResetTokenRepository } from "../src/infrastructure/repositories/sql-password-reset-token-repository.js";
import { SqlEmailVerificationTokenRepository } from "../src/infrastructure/repositories/sql-email-verification-token-repository.js";
import { AuthService } from "../src/application/services/auth-service.js";
import {
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
  parseCookiesFromHeader,
  getRefreshTokenFromRequest,
} from "../src/interfaces/http/controllers/auth-controller.js";
import { parseEnv } from "../src/config/env.js";

async function cleanupTestData() {
  const tables = [
    "Reports",
    "AnalysisScores",
    "Analyses",
    "Files",
    "Repositories",
    "Projects",
    "InterviewResults",
    "InterviewQuestions",
    "InterviewSessions",
    "Notifications",
    "AuditLogs",
    "RefreshTokens",
    "Sessions",
    "PasswordResetTokens",
    "EmailVerificationTokens",
    "UserRoles",
    "Users",
  ];

  for (const table of tables) {
    try {
      await sqlPool.request().query(`DELETE FROM dbo.${table}`);
    } catch {
      // Ignore
    }
  }
}

async function ensureRolesExist() {
  const roles = [
    { id: "11111111-1111-1111-1111-111111111112", name: "admin" },
    { id: "22222222-2222-2222-2222-222222222223", name: "developer" },
    { id: "33333333-3333-3333-3333-333333333334", name: "recruiter" },
    { id: "44444444-4444-4444-4444-444444444445", name: "team_lead" },
  ];

  for (const role of roles) {
    try {
      await sqlPool
        .request()
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

describe("Auth HttpOnly Cookie & Token Storage Hardening", () => {
  let app: ReturnType<typeof createApp>["app"];
  let authService: AuthService;
  let userRepo: SqlUserRepository;

  const TEST_USER = {
    email: "cookie-test@example.com",
    password: "SecurePassword123!",
    displayName: "Cookie Tester",
  };

  beforeAll(async () => {
    await sqlPool.connect();
    const appContainer = createApp();
    app = appContainer.app;
    authService = appContainer.authService;
    userRepo = appContainer.userRepository;
    await ensureRolesExist();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await sqlPool.close();
  });

  beforeEach(async () => {
    await cleanupTestData();
  });

  describe("Cookie Option Helpers & Configuration", () => {
    it("configures HttpOnly, path, and maxAge by default", () => {
      const devParsed = parseEnv({ NODE_ENV: "development" });
      const options = getRefreshCookieOptions(devParsed as any);

      expect(options.httpOnly).toBe(true);
      expect(options.path).toBe("/api/auth");
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe("lax");
      expect(options.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("enables secure: true in production environment", () => {
      const prodParsed = parseEnv({
        NODE_ENV: "production",
        API_URL: "https://api.codeguardai.com",
        JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef",
        JWT_REFRESH_SECRET: "fedcba9876543210fedcba9876543210",
        SQLSERVER_PASSWORD: "StrongProductionDBPassword#123",
        REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
      });
      const options = getRefreshCookieOptions(prodParsed as any);

      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.path).toBe("/api/auth");
      expect(options.sameSite).toBe("lax");
    });

    it("supports custom sameSite and path configuration", () => {
      const customParsed = parseEnv({
        NODE_ENV: "development",
        AUTH_COOKIE_SAME_SITE: "none",
        AUTH_COOKIE_PATH: "/api/auth",
      });
      const options = getRefreshCookieOptions(customParsed as any);

      expect(options.sameSite).toBe("none");
      expect(options.path).toBe("/api/auth");
    });

    it("correctly parses cookies from raw Cookie header", () => {
      const header = "codeguard_refresh_token=abc123token; other_cookie=xyz";
      const parsed = parseCookiesFromHeader(header);
      expect(parsed.codeguard_refresh_token).toBe("abc123token");
      expect(parsed.other_cookie).toBe("xyz");
    });

    it("extracts refresh token from req cookie header or body", () => {
      const reqFromCookie = {
        header: (name: string) =>
          name.toLowerCase() === "cookie" ? "codeguard_refresh_token=from-cookie-123" : undefined,
        body: {},
      } as any;
      expect(getRefreshTokenFromRequest(reqFromCookie)).toBe("from-cookie-123");

      const reqFromBody = {
        header: () => undefined,
        body: { refreshToken: "from-body-456" },
      } as any;
      expect(getRefreshTokenFromRequest(reqFromBody)).toBe("from-body-456");
    });
  });

  describe("End-to-End Cookie Auth Flow", () => {
    async function createVerifiedUser(prefix: string) {
      const user = {
        email: `${prefix}-${randomUUID()}@example.com`,
        password: "SecurePassword123!",
        displayName: "Cookie Tester",
      };

      await request(app).post("/api/auth/register").send(user).expect(201);

      const dbUser = await userRepo.findByEmail(user.email);
      const verificationToken = await authService.createEmailVerificationToken(dbUser!.id);
      await request(app).get(`/api/auth/verify-email/${verificationToken}`).expect(200);

      return user;
    }

    it("POST /login sets HttpOnly refresh cookie with Path=/api/auth and does NOT include refreshToken in JSON", async () => {
      const user = await createVerifiedUser("login-cookie");
      const res = await request(app)
        .post("/api/auth/login")
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeUndefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(user.email);
      expect(res.headers["set-cookie"]).toBeDefined();

      const setCookie = res.headers["set-cookie"].join("; ");
      expect(setCookie).toMatch(/codeguard_refresh_token=/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Path=\/api\/auth/i);
    });

    it("POST /refresh uses HttpOnly cookie, rotates the cookie, and does NOT include refreshToken in JSON", async () => {
      const user = await createVerifiedUser("refresh-cookie");
      // 1. Login to get cookie
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(200);

      expect(loginRes.body.refreshToken).toBeUndefined();
      const loginCookies: string[] = loginRes.headers["set-cookie"] || [];
      const refreshCookie = loginCookies.find((c) => c.startsWith("codeguard_refresh_token="))?.split(";")[0];
      const csrfCookie = loginCookies.find((c) => c.startsWith("codeguard_csrf_token="))?.split(";")[0];
      const csrfToken = csrfCookie?.replace("codeguard_csrf_token=", "");
      const cookieHeader = [refreshCookie, csrfCookie].filter(Boolean).join("; ");

      // 2. Call refresh sending Cookie header & X-CSRF-Token
      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(200);

      expect(refreshRes.body.accessToken).toBeDefined();
      expect(refreshRes.body.refreshToken).toBeUndefined();
      expect(refreshRes.body.newRefreshToken).toBeUndefined();
      expect(refreshRes.body.accessToken).not.toBe(loginRes.body.accessToken);

      // Should rotate and set a new cookie
      expect(refreshRes.headers["set-cookie"]).toBeDefined();
      const newCookies: string[] = refreshRes.headers["set-cookie"] || [];
      const rotatedRefreshCookie = newCookies.find((c) => c.startsWith("codeguard_refresh_token="))?.split(";")[0];
      const rotatedCsrfCookie = newCookies.find((c) => c.startsWith("codeguard_csrf_token="))?.split(";")[0];
      const rotatedCsrfToken = rotatedCsrfCookie?.replace("codeguard_csrf_token=", "");
      expect(rotatedRefreshCookie).toMatch(/codeguard_refresh_token=/);
      expect(rotatedRefreshCookie).not.toBe(refreshCookie);

      // 3. Old refresh token cookie should now be rejected (revoked on rotation)
      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `${refreshCookie}; ${csrfCookie}`)
        .set("X-CSRF-Token", csrfToken!)
        .expect(401);

      // 4. New rotated cookie should succeed
      const secondRefreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", `${rotatedRefreshCookie}; ${rotatedCsrfCookie}`)
        .set("X-CSRF-Token", rotatedCsrfToken!)
        .expect(200);

      expect(secondRefreshRes.body.accessToken).toBeDefined();
      expect(secondRefreshRes.body.refreshToken).toBeUndefined();
    });

    it("POST /logout revokes session and clears the HttpOnly cookie", async () => {
      const user = await createVerifiedUser("logout-cookie");
      // 1. Login
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({
          email: user.email,
          password: user.password,
        })
        .expect(200);

      const loginCookies: string[] = loginRes.headers["set-cookie"] || [];
      const refreshCookie = loginCookies.find((c) => c.startsWith("codeguard_refresh_token="))?.split(";")[0];
      const csrfCookie = loginCookies.find((c) => c.startsWith("codeguard_csrf_token="))?.split(";")[0];
      const csrfToken = csrfCookie?.replace("codeguard_csrf_token=", "");
      const cookieHeader = [refreshCookie, csrfCookie].filter(Boolean).join("; ");
      const accessToken = loginRes.body.accessToken;

      // 2. Logout with access token, cookie & CSRF header
      const logoutRes = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(204);

      // Cookie should be cleared (Expires in the past or maxAge=0)
      const clearCookie = logoutRes.headers["set-cookie"]?.join("; ") || "";
      expect(clearCookie).toMatch(/codeguard_refresh_token=/);

      // 3. Subsequent refresh with revoked cookie must fail
      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(401);
    });

    it("rejects refresh when no cookie or token is provided", async () => {
      await request(app)
        .post("/api/auth/refresh")
        .expect(400);
    });
  });
});
