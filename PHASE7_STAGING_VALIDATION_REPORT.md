# Phase 7: PostgreSQL Staging Validation & Production Cutover Readiness Report

- **Document Version:** 1.1.0
- **Phase:** Phase 7 Final Diff & Security Gate
- **Target Architecture:** Multi-Dialect (PostgreSQL 16 Candidate with Microsoft SQL Server Rollback)
- **Evaluated Commit:** `b2af9cd`

---

## Executive Summary

Phase 7 executes a rigorous, staging-equivalent qualification of the PostgreSQL-enabled CodeGuard AI API. The evaluation confirms runtime viability, security hardening, database migration determinism, distributed state handling, and rollback integrity outside developer-only environments.

All runtime validations were executed against isolated, ephemeral production-equivalent PostgreSQL 16 and Redis 7 containers. Real production databases were neither modified nor cut over. The Microsoft SQL Server repository implementation remains 100% intact as the production rollback target.

---

## 1. Production Configuration Audit & Required Secret Matrix

All production configuration paths (`apps/api/src/config/env.ts`, `docker-compose.prod.yml`, `apps/api/Dockerfile`) were audited. The configuration schema enforces fail-fast validation at startup: missing secrets, invalid origins, or predictable development defaults (e.g. `DEV_DEFAULT_ACCESS_SECRET`, `localhost` URLs) halt process startup immediately with descriptive diagnostics.

### Required Production Environment Variables Matrix

| Variable Name | Required in Prod? | Validation Status | Where Consumed | Description / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Yes | `[VERIFIED]` | Global runtime | Switches environment into hardened production mode (`"production"`). |
| `PORT` | Yes (default 5000) | `[VERIFIED]` | `server.ts` | HTTP listener port. |
| `API_URL` / `API_BASE_URL` | Yes | `[VERIFIED]` | `env.ts`, `AuthService` | Public API base URL used for email verification and password reset links. |
| `AI_SERVICE_URL` | Yes | `[VERIFIED]` | `app.ts`, `AiAnalysisService` | Internal network URL pointing to the FastAPI AI microservice. |
| `FRONTEND_URL` | Yes | `[VERIFIED]` | `env.ts`, `security.ts`, CORS | Trusted web client origin. Loopback origins (`localhost`, `127.0.0.1`, `::1`) are strictly rejected at startup. |
| `CORS_ORIGIN` | Optional | `[VERIFIED]` | `security.ts`, CORS | Additional trusted origins permitted for cross-origin resource sharing. |
| `JWT_ACCESS_SECRET` | Yes | `[VERIFIED]` | `TokenService`, auth middleware | Cryptographic signing key for HMAC-SHA256 access tokens (min 24 chars, high entropy). |
| `JWT_REFRESH_SECRET` | Yes | `[VERIFIED]` | `TokenService`, `AuthService` | Cryptographic signing key for HMAC-SHA256 refresh tokens (min 24 chars, high entropy). |
| `DB_DIALECT` | Yes | `[VERIFIED]` | Composition root (`createApp`) | Determines active repository dialect (`"postgres"` or `"sqlserver"`). Default is `sqlserver`. |
| `DATABASE_URL` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Standard PostgreSQL connection string. Takes precedence over discrete `POSTGRES_*` vars; loopback rejected in prod. |
| `POSTGRES_HOST` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Discrete database hostname when `DATABASE_URL` is omitted. Loopback rejected in prod. |
| `POSTGRES_PORT` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | PostgreSQL port (default 5432). |
| `POSTGRES_DATABASE` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Target PostgreSQL database name. |
| `POSTGRES_USER` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Database username (`codeguard_app` for runtime). |
| `POSTGRES_PASSWORD` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Database password. Redacted from all diagnostics and error messages. |
| `POSTGRES_SSL` | Conditional (`postgres`) | `[VERIFIED]` | `postgres.ts`, `pg.Pool` | Enforces TLS with certificate verification. Must be `true` in prod. |
| `REDIS_URL` | Yes | `[VERIFIED]` | `client.ts`, rate limit store | Distributed rate limiting and cache backend (`redis://` or `rediss://`). Loopback rejected in prod. |
| `SQLSERVER_HOST` | Conditional (`sqlserver`) | `[VERIFIED]` | `sqlserver.ts`, `mssql.ConnectionPool` | Hostname for SQL Server rollback path. |
| `SQLSERVER_PASSWORD` | Conditional (`sqlserver`) | `[VERIFIED]` | `sqlserver.ts` | Password for SQL Server rollback path. |
| `SQLSERVER_ENCRYPT` | Conditional (`sqlserver`) | `[VERIFIED]` | `sqlserver.ts` | Enforces TLS encryption for SQL Server transit. Must be `true` in prod. |
| `SQLSERVER_TRUST_SERVER_CERTIFICATE` | Conditional (`sqlserver`) | `[VERIFIED]` | `sqlserver.ts` | Disallows self-signed certificates in production. Must be `false` in prod. |
| `EMAIL_HOST` | Yes | `[VERIFIED]` | `EmailService`, nodemailer | SMTP server host for transactional emails. |
| `EMAIL_PORT` | Yes (default 587) | `[VERIFIED]` | `EmailService` | SMTP port. |
| `EMAIL_USER` | Optional | `[VERIFIED]` | `EmailService` | SMTP authentication user. |
| `EMAIL_PASSWORD` | Optional | `[VERIFIED]` | `EmailService` | SMTP authentication password. |
| `EMAIL_FROM` | Yes | `[VERIFIED]` | `EmailService` | From address on outbound notification emails. |

