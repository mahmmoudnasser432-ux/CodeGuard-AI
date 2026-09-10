import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";
import {
  createPostgresPoolConfig,
  classifyPostgresError,
} from "../src/infrastructure/database/postgres.js";

describe("PostgreSQL Configuration Validation & Dialect Isolation", () => {
  const baseValidProdSqlServerEnv = {
    NODE_ENV: "production",
    API_URL: "https://api.codeguardai.com",
    AI_SERVICE_URL: "http://ai-service:8000",
    FRONTEND_URL: "https://app.codeguardai.com",
    JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef",
    JWT_REFRESH_SECRET: "fedcba9876543210fedcba9876543210",
    SQLSERVER_HOST: "sql.internal.codeguardai.com",
    SQLSERVER_PORT: "1433",
    SQLSERVER_DATABASE: "CodeGuardAI",
    SQLSERVER_USER: "codeguard_app",
    SQLSERVER_PASSWORD: "StrongProductionDBPassword#123",
    REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
  };

  const baseValidProdPostgresEnv = {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    API_URL: "https://api.codeguardai.com",
    AI_SERVICE_URL: "http://ai-service:8000",
    FRONTEND_URL: "https://app.codeguardai.com",
    JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef",
    JWT_REFRESH_SECRET: "fedcba9876543210fedcba9876543210",
    POSTGRES_HOST: "ep-demo-12345.us-east-2.aws.neon.tech",
    POSTGRES_PORT: "5432",
    POSTGRES_DATABASE: "neondb",
    POSTGRES_USER: "codeguard_pg_user",
    POSTGRES_PASSWORD: "StrongPostgresPassword#123",
    POSTGRES_SSL: "true",
    REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
  };

  it("defaults to DB_DIALECT=sqlserver and preserves SQL Server validation without requiring PostgreSQL vars", () => {
    const parsed = parseEnv(baseValidProdSqlServerEnv);
    expect(parsed.DB_DIALECT).toBe("sqlserver");
    expect(parsed.POSTGRES_HOST).toBeUndefined();
    expect(parsed.SQLSERVER_PASSWORD).toBe("StrongProductionDBPassword#123");
  });

  it("enforces SQL Server production validation when DB_DIALECT=sqlserver", () => {
    // Missing SQLSERVER_PASSWORD
    expect(() =>
      parseEnv({
        ...baseValidProdSqlServerEnv,
        SQLSERVER_PASSWORD: "",
      })
    ).toThrowError(/SQLSERVER_PASSWORD is required in production/);

    // SQLSERVER_ENCRYPT disabled
    expect(() =>
      parseEnv({
        ...baseValidProdSqlServerEnv,
        SQLSERVER_ENCRYPT: "false",
      })
    ).toThrowError(/SQLSERVER_ENCRYPT must be true in production/);

    // SQLSERVER_TRUST_SERVER_CERTIFICATE enabled in prod
    expect(() =>
      parseEnv({
        ...baseValidProdSqlServerEnv,
        SQLSERVER_TRUST_SERVER_CERTIFICATE: "true",
      })
    ).toThrowError(/SQLSERVER_TRUST_SERVER_CERTIFICATE must be false in production/);
  });

  it("accepts valid production PostgreSQL settings when DB_DIALECT=postgres", () => {
    const parsed = parseEnv(baseValidProdPostgresEnv);
    expect(parsed.DB_DIALECT).toBe("postgres");
    expect(parsed.POSTGRES_HOST).toBe("ep-demo-12345.us-east-2.aws.neon.tech");
    expect(parsed.POSTGRES_SSL).toBe(true);
    expect(parsed.POSTGRES_POOL_MAX).toBe(10);
  });

  it("does not require SQL Server credentials or TLS flags in production when DB_DIALECT=postgres", () => {
    const parsed = parseEnv({
      ...baseValidProdPostgresEnv,
      SQLSERVER_PASSWORD: "",
      SQLSERVER_ENCRYPT: "false",
      SQLSERVER_TRUST_SERVER_CERTIFICATE: "true",
    });
    expect(parsed.DB_DIALECT).toBe("postgres");
  });

  it("rejects production PostgreSQL when required PostgreSQL env vars are missing or empty", () => {
    // Missing POSTGRES_HOST
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_HOST: "",
      })
    ).toThrowError(/POSTGRES_HOST is required in production/);

    // Missing POSTGRES_DATABASE
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_DATABASE: "",
      })
    ).toThrowError(/POSTGRES_DATABASE is required in production/);

    // Missing POSTGRES_USER
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_USER: "",
      })
    ).toThrowError(/POSTGRES_USER is required in production/);

    // Missing POSTGRES_PASSWORD
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_PASSWORD: "",
      })
    ).toThrowError(/POSTGRES_PASSWORD is required in production/);
  });

  it("rejects production PostgreSQL when POSTGRES_HOST is localhost or 127.0.0.1", () => {
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_HOST: "localhost",
      })
    ).toThrowError(/POSTGRES_HOST must not point to localhost in production/);

    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_HOST: "127.0.0.1",
      })
    ).toThrowError(/POSTGRES_HOST must not point to localhost in production/);
  });

  it("allows localhost POSTGRES_HOST in development and test environments", () => {
    const devEnv = {
      NODE_ENV: "development",
      DB_DIALECT: "postgres",
      POSTGRES_HOST: "localhost",
      POSTGRES_DATABASE: "codeguard_dev",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "dev_password",
    };
    const parsed = parseEnv(devEnv);
    expect(parsed.POSTGRES_HOST).toBe("localhost");
    expect(parsed.NODE_ENV).toBe("development");
  });

  it("rejects production PostgreSQL when POSTGRES_SSL is disabled (false)", () => {
    expect(() =>
      parseEnv({
        ...baseValidProdPostgresEnv,
        POSTGRES_SSL: "false",
      })
    ).toThrowError(/POSTGRES_SSL must be true in production/);
  });

  it("generates correct pg.PoolConfig matching environment settings", () => {
    const parsed = parseEnv(baseValidProdPostgresEnv);
    const poolConfig = createPostgresPoolConfig(parsed as any);

    expect(poolConfig.host).toBe("ep-demo-12345.us-east-2.aws.neon.tech");
    expect(poolConfig.port).toBe(5432);
    expect(poolConfig.database).toBe("neondb");
    expect(poolConfig.user).toBe("codeguard_pg_user");
    expect(poolConfig.password).toBe("StrongPostgresPassword#123");
    expect(poolConfig.max).toBe(10);
    expect(poolConfig.ssl).toEqual({ rejectUnauthorized: true });
  });
});

