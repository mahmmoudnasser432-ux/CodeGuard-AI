# Phase 6C-Free: Free Hosting Architecture Assessment & Migration Design

## 1. Architectural Scope & Target Separation

This document establishes the architecture assessment, database portability evaluation, and migration design for deploying a **zero-cost, non-production demo instance** of **CodeGuard AI**.

> [!IMPORTANT]
> **Strict Architecture Separation**:
> * **Production Target (Active Baseline)**: **Railway (API & AI Service) + Azure SQL Database**. This remains the hardened, enterprise-grade production target documented in `PHASE6B_AZURE_SQL_READINESS.md`.
> * **Zero-Cost Demo Target (Evaluation Only)**: **Vercel (Web) + Koyeb (API) + Neon (Database) + Upstash (Redis)**. This topology is strictly intended for testing, evaluation, and public showcase workloads. It is **NOT** production-ready and must not be treated as an enterprise deployment.
> * **PostgreSQL Migration**: Migrating from SQL Server to PostgreSQL is a **major, separate engineering effort** requiring new schema definitions, custom migration tooling, and a complete repository rewrite. No production code is migrated in this phase.

```mermaid
flowchart TD
    subgraph Clients["Clients / Browsers"]
        User["User Browser"]
    end

    subgraph Vercel["Vercel Free Tier (Global Edge CDN)"]
        Web["Next.js 16 Web\n(Static / SSR Pre-rendered)\nNEXT_PUBLIC_BACKEND_API_URL"]
    end

    subgraph Koyeb["Koyeb Free Tier (Hobby / Testing Only)"]
        API["Express + TypeScript API Container\nSingle Free Instance: 512 MB RAM, 0.1 vCPU, 2 GB SSD\nScales to zero after 1 hour without traffic\nDynamic Ingress PORT, dumb-init, non-root user"]
    end

    subgraph Database["Neon Serverless PostgreSQL (Free Plan)"]
        PG["PostgreSQL 16 Engine\n(0.5 GB storage, 50 CU-hrs/mo, 5 GB egress/mo)\nAutoscaling / Scale-to-Zero Compute\nBuilt-in PgBouncer (Port 5432/6543, sslmode=require)"]
    end

    subgraph RedisTier["Upstash Serverless Redis (Free Tier)"]
        Upstash["Upstash Redis\n(256 MB data, 500K commands/mo, 10 GB bandwidth)\nTLS (rediss://), Distributed Rate Limiting"]
    end

    subgraph TemporaryDemoAI["Railway Microservice (Temporary Demo Setup)"]
        AI["FastAPI AI Service Container\n(Python 3.11, Uvicorn, Multi-Provider LLM & AST Engine)\nRemotely queried via HTTPS :443"]
    end

    User -->|HTTPS :443| Web
    User -->|HTTPS /api/auth, /api/analyses\n(Cross-Site Cookies: SameSite=None, Secure)| API
    Web -.->|Client-Side Fetch (CORS allowed)| API
    API -->|PostgreSQL TLS :5432 / :6543\n(PgBouncer Pooled, sslmode=require)| PG
    API -->|Redis TLS :6379 (rediss://)| Upstash
    API -->|HTTPS :443 / REST (AbortSignal 45s)| AI
```

---

## 2. Service-by-Service Free-Tier Mapping & Resource Limits