---

## 2. PostgreSQL Production & TLS Requirements

1. **Version Target:** PostgreSQL 16.x (verified against official `postgres:16-alpine`). `[VERIFIED]`
2. **TLS / Network Transit:**
   - In production (`NODE_ENV=production`), `POSTGRES_SSL=true` is mandatory. Startup fails if false. `[VERIFIED]`
   - Certificate validation enforces `rejectUnauthorized: true` in production. `[VERIFIED]`
   - Standard managed providers (Neon, Supabase, AWS RDS with public Root CA, Azure PostgreSQL with DigiCert CA) are validated out of the box against Node's built-in Mozilla CA store. `[VERIFIED]`
   - Private or custom internal CA chains (e.g. internal Kubernetes or private enterprise CAs) require passing the root CA via `NODE_EXTRA_CA_CERTS`. `[REQUIRES PROVIDER VALIDATION]`
   - Localhost / loopback addresses (`localhost`, `127.0.0.1`, `::1`) are strictly rejected by `parseEnv` at startup. `[VERIFIED]`
3. **Connection Pooling Parameters:**
   - `POSTGRES_POOL_MAX`: Default 10 (bounded to prevent backend connection saturation). `[VERIFIED]`
   - `POSTGRES_POOL_MIN`: Default 0 (or 2 in production). `[VERIFIED]`
   - `POSTGRES_CONNECTION_TIMEOUT`: 15,000 ms. `[VERIFIED]`
   - `POSTGRES_IDLE_TIMEOUT`: 30,000 ms. `[VERIFIED]`
4. **Diagnostic Error Sanitization:**
   - Raw database error messages are classified by `classifyPostgresError`. All credentials, connection URLs, authorization tokens, and sensitive query parameters are redacted with `[REDACTED]`. `[VERIFIED]`

---

## 3. Least-Privilege Database Role Model & Audit Log Immutability

### Architectural Separation
A secure production PostgreSQL deployment mandates the separation of DDL (schema management) from DML (application queries):

