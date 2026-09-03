import { describe, it, expect } from "vitest";
import { parseEnv } from "../src/config/env.js";
import { createPoolConfig, classifySqlError } from "../src/infrastructure/database/sqlserver.js";

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
    REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
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

  describe("Phase 6A: Managed Cloud / Azure SQL Database Compatibility", () => {
    it("configures standard Azure SQL Database endpoint with strict TLS", () => {
      const azureEnv = {
        ...baseValidProdEnv,
        SQLSERVER_HOST: "codeguard-prod-sql.database.windows.net",
        SQLSERVER_PORT: "1433",
        SQLSERVER_DATABASE: "codeguard-db",
        SQLSERVER_USER: "codeguard_admin",
        SQLSERVER_ENCRYPT: "true",
        SQLSERVER_TRUST_SERVER_CERTIFICATE: "false",
      };

      const parsed = parseEnv(azureEnv);
      const poolConfig = createPoolConfig(parsed as any);

      expect(parsed.SQLSERVER_HOST).toBe("codeguard-prod-sql.database.windows.net");
      expect(poolConfig.server).toBe("codeguard-prod-sql.database.windows.net");
      expect(poolConfig.port).toBe(1433);
      expect(poolConfig.database).toBe("codeguard-db");
      expect(poolConfig.options?.encrypt).toBe(true);
      expect(poolConfig.options?.trustServerCertificate).toBe(false);
    });

    it("propagates optional SQLSERVER_SERVER_NAME when connection endpoint differs from certificate FQDN", () => {
      const customSanEnv = {
        ...baseValidProdEnv,
        SQLSERVER_HOST: "custom-db-proxy.internal.codeguardai.com",
        SQLSERVER_SERVER_NAME: "codeguard-prod-sql.database.windows.net",
      };

      const parsed = parseEnv(customSanEnv);
      const poolConfig = createPoolConfig(parsed as any);

      expect(parsed.SQLSERVER_SERVER_NAME).toBe("codeguard-prod-sql.database.windows.net");
      expect(poolConfig.options?.serverName).toBe("codeguard-prod-sql.database.windows.net");
    });

    it("omits serverName option when SQLSERVER_SERVER_NAME is not configured", () => {
      const parsed = parseEnv(baseValidProdEnv);
      const poolConfig = createPoolConfig(parsed as any);

      expect(poolConfig.options?.serverName).toBeUndefined();
    });
  });

  describe("Sanitized SQL Error Classification & Diagnostics", () => {
    it("classifies TLS certificate verification errors and preserves safe metadata", () => {
      const tlsError = {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
        message: "Hostname/IP does not match certificate's altnames: Host: custom-db-proxy is not in the cert's list",
      };

      const result = classifySqlError(tlsError, baseValidProdEnv as any);

      expect(result.category).toBe("TLS_CERTIFICATE_ERROR");
      expect(result.sanitizedMessage).toContain("Hostname/IP does not match");
      expect(result.safeMetadata.host).toBe("sql.internal.codeguardai.com");
      expect(result.safeMetadata.database).toBe("CodeGuardAI");
      expect(result.safeMetadata.encrypt).toBe(true);
      expect(result.safeMetadata.trustServerCertificate).toBe(false);
      expect((result.safeMetadata as any).password).toBeUndefined();
    });

    it("classifies network timeout / firewall rejection errors", () => {
      const timeoutError = {
        code: "ETIMEOUT",
        message: "Failed to connect to codeguard-prod-sql.database.windows.net:1433 - connect ETIMEDOUT",
      };

      const result = classifySqlError(timeoutError, baseValidProdEnv as any);

      expect(result.category).toBe("NETWORK_OR_FIREWALL_TIMEOUT");
      expect(result.safeMetadata.errorCode).toBe("ETIMEOUT");
    });

    it("classifies authentication failures and redacts any credential substrings", () => {
      const authError = {
        code: "ELOGIN",
        message: "Login failed for user 'codeguard_app'. Password=SuperSecretPassword123!; Connection failed",
      };

      const result = classifySqlError(authError, baseValidProdEnv as any);

      expect(result.category).toBe("AUTHENTICATION_FAILED");
      expect(result.sanitizedMessage).not.toContain("SuperSecretPassword123!");
      expect(result.sanitizedMessage).toContain("Password=[REDACTED]");
    });

    it("classifies database not found errors", () => {
      const dbError = {
        code: "EDATABASE",
        message: "Cannot open database 'NonExistentDB' requested by the login.",
      };

      const result = classifySqlError(dbError, baseValidProdEnv as any);

      expect(result.category).toBe("DATABASE_NOT_FOUND");
    });
  });
});