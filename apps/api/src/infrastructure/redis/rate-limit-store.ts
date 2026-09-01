import { MemoryStore, type Options, type Store } from "express-rate-limit";
import { RedisStore, type SendCommandFn } from "rate-limit-redis";
import { isRedisReady, logRateLimitDegraded, sendRedisCommand } from "./client.js";

export const RATE_LIMIT_KEY_PREFIX = "codeguard:ratelimit:";

export type RateLimitStoreMode = "redis" | "memory" | "hybrid";

/**
 * Uses Redis when connected; otherwise falls back to a per-process MemoryStore.
 * This is not unlimited: each replica still enforces the configured limit locally.
 * Failover is logged (throttled) and does not open a new Redis connection per request.
 */
export class DegradedRedisRateLimitStore implements Store {
  private redisStore: RedisStore | null = null;
  private storedOptions: Options | null = null;
  private readonly memoryStore: MemoryStore;
  private readonly isReady: () => boolean;
  private readonly sendCommand: SendCommandFn;
  private readonly keyPrefix: string;

  constructor(options: {
    sendCommand: SendCommandFn;
    prefix?: string;
    isReady?: () => boolean;
  }) {
    this.sendCommand = options.sendCommand;
    this.keyPrefix = options.prefix ?? RATE_LIMIT_KEY_PREFIX;
    this.memoryStore = new MemoryStore();
    this.isReady = options.isReady ?? isRedisReady;
  }

  get prefix(): string {
    return this.keyPrefix;
  }

  get redisStoreInstance(): RedisStore {
    return this.ensureRedisStore();
  }

  init(options: Options): void {
    this.storedOptions = options;
    this.redisStore?.init(options);
    this.memoryStore.init(options);
  }

  private ensureRedisStore(): RedisStore {
    if (!this.redisStore) {
      this.redisStore = new RedisStore({
        sendCommand: this.sendCommand,
        prefix: this.keyPrefix,
      });
      if (this.storedOptions) this.redisStore.init(this.storedOptions);
    }
    return this.redisStore;
  }

  private useRedis(): boolean {
    return this.isReady();
  }

  async increment(key: string) {
    if (!this.useRedis()) {
      logRateLimitDegraded("redis unavailable");
      return this.memoryStore.increment(key);
    }
    try {
      return await this.ensureRedisStore().increment(key);
    } catch {
      logRateLimitDegraded("redis command failed");
      return this.memoryStore.increment(key);
    }
  }

  async decrement(key: string) {
    if (!this.useRedis()) {
      await this.memoryStore.decrement(key);
      return;
    }
    try {
      await this.ensureRedisStore().decrement(key);
    } catch {
      logRateLimitDegraded("redis command failed");
      await this.memoryStore.decrement(key);
    }
  }

  async resetKey(key: string) {
    if (!this.useRedis()) {
      await this.memoryStore.resetKey(key);
      return;
    }
    try {
      await this.ensureRedisStore().resetKey(key);
    } catch {
      logRateLimitDegraded("redis command failed");
      await this.memoryStore.resetKey(key);
    }
  }
}

export function createDistributedRateLimitStore(overrides?: {
  sendCommand?: SendCommandFn;
  isReady?: () => boolean;
  prefix?: string;
}): DegradedRedisRateLimitStore {
  return new DegradedRedisRateLimitStore({
    sendCommand: overrides?.sendCommand ?? sendRedisCommand,
    isReady: overrides?.isReady,
    prefix: overrides?.prefix,
  });
}