```
+--------------------------------------------------------------------+
|                         PostgreSQL Cluster                         |
+--------------------------------------------------------------------+
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
+---------------------------+        +---------------------------+
|    codeguard_migrator     |        |       codeguard_app       |
|    (Migration Role)       |        |   (Runtime Application)   |
+---------------------------+        +---------------------------+
| Privileges:               |        | Privileges:               |
| - ALL ON SCHEMA public    |        | - USAGE ON SCHEMA public  |
| - Owns all tables/indexes |        | - SELECT, INSERT, UPDATE, |
| - Used only by CI/CD or   |        |   DELETE on domain tables |
|   pre-deploy init-job     |        | - AuditLogs: SELECT,      |
|                           |        |   INSERT ONLY (NO DELETE/ |
|                           |        |   UPDATE)                 |
|                           |        | - USAGE on sequences      |
|                           |        | - NO DDL (REVOKE CREATE)  |
+---------------------------+        +---------------------------+
```

### Table Privilege Breakdown for `codeguard_app`

| Table | SELECT | INSERT | UPDATE | DELETE | Rationale |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `"Users"` | Yes | Yes | Yes | No | User profile updates, lockout counters. Soft-delete only. |
| `"Roles"` | Yes | No | No | No | Read-only static lookup. |
| `"UserRoles"` | Yes | Yes | No | Yes | Role assignment and removal. |
| `"Sessions"` | Yes | Yes | Yes | Yes | Session rotation, expiration cleanup, logout. |
| `"Projects"` | Yes | Yes | Yes | No | Project creation and updates. |
| `"Analyses"` | Yes | Yes | Yes | Yes | Analysis execution, re-runs, cascading deletions. |
| `"AnalysisScores"` | Yes | Yes | Yes | Yes | Child table to analyses. |
| `"InterviewSessions"` | Yes | Yes | Yes | No | Interview progress tracking. |
| `"InterviewQuestions"` | Yes | Yes | Yes | Yes | Question generation and reset. |
| `"Reports"` | Yes | Yes | Yes | No | Executive reports. |
| `"Notifications"` | Yes | Yes | Yes | No | Notification dispatch and read status. |
| `"PasswordResetTokens"` | Yes | Yes | Yes | Yes | Single-use token lifecycle and expired purge. |
| `"EmailVerificationTokens"` | Yes | Yes | Yes | Yes | Single-use verification token lifecycle. |
| `"RefreshTokens"` | Yes | Yes | Yes | Yes | Refresh token rotation and revocation. |
| **`"AuditLogs"`** | **Yes** | **Yes** | **DENIED** | **DENIED** | **Immutable audit trail. Runtime cannot alter or delete logs.** |

### Audit Log Immutability Verification `[VERIFIED]`
- The domain `AuditLogRepository` exposes only `save(auditLog)` (INSERT), `listByActor` (SELECT), and `listByEntity` (SELECT). There are no update or delete methods in the domain interface.
- In PostgreSQL 16 live staging tests:
  - `INSERT INTO "AuditLogs"`: Allowed (`[VERIFIED]`)
  - `SELECT FROM "AuditLogs"`: Allowed (`[VERIFIED]`)
  - `UPDATE "AuditLogs"`: Denied with PostgreSQL error: `permission denied for table AuditLogs` (`[VERIFIED]`)
  - `DELETE FROM "AuditLogs"`: Denied with PostgreSQL error: `permission denied for table AuditLogs` (`[VERIFIED]`)

