import { describe, it, expect } from "vitest";
import { parseEnv, isRedisConnectionUrl, isLoopbackRedisUrl } from "../src/config/env.js";

describe("Phase 6C-Free: Zero-Cost Demo Architecture Static Configuration Validation", () => {
  const baseDemoEnv = {
    NODE_ENV: "production",
    API_BASE_URL: "https://codeguard-api.koyeb.app",
    FRONTEND_URL: "https://codeguard-ai.vercel.app",
    JWT_ACCESS_SECRET: "demo-high-entropy-access-secret-32-chars-min",
    JWT_REFRESH_SECRET: "demo-high-entropy-refresh-secret-32-chars-min",
    SQLSERVER_PASSWORD: "DemoPlaceholderPassword123!",
    REDIS_URL: "rediss://default:upstashdemo12345@us1-active-redis-12345.upstash.io:6379",
  };

  describe("Upstash Redis Free Configuration (TLS & Host Isolation)", () => {
    it("recognizes Upstash rediss:// URLs as valid Redis connection strings", () => {
      const upstashUrl = "rediss://default:token@us1-active-redis-12345.upstash.io:6379";
      expect(isRedisConnectionUrl(upstashUrl)).toBe(true);
    });

    it("verifies Upstash cloud hostnames are not classified as loopback addresses", () => {
      const upstashUrl = "rediss://default:token@us1-active-redis-12345.upstash.io:6379";
      expect(isLoopbackRedisUrl(upstashUrl)).toBe(false);
    });

    it("accepts Upstash Free Redis TLS URL in production env parsing without code changes", () => {
      const parsed = parseEnv(baseDemoEnv);
      expect(parsed.REDIS_URL).toBe(baseDemoEnv.REDIS_URL);
    });

    it("rejects loopback Redis URLs in production to prevent misconfiguration on Koyeb", () => {
      expect(() =>
        parseEnv({
          ...baseDemoEnv,
          REDIS_URL: "redis://localhost:6379",
        })
      ).toThrowError(/REDIS_URL must not point to localhost in production/);
    });
  });

  describe("Vercel & Koyeb Decoupled Cross-Origin Security", () => {
    it("supports SameSite=None and Secure cookies for cross-origin authentication (Vercel -> Koyeb)", () => {
      const parsed = parseEnv({
        ...baseDemoEnv,
        AUTH_COOKIE_SAME_SITE: "none",
        AUTH_COOKIE_SECURE: "true",
      });
      expect(parsed.AUTH_COOKIE_SAME_SITE).toBe("none");
      expect(parsed.AUTH_COOKIE_SECURE).toBe(true);
    });

    it("supports dynamic PORT assignment matching Koyeb container routing", () => {
      const parsed = parseEnv({
        ...baseDemoEnv,
        PORT: "8000",
      });
      expect(parsed.PORT).toBe(8000);
    });
  });
});
