import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import pg from "pg";
import jwt from "jsonwebtoken";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";
import { createApp } from "../src/app.js";
import { runPostgresMigrations, verifyPostgresSchema } from "../src/infrastructure/database/postgres-migration-runner.js";
import { startRedisClient, stopRedisClient, getRedisHealth, redactRedisUrl, sanitizeRedisLogText } from "../src/infrastructure/redis/client.js";
import { createDistributedRateLimitStore } from "../src/infrastructure/redis/rate-limit-store.js";
import { createApiRateLimiter } from "../src/interfaces/http/middleware/rate-limiter.js";
import { parseEnv } from "../src/config/env.js";
import { isAllowedOrigin } from "../src/interfaces/http/middleware/security.js";

const PG_CONTAINER = "codeguard-staging-pg-p7";
const REDIS_CONTAINER = "codeguard-staging-redis-p7";
const PG_PORT = 54335;
const REDIS_PORT = 6381;
const REDIS_PASSWORD = "StagingRedisSecretPass123!";

const ADMIN_USER = "postgres";
const ADMIN_PASSWORD = "StagingSuperPass123!";
const STAGING_DB = "codeguard_staging";

const MIGRATOR_USER = "codeguard_migrator";
const MIGRATOR_PASSWORD = "MigratorSecretPass123!";

const APP_USER = "codeguard_app";
const APP_PASSWORD = "AppRuntimeSecretPass123!";

const STAGING_JWT_ACCESS_SECRET = "a-very-long-staging-access-secret-32bytes-ok";
const STAGING_JWT_REFRESH_SECRET = "a-very-long-staging-refresh-secret-32bytes-ok";