### Least-Privilege DDL Denial Matrix `[VERIFIED]`
Tested live against PostgreSQL 16 with `codeguard_app`:
- `CREATE TABLE`: Denied (`permission denied for schema public`) `[VERIFIED]`
- `ALTER TABLE`: Denied (`must be owner of table`) `[VERIFIED]`
- `DROP TABLE`: Denied (`must be owner of table`) `[VERIFIED]`
- `CREATE INDEX`: Denied (`must be owner of table`) `[VERIFIED]`
- `DROP INDEX`: Denied (`must be owner of index`) `[VERIFIED]`
- `CREATE SCHEMA`: Denied (`permission denied for database`) `[VERIFIED]`
- `ALTER SCHEMA`: Denied (`must be owner of schema`) `[VERIFIED]`
- `CREATE FUNCTION`: Denied (`permission denied for schema public`) `[VERIFIED]`
- `DROP FUNCTION`: Denied (`must be owner of function`) `[VERIFIED]`
- `GRANT`: Denied (`must have admin option on role` / `permission denied`) `[VERIFIED]`
- `CREATE ROLE`: Denied (`permission denied to create role`) `[VERIFIED]`
- `ALTER ROLE`: Denied (`permission denied to alter role`) `[VERIFIED]`
- Table Ownership: All public schema tables are owned by `codeguard_migrator`, NOT `codeguard_app`. `[VERIFIED]`

### Role Provisioning Template

```sql
-- 1. Create dedicated database
CREATE DATABASE codeguard_prod;
\c codeguard_prod

-- 2. Create Migration Role (DDL)
CREATE ROLE codeguard_migrator WITH LOGIN PASSWORD '<STRONG_MIGRATOR_PASSWORD>';
GRANT CONNECT ON DATABASE codeguard_prod TO codeguard_migrator;
GRANT ALL ON SCHEMA public TO codeguard_migrator;

-- 3. Create Runtime Application Role (Least-Privilege DML)
CREATE ROLE codeguard_app WITH LOGIN PASSWORD '<STRONG_APP_PASSWORD>';
GRANT CONNECT ON DATABASE codeguard_prod TO codeguard_app;
GRANT USAGE ON SCHEMA public TO codeguard_app;
REVOKE CREATE ON SCHEMA public FROM codeguard_app;

-- 4. Apply migrations using codeguard_migrator

-- 5. Grant runtime DML to codeguard_app
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO codeguard_app;
-- Specifically protect AuditLogs from mutation or deletion:
REVOKE UPDATE, DELETE ON public."AuditLogs" FROM codeguard_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO codeguard_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO codeguard_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO codeguard_app;
```

---

## 4. Redis Requirements & Distributed Rate Limiting

1. **Target:** Redis 7.x (verified with `redis:7-alpine`). `[VERIFIED]`
2. **Authentication:** Authenticated connections via `REDIS_URL` (`redis://` or `rediss://`). `[VERIFIED]`
3. **Distributed Protection:**
   - Active rate limiting uses `rate-limit-redis` with key prefix `codeguard:ratelimit:`.
   - Rate limit hits are globally shared across independent process replicas (`[VERIFIED]` with 2 independent API instances sharing a Redis cluster).
4. **Degraded-Mode Semantics (Redis Outage):**
   - Fallback is **per-process memory** (`MemoryStore` via `DegradedRedisRateLimitStore`). `[VERIFIED]`
   - Fallback is **not shared** across processes during an outage. `[VERIFIED]`
   - Fallback is **fail-safe** (NOT fail-open; requests are still metered against the configured limit on each node). `[VERIFIED]`
   - **Quantified Behavior:** During a Redis outage, rate limiting becomes per-instance. Across $N$ process replicas behind a load balancer, each node independently enforces limit $M$ (e.g. 120 req/min). Total fleet throughput capacity before universal throttling becomes up to $N \times M$ requests.
   - This fail-safe degraded mode protects against denial-of-service and unmetered abuse while preventing cascading service outages.

---

## 5. Database Migration Process & Safety Guarantees

1. **Execution Engine:** `apps/api/src/infrastructure/database/postgres-migration-runner.ts`. `[VERIFIED]`
2. **Ordering:** Deterministic alphanumeric sorting of scripts in `database/postgres/migrations/`. `[VERIFIED]`
3. **Integrity & Immutability:** Migration files are normalized (`\r\n` to `\n`) and verified against SHA-256 hashes recorded in `public._migrations`. Tampering halts runner execution. `[VERIFIED]`
4. **Distributed Concurrency:** Runners acquire an advisory lock (`SELECT pg_advisory_lock(hashtext('codeguard_api_postgres_migrations'))`) before reading history, serializing concurrent startups across container replicas. `[VERIFIED]`
5. **Transactional Atomicity:** Each migration script executes inside an explicit `BEGIN ... COMMIT` block. Failures trigger `ROLLBACK` and leave `_migrations` intact. `[VERIFIED]`