| Service Component | Target Provider | Plan / Tier | Verified Resource Quotas & Behavior | Role & Production Disclaimer |
| :--- | :--- | :--- | :--- | :--- |
| **Web Frontend** | **Vercel** | Hobby (Free) | 100 GB bandwidth/month, unlimited static deployments, Edge CDN, automatic TLS | Hosts Next.js frontend. Pre-renders static pages; dispatches client-side API requests to Koyeb backend. |
| **Backend API** | **Koyeb** | Free Instance | **1 Free Instance per organization**<br>• 512 MB RAM<br>• 0.1 vCPU<br>• 2 GB SSD storage<br>• **Scales to zero after 1 hour without traffic** | **Testing / Hobby only; NOT production-ready**.<br>Runs the core Express API. Single-instance restriction prevents running multiple services on the free tier. |
| **Relational Database** | **Neon** | Free Plan | • **0.5 GB storage per project**<br>• **50 CU-hours/month per project**<br>• **5 GB egress/month**<br>• Serverless autoscaling compute with scale-to-zero on idle<br>• Built-in PgBouncer connection pooling | **Non-production serverless database**.<br>Provides PostgreSQL 16 engine accessible over TLS (`sslmode=require`) from dynamic Koyeb IPs. |
| **Distributed Cache & Rate Limiting** | **Upstash** | Free Tier | • **256 MB data storage**<br>• **500,000 commands/month**<br>• **10 GB monthly bandwidth**<br>• Encrypted TLS endpoint (`rediss://`) | Provides distributed rate-limiting store. If monthly command quota is exceeded, API gracefully degrades to in-memory limiting without dropping traffic. |
| **AI Microservice** | **Railway** | Existing Setup (Temporary Demo) | Dedicated container: Python 3.11, multi-worker Uvicorn, Google GenAI SDK, AST analyzer | **Temporary demo bridge**.<br>Preserved on Railway because Koyeb Free tier provides only 1 Free Instance per organization. |

---

## 3. Database Portability Assessment

A complete audit of CodeGuard AI's data layer was conducted across all 11 repositories, 19 tables, migration files, seed files, and the test suite.

### 3.1 Inventory of Database Assets
The database contains **19 tables**:
1. `Roles`: System authorization roles (admin, developer, recruiter, team_lead).
2. `Users`: User records, password hashes, security flags, failed login counters.
3. `UserRoles`: Join table `(UserId, RoleId)`.
4. `Sessions`: User sessions, JWT JTIs, refresh token hashes, device fingerprints.
5. `Projects`: Project workspaces.
6. `Repositories`: Git repositories linked to projects.
7. `Files`: Scanned source files with hashes and byte sizes.
8. `Analyses`: Analysis records, types, execution statuses, summaries.
9. `AnalysisScores`: Overall, security, quality, performance, maintainability, readability scores (0–100).
10. `Reports`: Generated analysis reports in Markdown/JSON.
11. `InterviewSessions`: Technical interview simulations.
12. `InterviewQuestions`: Session questions, criteria, difficulty.
13. `InterviewResults`: Session evaluations and technical/problem-solving scores.
14. `Notifications`: User alerts and read timestamps.
15. `AuditLogs`: Security event tracking, actor IDs, IP, user-agent, metadata JSON.
16. `RefreshTokens`: Cryptographic refresh tokens, JTIs, IP/UA hashes.
17. `PasswordResetTokens`: One-time password reset tokens.
18. `EmailVerificationTokens`: Email verification tokens.
19. `SchemaMigrations` / `_migrations`: Migration history and SHA-256 checksum tracking.

---

### 3.2 SQL Server-Specific Features Identified

#### 1. Procedural T-SQL Batches Embedded in Repository Queries
In `apps/api/src/infrastructure/repositories/sql-user-repository.ts`:
```sql
IF EXISTS (SELECT 1 FROM dbo.Users WHERE Id = @id)
BEGIN
  UPDATE dbo.Users SET ... WHERE Id = @id;
  BEGIN
    DELETE FROM dbo.UserRoles WHERE UserId = @id;
    INSERT INTO dbo.UserRoles (UserId, RoleId)
    SELECT @id, r.Id FROM STRING_SPLIT(@roles, ',') AS s ...
  END
END
ELSE ...
```
And:
```sql
UPDATE dbo.Users SET ... WHERE Id = @id;
IF @@ROWCOUNT = 0
BEGIN
  INSERT INTO dbo.Users (...) VALUES (...);
END
```
*Portability Impact*: PostgreSQL does not support procedural `IF ... BEGIN ... END` blocks or `@@ROWCOUNT` in raw SQL statements. These statements must be replaced with atomic ANSI `INSERT ... ON CONFLICT` operations or structured transactions.

