import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { createPoolConfig } from "../src/infrastructure/database/sqlserver.js";

describe("SQL Server Database Connection & TLS Hardening", () => {
  const baseValidProdEnv = {
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
  };

  // Requirement 1: production + unset trustServerCertificate -> false
  it("defaults trustServerCertificate to false in production when unset", () => {
    const parsed = parseEnv(baseValidProdEnv);
    const poolConfig = createPoolConfig(parsed as any);

    expect(parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE).toBe(false);
    expect(poolConfig.options?.trustServerCertificate).toBe(false);
    expect(poolConfig.options?.encrypt).toBe(true);
  });

  // Requirement 2: production + false -> accepted
  it("accepts trustServerCertificate=false in production", () => {
    const parsed = parseEnv({
      ...baseValidProdEnv,
      SQLSERVER_TRUST_SERVER_CERTIFICATE: "false",
    });
    const poolConfig = createPoolConfig(parsed as any);

    expect(parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE).toBe(false);
    expect(poolConfig.options?.trustServerCertificate).toBe(false);
  });

  // Requirement 3: production + true -> rejected
  it("rejects trustServerCertificate=true in production", () => {
    expect(() =>
      parseEnv({
        ...baseValidProdEnv,
        SQLSERVER_TRUST_SERVER_CERTIFICATE: "true",
      })
    ).toThrowError(/SQLSERVER_TRUST_SERVER_CERTIFICATE must be false in production/);
  });

  // Requirement 4: development + true -> accepted
  it("accepts trustServerCertificate=true in development", () => {
    const devEnv = {
      NODE_ENV: "development",
      SQLSERVER_PASSWORD: "dev_password",
      SQLSERVER_TRUST_SERVER_CERTIFICATE: "true",
    };
    const parsed = parseEnv(devEnv);
    const poolConfig = createPoolConfig(parsed as any);

    expect(parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE).toBe(true);
    expect(poolConfig.options?.trustServerCertificate).toBe(true);
  });

  // Requirement 5: encrypt=false in production -> rejected
  it("rejects encrypt=false in production", () => {
    expect(() =>
      parseEnv({
        ...baseValidProdEnv,
        SQLSERVER_ENCRYPT: "false",
      })
    ).toThrowError(/SQLSERVER_ENCRYPT must be true in production/);
  });

  it("fails production validation if SQLSERVER_PASSWORD is empty or missing", () => {
    expect(() =>
      parseEnv({
        ...baseValidProdEnv,
        SQLSERVER_PASSWORD: "",
      })
    ).toThrowError(/SQLSERVER_PASSWORD is required in production/);
  });

  it("configures explicit production timeouts and pool sizing", () => {
    const parsed = parseEnv({
      ...baseValidProdEnv,
      SQLSERVER_CONNECTION_TIMEOUT: "10000",
      SQLSERVER_REQUEST_TIMEOUT: "20000",
      SQLSERVER_POOL_MIN: "5",
      SQLSERVER_POOL_MAX: "30",
      SQLSERVER_POOL_IDLE_TIMEOUT: "45000",
    });
    const poolConfig = createPoolConfig(parsed as any);

    expect(poolConfig.connectionTimeout).toBe(10000);
    expect(poolConfig.requestTimeout).toBe(20000);
    expect(poolConfig.options?.connectTimeout).toBe(10000);
    expect(poolConfig.options?.requestTimeout).toBe(20000);
    expect(poolConfig.pool?.min).toBe(5);
    expect(poolConfig.pool?.max).toBe(30);
    expect(poolConfig.pool?.idleTimeoutMillis).toBe(45000);
  });

  it("defaults pool.min to 2 in production and 0 in development", () => {
    const prodParsed = parseEnv(baseValidProdEnv);
    const prodConfig = createPoolConfig(prodParsed as any);
    expect(prodConfig.pool?.min).toBe(2);

    const devParsed = parseEnv({ NODE_ENV: "development" });
    const devConfig = createPoolConfig(devParsed as any);
    expect(devConfig.pool?.min).toBe(0);
  });
});