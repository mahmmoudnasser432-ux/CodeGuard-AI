import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { sqlPool } from "../src/infrastructure/database/sqlserver.js";
import { parseEnv } from "../src/config/env.js";
import { isAllowedOrigin } from "../src/interfaces/http/middleware/security.js";
import {
  generateCsrfToken,
  getCsrfCookieOptions,
  safeCompareTokens,
  extractOriginFromUrl,
} from "../src/interfaces/http/middleware/csrf.js";

describe("Phase 3B CSRF Protection Test Suite", () => {
  let app: ReturnType<typeof createApp>["app"];
  let authService: ReturnType<typeof createApp>["authService"];
  let userRepo: ReturnType<typeof createApp>["userRepository"];

  beforeAll(async () => {
    await sqlPool.connect();
    const container = createApp();
    app = container.app;
    authService = container.authService;
    userRepo = container.userRepository;
  });

  // Helper to extract cookies from supertest response headers
  function extractCookies(res: request.Response): { refreshCookie?: string; csrfCookie?: string; csrfToken?: string; cookieHeader: string } {
    const rawCookies: string[] = res.headers["set-cookie"] || [];
    let refreshCookie: string | undefined;
    let csrfCookie: string | undefined;
    let csrfToken: string | undefined;

    for (const c of rawCookies) {
      const firstPart = c.split(";")[0];
      if (firstPart.startsWith("codeguard_refresh_token=")) {
        refreshCookie = firstPart;
      }
      if (firstPart.startsWith("codeguard_csrf_token=")) {
        csrfCookie = firstPart;
        csrfToken = firstPart.replace("codeguard_csrf_token=", "");
      }
    }

    const cookieHeader = [refreshCookie, csrfCookie].filter(Boolean).join("; ");
    return { refreshCookie, csrfCookie, csrfToken, cookieHeader };
  }

  async function createVerifiedUser(prefix: string) {
    const email = `${prefix}-${Date.now()}@example.com`;
    const password = "ValidPassword123!";
    const displayName = "CSRF Test User";

    await request(app)
      .post("/api/auth/register")
      .send({ email, password, displayName })
      .expect(201);

    const user = await userRepo.findByEmail(email);
    const token = await authService.createEmailVerificationToken(user!.id);
    await request(app).get(`/api/auth/verify-email/${token}`).expect(200);

    return { email, password, displayName, user: user! };
  }

  describe("1. Safe HTTP Methods", () => {
    it("1. GET requests remain allowed without CSRF token", async () => {
      const res = await request(app).get("/health").expect(200);
      expect(res.body.status).toBe("ok");
    });

    it("2. HEAD remains allowed without CSRF token", async () => {
      await request(app).head("/health").expect(200);
    });

    it("3. OPTIONS preflight works and returns CORS headers", async () => {
      const res = await request(app)
        .options("/api/auth/refresh")
        .set("Origin", "http://localhost:3000")
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "Content-Type, X-CSRF-Token")
        .expect(204);

      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });
  });

  describe("2. CSRF Token & Origin Validation", () => {
    it("4. State-changing request with trusted Origin + valid CSRF token succeeds", async () => {
      const { email, password } = await createVerifiedUser("csrf-valid");
      const loginRes = await request(app)
        .post("/api/auth/login")
        .set("Origin", "http://localhost:3000")
        .send({ email, password })
        .expect(200);

      const { cookieHeader, csrfToken } = extractCookies(loginRes);
      expect(csrfToken).toBeDefined();

      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", "http://localhost:3000")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(200);

      expect(refreshRes.body.accessToken).toBeDefined();
    });

    it("5. Missing CSRF token header fails with 403 CSRF_VALIDATION_FAILED", async () => {
      const { email, password } = await createVerifiedUser("csrf-missing");
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password })
        .expect(200);

      const { cookieHeader } = extractCookies(loginRes);

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .expect(403);

      expect(res.body.error).toBe("CSRF_VALIDATION_FAILED");
    });

    it("6. Invalid CSRF token fails with 403 CSRF_VALIDATION_FAILED", async () => {
      const { email, password } = await createVerifiedUser("csrf-invalid");
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password })
        .expect(200);

      const { cookieHeader } = extractCookies(loginRes);

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", "invalid-fake-csrf-token-12345678901234567890123456789012")
        .expect(403);

      expect(res.body.error).toBe("CSRF_VALIDATION_FAILED");
    });

    it("7. Origin mismatch fails with 403 CSRF_VALIDATION_FAILED", async () => {
      const { email, password } = await createVerifiedUser("csrf-origin-mismatch");
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password })
        .expect(200);

      const { cookieHeader, csrfToken } = extractCookies(loginRes);

      const res = await request(app)
        .post("/api/auth/refresh")
        .set("Origin", "https://evil-attacker.com")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(403);

      expect(res.body.error).toBe("CSRF_VALIDATION_FAILED");
    });

    it("8. Arbitrary Vercel origin fails in production", () => {
      const prodEnv = parseEnv({
        NODE_ENV: "production",
        API_BASE_URL: "https://api.codeguard.ai",
        FRONTEND_URL: "https://codeguard.ai",
        CORS_ORIGIN: "https://codeguard.ai",
        JWT_ACCESS_SECRET: "a-very-long-production-access-secret-32-chars-ok!",
        JWT_REFRESH_SECRET: "a-very-long-production-refresh-secret-32-chars-ok!",
        SQLSERVER_PASSWORD: "ProdSqlPassword123!",
        SQLSERVER_ENCRYPT: "true",
        SQLSERVER_TRUST_SERVER_CERTIFICATE: "false",
      });

      expect(isAllowedOrigin("https://arbitrary-subdomain.vercel.app", prodEnv)).toBe(false);
      expect(isAllowedOrigin("https://evil-codeguard.vercel.app", prodEnv)).toBe(false);
      expect(isAllowedOrigin("https://codeguard.ai", prodEnv)).toBe(true);
    });

    it("9. Production localhost origin is rejected", () => {
      const prodEnv = parseEnv({
        NODE_ENV: "production",
        API_BASE_URL: "https://api.codeguard.ai",
        FRONTEND_URL: "https://codeguard.ai",
        CORS_ORIGIN: "https://codeguard.ai",
        JWT_ACCESS_SECRET: "a-very-long-production-access-secret-32-chars-ok!",
        JWT_REFRESH_SECRET: "a-very-long-production-refresh-secret-32-chars-ok!",
        SQLSERVER_PASSWORD: "ProdSqlPassword123!",
        SQLSERVER_ENCRYPT: "true",
        SQLSERVER_TRUST_SERVER_CERTIFICATE: "false",
      });

      expect(isAllowedOrigin("http://localhost:3000", prodEnv)).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1:5000", prodEnv)).toBe(false);
    });

    it("10. Development localhost is allowed", () => {
      const devEnv = parseEnv({
        NODE_ENV: "development",
      });

      expect(isAllowedOrigin("http://localhost:3000", devEnv)).toBe(true);
      expect(isAllowedOrigin("http://127.0.0.1:3000", devEnv)).toBe(true);
      expect(isAllowedOrigin("https://malicious-site.com", devEnv)).toBe(false);
    });
  });

  describe("3. Protected Auth Routes", () => {
    it("11. Refresh requires CSRF protection", async () => {
      const { email, password } = await createVerifiedUser("csrf-refresh-check");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const { cookieHeader, csrfToken } = extractCookies(loginRes);

      // Without header -> 403
      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .expect(403);

      // With header -> 200
      await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(200);
    });

    it("12. Logout requires CSRF protection", async () => {
      const { email, password } = await createVerifiedUser("csrf-logout-check");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const { cookieHeader, csrfToken } = extractCookies(loginRes);
      const accessToken = loginRes.body.accessToken;

      // Without CSRF header -> 403
      await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", cookieHeader)
        .expect(403);

      // With CSRF header -> 204
      await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(204);
    });

    it("13. Logout-all requires CSRF protection", async () => {
      const { email, password } = await createVerifiedUser("csrf-logout-all-check");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const { cookieHeader, csrfToken } = extractCookies(loginRes);
      const accessToken = loginRes.body.accessToken;

      // Without CSRF header -> 403
      await request(app)
        .post("/api/auth/logout-all")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", cookieHeader)
        .expect(403);

      // With CSRF header -> 204
      await request(app)
        .post("/api/auth/logout-all")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(204);
    });

    it("14. Password reset mutation routes are protected against CSRF when cookies are present", async () => {
      const csrfToken = generateCsrfToken();
      const csrfCookie = `codeguard_csrf_token=${csrfToken}`;

      // With CSRF cookie but without header -> 403
      await request(app)
        .post("/api/auth/reset-password/request")
        .set("Cookie", csrfCookie)
        .send({ email: "user@example.com" })
        .expect(403);

      // With matching CSRF header -> 200
      await request(app)
        .post("/api/auth/reset-password/request")
        .set("Cookie", csrfCookie)
        .set("X-CSRF-Token", csrfToken)
        .send({ email: "user@example.com" })
        .expect(200);
    });
  });

  describe("4. Security Properties & Timing-Safety", () => {
    it("15. CSRF token generation produces cryptographically strong, 64-char hex strings", () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it("16. Refresh token remains HttpOnly while CSRF token is accessible to JavaScript", async () => {
      const { email, password } = await createVerifiedUser("cookie-attrib-check");
      const res = await request(app)
        .post("/api/auth/login")
        .send({ email, password })
        .expect(200);

      const setCookies: string[] = res.headers["set-cookie"] || [];
      const refreshCookieHeader = setCookies.find((c) => c.startsWith("codeguard_refresh_token="));
      const csrfCookieHeader = setCookies.find((c) => c.startsWith("codeguard_csrf_token="));

      expect(refreshCookieHeader).toBeDefined();
      expect(refreshCookieHeader).toMatch(/HttpOnly/i);

      expect(csrfCookieHeader).toBeDefined();
      expect(csrfCookieHeader).not.toMatch(/HttpOnly/i); // Intentionally false so client JS can read it
    });

    it("17. Refresh token is never exposed in login or refresh JSON bodies", async () => {
      const { email, password } = await createVerifiedUser("json-exposure-check");
      const loginRes = await request(app)
        .post("/api/auth/login")
        .send({ email, password })
        .expect(200);

      expect(loginRes.body.refreshToken).toBeUndefined();

      const { cookieHeader, csrfToken } = extractCookies(loginRes);
      const refreshRes = await request(app)
        .post("/api/auth/refresh")
        .set("Cookie", cookieHeader)
        .set("X-CSRF-Token", csrfToken!)
        .expect(200);

      expect(refreshRes.body.refreshToken).toBeUndefined();
      expect(refreshRes.body.newRefreshToken).toBeUndefined();
    });

    it("18. Constant-time CSRF comparison correctly handles equal, unequal, and mismatched length strings", () => {
      const tokenA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const tokenB = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const tokenC = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
      const tokenShort = "aaaaaaaa";

      expect(safeCompareTokens(tokenA, tokenB)).toBe(true);
      expect(safeCompareTokens(tokenA, tokenC)).toBe(false);
      expect(safeCompareTokens(tokenA, tokenShort)).toBe(false);
      expect(safeCompareTokens(undefined, tokenA)).toBe(false);
      expect(safeCompareTokens(tokenA, undefined)).toBe(false);
    });

    it("19. Non-cookie API clients authenticating strictly via Authorization header are not blocked", async () => {
      // Machine-to-machine client without cookies calling an endpoint
      const { email, password } = await createVerifiedUser("api-client-check");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const accessToken = loginRes.body.accessToken;

      // GET /me with Bearer token only (no cookies, no CSRF header) -> 200
      const meRes = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.email).toBe(email);
    });
  });

  describe("5. GET /api/auth/csrf endpoint", () => {
    it("returns a new CSRF token and sets the codeguard_csrf_token cookie", async () => {
      const res = await request(app).get("/api/auth/csrf").expect(200);
      expect(res.body.csrfToken).toBeDefined();
      expect(res.body.csrfToken).toHaveLength(64);

      const setCookies: string[] = res.headers["set-cookie"] || [];
      const csrfCookie = setCookies.find((c) => c.startsWith("codeguard_csrf_token="));
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).not.toMatch(/HttpOnly/i);
    });
  });

  describe("6. Cookie Utility Parser & Bearer CSRF Scenarios", () => {
    it("parses cookies from header string correctly", async () => {
      const { parseCookiesFromHeader } = await import("../src/interfaces/http/utils/cookies.js");
      expect(parseCookiesFromHeader(undefined)).toEqual({});
      expect(parseCookiesFromHeader("")).toEqual({});
      expect(parseCookiesFromHeader("key=val")).toEqual({ key: "val" });
      expect(parseCookiesFromHeader("key1=val1; key2=val2; key3=hello%20world")).toEqual({
        key1: "val1",
        key2: "val2",
        key3: "hello world"
      });
    });

    it("Bearer-only authenticated request succeeds even when an unrelated CSRF cookie is present in browser", async () => {
      const { email, password } = await createVerifiedUser("bearer-csrf-coexist");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const accessToken = loginRes.body.accessToken;

      // Make a GET/mutation request with Bearer token AND a CSRF cookie, but WITHOUT X-CSRF-Token header
      const res = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", "codeguard_csrf_token=arbitrary-browser-csrf-token-1234567890")
        .expect(200);

      expect(res.body.email).toBe(email);
    });

    it("CSRF token is strictly independent from the refresh token", async () => {
      const { email, password } = await createVerifiedUser("token-independence");
      const loginRes = await request(app).post("/api/auth/login").send({ email, password }).expect(200);
      const { refreshCookie, csrfToken } = extractCookies(loginRes);

      const refreshToken = refreshCookie?.replace("codeguard_refresh_token=", "");
      expect(refreshToken).toBeDefined();
      expect(csrfToken).toBeDefined();
      expect(csrfToken).not.toBe(refreshToken);
      expect(csrfToken).toHaveLength(64); // 32-byte hex
    });
  });
});