#### 2. T-SQL `OUTPUT INSERTED.*` Clause
In `sql-user-repository.ts` (`incrementFailedLogins`):
```sql
UPDATE dbo.Users
SET FailedLoginCount = ..., LockedUntil = ...
OUTPUT INSERTED.FailedLoginCount, INSERTED.LockedUntil
WHERE Id = @userId;
```
*Portability Impact*: `OUTPUT INSERTED` is proprietary T-SQL syntax. In PostgreSQL, this requires `RETURNING failed_login_count, locked_until`.

#### 3. T-SQL `MERGE` Statements
Used in:
- `SqlAnalysisRepository.save` (`MERGE dbo.Analyses AS target ...`)
- `SqlProjectRepository.save` (`MERGE dbo.Projects AS target ...`)
- `SqlReportRepository.save` (`MERGE dbo.Reports AS target ...`)
- `SqlInterviewRepository.saveSession` (`MERGE dbo.InterviewSessions AS target ...`)
- `SqlInterviewRepository.saveResult` (`MERGE dbo.InterviewResults AS target ...`)
- `SqlNotificationRepository.save` (`MERGE dbo.Notifications AS target ...`)
- `database/seeds/001_seed_roles_and_dev_user.sql` (`MERGE dbo.Roles AS target ...`)

*Portability Impact*: While PostgreSQL 15+ supports ANSI `MERGE`, PostgreSQL's idiomatic, lock-free pattern for single-entity upserts is `INSERT INTO ... ON CONFLICT (id) DO UPDATE SET ... RETURNING *`. T-SQL `MERGE` syntax with `USING (SELECT @param as Col) AS source` is incompatible.

#### 4. `SELECT TOP (@limit)` / `TOP 1`
Used in:
- `sql-audit-log-repository.ts`: `SELECT TOP (@limit) Id, ActorUserId...`
- `sql-email-verification-token-repository.ts`: `SELECT TOP 1 Id, UserId...`
- `sql-password-reset-token-repository.ts`: `SELECT TOP 1 Id, UserId...`

*Portability Impact*: `TOP (n)` is invalid in PostgreSQL. PostgreSQL requires `SELECT ... LIMIT n`.

#### 5. String Splitting Function (`STRING_SPLIT`)
Used in `sql-user-repository.ts` to deserialize comma-separated roles:
```sql
FROM STRING_SPLIT(@roles, ',') AS s
INNER JOIN dbo.Roles r ON (s.value = r.Name OR s.value = CAST(r.Id AS NVARCHAR(36)))
```
*Portability Impact*: `STRING_SPLIT` is a proprietary T-SQL table-valued function. PostgreSQL uses `unnest(string_to_array($1, ','))` or array parameters (`WHERE r.name = ANY($1::text[])`).

#### 6. Date/Time Functions & Operators
- `SYSUTCDATETIME()`: Used across all repositories, schema, and migrations. In PostgreSQL: `CURRENT_TIMESTAMP` or `NOW()`.
- `DATEADD(millisecond, @lockoutDurationMs, SYSUTCDATETIME())`: In PostgreSQL: `NOW() + ($1 || ' milliseconds')::interval`.

#### 7. Column Identifier Case-Folding in PostgreSQL Drivers
- SQL Server with `mssql` preserves column names in PascalCase as declared: `recordset[0].Id`, `recordset[0].Email`, `recordset[0].OverallScore`.
- PostgreSQL drivers (`pg`) fold unquoted column names to lowercase (`rows[0].id`, `rows[0].email`, `rows[0].overallscore`).
- *High Risk Hazard*: Unless every column is explicitly quoted (`"Id"`) or a case-mapping transformer is implemented, all repository reads will return objects with `undefined` properties in TypeScript, silently breaking application logic.

