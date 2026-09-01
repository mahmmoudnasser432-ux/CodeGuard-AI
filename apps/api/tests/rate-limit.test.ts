import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/config/env.js";
import {
  redactRedisUrl,
  sanitizeRedisLogText,
  startRedisClient,
} from "../src/infrastructure/redis/client.js";
import {
  createDistributedRateLimitStore,
  RATE_LIMIT_KEY_PREFIX,
} from "../src/infrastructure/redis/rate-limit-store.js";
import {
  buildClientRateLimitKey,
  createApiRateLimiter,
} from "../src/interfaces/http/middleware/rate-limiter.js";

function createInMemoryRedisSendCommand() {
  const counters = new Map<string, number>();
  const commands: string[][] = [];

  const sendCommand = async (...args: string[]) => {
    commands.push(args);
    const op = args[0]?.toUpperCase();
    if (op === "SCRIPT") return "mocksha";
    if (op === "EVALSHA" || op === "EVAL") {
      const key = args[3] ?? "";
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return [next, 60_000];
    }
    if (op === "DECR") {
      const key = args[1] ?? "";
      const next = Math.max(0, (counters.get(key) ?? 1) - 1);
      counters.set(key, next);
      return next;
    }
    if (op === "DEL") {
      counters.delete(args[1] ?? "");
      return 1;
    }
    return 1;
  };

  return { sendCommand, counters, commands };
}

