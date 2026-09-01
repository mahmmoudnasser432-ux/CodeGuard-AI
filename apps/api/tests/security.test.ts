import { describe, it, expect, vi } from "vitest";
import { parseEnv, DEV_DEFAULT_ACCESS_SECRET, DEV_DEFAULT_REFRESH_SECRET } from "../src/config/env.js";
import { isAllowedOrigin } from "../src/interfaces/http/middleware/security.js";
import { TokenService } from "../src/application/services/token-service.js";
import { errorHandler } from "../src/interfaces/http/middleware/error-handler.js";
import type { Request, Response } from "express";

describe("Phase 1 Security: Environment Configuration Validation", () => {
  const baseValidProdEnv = {
    NODE_ENV: "production",
    API_BASE_URL: "https://api.codeguard.ai",
    JWT_ACCESS_SECRET: "a-super-secret-access-token-key-for-prod-32bytes",
    JWT_REFRESH_SECRET: "a-super-secret-refresh-token-key-for-prod-32bytes",
    SQLSERVER_PASSWORD: "ProdSqlPassword123!",
    REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
  };

  it("accepts valid production configuration", () => {
    const parsed = parseEnv(baseValidProdEnv);
    expect(parsed.NODE_ENV).toBe("production");
    expect(parsed.API_BASE_URL).toBe("https://api.codeguard.ai");
    expect(parsed.JWT_ACCESS_SECRET).toBe("a-super-secret-access-token-key-for-prod-32bytes");
    expect(parsed.JWT_REFRESH_SECRET).toBe("a-super-secret-refresh-token-key-for-prod-32bytes");
  });

  it("rejects production startup when API_BASE_URL is missing", () => {
    const invalidEnv = { ...baseValidProdEnv, API_BASE_URL: undefined, API_URL: undefined };
    expect(() => parseEnv(invalidEnv)).toThrowError(/API_BASE_URL/);
  });

  it("rejects production startup when JWT_ACCESS_SECRET uses default development secret", () => {
    const invalidEnv = { ...baseValidProdEnv, JWT_ACCESS_SECRET: DEV_DEFAULT_ACCESS_SECRET };
    expect(() => parseEnv(invalidEnv)).toThrowError(/predictable development default/);
  });

  it("rejects production startup when JWT_REFRESH_SECRET uses default development secret", () => {
    const invalidEnv = { ...baseValidProdEnv, JWT_REFRESH_SECRET: DEV_DEFAULT_REFRESH_SECRET };
    expect(() => parseEnv(invalidEnv)).toThrowError(/predictable development default/);
  });

  it("rejects production startup when JWT secrets are missing", () => {
    const invalidEnv = { ...baseValidProdEnv, JWT_ACCESS_SECRET: undefined, JWT_REFRESH_SECRET: undefined };
    expect(() => parseEnv(invalidEnv)).toThrowError(/JWT_ACCESS_SECRET/);
  });

  it("allows default secrets and localhost URLs in development mode", () => {
    const devEnv = { NODE_ENV: "development" };
    const parsed = parseEnv(devEnv);
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.API_BASE_URL).toBe("http://localhost:5000");
    expect(parsed.JWT_ACCESS_SECRET).toBe(DEV_DEFAULT_ACCESS_SECRET);
    expect(parsed.JWT_REFRESH_SECRET).toBe(DEV_DEFAULT_REFRESH_SECRET);
  });
});

describe("Phase 1 Security: CORS Origin Validation", () => {
  const prodEnv = {
    NODE_ENV: "production" as const,
    FRONTEND_URL: "https://codeguard.ai",
    CORS_ORIGIN: "https://admin.codeguard.ai,https://preview.codeguard.ai",
  } as any;

  const devEnv = {
    NODE_ENV: "development" as const,
    FRONTEND_URL: "http://localhost:3000",
    CORS_ORIGIN: undefined,
  } as any;

  it("allows non-browser server-to-server or curl requests (no origin header)", () => {
    expect(isAllowedOrigin(undefined, prodEnv)).toBe(true);
    expect(isAllowedOrigin(undefined, devEnv)).toBe(true);
  });

  it("allows configured production FRONTEND_URL", () => {
    expect(isAllowedOrigin("https://codeguard.ai", prodEnv)).toBe(true);
  });

  it("allows configured production CORS_ORIGIN list items", () => {
    expect(isAllowedOrigin("https://admin.codeguard.ai", prodEnv)).toBe(true);
    expect(isAllowedOrigin("https://preview.codeguard.ai", prodEnv)).toBe(true);
  });

  it("rejects arbitrary *.vercel.app origins in production", () => {
    expect(isAllowedOrigin("https://malicious-user.vercel.app", prodEnv)).toBe(false);
    expect(isAllowedOrigin("https://random-app.vercel.app", prodEnv)).toBe(false);
  });

  it("rejects localhost origins in production", () => {
    expect(isAllowedOrigin("http://localhost:3000", prodEnv)).toBe(false);
    expect(isAllowedOrigin("http://127.0.0.1:8080", prodEnv)).toBe(false);
  });

  it("allows arbitrary localhost origins in development mode", () => {
    expect(isAllowedOrigin("http://localhost:3000", devEnv)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173", devEnv)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4200", devEnv)).toBe(true);
  });
});

describe("Phase 1 Security: Cryptographic JTI Generation", () => {
  it("generates a valid UUID v4 string for JTI", () => {
    const jti = TokenService.generateJti();
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(jti).toMatch(uuidV4Regex);
  });

  it("generates unique JTIs across consecutive invocations", () => {
    const jtis = new Set(Array.from({ length: 50 }, () => TokenService.generateJti()));
    expect(jtis.size).toBe(50);
  });
});

describe("Phase 1 Security: Error Handler Sanitization", () => {
  it("returns generic sanitized message for 500 error in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const error = new Error("SELECT * FROM users WHERE password_hash = 'leak'; Database connection failed");
    const req = { header: () => "req-12345", log: { error: vi.fn() } } as unknown as Request;
    let responseStatus: number = 0;
    let responseBody: any = null;

    const res = {
      status: (status: number) => {
        responseStatus = status;
        return res;
      },
      json: (body: any) => {
        responseBody = body;
        return res;
      }
    } as unknown as Response;

    const next = vi.fn();

    try {
      errorHandler(error, req, res, next);
      expect(responseStatus).toBe(500);
      expect(responseBody.error).toBe("INTERNAL_SERVER_ERROR");
      expect(responseBody.message).toBe("An unexpected internal server error occurred.");
      expect(responseBody.message).not.toContain("password_hash");
      expect(responseBody.requestId).toBe("req-12345");
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("returns detailed error message in non-production test mode", () => {
    const error = new Error("Detailed debug test error");
    const req = { header: () => undefined } as unknown as Request;
    let responseStatus: number = 0;
    let responseBody: any = null;

    const res = {
      status: (status: number) => {
        responseStatus = status;
        return res;
      },
      json: (body: any) => {
        responseBody = body;
        return res;
      }
    } as unknown as Response;

    const next = vi.fn();

    errorHandler(error, req, res, next);
    expect(responseStatus).toBe(500);
    expect(responseBody.error).toBe("INTERNAL_SERVER_ERROR");
    expect(responseBody.message).toBe("Detailed debug test error");
  });
});