#### 8. Migration Runner & SQL Batching (`GO` Splitter)
- `apps/api/src/migration-runner.ts` splits scripts on `^\s*GO\s*$`.
- `GO` is a SQL Server client-side batch separator that causes syntax errors in PostgreSQL.
- Existing migrations (`001_initial_schema.sql`, `20240115_add_jti_to_sessions.sql`, `20240820_add_auth_tables.sql`) are written entirely in T-SQL with `dbo.` prefixes, `sys.indexes` lookups, `COL_LENGTH`, `NEWID()`, `DATETIME2`, and `INT IDENTITY`.

---

## 4. Database Migration Matrix

| SQL Server Construct | PostgreSQL Equivalent | Migration Complexity | Application Code Impact | Test Impact | Risk Level |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Driver & Pool (`mssql`)** | `pg` / `pg-pool` | Medium | High: Requires new `postgres.ts` connection pool manager. | Medium: Requires PostgreSQL test fixtures. | **Medium** |
| **Named Params (`@param`)** | Positional Params (`$1, $2`) | Low-Medium | High: All 11 repositories must map parameters to `$1, $2...`. | Medium: Parameter binding verification. | **Medium** |
| **`OUTPUT INSERTED.*`** | `RETURNING col1, col2` | Low | Low: Affects `sql-user-repository.ts` (`incrementFailedLogins`). | Low: Verify returned object structure. | **Low** |
| **`MERGE` Statements** | `INSERT ... ON CONFLICT DO UPDATE` | Medium | High: 6 repositories and seed script require rewritten queries. | High: Upsert race conditions and key conflicts. | **Medium** |
| **`SELECT TOP (n)`** | `SELECT ... LIMIT n` | Low | Low: Affects audit logs, email verification, password reset repos. | Low: Verify row limits. | **Low** |
| **`OFFSET..FETCH NEXT`** | `LIMIT $1 OFFSET $2` | Low | Low: Affects `sql-analysis-repository.ts` (`listByUser`). | Low: Verify pagination bounds. | **Low** |
| **`STRING_SPLIT(@roles, ',')`** | `ANY($1::text[])` or `unnest` | Low-Medium | Medium: In `sql-user-repository.ts`, pass roles as array. | Medium: Role assignment tests. | **Low** |
| **Procedural `IF..BEGIN..END`** | `INSERT..ON CONFLICT` / transactions | Medium | Medium: User repository logic must be refactored into clean queries. | Medium: Account lockout and user registration tests. | **Medium** |
| **Identifier Casing (`record.Id`)** | Column aliasing / mapping layer | Medium | High: Without explicit quoting or casing mapper, all entity fields return `undefined`. | High: Integration assertions catch missing fields. | **HIGH** |
| **`UNIQUEIDENTIFIER` & `NEWID()`** | `UUID` & `gen_random_uuid()` | Low | Low: Both represent UUID strings in application space. | Low: Entity schema validation tests pass unchanged. | **Low** |
| **`DATETIME2` & `SYSUTCDATETIME()`**| `TIMESTAMPTZ` & `NOW()` | Low | Low: JavaScript `Date` instances map naturally to both. | Low: Timestamp assertions pass. | **Low** |
| **`BIT` (0 / 1)** | `BOOLEAN` (`true` / `false`) | Low | Low: Repositories currently convert `isEmailVerified ? 1 : 0`. | Low: Boolean assertions pass. | **Low** |
| **Filtered Indexes (`WHERE x IS NOT NULL`)** | Partial Indexes (`WHERE x IS NOT NULL`) | Low | Low: Migration scripts only. Native support in PostgreSQL. | Low: Index creation checks. | **Low** |
| **Migration Runner (`GO` splitter)** | Semicolon/SQL statement parser | Medium | High: Existing runner cannot run PG migrations; requires dedicated runner. | High: `tests/migrations.test.ts` must test PG engine. | **Medium** |
| **T-SQL Migrations (3 files)** | PostgreSQL DDL Migrations | Medium | High: Must author PostgreSQL migration scripts from scratch. | High: Schema verification on PostgreSQL engine. | **HIGH** |

---

