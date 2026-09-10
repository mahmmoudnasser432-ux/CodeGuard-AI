import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import pg from "pg";
import { execSync } from "child_process";
import { createApp } from "../src/app.js";
import { runPostgresMigrations } from "../src/infrastructure/database/postgres-migration-runner.js";
import { v4 as uuidv4 } from "uuid";

const CONTAINER_NAME = "codeguard-pg-live-test-6c3";
const PG_PORT = 54334;
const PG_USER = "codeguard";
const PG_PASSWORD = "TestPassword123!";
const PG_DATABASE = "codeguard_test";

describe("Phase 6C-3: Full Live PostgreSQL Runtime Integration Test", () => {
  let pool: pg.Pool;
  let appContainer: ReturnType<typeof createApp>;

  beforeAll(async () => {
    // 1. Ensure any previous test container is removed
    try {
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "ignore" });
    } catch {
      // ignore if not running
    }

    // 2. Start ephemeral PostgreSQL 16 Alpine container
    console.log(`[Test] Launching ephemeral PostgreSQL 16 Alpine container (${CONTAINER_NAME})...`);
    execSync(
      `docker run -d --name ${CONTAINER_NAME} -e POSTGRES_USER=${PG_USER} -e POSTGRES_PASSWORD=${PG_PASSWORD} -e POSTGRES_DB=${PG_DATABASE} -p ${PG_PORT}:5432 postgres:16-alpine`,
      { stdio: "inherit" }
    );

    // 3. Wait for PostgreSQL to become ready
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: PG_DATABASE,
      connectionTimeoutMillis: 5000,
    });

    let connected = false;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      try {
        const res = await pool.query("SELECT 1 AS ready;");
        if (res.rows?.[0]?.ready === 1) {
          connected = true;
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!connected) {
      throw new Error("Failed to connect to ephemeral PostgreSQL container within timeout.");
    }
    console.log("[Test] Ephemeral PostgreSQL connected successfully.");

    // 4. Run migrations on the test database
    console.log("[Test] Running migrations on ephemeral database...");
    const migrationResult = await runPostgresMigrations(undefined, pool);
    expect(migrationResult.applied.length).toBeGreaterThan(0);
    console.log(`[Test] Applied ${migrationResult.applied.length} migrations.`);

    // 5. Initialize the actual composition root with DB_DIALECT=postgres
    appContainer = createApp({
      dbDialect: "postgres",
      postgresPool: pool,
    });
  }, 45000);

  afterAll(async () => {
    // Cleanly close application and pool
    if (appContainer) {
      await appContainer.close();
    }
    if (pool) {
      await pool.end().catch(() => {});
    }

    // Stop and remove ephemeral container
    try {
      console.log(`[Test] Removing ephemeral container ${CONTAINER_NAME}...`);
      execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "inherit" });
      console.log("[Test] Container removed.");
    } catch (err) {
      console.warn("Failed to remove container:", err);
    }

    // Verify container is gone
    const psOutput = execSync(`docker ps -a --filter name=${CONTAINER_NAME} -q`, { encoding: "utf8" }).trim();
    expect(psOutput).toBe("");
  });

  it("boots with DB_DIALECT=postgres without triggering runtime guards", () => {
    expect(appContainer).toBeDefined();
    expect(appContainer.app).toBeDefined();
    expect(appContainer.dbDialect).toBe("postgres");
    expect(appContainer.postgresPool).toBe(pool);
  });

  it("responds successfully on /health liveness probe", async () => {
    const res = await request(appContainer.app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("codeguard-api");
  });

  it("responds successfully on /ready readiness probe with healthy database", async () => {
    const res = await request(appContainer.app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
    expect(res.body.dependencies.database).toBe("healthy");
  });

  it("processes user registration through full HTTP pipeline (controller -> service -> repositories)", async () => {
    // 1. Obtain CSRF token
    const csrfRes = await request(appContainer.app).get("/api/auth/csrf");
    expect(csrfRes.status).toBe(200);
    expect(csrfRes.body.csrfToken).toBeDefined();

    // 2. Register new user via HTTP POST
    const registrationEmail = `http-user-${Date.now()}@codeguard.test`;
    const registerRes = await request(appContainer.app)
      .post("/api/auth/register")
      .send({
        email: registrationEmail,
        password: "LiveHttpPassword123!",
        displayName: "HTTP Live User",
      });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.message).toBe("USER_CREATED_VERIFICATION_EMAIL_SENT");
    expect(registerRes.body.userId).toBeDefined();

    // 3. Confirm persistence in PostgreSQL via UserRepository
    const createdUser = await appContainer.userRepository.findById(registerRes.body.userId);
    expect(createdUser).not.toBeNull();
    expect(createdUser?.email).toBe(registrationEmail);
    expect(createdUser?.displayName).toBe("HTTP Live User");
  });

  it("performs authenticated user operations against PostgreSQL", async () => {
    const userId = uuidv4();
    const userEmail = `live-user-${Date.now()}@codeguard.test`;
    const passwordHash = await appContainer.authService.hashPassword("SuperSecret123!");

    // Save user via UserRepository
    const savedUser = await appContainer.userRepository.save(
      {
        id: userId,
        email: userEmail,
        displayName: "Live Test User",
        roles: ["developer"],
        isEmailVerified: true,
        mfaEnabled: false,
      },
      passwordHash
    );

    expect(savedUser.id).toBe(userId);
    expect(savedUser.email).toBe(userEmail);

    // Retrieve user via findById
    const fetchedUser = await appContainer.userRepository.findById(userId);
    expect(fetchedUser).not.toBeNull();
    expect(fetchedUser?.email).toBe(userEmail);

    // Create session in PostgreSQL
    const sessionId = uuidv4();
    const session = await appContainer.sessionRepository.create({
      id: sessionId,
      userId: userId,
      jti: uuidv4(),
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });
    expect(session.id).toBe(sessionId);
    expect(session.userId).toBe(userId);

    const retrievedSession = await appContainer.sessionRepository.findById(sessionId);
    expect(retrievedSession).not.toBeNull();
    expect(retrievedSession?.userId).toBe(userId);
  });

  it("performs Project and Analysis operations against PostgreSQL", async () => {
    const ownerUserId = uuidv4();
    await appContainer.userRepository.save({
      id: ownerUserId,
      email: `owner-${Date.now()}@codeguard.test`,
      displayName: "Project Owner",
      roles: ["developer"],
      isEmailVerified: true,
      mfaEnabled: false,
    });

    const projectId = uuidv4();
    const project = await appContainer.projectRepository.save({
      id: projectId,
      name: "Phase 6C-3 Test Project",
      description: "PostgreSQL Runtime DI Test Project",
      ownerUserId: ownerUserId,
      defaultBranch: "main",
      settings: { analysisLevel: "standard" },
    });

    expect(project.id).toBe(projectId);
    expect(project.name).toBe("Phase 6C-3 Test Project");

    const analysisId = uuidv4();
    const now = new Date();
    const analysis = await appContainer.analysisRepository.save(
      {
        id: analysisId,
        type: "security-analysis",
        title: "Live PostgreSQL Security Analysis",
        summary: "Verification scan for Phase 6C-3 composition root",
        projectId: projectId,
        requestedByUserId: ownerUserId,
        startedAt: now,
        completedAt: now,
        scores: {
          overallScore: 95,
          securityScore: 98,
          qualityScore: 92,
          performanceScore: 95,
          maintainabilityScore: 90,
          readabilityScore: 92,
        },
      },
      ownerUserId
    );

    expect(analysis.id).toBe(analysisId);

    const fetchedAnalysis = await appContainer.analysisRepository.findById(analysisId);
    expect(fetchedAnalysis).not.toBeNull();
    expect(fetchedAnalysis?.title).toBe("Live PostgreSQL Security Analysis");
    expect(fetchedAnalysis?.scores?.securityScore).toBe(98);
  });

  it("performs Interview, Notification, and AuditLog operations against PostgreSQL", async () => {
    const candidateUserId = uuidv4();
    const recruiterUserId = uuidv4();

    await appContainer.userRepository.save({
      id: candidateUserId,
      email: `candidate-${Date.now()}@codeguard.test`,
      displayName: "Candidate User",
      roles: ["developer"],
      isEmailVerified: true,
      mfaEnabled: false,
    });

    await appContainer.userRepository.save({
      id: recruiterUserId,
      email: `recruiter-${Date.now()}@codeguard.test`,
      displayName: "Recruiter User",
      roles: ["recruiter"],
      isEmailVerified: true,
      mfaEnabled: false,
    });

    // 1. Interview Session
    const interviewSessionId = uuidv4();
    const session = await appContainer.interviewRepository.saveSession({
      id: interviewSessionId,
      title: "Live Runtime DI Interview",
      candidateUserId,
      recruiterUserId,
      status: "in_progress",
    });
    expect(session.id).toBe(interviewSessionId);
    expect(session.title).toBe("Live Runtime DI Interview");

    const fetchedSession = await appContainer.interviewRepository.findSessionById(interviewSessionId);
    expect(fetchedSession).not.toBeNull();
    expect(fetchedSession?.candidateUserId).toBe(candidateUserId);

    // 2. Notification
    const notifId = uuidv4();
    const notification = await appContainer.notificationRepository.save({
      id: notifId,
      userId: candidateUserId,
      type: "interview_scheduled",
      title: "Your interview is confirmed",
      body: "Welcome to CodeGuard AI technical evaluation.",
      createdAt: new Date(),
    });
    expect(notification.id).toBe(notifId);

    const notifications = await appContainer.notificationRepository.listByUser(candidateUserId);
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    expect(notifications[0].title).toBe("Your interview is confirmed");

    // 3. Audit Log
    const auditLogId = uuidv4();
    const auditLog = await appContainer.auditLogRepository.save({
      id: auditLogId,
      actorUserId: recruiterUserId,
      eventType: "INTERVIEW_SESSION_CREATED",
      entityType: "InterviewSession",
      entityId: interviewSessionId,
      ipAddress: "127.0.0.1",
      userAgent: "Vitest-DI-Suite",
      metadata: { dialect: "postgres", phase: "6C-3" },
      createdAt: new Date(),
    });
    expect(auditLog.id).toBe(auditLogId);

    const logs = await appContainer.auditLogRepository.listByActor(recruiterUserId);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].eventType).toBe("INTERVIEW_SESSION_CREATED");
  });
});