describe("Runtime Selection Boundary (Phase 6C-3 DI Wiring)", () => {
  it("defaults application runtime to SQL Server and keeps PostgreSQL support additive-only", async () => {
    const { createApp } = await import("../src/app.js");
    const instance = createApp();
    expect(instance).toBeDefined();
    expect(instance.app).toBeDefined();
    expect(instance.dbDialect).toBe("sqlserver");
    expect(instance.postgresPool).toBeUndefined();
  }, 30000);

  it("requires valid configuration or shared pool when dbDialect=postgres", async () => {
    const { createApp } = await import("../src/app.js");
    // Without valid POSTGRES_HOST / POSTGRES_DATABASE or pool, fails safely
    const devEnv = {
      ...process.env,
      DB_DIALECT: "postgres",
      POSTGRES_HOST: "",
      POSTGRES_DATABASE: "",
      DATABASE_URL: "",
    };
    expect(() =>
      createApp({
        dbDialect: "postgres",
        envConfig: devEnv as any,
      })
    ).toThrowError(/Incomplete PostgreSQL configuration/);
  }, 30000);

  it("successfully instantiates all repositories with shared pg.Pool when dbDialect=postgres", async () => {
    const { createApp } = await import("../src/app.js");
    const mockPool = {
      query: async () => ({ rows: [{ is_ready: 1 }] }),
    } as any;

    const instance = createApp({ dbDialect: "postgres", postgresPool: mockPool });
    expect(instance).toBeDefined();
    expect(instance.dbDialect).toBe("postgres");
    expect(instance.postgresPool).toBe(mockPool);
    expect(instance.userRepository).toBeDefined();
    expect(instance.projectRepository).toBeDefined();
    expect(instance.interviewRepository).toBeDefined();
  }, 30000);
});

describe("PostgreSQL Error Diagnostics & Credential Sanitization", () => {
  it("sanitizes plaintext passwords and connection URLs from error messages", () => {
    const rawError = new Error(
      "Connection failed for postgresql://admin:superSecret123@ep-xyz.aws.neon.tech/db with password=superSecret123"
    );

    const diagnostic = classifyPostgresError(rawError);

    expect(diagnostic.sanitizedMessage).not.toContain("superSecret123");
    expect(diagnostic.sanitizedMessage).toContain("[REDACTED]");
  });

  it("classifies authentication failures (code 28P01 / 28000)", () => {
    const authError = {
      code: "28P01",
      message: "password authentication failed for user codeguard",
    };
    const diagnostic = classifyPostgresError(authError);
    expect(diagnostic.category).toBe("AUTHENTICATION_FAILED");
  });

  it("classifies network timeout and connection refused errors", () => {
    const timeoutError = {
      code: "ETIMEDOUT",
      message: "connect ETIMEDOUT 52.12.34.56:5432",
    };
    const diagnostic = classifyPostgresError(timeoutError);
    expect(diagnostic.category).toBe("NETWORK_OR_FIREWALL_TIMEOUT");
  });

  it("classifies missing database errors (code 3D000)", () => {
    const dbError = {
      code: "3D000",
      message: 'database "unknown_db" does not exist',
    };
    const diagnostic = classifyPostgresError(dbError);
    expect(diagnostic.category).toBe("DATABASE_NOT_FOUND");
  });

  it("classifies connection termination and closed connection errors (code 57P01)", () => {
    const closedError = {
      code: "57P01",
      message: "terminating connection due to administrator command",
    };
    const diagnostic = classifyPostgresError(closedError);
    expect(diagnostic.category).toBe("CONNECTION_CLOSED");
  });

  it("sanitizes quoted secrets, bearer tokens, and api_key params from diagnostics", () => {
    const complexError = new Error(
      `Failed to connect with password = 'verySecretPassword123' and token="jwt-token-val-456" and apiKey = secret_api_key_789`
    );
    const diagnostic = classifyPostgresError(complexError);
    expect(diagnostic.sanitizedMessage).not.toContain("verySecretPassword123");
    expect(diagnostic.sanitizedMessage).not.toContain("jwt-token-val-456");
    expect(diagnostic.sanitizedMessage).not.toContain("secret_api_key_789");
    expect(diagnostic.sanitizedMessage).toContain("[REDACTED]");
  });
});