## 5. PostgreSQL Migration Risk Rating

### Definitive Rating: **HIGH RISK**

> [!CAUTION]
> **Why PostgreSQL Migration Cannot Be Claimed Low Risk**:
> 1. **No ORM Abstraction**: CodeGuard AI does not use an ORM (such as Prisma or TypeORM) to abstract SQL dialect differences. All 11 repositories execute handwritten raw SQL queries.
> 2. **Silent Failure via Casing Folding**: PostgreSQL folds all unquoted identifiers to lowercase. Because the entire TypeScript application layer expects PascalCase properties (`record.Id`, `record.UserId`, `record.OverallScore`), an unmitigated cutover will execute queries that succeed at the SQL level while returning `undefined` for all model fields, leading to silent application failure.
> 3. **Proprietary T-SQL Constructs**: The application relies on T-SQL specific behavior:
>    * `OUTPUT INSERTED.*` for atomic account security.
>    * `MERGE ... USING ... WHEN MATCHED` across 6 domain entities.
>    * Procedural `IF ... BEGIN ... END` blocks and `@@ROWCOUNT` inside application queries.
>    * `STRING_SPLIT` table-valued functions.
> 4. **Complete Migration Engine Incompatibility**: The existing migration runner relies on SQL Server `GO` statements and system tables (`sys.indexes`, `IF OBJECT_ID`).
> 5. **Extensive Test Suite Coupling**: Over 950 lines of integration tests execute directly against SQL Server error classifications and database behaviors.

### Safe Architecture Recommendation: The Repository Provider Pattern
To mitigate this high risk:
* **Do NOT modify existing SQL Server repositories**.
* CodeGuard AI's Domain-Driven Design already defines domain repository interfaces in `src/domain/repositories/`.
* The safe implementation path introduces a dedicated `src/infrastructure/repositories/postgres/` directory implementing the same domain interfaces with `pg`.
* A `DB_DIALECT` configuration toggle switches between SQL Server and PostgreSQL repositories without risking the production baseline.

---

## 6. Platform-Agnostic Database Configuration Model

The current configuration in `apps/api/src/config/env.ts` enforces SQL Server-specific production invariants.

### Proposed Platform-Agnostic Abstraction (Design Only)
```typescript
export const dbConfigSchema = z.object({
  DB_DIALECT: z.enum(["sqlserver", "postgres"]).default("sqlserver"),

  // PostgreSQL / Neon Configuration (Free Demo)
  DATABASE_URL: z.string().optional(), // postgresql://user:pass@ep-xyz.region.aws.neon.tech/neondb?sslmode=require
  PGHOST: z.string().optional(),
  PGPORT: z.coerce.number().default(5432),
  PGDATABASE: z.string().optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGSSL: z.preprocess((val) => (typeof val === "string" ? val.toLowerCase() === "true" || val === "require" : Boolean(val)), z.boolean()).default(true),
  PG_POOL_MIN: z.coerce.number().default(0),
  PG_POOL_MAX: z.coerce.number().default(10),
  PG_CONNECTION_TIMEOUT: z.coerce.number().default(15000),

  // SQL Server Configuration (Production Target — Preserved)
  SQLSERVER_HOST: z.string().default("localhost"),
  SQLSERVER_PORT: z.coerce.number().default(54833),
  SQLSERVER_DATABASE: z.string().default("CodeGuardAI"),
  SQLSERVER_USER: z.string().default("sa"),
  SQLSERVER_PASSWORD: z.string().default(""),
  SQLSERVER_ENCRYPT: z.boolean().default(true),
  SQLSERVER_TRUST_SERVER_CERTIFICATE: z.boolean().optional(),
  SQLSERVER_CONNECTION_TIMEOUT: z.coerce.number().default(15000),
  SQLSERVER_POOL_MIN: z.coerce.number().optional(),
  SQLSERVER_POOL_MAX: z.coerce.number().default(20),
});
```

---

## 7. Redis Mapping & Upstash Free Quota Verification