function createLimitedApp(limiter: ReturnType<typeof createApiRateLimiter>) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(limiter);
  app.get("/ping", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("Phase 4A: Redis-backed distributed rate limiting", () => {
  it("initializes a Redis-backed limiter with the CodeGuard key prefix", async () => {
    const { sendCommand, commands } = createInMemoryRedisSendCommand();
    const store = createDistributedRateLimitStore({
      sendCommand,
      isReady: () => true,
    });
    expect(store.prefix).toBe(RATE_LIMIT_KEY_PREFIX);
    expect(RATE_LIMIT_KEY_PREFIX).toBe("codeguard:ratelimit:");

    const app = createLimitedApp(
      createApiRateLimiter({ windowMs: 60_000, limit: 10, store })
    );
    await request(app).get("/ping").expect(200);

    const prefixedKeys = commands
      .map((args) => args.find((part) => part.startsWith(RATE_LIMIT_KEY_PREFIX)))
      .filter((key): key is string => Boolean(key));
    expect(prefixedKeys.length).toBeGreaterThan(0);
    expect(prefixedKeys.every((key) => key.startsWith("codeguard:ratelimit:"))).toBe(true);
  });

  it("uses a shared distributed store so counters persist across middleware instances", async () => {
    const { sendCommand, counters } = createInMemoryRedisSendCommand();
    const storeA = createDistributedRateLimitStore({
      sendCommand,
      isReady: () => true,
    });
    const storeB = createDistributedRateLimitStore({
      sendCommand,
      isReady: () => true,
    });
    const appA = createLimitedApp(createApiRateLimiter({ windowMs: 60_000, limit: 3, store: storeA }));
    const appB = createLimitedApp(createApiRateLimiter({ windowMs: 60_000, limit: 3, store: storeB }));

    await request(appA).get("/ping").set("X-Forwarded-For", "203.0.113.10").expect(200);
    await request(appA).get("/ping").set("X-Forwarded-For", "203.0.113.10").expect(200);
    await request(appB).get("/ping").set("X-Forwarded-For", "203.0.113.10").expect(200);
    const blocked = await request(appB).get("/ping").set("X-Forwarded-For", "203.0.113.10");

    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe("TOO_MANY_REQUESTS");
    expect([...counters.keys()].some((key) => key.startsWith(RATE_LIMIT_KEY_PREFIX))).toBe(true);
  });

  it("emits standard RateLimit headers and returns 429 after the configured limit", async () => {
    const app = createLimitedApp(
      createApiRateLimiter({ windowMs: 60_000, limit: 2, forceMemory: true })
    );

    const first = await request(app).get("/ping").expect(200);
    expect(first.headers["ratelimit-limit"] || first.headers["ratelimit-policy"]).toBeTruthy();
    expect(first.headers["ratelimit-remaining"]).toBeDefined();

    await request(app).get("/ping").expect(200);
    const limited = await request(app).get("/ping");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("TOO_MANY_REQUESTS");
    expect(limited.headers["ratelimit-remaining"] === "0" || limited.status === 429).toBe(true);
  });

  it("tracks different client identities on separate counters", async () => {
    const app = createLimitedApp(
      createApiRateLimiter({ windowMs: 60_000, limit: 1, forceMemory: true })
    );

    await request(app).get("/ping").set("X-Forwarded-For", "198.51.100.1").expect(200);
    const secondSame = await request(app).get("/ping").set("X-Forwarded-For", "198.51.100.1");
    expect(secondSame.status).toBe(429);

    const otherClient = await request(app).get("/ping").set("X-Forwarded-For", "198.51.100.2");
    expect(otherClient.status).toBe(200);
  });

  it("does not put credentials or secrets into Redis keys", async () => {
    const { sendCommand, commands } = createInMemoryRedisSendCommand();
    const store = createDistributedRateLimitStore({
      sendCommand,
      isReady: () => true,
    });
    const app = createLimitedApp(createApiRateLimiter({ windowMs: 60_000, limit: 5, store }));
    const secret = "super-secret-refresh-token-value";

    await request(app)
      .get("/ping")
      .set("Authorization", `Bearer ${secret}`)
      .set("Cookie", `codeguard_refresh_token=${secret}`)
      .set("X-CSRF-Token", secret)
      .set("X-Forwarded-For", "203.0.113.50")
      .expect(200);

    const serialized = JSON.stringify(commands);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("Bearer ");
    expect(serialized.toLowerCase()).not.toContain("csrf");
  });

  it("does not use Authorization headers as the rate-limit identity", () => {
    const req = {
      ip: "203.0.113.9",
      headers: { authorization: "Bearer should-never-be-a-key" },
    } as any;
    expect(buildClientRateLimitKey(req)).toBe("203.0.113.9");
    expect(buildClientRateLimitKey(req)).not.toContain("Bearer");
  });

  it("still enforces limits when Redis is unavailable instead of failing open", async () => {
    const failingSend = async () => {
      throw new Error("ECONNREFUSED redis://:hunter2@redis.internal:6379");
    };
    const store = createDistributedRateLimitStore({
      sendCommand: failingSend,
      isReady: () => false,
    });
    const app = createLimitedApp(createApiRateLimiter({ windowMs: 60_000, limit: 1, store }));

    await request(app).get("/ping").expect(200);
    const limited = await request(app).get("/ping");
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("TOO_MANY_REQUESTS");
  });

  it("falls back to in-memory limits when Redis commands fail while marked ready", async () => {
    const store = createDistributedRateLimitStore({
      sendCommand: async (...args: string[]) => {
        if (args[0]?.toUpperCase() === "SCRIPT") return "mocksha";
        throw new Error("NOSCRIPT");
      },
      isReady: () => true,
    });
    const app = createLimitedApp(createApiRateLimiter({ windowMs: 60_000, limit: 1, store }));

    await request(app).get("/ping").expect(200);
    expect((await request(app).get("/ping")).status).toBe(429);
  });

  it("allows development without REDIS_URL and keeps default rate-limit window/max", () => {
    const parsed = parseEnv({ NODE_ENV: "development" });
    expect(parsed.REDIS_URL).toBeUndefined();
    expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBe(120);
  });

  it("requires a non-loopback REDIS_URL in production", () => {
    const base = {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.codeguard.ai",
      JWT_ACCESS_SECRET: "a-super-secret-access-token-key-for-prod-32bytes",
      JWT_REFRESH_SECRET: "a-super-secret-refresh-token-key-for-prod-32bytes",
      SQLSERVER_PASSWORD: "ProdSqlPassword123!",
    };

    expect(() => parseEnv(base)).toThrowError(/REDIS_URL is required in production/);
    expect(() => parseEnv({ ...base, REDIS_URL: "redis://localhost:6379" })).toThrowError(/must not point to localhost/);
    expect(() => parseEnv({ ...base, REDIS_URL: "http://redis.internal:6379" })).toThrowError(/redis:\/\/ or rediss:\/\//);

    const parsed = parseEnv({ ...base, REDIS_URL: "rediss://redis.internal.codeguard.ai:6379" });
    expect(parsed.REDIS_URL).toBe("rediss://redis.internal.codeguard.ai:6379");
    expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(60_000);
    expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBe(120);
  });

  it("honors explicit rate-limit configuration values", () => {
    const parsed = parseEnv({
      NODE_ENV: "development",
      RATE_LIMIT_WINDOW_MS: "15000",
      RATE_LIMIT_MAX_REQUESTS: "40",
    });
    expect(parsed.RATE_LIMIT_WINDOW_MS).toBe(15_000);
    expect(parsed.RATE_LIMIT_MAX_REQUESTS).toBe(40);
  });

  it("redacts Redis credentials from URLs and log text", () => {
    const url = "rediss://cacheuser:super-secret-redis-pw@redis.internal:6379/0";
    const redacted = redactRedisUrl(url);
    expect(redacted).not.toContain("super-secret-redis-pw");
    expect(redacted).toContain("redacted");

    const logLine = sanitizeRedisLogText(`connect failed ${url} password=super-secret-redis-pw`, url);
    expect(logLine).not.toContain("super-secret-redis-pw");
  });

  it("skips Redis startup when REDIS_URL is not configured", async () => {
    await expect(startRedisClient("")).resolves.toBe("skipped");
  });

  it("does not treat malformed forwarded headers as a bypass", async () => {
    const app = createLimitedApp(
      createApiRateLimiter({ windowMs: 60_000, limit: 1, forceMemory: true })
    );

    await request(app).get("/ping").set("X-Forwarded-For", "not-an-ip, , ::").expect(200);
    const second = await request(app).get("/ping").set("X-Forwarded-For", "not-an-ip, , ::");
    expect(second.status).toBe(429);
  });
});