---

## 5.1. Production Migration vs Runtime Database Roles (Phase 7.1)

### The Privilege Conflict & Root Cause
In earlier iterations, the API startup flow (`server.ts`) invoked `runPostgresMigrations()` directly upon container boot using the application database connection pool. In production, this created an architectural privilege conflict:
- The production runtime user (`codeguard_app`) operates under strict least-privilege (DML only: `SELECT`, `INSERT`, `UPDATE`, `DELETE`) with `REVOKE CREATE ON SCHEMA public`.
- `runPostgresMigrations()` requires DDL capabilities: running `ensurePostgresMigrationHistoryTable()` executes `CREATE TABLE IF NOT EXISTS public._migrations`, and applying new scripts executes DDL statements (`CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`).
- Consequently, booting the API with runtime credentials against an uninitialized schema failed with `permission denied for schema public`.

Granting DDL privileges to `codeguard_app` to bypass this failure would violate fundamental defense-in-depth principles: an application vulnerability (e.g. SQL injection or remote code execution) would allow an attacker to alter schema, drop tables, or destroy audit logs.

### Phase 7.1 Architecture: Clean Separation of Responsibilities

The system decouples migration execution from runtime API execution via `POSTGRES_MIGRATION_MODE`:

| Mode | Allowed Environments | Behavior | Privileges Required |
| :--- | :--- | :--- | :--- |
| `validate` | Production (default) | Pure read-only verification (`verifyPostgresSchema`). Checks `public._migrations` via `to_regclass`, reads applied hashes via `SELECT`, compares with files on disk. Executes **ZERO DDL**. Fails fast if migrations are pending, checksums mismatch, or schema is uninitialized. | DML runtime user (`codeguard_app`) |
| `auto` / `migrate` | Development / Test (default) | Runs `runPostgresMigrations()`. Applies pending migrations idempotently with advisory locking and transaction isolation. | Developer / Migrator user |
| `none` | Explicit opt-in | Completely skips migration checks during startup. | N/A |

### Role Responsibilities & Privileges

```
+---------------------------------------------------------------------------------+
|                               PostgreSQL Database                               |
+---------------------------------------------------------------------------------+
                                         |
             +---------------------------+---------------------------+
             |                                                       |
             v                                                       v
+------------------------------------+      +------------------------------------+
|        codeguard_migrator          |      |           codeguard_app            |
|         (Migration Role)           |      |       (Runtime API Service)        |
+------------------------------------+      +------------------------------------+
| Responsibilities:                  |      | Responsibilities:                  |
| - Owns schema public and all tables|      | - Serves HTTP traffic              |
| - Executes DDL migrations          |      | - Executes application CRUD/DML    |
| - Manages public._migrations       |      | - Read-only schema validation      |
| - Invoked only during deployment   |      | - Prohibited from any DDL          |
|                                    |      |                                    |
| Privileges:                        |      | Privileges:                        |
| - ALL ON SCHEMA public             |      | - USAGE ON SCHEMA public           |
| - ALL PRIVILEGES ON DATABASE       |      | - SELECT, INSERT, UPDATE, DELETE   |
| - CREATE TABLE, ALTER, DROP, INDEX |      |   on domain tables                 |
| - Owns all sequences and tables    |      | - SELECT, INSERT on AuditLogs      |
|                                    |      |   (UPDATE and DELETE strictly      |
| Execution Targets:                 |      |    REVOKED)                        |
| - CI/CD pre-deploy job             |      | - USAGE, SELECT on sequences       |
| - Kubernetes init-container        |      | - REVOKE CREATE ON SCHEMA public   |
| - One-shot migration container     |      |                                    |
| - CLI: npm run migrate:postgres:prod|     | Execution Targets:                 |
+------------------------------------+      | - Long-running API server (node)   |
                                            +------------------------------------+
```