### Current Upstash Free Tier Specifications
* **Data Storage**: 256 MB
* **Command Quota**: **500,000 commands/month**
* **Bandwidth**: **10 GB/month**
* **Protocol**: Encrypted TLS connection (`rediss://`)

### Verification Findings
1. **URL Format Support**: `apps/api/src/config/env.ts` accepts `rediss://` via `isRedisConnectionUrl()`.
2. **Client Driver**: `redis@^6.2.1` in `apps/api/src/infrastructure/redis/client.ts` natively supports TLS connections with `rediss://`.
3. **Failover & Degradation**: `DegradedRedisRateLimitStore` falls back to an in-memory sliding window if Upstash Redis is unreachable or exceeds its monthly command quota, ensuring zero application downtime.
4. **Code Impact**: **Zero code changes required**.

---

## 8. API Deployment Requirements (Koyeb Free Instance)

### 8.1 Koyeb Free Instance Specifications
* **Allocation**: **1 Free Instance per organization**.
* **Resources**: **512 MB RAM, 0.1 vCPU, 2 GB SSD storage**.
* **Lifecycle**: **Scales down to zero after 1 hour without traffic**.
* **Intended Use**: Testing, demos, and hobby workloads only. **NOT intended for production workloads**.

### 8.2 Container & Runtime Compatibility
* **Dockerfile**: Multi-stage Alpine container (`node:20-alpine`, `dumb-init`, non-root user `node`) is fully compatible with Koyeb's Docker builder.
* **PORT Handling**: Binds to `env.PORT` dynamically. Koyeb can route external HTTP traffic to port `5000` or inject `PORT=8000`.
* **Health Checks**: Configure Koyeb HTTP health probe to path `/health` (liveness probe; returns `{ status: "ok" }` in <5ms). The `/ready` probe checks downstream dependencies and should remain an internal diagnostic endpoint.
* **Scale-to-Zero Behavior**: After 1 hour of zero traffic, the Free Instance suspends. Inbound requests wake the container in ~6–10 seconds.
* **Database Cold Start**: Neon computes suspend after inactivity. Initial database queries take ~1–2 seconds to resume. Combined cold-start request latency is ~8–12 seconds.
* **Outbound Networking**: Neon PostgreSQL enforces TLS (`sslmode=require`) and accepts connections from dynamic Koyeb IPs.

---

## 9. AI Service Deployment Evaluation & Recommendation

### 9.1 Resource Profiling & Free-Tier Incompatibility
* **Dependencies**: FastAPI, Uvicorn, Pydantic v2, HTTPX, Tenacity, Google GenAI SDK (with Protobuf and gRPC).
* **Worker Configuration**: The Dockerfile runs `uvicorn` with `--workers 2`.
* **Memory Footprint**:
  * Base runtime + dependencies: ~230 MB idle RSS across master and 2 workers.
  * Active AST parsing and LLM prompt processing: spikes by +100 MB to +180 MB.
  * Peak working set: **350 MB – 450 MB**.
* **Koyeb Free Tier Limitation**:
  * Koyeb Free tier provides **only 1 Free Instance per organization**.
  * Running the API on Koyeb exhausts the free tier quota. Koyeb **cannot** run both the API and the AI service for free.
  * Furthermore, running the AI service on 512 MB RAM with 0.1 vCPU poses severe OOM kill risks and excessive AST analysis latencies.

### 9.2 Recommendation
**Keep the AI service on Railway as a temporary demo architecture**:
* The API continues communicating with the AI service over public HTTPS via `AI_SERVICE_URL`.
* The API already uses standard REST calls with a 45-second timeout (`AbortSignal.timeout(45_000)`).
* This preserves multi-provider capabilities without exhausting Koyeb's single free instance allowance.

---

## 10. Frontend Configuration (Vercel) & Cross-Origin Security