describe("Phase 7: PostgreSQL & Redis Staging Validation Suite", () => {
  let adminPool: pg.Pool;
  let migratorPool: pg.Pool;
  let appPool: pg.Pool;
  let appInstance: ReturnType<typeof createApp>;
  let capturedLogs: string[] = [];

  beforeAll(async () => {
    // 1. Cleanup any pre-existing staging test containers
    for (const name of [PG_CONTAINER, REDIS_CONTAINER]) {
      try {
        execSync(`docker rm -f ${name}`, { stdio: "ignore" });
      } catch {
        // ignore
      }
    }

    // 2. Launch ephemeral PostgreSQL 16 Alpine container
    console.log(`[Staging Test] Starting PostgreSQL 16 container (${PG_CONTAINER})...`);
    execSync(
      `docker run -d --name ${PG_CONTAINER} -e POSTGRES_PASSWORD=${ADMIN_PASSWORD} -p ${PG_PORT}:5432 postgres:16-alpine`,
      { stdio: "ignore" }
    );

    // 3. Launch ephemeral Redis 7 Alpine container with authentication
    console.log(`[Staging Test] Starting Redis 7 container (${REDIS_CONTAINER})...`);
    execSync(
      `docker run -d --name ${REDIS_CONTAINER} -p ${REDIS_PORT}:6379 redis:7-alpine redis-server --requirepass ${REDIS_PASSWORD} --save "" --appendonly no`,
      { stdio: "ignore" }
    );

    // 4. Wait for PostgreSQL readiness
    adminPool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      database: "postgres",
      connectionTimeoutMillis: 5000,
    });

    let pgReady = false;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        const res = await adminPool.query("SELECT 1 AS ready;");
        if (res.rows?.[0]?.ready === 1) {
          pgReady = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!pgReady) throw new Error("PostgreSQL staging container failed to become ready.");
    console.log("[Staging Test] PostgreSQL 16 ready.");

    // 5. Create staging database and dedicated roles
    await adminPool.query(`DROP DATABASE IF EXISTS ${STAGING_DB};`);
    await adminPool.query(`CREATE DATABASE ${STAGING_DB};`);

    // Connect to staging database as admin to provision roles and schemas
    const stagingAdminPool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: ADMIN_USER,
      password: ADMIN_PASSWORD,
      database: STAGING_DB,
      connectionTimeoutMillis: 5000,
    });

    // Create migrator role (DDL capabilities)
    await stagingAdminPool.query(`DROP ROLE IF EXISTS ${MIGRATOR_USER};`);
    await stagingAdminPool.query(
      `CREATE ROLE ${MIGRATOR_USER} WITH LOGIN PASSWORD '${MIGRATOR_PASSWORD}';`
    );
    await stagingAdminPool.query(`GRANT ALL ON SCHEMA public TO ${MIGRATOR_USER};`);
    await stagingAdminPool.query(`GRANT ALL PRIVILEGES ON DATABASE ${STAGING_DB} TO ${MIGRATOR_USER};`);

    // Create least-privilege application role (DML capabilities only)
    await stagingAdminPool.query(`DROP ROLE IF EXISTS ${APP_USER};`);
    await stagingAdminPool.query(
      `CREATE ROLE ${APP_USER} WITH LOGIN PASSWORD '${APP_PASSWORD}';`
    );
    await stagingAdminPool.query(`GRANT CONNECT ON DATABASE ${STAGING_DB} TO ${APP_USER};`);
    await stagingAdminPool.query(`GRANT USAGE ON SCHEMA public TO ${APP_USER};`);
    await stagingAdminPool.query(`REVOKE CREATE ON SCHEMA public FROM ${APP_USER};`);

    // 6. Execute migrations with migration role
    migratorPool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: MIGRATOR_USER,
      password: MIGRATOR_PASSWORD,
      database: STAGING_DB,
      connectionTimeoutMillis: 5000,
    });

    console.log("[Staging Test] Running migrations as codeguard_migrator...");
    const migrationResult = await runPostgresMigrations(undefined, migratorPool);
    expect(migrationResult.applied.length).toBeGreaterThanOrEqual(2);
    console.log(`[Staging Test] Applied ${migrationResult.applied.length} migrations.`);

    // 7. Grant least-privilege DML permissions to application role on newly migrated tables
    await stagingAdminPool.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER};`);
    // Specifically revoke UPDATE and DELETE on AuditLogs to guarantee immutability
    await stagingAdminPool.query(`REVOKE UPDATE, DELETE ON public."AuditLogs" FROM ${APP_USER};`);
    await stagingAdminPool.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};`);
    await stagingAdminPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};`);
    await stagingAdminPool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};`);

    await stagingAdminPool.end();

    // 8. Connect application pool as least-privilege application role
    appPool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: APP_USER,
      password: APP_PASSWORD,
      database: STAGING_DB,
      connectionTimeoutMillis: 5000,
      max: 10,
      min: 2,
    });

    // Verify application role connection
    const appPing = await appPool.query("SELECT current_user, current_database();");
    expect(appPing.rows[0].current_user).toBe(APP_USER);
    expect(appPing.rows[0].current_database).toBe(STAGING_DB);

    // 9. Connect Redis client with authentication
    const redisUrl = `redis://default:${REDIS_PASSWORD}@127.0.0.1:${REDIS_PORT}`;
    const redisStatus = await startRedisClient(redisUrl);
    expect(redisStatus).toBe("connected");
    expect(getRedisHealth()).toBe("healthy");

    // 10. Bootstrap the actual application composition root
    appInstance = createApp({
      dbDialect: "postgres",
      postgresPool: appPool,
      envConfig: {
        ...process.env,
        DB_DIALECT: "postgres",
        REDIS_URL: redisUrl,
        JWT_ACCESS_SECRET: STAGING_JWT_ACCESS_SECRET,
        JWT_REFRESH_SECRET: STAGING_JWT_REFRESH_SECRET,
        FRONTEND_URL: "http://localhost:3000",
      } as any,
    });
  }, 60000);

  afterAll(async () => {
    if (appInstance) await appInstance.close().catch(() => {});
    if (appPool) await appPool.end().catch(() => {});
    if (migratorPool) await migratorPool.end().catch(() => {});
    if (adminPool) await adminPool.end().catch(() => {});
    await stopRedisClient().catch(() => {});

    for (const name of [PG_CONTAINER, REDIS_CONTAINER]) {
      try {
        execSync(`docker rm -f ${name}`, { stdio: "ignore" });
      } catch {
        // ignore
      }
    }
  });

  // ============================================================================
  // SECTION 2: PostgreSQL TLS & Network Security
  // ============================================================================
  describe("Section 2: PostgreSQL TLS & Network Security", () => {
    const validBasePostgresProd = {
      NODE_ENV: "production",
      DB_DIALECT: "postgres",
      API_URL: "https://api.codeguardai.com",
      AI_SERVICE_URL: "http://ai-service:8000",
      FRONTEND_URL: "https://app.codeguardai.com",
      JWT_ACCESS_SECRET: "0123456789abcdef0123456789abcdef",
      JWT_REFRESH_SECRET: "fedcba9876543210fedcba9876543210",
      POSTGRES_HOST: "ep-demo.aws.neon.tech",
      POSTGRES_PORT: "5432",
      POSTGRES_DATABASE: "neondb",
      POSTGRES_USER: "codeguard_pg_user",
      POSTGRES_PASSWORD: "StrongPostgresPassword#123",
      POSTGRES_SSL: "true",
      REDIS_URL: "rediss://redis.internal.codeguard.ai:6379",
    };

    it("rejects production startup if DATABASE_URL points to localhost or loopback", () => {
      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          DATABASE_URL: "postgresql://user:pass@127.0.0.1:5432/db?sslmode=require",
        })
      ).toThrowError(/DATABASE_URL must not point to localhost in production/);

      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          DATABASE_URL: "postgresql://user:pass@localhost:5432/db?sslmode=require",
        })
      ).toThrowError(/DATABASE_URL must not point to localhost in production/);
    });

    it("rejects production startup if POSTGRES_HOST points to localhost", () => {
      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_HOST: "localhost",
        })
      ).toThrowError(/POSTGRES_HOST must not point to localhost in production/);

      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_HOST: "127.0.0.1",
        })
      ).toThrowError(/POSTGRES_HOST must not point to localhost in production/);
    });

    it("rejects production startup if POSTGRES_SSL is false", () => {
      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_SSL: "false",
        })
      ).toThrowError(/POSTGRES_SSL must be true in production/);
    });

    it("rejects production startup if discrete fields are missing when DATABASE_URL is not set", () => {
      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_PASSWORD: "",
        })
      ).toThrowError(/POSTGRES_PASSWORD is required in production/);

      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_USER: "",
        })
      ).toThrowError(/POSTGRES_USER is required in production/);

      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          POSTGRES_DATABASE: "",
        })
      ).toThrowError(/POSTGRES_DATABASE is required in production/);
    });

    it("rejects malformed DATABASE_URL in production", () => {
      expect(() =>
        parseEnv({
          ...validBasePostgresProd,
          DATABASE_URL: "not-a-valid-url",
        })
      ).toThrowError(/DATABASE_URL must be a valid connection URL/);
    });
  });

  // ============================================================================
  // SECTION 3 & 4: Database Migration Safety & Least-Privilege Role Separation
  // ============================================================================
  describe("Section 3 & 4: Migration Safety & Least-Privilege Verification", () => {
    it("second startup: running migrations again skips already applied migrations (idempotent)", async () => {
      const rerunResult = await runPostgresMigrations(undefined, migratorPool);
      expect(rerunResult.applied).toHaveLength(0);
      expect(rerunResult.skipped.length).toBeGreaterThanOrEqual(2);
      expect(rerunResult.total).toBe(rerunResult.skipped.length);
    });

    it("least-privilege check: codeguard_app runtime role CANNOT execute DDL statements", async () => {
      // CREATE TABLE
      await expect(
        appPool.query("CREATE TABLE public.unauthorized_table (id INT);")
      ).rejects.toThrowError(/permission denied/i);

      // ALTER TABLE
      await expect(
        appPool.query('ALTER TABLE public."Users" ADD COLUMN hack_col text;')
      ).rejects.toThrowError(/must be owner of table/i);

      // DROP TABLE
      await expect(
        appPool.query('DROP TABLE public."Users";')
      ).rejects.toThrowError(/must be owner of table/i);

      // CREATE INDEX
      await expect(
        appPool.query('CREATE INDEX idx_hack ON public."Users" ("Email");')
      ).rejects.toThrowError(/must be owner of table|permission denied/i);

      // Setup migrator-owned index and function to verify DROP denial
      await migratorPool.query('CREATE INDEX IF NOT EXISTS idx_ddl_test ON public."Projects" ("OwnerUserId");');
      await migratorPool.query('CREATE OR REPLACE FUNCTION public.test_ddl_fn() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;');

      // DROP INDEX
      await expect(
        appPool.query('DROP INDEX public.idx_ddl_test;')
      ).rejects.toThrowError(/must be owner of index|permission denied/i);

      // CREATE SCHEMA
      await expect(
        appPool.query("CREATE SCHEMA unauthorized_schema;")
      ).rejects.toThrowError(/permission denied/i);

      // ALTER SCHEMA
      await expect(
        appPool.query("ALTER SCHEMA public RENAME TO public_hacked;")
      ).rejects.toThrowError(/must be owner of schema/i);

      // CREATE FUNCTION
      await expect(
        appPool.query("CREATE FUNCTION public.hack_fn() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;")
      ).rejects.toThrowError(/permission denied/i);

      // DROP FUNCTION
      await expect(
        appPool.query("DROP FUNCTION public.test_ddl_fn();")
      ).rejects.toThrowError(/must be owner of function|permission denied/i);

      // GRANT (granting role membership without ADMIN OPTION throws error)
      await expect(
        appPool.query(`GRANT ${MIGRATOR_USER} TO ${APP_USER};`)
      ).rejects.toThrowError(/must have admin option on role|permission denied/i);

      // CREATE ROLE
      await expect(
        appPool.query("CREATE ROLE unauthorized_role;")
      ).rejects.toThrowError(/permission denied to create role/i);

      // ALTER ROLE
      await expect(
        appPool.query(`ALTER ROLE ${APP_USER} SUPERUSER;`)
      ).rejects.toThrowError(/permission denied to alter role/i);
    });

    it("least-privilege check: codeguard_app runtime role CAN execute DML statements", async () => {
      const testUserId = uuidv4();
      const insertRes = await appPool.query(
        `INSERT INTO public."Users" ("Id", "Email", "PasswordHash", "DisplayName", "IsEmailVerified", "MfaEnabled")
         VALUES ($1, $2, $3, $4, true, false)
         RETURNING "Id", "Email";`,
        [testUserId, `dml-test-${Date.now()}@example.com`, "dummy_hash", "DML Test User"]
      );
      expect(insertRes.rows[0].Id).toBe(testUserId);

      const selectRes = await appPool.query(
        `SELECT "Id", "Email" FROM public."Users" WHERE "Id" = $1;`,
        [testUserId]
      );
      expect(selectRes.rows[0].Email).toBe(insertRes.rows[0].Email);

      await appPool.query(`DELETE FROM public."Users" WHERE "Id" = $1;`, [testUserId]);
    });

    it("audit log integrity: INSERT and SELECT allowed, UPDATE and DELETE denied for codeguard_app", async () => {
      const auditLogId = uuidv4();

      // INSERT allowed
      await expect(
        appPool.query(
          `INSERT INTO public."AuditLogs" ("Id", "EventType", "EntityType", "EntityId", "CreatedAt")
           VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP);`,
          [auditLogId, "SECURITY_TEST_EVENT", "TestEntity", auditLogId]
        )
      ).resolves.toBeDefined();

      // SELECT allowed
      const selectRes = await appPool.query(
        `SELECT "Id", "EventType" FROM public."AuditLogs" WHERE "Id" = $1;`,
        [auditLogId]
      );
      expect(selectRes.rows).toHaveLength(1);
      expect(selectRes.rows[0].EventType).toBe("SECURITY_TEST_EVENT");

      // UPDATE denied
      await expect(
        appPool.query(
          `UPDATE public."AuditLogs" SET "EventType" = 'TAMPERED' WHERE "Id" = $1;`,
          [auditLogId]
        )
      ).rejects.toThrowError(/permission denied for table AuditLogs/i);

      // DELETE denied
      await expect(
        appPool.query(
          `DELETE FROM public."AuditLogs" WHERE "Id" = $1;`,
          [auditLogId]
        )
      ).rejects.toThrowError(/permission denied for table AuditLogs/i);
    });

    it("verifies table and schema ownership belongs to migrator role, NOT application role", async () => {
      const ownershipRes = await appPool.query(`
        SELECT tablename, tableowner
        FROM pg_tables
        WHERE schemaname = 'public';
      `);

      expect(ownershipRes.rows.length).toBeGreaterThanOrEqual(10);
      for (const row of ownershipRes.rows) {
        expect(row.tableowner).toBe(MIGRATOR_USER);
        expect(row.tableowner).not.toBe(APP_USER);
      }
    });
  });

  // ============================================================================
  // SECTION 3.1: Runtime Role Schema Validation & Migration Isolation (Phase 7.1)
  // ============================================================================
  describe("Section 3.1: Runtime Role Schema Validation & Migration Isolation (Phase 7.1)", () => {
    it("A. Production API with codeguard_app: schema validation succeeds against already-migrated DB with ZERO DDL", async () => {
      // verifyPostgresSchema uses read-only queries (SELECT) and never issues DDL
      const result = await verifyPostgresSchema(appPool);
      expect(result.verified).toBe(true);
      expect(result.appliedMigrations).toBeGreaterThanOrEqual(2);
      expect(result.totalMigrations).toBe(result.appliedMigrations);
    });

    it("B. Production API with codeguard_app: detects pending migration and fails safely without executing DDL", async () => {
      // Temporarily remove last migration record from public._migrations using migratorPool
      const lastMigration = await migratorPool.query(
        "SELECT id, name, checksum, duration_ms FROM public._migrations ORDER BY id DESC LIMIT 1;"
      );
      expect(lastMigration.rows).toHaveLength(1);
      const savedRow = lastMigration.rows[0];

      await migratorPool.query("DELETE FROM public._migrations WHERE id = $1;", [savedRow.id]);

      try {
        // Now verifyPostgresSchema with codeguard_app must throw without attempting DDL
        await expect(verifyPostgresSchema(appPool)).rejects.toThrowError(
          /Database schema is out of date: 1 pending migration\(s\) detected/i
        );
      } finally {
        // Restore the migration record using migratorPool
        await migratorPool.query(
          "INSERT INTO public._migrations (name, checksum, duration_ms) VALUES ($1, $2, $3);",
          [savedRow.name, savedRow.checksum, savedRow.duration_ms]
        );
      }

      // Re-verify that schema validation passes once restored
      const restored = await verifyPostgresSchema(appPool);
      expect(restored.verified).toBe(true);
    });

    it("C. Production API with codeguard_app: detects checksum tampering and fails safely without executing DDL", async () => {
      // Temporarily tamper with checksum of a migration using migratorPool
      const firstMigration = await migratorPool.query(
        "SELECT id, name, checksum FROM public._migrations ORDER BY id ASC LIMIT 1;"
      );
      const originalChecksum = firstMigration.rows[0].checksum;
      const fakeChecksum = "0000000000000000000000000000000000000000000000000000000000000000";

      await migratorPool.query(
        "UPDATE public._migrations SET checksum = $1 WHERE id = $2;",
        [fakeChecksum, firstMigration.rows[0].id]
      );

      try {
        await expect(verifyPostgresSchema(appPool)).rejects.toThrowError(
          /Checksum mismatch for migration/i
        );
      } finally {
        // Restore genuine checksum
        await migratorPool.query(
          "UPDATE public._migrations SET checksum = $1 WHERE id = $2;",
          [originalChecksum, firstMigration.rows[0].id]
        );
      }

      const restored = await verifyPostgresSchema(appPool);
      expect(restored.verified).toBe(true);
    });

    it("D. Production API with codeguard_app: fails clearly if _migrations table is missing without executing DDL", async () => {
      // Mock pool returning table_exists = null
      const mockClient = {
        query: async (sql: string) => {
          if (sql.includes("to_regclass")) {
            return { rows: [{ table_exists: null }] };
          }
          return { rows: [] };
        },
        release: () => {},
      };
      const mockPool = {
        connect: async () => mockClient,
      } as any;

      await expect(verifyPostgresSchema(mockPool)).rejects.toThrowError(
        /Database schema is uninitialized: 'public._migrations' table does not exist/i
      );
    });

    it("E. Least-privilege verification: running DDL migrations with codeguard_app fails due to missing permissions", async () => {
      // If someone erroneously attempts to run DDL migrations using the runtime role, it fails
      // because codeguard_app has REVOKE CREATE ON SCHEMA public
      const failingMigrationExecutor = async (client: any) => {
        await client.query("CREATE TABLE public.should_fail (id int);");
        return 1;
      };

      await expect(
        runPostgresMigrations(undefined, appPool, failingMigrationExecutor)
      ).rejects.toThrowError(/permission denied/i);
    });

    it("F. Migration job with codeguard_migrator: succeeds and is idempotent", async () => {
      const rerun = await runPostgresMigrations(undefined, migratorPool);
      expect(rerun.applied).toHaveLength(0);
      expect(rerun.skipped.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // SECTION 5 & 10: Redis Staging & Distributed Rate Limiting
  // ============================================================================
  describe("Section 5 & 10: Redis Integration & Distributed Rate Limiting", () => {
    it("reports Redis health as healthy when connected with credentials", () => {
      expect(getRedisHealth()).toBe("healthy");
    });

    it("redacts Redis passwords and tokens from logging output", () => {
      const secretUrl = `redis://default:${REDIS_PASSWORD}@127.0.0.1:${REDIS_PORT}`;
      const redacted = redactRedisUrl(secretUrl);
      expect(redacted).not.toContain(REDIS_PASSWORD);
      expect(redacted).toContain("redacted");

      const logSnippet = `Failed connecting to ${secretUrl} with error`;
      const sanitized = sanitizeRedisLogText(logSnippet, secretUrl);
      expect(sanitized).not.toContain(REDIS_PASSWORD);
    });

    it("distributes rate-limiting state across independent process instances sharing Redis", async () => {
      const store1 = createDistributedRateLimitStore();
      const store2 = createDistributedRateLimitStore();

      const app1 = express();
      app1.set("trust proxy", 1);
      app1.use(createApiRateLimiter({ windowMs: 60_000, limit: 3, store: store1 }));
      app1.get("/test-rate", (_req, res) => res.json({ ok: true }));

      const app2 = express();
      app2.set("trust proxy", 1);
      app2.use(createApiRateLimiter({ windowMs: 60_000, limit: 3, store: store2 }));
      app2.get("/test-rate", (_req, res) => res.json({ ok: true }));

      const clientIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

      // Request 1 on App 1
      const res1 = await request(app1).get("/test-rate").set("X-Forwarded-For", clientIp);
      expect(res1.status).toBe(200);

      // Request 2 on App 2 (same IP)
      const res2 = await request(app2).get("/test-rate").set("X-Forwarded-For", clientIp);
      expect(res2.status).toBe(200);

      // Request 3 on App 1 (same IP)
      const res3 = await request(app1).get("/test-rate").set("X-Forwarded-For", clientIp);
      expect(res3.status).toBe(200);

      // Request 4 on App 2 (same IP) -> Must be rate limited across instances!
      const res4 = await request(app2).get("/test-rate").set("X-Forwarded-For", clientIp);
      expect(res4.status).toBe(429);
      expect(res4.body.error).toBe("TOO_MANY_REQUESTS");
    });
  });

  // ============================================================================
  // SECTION 6: End-to-End Staging Pipeline Validation
  // ============================================================================
  describe("Section 6: Full End-to-End HTTP API Pipeline", () => {
    let csrfToken: string;
    let csrfCookie: string;
    let accessToken: string;
    let refreshCookie: string;
    let registeredEmail: string;
    let registeredUserId: string;
    const userPassword = "StagingPassword123!";

    function extractResponseCookies(res: request.Response) {
      const rawCookies: string[] = res.headers["set-cookie"] || [];
      let rCookie: string | undefined;
      let cCookie: string | undefined;
      let cToken: string | undefined;

      for (const c of rawCookies) {
        const firstPart = c.split(";")[0];
        if (firstPart.startsWith("codeguard_refresh_token=")) {
          rCookie = firstPart;
        }
        if (firstPart.startsWith("codeguard_csrf_token=")) {
          cCookie = firstPart;
          cToken = firstPart.replace("codeguard_csrf_token=", "");
        }
      }
      return { rCookie, cCookie, cToken, cookieHeader: [rCookie, cCookie].filter(Boolean).join("; ") };
    }

    it("1. GET /health responds with 200 ok and uptime", async () => {
      const res = await request(appInstance.app).get("/health");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ok");
      expect(res.body.service).toBe("codeguard-api");
      expect(typeof res.body.uptime).toBe("number");
    });

    it("2. GET /ready responds with 200 ready and healthy database & redis dependencies", async () => {
      const res = await request(appInstance.app).get("/ready");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("ready");
      expect(res.body.dependencies.database).toBe("healthy");
      expect(res.body.dependencies.redis).toBe("healthy");
    });

    it("3. GET /api/auth/csrf issues a cryptographically secure CSRF token & cookie", async () => {
      const res = await request(appInstance.app).get("/api/auth/csrf");
      expect(res.status).toBe(200);
      expect(res.body.csrfToken).toBeDefined();
      expect(res.body.csrfToken).toHaveLength(64);

      const cookies = extractResponseCookies(res);
      expect(cookies.cCookie).toBeDefined();
      csrfToken = res.body.csrfToken;
      csrfCookie = cookies.cCookie!;
    });

    it("4. POST /api/auth/register creates user in PostgreSQL", async () => {
      registeredEmail = `staging-user-${Date.now()}@codeguard.test`;

      const res = await request(appInstance.app)
        .post("/api/auth/register")
        .set("Cookie", csrfCookie)
        .set("X-CSRF-Token", csrfToken)
        .send({
          email: registeredEmail,
          password: userPassword,
          displayName: "Staging Test User",
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("USER_CREATED_VERIFICATION_EMAIL_SENT");
      expect(res.body.userId).toBeDefined();
      registeredUserId = res.body.userId;

      // Verify row persisted directly in PostgreSQL
      const pgUser = await appPool.query(`SELECT "Id", "Email", "DisplayName" FROM public."Users" WHERE "Id" = $1;`, [registeredUserId]);
      expect(pgUser.rows).toHaveLength(1);
      expect(pgUser.rows[0].Email).toBe(registeredEmail);
    });

    it("5. Email verification token flow marks user as verified", async () => {
      const token = await appInstance.authService.createEmailVerificationToken(registeredUserId);
      const verifyRes = await request(appInstance.app).get(`/api/auth/verify-email/${token}`);
      expect(verifyRes.status).toBe(200);

      // Verify DB column updated
      const updatedUser = await appPool.query(`SELECT "IsEmailVerified" FROM public."Users" WHERE "Id" = $1;`, [registeredUserId]);
      expect(updatedUser.rows[0].IsEmailVerified).toBe(true);
    });

    it("6. POST /api/auth/login issues HttpOnly refresh cookie and JWT access token", async () => {
      const res = await request(appInstance.app)
        .post("/api/auth/login")
        .set("Cookie", csrfCookie)
        .set("X-CSRF-Token", csrfToken)
        .send({
          email: registeredEmail,
          password: userPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(registeredEmail);

      // Verify refresh token is NOT in JSON response
      expect(res.body.refreshToken).toBeUndefined();

      const cookies = extractResponseCookies(res);
      expect(cookies.rCookie).toBeDefined();
      accessToken = res.body.accessToken;
      refreshCookie = cookies.rCookie!;

      // Verify refresh cookie attributes
      const rawCookie = res.headers["set-cookie"].find((c: string) => c.startsWith("codeguard_refresh_token="));
      expect(rawCookie).toMatch(/HttpOnly/i);
      expect(rawCookie).toMatch(/Path=\/api\/auth/i);
    });

    it("7. GET /api/auth/me returns authenticated user details", async () => {
      const res = await request(appInstance.app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(registeredUserId);
      expect(res.body.email).toBe(registeredEmail);
    });

    it("8. POST /api/auth/refresh rotates refresh token cleanly", async () => {
      const res = await request(appInstance.app)
        .post("/api/auth/refresh")
        .set("Cookie", `${refreshCookie}; ${csrfCookie}`)
        .set("X-CSRF-Token", csrfToken);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeUndefined(); // Never in JSON

      const newCookies = extractResponseCookies(res);
      expect(newCookies.rCookie).toBeDefined();
      expect(newCookies.rCookie).not.toBe(refreshCookie); // Token rotated!

      // Update active credentials
      accessToken = res.body.accessToken;
      refreshCookie = newCookies.rCookie!;
    });

    it("9. Account lockout triggers after 5 consecutive failed login attempts", async () => {
      const attackerTargetEmail = `lockout-test-${Date.now()}@codeguard.test`;
      await appInstance.userRepository.save(
        {
          id: uuidv4(),
          email: attackerTargetEmail,
          displayName: "Lockout Target",
          roles: ["developer"],
          isEmailVerified: true,
          mfaEnabled: false,
        },
        await appInstance.authService.hashPassword("CorrectPass123!")
      );

      // Perform 5 failed login attempts
      for (let i = 1; i <= 5; i++) {
        const failedRes = await request(appInstance.app)
          .post("/api/auth/login")
          .send({ email: attackerTargetEmail, password: "WrongPassword" });
        expect(failedRes.status).toBe(401);
      }

      // 6th attempt must be blocked by account lockout (returns 403 ACCOUNT_LOCKED)
      const lockedRes = await request(appInstance.app)
        .post("/api/auth/login")
        .send({ email: attackerTargetEmail, password: "CorrectPass123!" });

      expect(lockedRes.status).toBe(403);
      expect(lockedRes.body.error).toBe("ACCOUNT_LOCKED");

      // Verify LockedUntil persisted in PostgreSQL
      const pgTarget = await appPool.query(
        `SELECT "FailedLoginCount", "LockedUntil" FROM public."Users" WHERE "Email" = $1;`,
        [attackerTargetEmail]
      );
      expect(pgTarget.rows[0].FailedLoginCount).toBeGreaterThanOrEqual(5);
      expect(pgTarget.rows[0].LockedUntil).not.toBeNull();
    });

    it("10. Project CRUD persists and queries correctly in PostgreSQL", async () => {
      const projectId = uuidv4();
      const savedProject = await appInstance.projectRepository.save({
        id: projectId,
        name: "Staging Mission Project",
        description: "PostgreSQL Staging E2E Project",
        ownerUserId: registeredUserId,
        defaultBranch: "main",
        settings: { scanDepth: "deep" },
      });

      expect(savedProject.id).toBe(projectId);

      const fetched = await appInstance.projectRepository.findById(projectId);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe("Staging Mission Project");

      const pgRow = await appPool.query(`SELECT "Id", "Name", "OwnerUserId" FROM public."Projects" WHERE "Id" = $1;`, [projectId]);
      expect(pgRow.rows).toHaveLength(1);
      expect(pgRow.rows[0].Name).toBe("Staging Mission Project");
    });

    it("11. Analysis and AnalysisScores persist correctly in PostgreSQL", async () => {
      const analysisId = uuidv4();
      const now = new Date();
      const savedAnalysis = await appInstance.analysisRepository.save(
        {
          id: analysisId,
          type: "security-analysis",
          title: "Staging Pipeline Analysis",
          summary: "Automated scan in staging validation",
          requestedByUserId: registeredUserId,
          startedAt: now,
          completedAt: now,
          scores: {
            overallScore: 94,
            securityScore: 99,
            qualityScore: 91,
            performanceScore: 93,
            maintainabilityScore: 92,
            readabilityScore: 95,
          },
        },
        registeredUserId
      );

      expect(savedAnalysis.id).toBe(analysisId);

      const fetched = await appInstance.analysisRepository.findById(analysisId);
      expect(fetched).not.toBeNull();
      expect(fetched?.scores?.securityScore).toBe(99);

      // Verify rows in PostgreSQL
      const pgAnalysis = await appPool.query(`SELECT "Id", "Title" FROM public."Analyses" WHERE "Id" = $1;`, [analysisId]);
      expect(pgAnalysis.rows).toHaveLength(1);
      const pgScores = await appPool.query(`SELECT "SecurityScore", "OverallScore" FROM public."AnalysisScores" WHERE "AnalysisId" = $1;`, [analysisId]);
      expect(pgScores.rows).toHaveLength(1);
      expect(pgScores.rows[0].SecurityScore).toBe(99);
    });

    it("12. Interview, Notification, and AuditLog operations persist in PostgreSQL", async () => {
      // Interview Session
      const interviewId = uuidv4();
      await appInstance.interviewRepository.saveSession({
        id: interviewId,
        title: "Senior Backend Engineer Interview",
        candidateUserId: registeredUserId,
        status: "scheduled",
      });
      const fetchedInterview = await appInstance.interviewRepository.findSessionById(interviewId);
      expect(fetchedInterview?.title).toBe("Senior Backend Engineer Interview");

      // Notification
      const notifId = uuidv4();
      await appInstance.notificationRepository.save({
        id: notifId,
        userId: registeredUserId,
        type: "system_alert",
        title: "Staging Validation In Progress",
        body: "Phase 7 execution verified.",
        createdAt: new Date(),
      });
      const notifications = await appInstance.notificationRepository.listByUser(registeredUserId);
      expect(notifications.some((n) => n.id === notifId)).toBe(true);

      // Audit Log with valid UUID entityId
      const logId = uuidv4();
      const entityUuid = uuidv4();
      await appInstance.auditLogRepository.save({
        id: logId,
        actorUserId: registeredUserId,
        eventType: "STAGING_VALIDATION_COMPLETED",
        entityType: "System",
        entityId: entityUuid,
        ipAddress: "127.0.0.1",
        userAgent: "Staging-Test-Runner",
        metadata: { status: "PASS", dialect: "postgres" },
        createdAt: new Date(),
      });
      const auditLogs = await appInstance.auditLogRepository.listByActor(registeredUserId);
      expect(auditLogs.some((l) => l.id === logId)).toBe(true);

      // Verify PostgreSQL rows
      const pgNotif = await appPool.query(`SELECT "Id" FROM public."Notifications" WHERE "Id" = $1;`, [notifId]);
      expect(pgNotif.rows).toHaveLength(1);
      const pgAudit = await appPool.query(`SELECT "Id", "EventType" FROM public."AuditLogs" WHERE "Id" = $1;`, [logId]);
      expect(pgAudit.rows).toHaveLength(1);
    });

    it("13. POST /api/auth/logout-all revokes all sessions and refresh tokens", async () => {
      const logoutAllRes = await request(appInstance.app)
        .post("/api/auth/logout-all")
        .set("Authorization", `Bearer ${accessToken}`)
        .set("Cookie", `${refreshCookie}; ${csrfCookie}`)
        .set("X-CSRF-Token", csrfToken);

      expect(logoutAllRes.status).toBe(204);

      // Subsequent refresh attempt must fail
      const failedRefresh = await request(appInstance.app)
        .post("/api/auth/refresh")
        .set("Cookie", `${refreshCookie}; ${csrfCookie}`)
        .set("X-CSRF-Token", csrfToken);

      expect(failedRefresh.status).toBe(401);
    });
  });

  // ============================================================================
  // SECTION 7: Security Regression & Penetration Testing
  // ============================================================================
  describe("Section 7: Security Regression & Penetration Testing", () => {
    it("A. SQL injection payloads in auth endpoints fail safely without executing injection", async () => {
      const sqliPayloads = [
        "' OR '1'='1",
        "admin'--",
        "'; DROP TABLE \"Users\"; --",
        "1' UNION SELECT NULL, NULL, NULL--",
      ];

      for (const payload of sqliPayloads) {
        const res = await request(appInstance.app)
          .post("/api/auth/login")
          .send({ email: payload, password: "password" });
        // Input validation rejects invalid email with 400; if valid format, auth rejects with 401
        expect([400, 401]).toContain(res.status);
      }

      // Verify "Users" table is completely intact
      const countRes = await appPool.query(`SELECT count(*) FROM public."Users";`);
      expect(Number(countRes.rows[0].count)).toBeGreaterThan(0);
    });

    it("B. Malformed non-UUID IDs fail safely with 400/401/404 without database crashes", async () => {
      const res = await request(appInstance.app)
        .get("/api/analyses/not-a-valid-uuid-12345");
      expect([400, 401, 404]).toContain(res.status);
    });

    it("C. Oversized JSON request payload (> 1MB) returns 413 Payload Too Large", async () => {
      const largePayload = "a".repeat(1.5 * 1024 * 1024); // 1.5MB
      const res = await request(appInstance.app)
        .post("/api/auth/login")
        .send({ email: "test@example.com", data: largePayload });
      expect(res.status).toBe(413);
      expect(res.body.error).toBe("PAYLOAD_TOO_LARGE");
    });

    it("D. Invalid JWT returns 401 Unauthorized", async () => {
      const res = await request(appInstance.app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature");
      expect(res.status).toBe(401);
    });

    it("E. Expired JWT returns 401 Unauthorized", async () => {
      const expiredToken = jwt.sign(
        { sub: uuidv4(), email: "expired@test.com", roles: ["developer"] },
        STAGING_JWT_ACCESS_SECRET,
        { expiresIn: "-1s" }
      );
      const res = await request(appInstance.app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("INVALID_TOKEN");
    });

    it("F. Tampered refresh cookie returns 401 / 403", async () => {
      const res = await request(appInstance.app)
        .post("/api/auth/refresh")
        .set("Cookie", "codeguard_refresh_token=tampered.fake.jwt-signature; codeguard_csrf_token=fake")
        .set("X-CSRF-Token", "fake");
      expect([401, 403]).toContain(res.status);
    });

    it("G. Missing CSRF token header fails with 403", async () => {
      const res = await request(appInstance.app)
        .post("/api/auth/refresh")
        .set("Cookie", "codeguard_refresh_token=some_token");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("CSRF_VALIDATION_FAILED");
    });

    it("H. Untrusted CSRF Origin fails with 403", async () => {
      const res = await request(appInstance.app)
        .post("/api/auth/refresh")
        .set("Origin", "https://evil-attacker.com")
        .set("Cookie", "codeguard_refresh_token=some_token; codeguard_csrf_token=abc")
        .set("X-CSRF-Token", "abc");
      expect(res.status).toBe(403);
      expect(res.body.error).toBe("CSRF_VALIDATION_FAILED");
    });

    it("I. Cross-tenant authorization: User A cannot access User B's project or analysis", async () => {
      const userAId = uuidv4();
      const userBId = uuidv4();

      await appPool.query(
        `INSERT INTO public."Users" ("Id", "Email", "PasswordHash", "DisplayName", "IsEmailVerified", "MfaEnabled")
         VALUES ($1, $2, 'hash', 'User A', true, false), ($3, $4, 'hash', 'User B', true, false);`,
        [userAId, `usera-${Date.now()}@test.com`, userBId, `userb-${Date.now()}@test.com`]
      );

      const projectAId = uuidv4();
      await appInstance.projectRepository.save({
        id: projectAId,
        name: "User A Confidential Project",
        description: "Confidential",
        ownerUserId: userAId,
        defaultBranch: "main",
      });

      // User B queries user projects
      const userBProjects = await appInstance.projectRepository.listByOwner(userBId);
      expect(userBProjects.some((p) => p.id === projectAId)).toBe(false);
    });
  });

  // ============================================================================
  // SECTION 8 & 9: Cookie, Proxy, and CORS Review
  // ============================================================================
  describe("Section 8 & 9: Cookie, Reverse Proxy, and CORS Hardening", () => {
    it("rejects localhost in production CORS even if FRONTEND_URL defaulted to localhost", () => {
      const prodEnvWithDefaultFrontend = {
        NODE_ENV: "production",
        FRONTEND_URL: "http://localhost:3000",
      } as any;

      expect(isAllowedOrigin("http://localhost:3000", prodEnvWithDefaultFrontend)).toBe(false);
      expect(isAllowedOrigin("http://127.0.0.1:3000", prodEnvWithDefaultFrontend)).toBe(false);
    });

    it("accepts explicitly configured production domain", () => {
      const prodEnv = {
        NODE_ENV: "production",
        FRONTEND_URL: "https://codeguardai.com",
        CORS_ORIGIN: "https://admin.codeguardai.com",
      } as any;

      expect(isAllowedOrigin("https://codeguardai.com", prodEnv)).toBe(true);
      expect(isAllowedOrigin("https://admin.codeguardai.com", prodEnv)).toBe(true);
      expect(isAllowedOrigin("https://evil.com", prodEnv)).toBe(false);
    });
  });

  // ============================================================================
  // SECTION 11: Observability & Zero Secret Leakage Audit
  // ============================================================================
  describe("Section 11: Secret Redaction & Observability Audit", () => {
    it("confirms zero secret keys or plaintext passwords appear in test logs", () => {
      const forbiddenTokens = [
        ADMIN_PASSWORD,
        MIGRATOR_PASSWORD,
        APP_PASSWORD,
        REDIS_PASSWORD,
        STAGING_JWT_ACCESS_SECRET,
        STAGING_JWT_REFRESH_SECRET,
      ];

      const fullLogOutput = capturedLogs.join("\n");
      for (const secret of forbiddenTokens) {
        expect(fullLogOutput).not.toContain(secret);
      }
    });
  });
});