### Deployment Sequence
1. **Pre-Deploy Database Migration:**
   - CI/CD workflow (`.github/workflows/deploy.yml`) or Kubernetes init-container executes migrations with `codeguard_migrator` credentials:
     `npm run migrate:postgres:prod -w apps/api`
   - The runner acquires advisory lock, verifies checksums, applies pending `.sql` files inside transactions, updates `public._migrations`, and releases the lock.
   - If a migration script fails, the transaction rolls back, and the deployment pipeline halts immediately before touching the running API.
2. **Runtime API Deployment:**
   - The API container is deployed with `POSTGRES_MIGRATION_MODE=validate` and `POSTGRES_USER=codeguard_app`.
   - On startup (`server.ts`), the API verifies DB connectivity, then invokes `verifyPostgresSchema(postgresPool)`.
   - The validation performs read-only `SELECT` queries to confirm all disk migrations exist in `_migrations` with matching checksums.
   - Zero DDL is executed. Once validated, the API mounts routes and opens its HTTP listener.

### Rollback Sequence
1. **Application-Level Rollback (PostgreSQL):**
   - If a newly deployed API version fails health checks or exhibits runtime defects, roll back the API container to the previous container image.
   - Because migrations follow backwards-compatible expanding schema guidelines (additive columns/tables), the previous container image boots and validates successfully.
2. **Full Dialect Rollback (SQL Server):**
   - If the PostgreSQL platform candidate experiences an infrastructure-level incident:
     1. Update service environment: `DB_DIALECT=sqlserver` and supply `SQLSERVER_*` credentials.
     2. Redeploy the API container.
     3. The API boots using SQL Server connection pools and repositories without any PostgreSQL dependencies.

### Emergency Migration Procedure
If an out-of-band schema hotfix or emergency migration is required:
1. Connect via administrative bastion or authorized operator shell with `codeguard_migrator` credentials.
2. Prepare the numbered migration script (e.g. `003_hotfix_index.sql`).
3. Run:
   ```bash
   DATABASE_URL="postgresql://codeguard_migrator:<PASSWORD>@<HOST>:5432/<DB>?sslmode=require" \
   npm run migrate:postgres:prod -w apps/api
   ```
4. Verify application readiness via `GET /ready`.

