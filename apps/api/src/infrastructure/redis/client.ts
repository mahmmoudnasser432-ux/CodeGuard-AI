import { createClient } from "redis";
import pino from "pino";
import { env } from "../../config/env.js";

const logger = pino({ name: "codeguard-redis" });

const MAX_RECONNECT_DELAY_MS = 5_000;

let client: ReturnType<typeof createClient> | null = null;
let shuttingDown = false;
let lastDegradedLogAt = 0;

export type RedisHealthStatus = "healthy" | "disconnected" | "not_configured" | "connecting";

export function redactRedisUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = "redacted";
    if (parsed.username) parsed.username = "redacted";
    return parsed.toString();
  } catch {
    return "[unparseable-redis-url]";
  }
}

export function sanitizeRedisLogText(text: string, redisUrl?: string): string {
  let sanitized = text;
  if (redisUrl) {
    sanitized = sanitized.split(redisUrl).join(redactRedisUrl(redisUrl));
    try {
      const parsed = new URL(redisUrl);
      if (parsed.password) sanitized = sanitized.split(parsed.password).join("[redacted]");
      if (parsed.username && parsed.username !== "default") {
        sanitized = sanitized.split(parsed.username).join("[redacted]");
      }
    } catch {
      // ignore unparseable URLs
    }
  }
  return sanitized;
}

export function isRedisReady(): boolean {
  return client?.isReady === true;
}

export function getRedisClient(): ReturnType<typeof createClient> | null {
  return client;
}

export function getRedisHealth(): RedisHealthStatus {
  if (!env.REDIS_URL) return "not_configured";
  if (client?.isReady === true) return "healthy";
  if (client?.isOpen === true) return "connecting";
  return "disconnected";
}

export function logRateLimitDegraded(reason: string): void {
  const now = Date.now();
  if (now - lastDegradedLogAt < 30_000) return;
  lastDegradedLogAt = now;
  logger.warn(
    { redis: getRedisHealth() },
    `Rate limiting degraded to in-memory store (${reason}). Limits remain enforced per process, not across replicas.`
  );
}

function reconnectDelay(attempt: number): number {
  return Math.min(200 * 2 ** Math.min(attempt, 6), MAX_RECONNECT_DELAY_MS);
}

export async function startRedisClient(redisUrl = env.REDIS_URL): Promise<"connected" | "skipped" | "failed"> {
  if (!redisUrl) {
    logger.warn(
      "REDIS_URL is not set; API rate limiting uses an in-memory store and is not distributed across replicas."
    );
    return "skipped";
  }

  if (client?.isReady) return "connected";

  shuttingDown = false;
  try {
    client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (shuttingDown) return false;
          return reconnectDelay(retries);
        },
        connectTimeout: 5_000,
      },
    });

    client.on("error", (err: Error) => {
      logger.warn(
        { err: sanitizeRedisLogText(err.message, redisUrl) },
        "Redis client error; distributed rate limiting may be degraded."
      );
    });

    client.on("ready", () => {
      logger.info({ redis: redactRedisUrl(redisUrl) }, "Redis connected for distributed rate limiting.");
    });

    await Promise.race([
      client.connect().catch((err) => {
        logger.warn(
          { err: sanitizeRedisLogText(err instanceof Error ? err.message : String(err), redisUrl) },
          "Initial Redis connection failed; will retry in background. In-memory fallback is active."
        );
      }),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);

    return isRedisReady() ? "connected" : "failed";
  } catch (err) {
    logger.warn(
      { err: sanitizeRedisLogText(err instanceof Error ? err.message : String(err), redisUrl) },
      "Redis initialization error. In-memory fallback is active."
    );
    return "failed";
  }
}

export async function stopRedisClient(): Promise<void> {
  shuttingDown = true;
  const current = client;
  client = null;
  if (!current) return;
  try {
    await current.quit();
  } catch {
    try {
      await current.disconnect();
    } catch {
      // ignore shutdown races
    }
  }
}

export async function sendRedisCommand(...args: string[]): Promise<string | number | boolean | Array<string | number | boolean>> {
  if (!client?.isReady) {
    throw new Error("Redis is not connected");
  }
  return client.sendCommand(args) as Promise<string | number | boolean | Array<string | number | boolean>>;
}