* **Environment Variable Injection**:
  * In Vercel, `NEXT_PUBLIC_BACKEND_API_URL` is set to the Koyeb public URL (`https://codeguard-api.koyeb.app`).
  * Only public variables prefixed with `NEXT_PUBLIC_` are exposed in the client bundle; all backend database credentials, JWT secrets, and Redis keys remain isolated on Koyeb.
* **Cross-Origin Authentication (Vercel -> Koyeb)**:
  * Express CORS policy allows the Vercel frontend origin (`FRONTEND_URL` / `CORS_ORIGIN`) with `credentials: true`.
  * Cookies (`codeguard_refresh_token` and `codeguard_csrf_token`) require:
    * `AUTH_COOKIE_SAME_SITE="none"`
    * `AUTH_COOKIE_SECURE=true`
  * These settings are validated in `apps/api/tests/free-demo-architecture.test.ts`.

---

## 11. Environment Variable Map

| Variable Name | Required Service | Host Provider | Value / Format Example | Secret? | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | API | Koyeb | `production` | No | Enables production optimizations & security policies. |
| `PORT` | API | Koyeb | `5000` | No | HTTP port for Koyeb ingress. |
| `FRONTEND_URL` | API | Koyeb | `https://codeguard-ai.vercel.app` | No | Allowed CORS origin & redirect destination. |
| `CORS_ORIGIN` | API | Koyeb | `https://codeguard-ai.vercel.app` | No | Explicit CORS allowlist. |
| `API_BASE_URL` | API | Koyeb | `https://codeguard-api.koyeb.app` | No | Public URL used in email verification links. |
| `DATABASE_URL` | API | Koyeb | `postgresql://user:pass@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require` | **YES** | Neon PostgreSQL pooled connection URL. |
| `DB_DIALECT` | API | Koyeb | `postgres` (Phase 6C-1) | No | Selects PostgreSQL repository implementation. |
| `REDIS_URL` | API | Koyeb | `rediss://default:token@xyz.upstash.io:6379` | **YES** | Upstash TLS Redis connection string. |
| `JWT_ACCESS_SECRET` | API | Koyeb | `[High-entropy 32+ character random secret]` | **YES** | Signs short-lived access JWTs. |
| `JWT_REFRESH_SECRET`| API | Koyeb | `[High-entropy 32+ character random secret]` | **YES** | Signs persistent refresh JWTs. |
| `AUTH_COOKIE_SAME_SITE` | API | Koyeb | `none` | No | Required for cross-site cookie transmission (Vercel → Koyeb). |
| `AUTH_COOKIE_SECURE` | API | Koyeb | `true` | No | Enforces HTTPS-only cookies. |
| `AI_SERVICE_URL` | API | Koyeb | `https://codeguard-ai-service.up.railway.app` | No | Directs code analysis requests to Railway AI container. |
| `NEXT_PUBLIC_BACKEND_API_URL` | Web | Vercel | `https://codeguard-api.koyeb.app` | No | Frontend API target endpoint (public bundle). |
| `GEMINI_API_KEY` | AI | Railway | `[Google AI Studio API Key]` | **YES** | Primary LLM provider key on AI service. |
| `OPENAI_API_KEY` | AI | Railway | `[OpenAI Key or leave unset]` | **YES** | Secondary failover provider. |

---

## 12. Security & Compliance Constraints

1. **Transport Layer Security (TLS)**:
   * Client to Vercel: HTTPS
   * Client / Vercel to Koyeb: HTTPS
   * Koyeb API to Neon PostgreSQL: TLS (`sslmode=require`)
   * Koyeb API to Upstash Redis: TLS (`rediss://`)
   * Koyeb API to Railway AI: HTTPS
2. **Secret Isolation**:
   * Zero secrets stored in git repository.
   * Koyeb Encrypted Secrets store database passwords, JWT secrets, and Redis URLs.
   * Railway Sealed Variables store AI provider keys.
3. **Proxy Ingress Trust**:
   * `app.set("trust proxy", 1)` is enabled in `apps/api/src/app.ts` to sanitize client IP headers for rate-limiting.