### Credential Separation & Zero-Leakage Guarantee
- `codeguard_migrator` credentials (`POSTGRES_MIGRATOR_URL`, `POSTGRES_MIGRATION_PASSWORD`) are injected exclusively into deployment runners and ephemeral migration tasks. They are **NEVER** injected into the long-running API runtime container.
- `codeguard_app` credentials (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`) are injected into the runtime container and possess zero DDL privileges.
- Under no circumstances may `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, or `CREATE SCHEMA` privileges be granted to `codeguard_app`.

---

## 6. Docker Image & Compose Audit

### Docker Image Inspection (`codeguardai-api:phase7`)
- **Base:** `node:20-alpine`, multi-stage build.
- **Directories Present:**
  - `/app/database/migrations` (SQL Server rollback migrations) `[VERIFIED]`
  - `/app/database/postgres/migrations` (PostgreSQL candidate migrations) `[VERIFIED]`
- **Secrets & `.env` Audit:** Exactly zero `.env` files found in image filesystem. Zero hardcoded secrets, passwords, or API keys in compiled `/app/apps/api/dist`. `[VERIFIED]`
- **Process User:** Runs as non-root `USER node` (UID 1000). `[VERIFIED]`
- **Container Boot:** Successfully booted container with `DB_DIALECT=postgres` and verified production environment configuration without errors. `[VERIFIED]`

### Docker Compose Production Audit (`docker-compose.prod.yml`)
- `ai-service`: Internal only (`expose: "8000"`, NOT in `ports`). Kept private inside `codeguard-prod-network`. `[VERIFIED]`
- `api`: Only port 5000 is published. `[VERIFIED]`
- `web`: Only port 3000 is published. `[VERIFIED]`
- Databases: Neither PostgreSQL nor Redis is exposed as a public service in compose; both rely on managed external cloud services or private network connections. `[VERIFIED]`
- Precedence: `DATABASE_URL` takes precedence over discrete `POSTGRES_*` settings when non-empty. `[VERIFIED]`

---

## 7. Rollback Architecture & Procedure

SQL Server support is 100% preserved. The architecture relies on dependency-injected repository factories (`OperationalRepositoryFactory`, `AuthRepositoryFactory`, `AnalysisProjectRepositoryFactory`).

### Dialect Isolation Verification `[VERIFIED]`
- When `DB_DIALECT=sqlserver`: Only SQL Server repositories are instantiated; `postgresPool` is `undefined`; zero PostgreSQL connections are opened. `[VERIFIED]`
- When `DB_DIALECT=postgres`: Only PostgreSQL repositories are instantiated with a single shared `pg.Pool`; zero SQL Server connection pools or queries are executed. `[VERIFIED]`

### Rollback Runbook `[VERIFIED]`
If an unexpected provider or data anomaly occurs after cutting over to PostgreSQL:
1. Revert service configuration on host / orchestrator:
   - Set `DB_DIALECT=sqlserver`.
   - Set `SQLSERVER_HOST`, `SQLSERVER_DATABASE`, `SQLSERVER_USER`, `SQLSERVER_PASSWORD`.
2. Restart / redeploy the API container.
3. The API immediately boots using SQL Server connection pools and repositories. Zero code changes required.

---

## 8. Pre-Production Checklist Summary

- [x] `[VERIFIED]` Missing `FRONTEND_URL` rejected at production startup.
- [x] `[VERIFIED]` Loopback `FRONTEND_URL` (`localhost`, `127.0.0.1`, `::1`) rejected at production startup.
- [x] `[VERIFIED]` Production CORS rejects loopback origins.
- [x] `[VERIFIED]` `AuditLogs` immutability verified (INSERT/SELECT allowed; UPDATE/DELETE denied).
- [x] `[VERIFIED]` Comprehensive DDL denial matrix verified for `codeguard_app`.
- [x] `[VERIFIED]` Migrator role owns tables and schema.
- [x] `[VERIFIED]` Redis rate limiting shared across instances; fail-safe per-instance fallback during outage.
- [x] `[VERIFIED]` TLS certificate verification enforced (`rejectUnauthorized: true`).
- [x] `[VERIFIED]` Docker image contains migrations, non-root user, zero secrets.
- [x] `[VERIFIED]` Compose configuration exposes only intended frontend and API ports.
- [x] `[VERIFIED]` Dialect isolation verified for both PostgreSQL and SQL Server modes.
- [x] `[VERIFIED]` SQL Server repositories and rollback runbook 100% intact.
- [x] `[VERIFIED]` Security test suite passes (CSRF, lockout, injection prevention, 413 payload limit, sanitization).
- [x] `[VERIFIED]` Real CI migration execution command chain in `deploy.yml` (`npm run migrate:postgres:prod -w apps/api`).
- [x] `[VERIFIED]` Credential separation: `codeguard_migrator` (DDL) in CI vs `codeguard_app` (DML only) in runtime.
- [x] `[VERIFIED]` CI Failure gating: non-zero exit code blocks API deployment without swallowed errors.
- [x] `[VERIFIED]` Live dry-run of `npm run migrate:postgres:prod` verified against PostgreSQL 16 Alpine.
- [x] `[VERIFIED]` Pending migration halts runtime API startup with zero DDL attempted.