4. **Credential Redaction in Logs**:
   * `sanitizeRedisLogText` strips tokens from Upstash error logs.
   * `classifySqlError` redacts credentials before console output.

---

## 13. Known Limitations & Mitigation Strategies

| Limitation | Technical Detail | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Koyeb Sleep on Idle** | Free Instance scales to zero after 1 hour without traffic. | First request after sleep takes 6–10 seconds. | Frontend UI displays friendly waking status; health probe keeps alive during active demos. |
| **Neon Compute Auto-Suspend** | Compute suspends during idle periods. | First DB query takes 1–2 seconds to resume. | Use Neon PgBouncer connection pooler; configure 15s connection timeout in API. |
| **Upstash Monthly Quota** | Free tier capped at 500,000 commands/month. | Exceeding quota returns Redis errors. | `DegradedRedisRateLimitStore` seamlessly falls back to in-memory rate limiting with zero downtime. |
| **Neon Storage & Egress Limits** | 0.5 GB storage, 50 CU-hours/month, 5 GB egress/month. | Exceeding limits blocks database operations. | Implement automated cleanup routines for demo analysis payloads; scope demo to lightweight codebases. |
| **Cross-Site Cookie Restrictions** | Some browsers block third-party cookies by default. | Third-party cookie blocking may prevent silent refresh. | Frontend retains access token in memory during active session; provides clear login prompt on expiry. |

---

## 14. Rollback Plan

1. **Instant Rollback to Railway + SQL Server**:
   * The primary production deployment on Railway and Azure SQL Database remains completely intact.
   * Reverting Vercel's `NEXT_PUBLIC_BACKEND_API_URL` to Railway restores baseline production immediately.
2. **Zero Code Breakage**:
   * No SQL Server repositories or migrations are modified or deleted.
   * All existing tests continue passing against SQL Server.

---

## 15. Exact Next Implementation Phases

```mermaid
flowchart LR
    P6C["Phase 6C-Free\n(Assessment & Design)\n[COMPLETED]"]
    P6C1["Phase 6C-1\nPostgreSQL DDL &\nMigration Engine"]
    P6C2["Phase 6C-2\nPostgreSQL Repositories\n(Domain Adapters)"]
    P6C3["Phase 6C-3\nKoyeb, Neon & Upstash\nStaging Deploys"]
    P6C4["Phase 6C-4\nE2E Smoke Verification\n& Demo Cutover"]

    P6C --> P6C1 --> P6C2 --> P6C3 --> P6C4
```

1. **Phase 6C-1: PostgreSQL Schema & Dedicated Migration Engine**
   * Author PostgreSQL DDL schema (`database/postgres/schema.sql`) replacing T-SQL constructs with `UUID`, `TIMESTAMPTZ`, `BOOLEAN`, and partial indexes.
   * Implement `postgres-migration-runner.ts` using `pg` without SQL Server `GO` splitters.
   * Add automated test verifying schema idempotency against PostgreSQL.

2. **Phase 6C-2: Repository Implementation Layer (PostgreSQL Adapters)**
   * Create `src/infrastructure/repositories/postgres/` implementing domain repository interfaces.
   * Convert all queries: replace `@param` with `$1, $2`, rewrite `MERGE` to `ON CONFLICT`, rewrite `OUTPUT` to `RETURNING`, and enforce PascalCase field mapping.
   * Implement a repository factory toggling implementations via `DB_DIALECT`.

3. **Phase 6C-3: Koyeb, Neon & Upstash Staging Deployment**
   * Create Neon Free PostgreSQL database and run migrations via `postgres-migration-runner`.
   * Create Upstash Redis instance and obtain `rediss://` TLS endpoint.
   * Deploy `apps/api` container to Koyeb Free Instance with environment variables.
   * Configure Vercel frontend with `NEXT_PUBLIC_BACKEND_API_URL`.

4. **Phase 6C-4: End-to-End Verification & Demo Cutover**
   * Execute full smoke test: user registration, login, cookie persistence, code analysis with AI service, stats calculation, and rate-limit verification.
