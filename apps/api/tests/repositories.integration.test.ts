console.log("TEST FILE: Top of file reached");
import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { SqlUserRepository } from "../src/infrastructure/repositories/sql-user-repository";
import { SqlProjectRepository } from "../src/infrastructure/repositories/sql-project-repository";
import { SqlAnalysisRepository } from "../src/infrastructure/repositories/sql-analysis-repository";
import { SqlReportRepository } from "../src/infrastructure/repositories/sql-report-repository";
import { SqlInterviewRepository } from "../src/infrastructure/repositories/sql-interview-repository";
import { SqlNotificationRepository } from "../src/infrastructure/repositories/sql-notification-repository";
import { SqlAuditLogRepository } from "../src/infrastructure/repositories/sql-audit-log-repository";
import { sqlPool } from "../src/infrastructure/database/sqlserver";
import type { User, UserRole } from "../../../domain/entities/user";

// Test interfaces matching actual domain entities
interface TestUser {
  id?: string;
  email: string;
  displayName: string;
  roles: UserRole[];
  isEmailVerified?: boolean;
  mfaEnabled?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  passwordHash?: string;
}

interface TestProject {
  id?: string;
  ownerUserId: string;
  name: string;
  description?: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TestAnalysis {
  id?: string;
  projectId: string;
  requestedByUserId: string;
  title: string;
  type: "code-review" | "security-analysis" | "performance-analysis" | "documentation-generator" | "interview-generator" | "repository-analysis" | "scoring-engine";
  summary: string;
  scores: {
    overallScore: number;
    securityScore: number;
    qualityScore: number;
    performanceScore: number;
    maintainabilityScore: number;
    readabilityScore: number;
  };
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TestReport {
  id?: string;
  analysisId: string;
  title: string;
  content?: string;
  format?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TestInterview {
  id?: string;
  analysisId: string;
  title: string;
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface TestNotification {
  id?: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  readAt?: Date;
  createdAt?: Date;
}

interface TestAuditLog {
  id?: string;
  actorUserId?: string;
  eventType: string;
  entityType: string;
  entityId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

// Helper to clean up test data
async function cleanupTestData() {
  const tables = [
    "AuditLogs",
    "Notifications",
    "Interviews",
    "Reports",
    "AnalysisScores",
    "Analyses",
    "Projects",
    "Users",
    "UserRoles"
    // Note: Roles table is excluded to preserve essential roles
  ];

  for (const table of tables) {
    try {
      await sqlPool.request().query(`DELETE FROM ${table}`);
    } catch (err) {
      // Table might not exist yet, or other issues - ignore for cleanup
    }
  }
}

// Ensure essential roles exist
async function ensureRolesExist() {
  const roles = [
    { id: "11111111-1111-1111-1111-111111111112", name: "admin" },
    { id: "22222222-2222-2222-2222-222222222223", name: "developer" },
    { id: "33333333-3333-3333-3333-333333333334", name: "recruiter" },
    { id: "44444444-4444-4444-4444-444444444445", name: "team_lead" }
  ];

  console.log("ensureRolesExist() called");
  for (const role of roles) {
    try {
      console.log(`Checking/inserting role: ${role.id} - ${role.name}`);
      const result = await sqlPool.request()
        .input('id', role.id)
        .input('name', role.name)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.Roles WHERE Id = @id)
          BEGIN
            INSERT INTO dbo.Roles (Id, Name) VALUES (@id, @name)
          END
        `);
      console.log(`Result for role ${role.id}: ${JSON.stringify(result)}`);
    } catch (err) {
      console.error(`Error ensuring role ${role.id} exists:`, err);
      // Role might already exist - ignore
    }
  }

  // Verify roles were inserted
  try {
    const verifyResult = await sqlPool.request().query('SELECT Id, Name FROM dbo.Roles');
    console.log(`Current roles in database: ${JSON.stringify(verifyResult.recordset)}`);
  } catch (err) {
    console.error('Error verifying roles:', err);
  }
}

describe("SQL Repository Integration Tests", () => {
  let userRepo: SqlUserRepository;
  let projectRepo: SqlProjectRepository;
  let analysisRepo: SqlAnalysisRepository;
  let reportRepo: SqlReportRepository;
  let interviewRepo: SqlInterviewRepository;
  let notificationRepo: SqlNotificationRepository;
  let auditLogRepo: SqlAuditLogRepository;

  beforeAll(async () => {
    console.log("BEFOREALL: Entering beforeAll hook");
    try {
      await sqlPool.connect();
      console.log("beforeAll: Starting database connection...");
      console.log("Connected to database for integration tests");

      // Initialize repositories
      userRepo = new SqlUserRepository();
      projectRepo = new SqlProjectRepository();
      analysisRepo = new SqlAnalysisRepository();
      reportRepo = new SqlReportRepository();
      interviewRepo = new SqlInterviewRepository();
      notificationRepo = new SqlNotificationRepository();
      auditLogRepo = new SqlAuditLogRepository();

      // Ensure roles exist
      await ensureRolesExist();

      // Ensure Analyses table has Title column
      try {
        const columnCheck = await sqlPool.request().query(`
          SELECT COL_LENGTH('dbo.Analyses', 'Title') AS TitleLength
        `);
        const titleLength = columnCheck.recordset[0]?.TitleLength;
        if (titleLength === null) {
          console.log("Adding Title column to Analyses table");
          await sqlPool.request().query(`
            ALTER TABLE dbo.Analyses
            ADD Title NVARCHAR(255) NULL
          `);
        } else {
          console.log("Title column already exists in Analyses table");
        }
      } catch (columnError) {
        console.error("Error checking/adding Title column:", columnError);
        // Continue anyway - the test might still work if the column exists
      }

      // Ensure Reports table has Title column
      try {
        const columnCheck = await sqlPool.request().query(`
          SELECT COL_LENGTH('dbo.Reports', 'Title') AS TitleLength
        `);
        const titleLength = columnCheck.recordset[0]?.TitleLength;
        if (titleLength === null) {
          console.log("Adding Title column to Reports table");
          await sqlPool.request().query(`
            ALTER TABLE dbo.Reports
            ADD Title NVARCHAR(255) NULL
          `);
        } else {
          console.log("Title column already exists in Reports table");
        }
      } catch (columnError) {
        console.error("Error checking/adding Title column to Reports:", columnError);
        // Continue anyway - the test might still work if the column exists
      }

      // Ensure InterviewSessions table has Title column
      try {
        const columnCheck = await sqlPool.request().query(`
          SELECT COL_LENGTH('dbo.InterviewSessions', 'Title') AS TitleLength
        `);
        const titleLength = columnCheck.recordset[0]?.TitleLength;
        if (titleLength === null) {
          console.log("Adding Title column to InterviewSessions table");
          await sqlPool.request().query(`
            ALTER TABLE dbo.InterviewSessions
            ADD Title NVARCHAR(255) NULL
          `);
        } else {
          console.log("Title column already exists in InterviewSessions table");
        }
      } catch (columnError) {
        console.error("Error checking/adding Title column to InterviewSessions:", columnError);
        // Continue anyway - the test might still work if the column exists
      }

      // Clean up any existing test data
      await cleanupTestData();
    } catch (error) {
      console.error("Failed to connect to database:", error);
      throw error;
    }
  });

  afterAll(async () => {
    await cleanupTestData();
    await sqlPool.close();
    console.log("Database connection closed");
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupTestData();
  });

  describe("UserRepository", () => {
    it("should create and retrieve a user", async () => {
      const userData: TestUser = {
        id: "11111111-1111-1111-1111-111111111111",
        email: "test1@example.com",
        displayName: "Test User 1",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-1"
      };

      // Create user
      const createdUser = await userRepo.save(userData);
      expect(createdUser).toBeDefined();
      expect(createdUser.id).toBe(userData.id);
      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.displayName).toBe(userData.displayName);
      expect(createdUser.roles).toEqual(userData.roles);

      // Retrieve user
      const retrievedUser = await userRepo.findById(createdUser.id);
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.email).toBe(userData.email);
      expect(retrievedUser?.displayName).toBe(userData.displayName);
      expect(retrievedUser?.roles).toEqual(userData.roles);
    });

    it("should update a user", async () => {
      const userData: TestUser = {
        id: "22222222-2222-2222-2222-222222222222",
        email: "test2@example.com",
        displayName: "Original Name",
        roles: ["22222222-2222-2222-2222-222222222223"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-2"
      };

      // Create user
      const createdUser = await userRepo.save(userData);
      expect(createdUser).toBeDefined();

      // Update user
      const updatedUserData: TestUser = {
        ...userData,
        displayName: "Updated Name",
        email: "updated@example.com",
        roles: ["11111111-1111-1111-1111-111111111112", "22222222-2222-2222-2222-222222222223"] as UserRole[]
      };

      const updatedUserResult = await userRepo.save(updatedUserData);
      expect(updatedUserResult).toBeDefined();
      expect(updatedUserResult.displayName).toBe("Updated Name");
      expect(updatedUserResult.email).toBe("updated@example.com");
      expect(updatedUserResult.roles).toEqual(["11111111-1111-1111-1111-111111111112", "22222222-2222-2222-2222-222222222223"] as UserRole[]);

      // Verify update persisted
      const retrievedUser = await userRepo.findById(updatedUserResult.id);
      expect(retrievedUser).toBeDefined();
      expect(retrievedUser?.displayName).toBe("Updated Name");
      expect(retrievedUser?.email).toBe("updated@example.com");
      expect(retrievedUser?.roles).toEqual(["11111111-1111-1111-1111-111111111112", "22222222-2222-2222-2222-222222222223"] as UserRole[]);
    });

    it("should list users by role", async () => {
      // Create users with different roles
      const adminUserData: TestUser = {
        id: "33333333-3333-3333-3333-333333333333",
        email: "admin@example.com",
        displayName: "Admin User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-admin"
      };

      const userUserData: TestUser = {
        id: "44444444-4444-4444-4444-444444444444",
        email: "user@example.com",
        displayName: "Regular User",
        roles: ["22222222-2222-2222-2222-222222222223"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-user"
      };

      // Create admin user
      await userRepo.save(adminUserData);

      // Create regular user
      await userRepo.save(userUserData);

      // Retrieve users by role
      const adminUsers = await userRepo.findByRole("admin");
      expect(adminUsers.length).toBeGreaterThanOrEqual(1);
      expect(adminUsers.some(u => u.email === adminUserData.email)).toBe(true);

      const regularUsers = await userRepo.findByRole("developer");
      expect(regularUsers.length).toBeGreaterThanOrEqual(1);
      expect(regularUsers.some(u => u.email === userUserData.email)).toBe(true);
    });
  });

  describe("ProjectRepository", () => {
    it("should create and retrieve a project", async () => {
      // First create a user to own the project
      const userData: TestUser = {
        id: "55555555-5555-5555-5555-555555555555",
        email: "owner@example.com",
        displayName: "Project Owner",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-owner"
      };

      await userRepo.save(userData);

      const projectData: TestProject = {
        id: "66666666-6666-6666-6666-666666666666",
        ownerUserId: userData.id,
        name: "Test Project",
        description: "A test project",
        status: "active"
      };

      // Create project
      const createdProject = await projectRepo.save({
        id: projectData.id,
        ownerUserId: projectData.ownerUserId,
        name: projectData.name,
        description: projectData.description ?? undefined,
        status: projectData.status ?? "active",
        createdAt: projectData.createdAt ?? new Date(),
        updatedAt: projectData.updatedAt ?? new Date()
      });
      expect(createdProject).toBeDefined();
      expect(createdProject.id).toBe(projectData.id);
      expect(createdProject.name).toBe(projectData.name);
      expect(createdProject.description).toBe(projectData.description);

      // Retrieve project
      const retrievedProject = await projectRepo.findById(createdProject.id);
      expect(retrievedProject).toBeDefined();
      expect(retrievedProject?.name).toBe(projectData.name);
      expect(retrievedProject?.description).toBe(projectData.description);
    });

    it("should list projects by user", async () => {
      // Create a user
      const userData: TestUser = {
        id: "77777777-7777-7777-7777-777777777777",
        email: "projects@example.com",
        displayName: "Projects User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-projects"
      };

      await userRepo.save(userData);

      // Create projects for the user
      const project1Data: TestProject = {
        id: "88888888-8888-8888-8888-888888888888",
        ownerUserId: userData.id,
        name: "Test Project 1",
        description: "First test project",
        status: "active"
      };

      const project2Data: TestProject = {
        id: "99999999-9999-9999-9999-999999999999",
        ownerUserId: userData.id,
        name: "Test Project 2",
        description: "Second test project",
        status: "active"
      };

      await projectRepo.save({
        id: project1Data.id,
        ownerUserId: project1Data.ownerUserId,
        name: project1Data.name,
        description: project1Data.description ?? undefined,
        status: project1Data.status ?? "active",
        createdAt: project1Data.createdAt ?? new Date(),
        updatedAt: project1Data.updatedAt ?? new Date()
      });

      await projectRepo.save({
        id: project2Data.id,
        ownerUserId: project2Data.ownerUserId,
        name: project2Data.name,
        description: project2Data.description ?? undefined,
        status: project2Data.status ?? "active",
        createdAt: project2Data.createdAt ?? new Date(),
        updatedAt: project2Data.updatedAt ?? new Date()
      });

      // Retrieve projects by user
      const projects = await projectRepo.listByOwner(userData.id);
      expect(projects.length).toBeGreaterThanOrEqual(2);
      expect(projects.some(p => p.name === project1Data.name)).toBe(true);
      expect(projects.some(p => p.name === project2Data.name)).toBe(true);
    });
  });

  describe("AnalysisRepository", () => {
    it("should create analysis with scores in a transaction", async () => {
      // Create user
      const userData: TestUser = {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        email: "analysis@example.com",
        displayName: "Analysis User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-analysis"
      };

      await userRepo.save(userData);

      // Create project
      const projectData: TestProject = {
        id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        ownerUserId: userData.id,
        name: "Analysis Project",
        description: "Project for analysis testing",
        status: "active"
      };

      await projectRepo.save({
        id: projectData.id,
        ownerUserId: projectData.ownerUserId,
        name: projectData.name,
        description: projectData.description ?? undefined,
        status: projectData.status ?? "active",
        createdAt: projectData.createdAt ?? new Date(),
        updatedAt: projectData.updatedAt ?? new Date()
      });

      // Create analysis
      const analysisData: TestAnalysis = {
        id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
        projectId: projectData.id,
        requestedByUserId: userData.id,
        title: "Test Analysis",
        type: "code-review",
        summary: "A test analysis",
        scores: {
          overallScore: 85,
          securityScore: 90,
          qualityScore: 80,
          performanceScore: 75,
          maintainabilityScore: 85,
          readabilityScore: 90
        },
        status: "completed"
      };

      const createdAnalysis = await analysisRepo.save(
        {
          id: analysisData.id,
          projectId: analysisData.projectId,
          requestedByUserId: analysisData.requestedByUserId,
          title: analysisData.title,
          type: analysisData.type,
          summary: analysisData.summary,
          scores: analysisData.scores,
          status: analysisData.status ?? "pending"
        },
        analysisData.requestedByUserId
      );
      expect(createdAnalysis).toBeDefined();
      expect(createdAnalysis.id).toBe(analysisData.id);
      expect(createdAnalysis.title).toBe(analysisData.title);
      expect(createdAnalysis.description).toBe(analysisData.description);

      // Add scores (if the repository supports it)
      // This test might need adjustment based on actual AnalysisRepository implementation
      const retrievedAnalysis = await analysisRepo.findById(createdAnalysis.id);
      expect(retrievedAnalysis).toBeDefined();
      expect(retrievedAnalysis?.title).toBe(analysisData.title);
    });

    it("should list analyses by project", async () => {
      // Create user
      const userData: TestUser = {
        id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        email: "analyses@example.com",
        displayName: "Analyses User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-analyses"
      };

      await userRepo.save(userData);

      // Create project
      const projectData: TestProject = {
        id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
        ownerUserId: userData.id,
        name: "Analyses Project",
        description: "Project for analyses testing",
        status: "active"
      };

      await projectRepo.save({
        id: projectData.id,
        ownerUserId: projectData.ownerUserId,
        name: projectData.name,
        description: projectData.description ?? undefined,
        status: projectData.status ?? "active",
        createdAt: projectData.createdAt ?? new Date(),
        updatedAt: projectData.updatedAt ?? new Date()
      });

      // Create analyses for the project
      const analysis1Data: TestAnalysis = {
        id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        projectId: projectData.id,
        requestedByUserId: userData.id,
        title: "Test Analysis 1",
        type: "code-review",
        summary: "First test analysis",
        scores: {
          overallScore: 85,
          securityScore: 90,
          qualityScore: 80,
          performanceScore: 75,
          maintainabilityScore: 85,
          readabilityScore: 90
        },
        status: "completed"
      };

      const analysis2Data: TestAnalysis = {
        id: "10000000-1000-1000-1000-100000000000",
        projectId: projectData.id,
        requestedByUserId: userData.id,
        title: "Test Analysis 2",
        type: "security-analysis",
        summary: "Second test analysis",
        scores: {
          overallScore: 75,
          securityScore: 85,
          qualityScore: 90,
          performanceScore: 80,
          maintainabilityScore: 75,
          readabilityScore: 85
        },
        status: "pending"
      };

      await analysisRepo.save(
        {
          id: analysis1Data.id,
          projectId: analysis1Data.projectId,
          requestedByUserId: analysis1Data.requestedByUserId,
          title: analysis1Data.title,
          type: analysis1Data.type,
          summary: analysis1Data.summary,
          scores: analysis1Data.scores,
          status: analysis1Data.status ?? "pending"
        },
        analysis1Data.requestedByUserId
      );

      await analysisRepo.save(
        {
          id: analysis2Data.id,
          projectId: analysis2Data.projectId,
          requestedByUserId: analysis2Data.requestedByUserId,
          title: analysis2Data.title,
          type: analysis2Data.type,
          summary: analysis2Data.summary,
          scores: analysis2Data.scores,
          status: analysis2Data.status ?? "pending"
        },
        analysis2Data.requestedByUserId
      );

      // Retrieve analyses by project
      const analyses = await analysisRepo.findByProjectId(projectData.id);
      expect(analyses.length).toBeGreaterThanOrEqual(2);
      expect(analyses.some(a => a.title === analysis1Data.title)).toBe(true);
      expect(analyses.some(a => a.title === analysis2Data.title)).toBe(true);
    });
  });

  describe("ReportRepository", () => {
    it("should create and retrieve a report", async () => {
      // Create user
      const userData: TestUser = {
        id: "11000000-1100-1100-1100-110000000000",
        email: "report@example.com",
        displayName: "Report User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-report"
      };

      await userRepo.save(userData);

      // Create project
      const projectData: TestProject = {
        id: "12000000-1200-1200-1200-120000000000",
        ownerUserId: userData.id,
        name: "Report Project",
        description: "Project for report testing",
        status: "active"
      };

      await projectRepo.save({
        id: projectData.id,
        ownerUserId: projectData.ownerUserId,
        name: projectData.name,
        description: projectData.description ?? undefined,
        status: projectData.status ?? "active",
        createdAt: projectData.createdAt ?? new Date(),
        updatedAt: projectData.updatedAt ?? new Date()
      });

      // Create analysis
      const analysisData: TestAnalysis = {
        id: "13000000-1300-1300-1300-130000000000",
        projectId: projectData.id,
        requestedByUserId: userData.id,
        title: "Report Analysis",
        type: "code-review",
        summary: "Analysis for report testing",
        scores: {
          overallScore: 85,
          securityScore: 90,
          qualityScore: 80,
          performanceScore: 75,
          maintainabilityScore: 85,
          readabilityScore: 90
        },
        status: "completed"
      };

      await analysisRepo.save(
        {
          id: analysisData.id,
          projectId: analysisData.projectId,
          requestedByUserId: analysisData.requestedByUserId,
          title: analysisData.title,
          type: analysisData.type,
          summary: analysisData.summary,
          scores: analysisData.scores,
          status: analysisData.status ?? "pending"
        },
        analysisData.requestedByUserId
      );

      // Create report
      const reportData: TestReport = {
        id: "14000000-1400-1400-1400-140000000000",
        analysisId: analysisData.id,
        title: "Test Report",
        content: "This is a test report",
        format: "pdf"
      };

      const createdReport = await reportRepo.save({
        id: reportData.id,
        analysisId: reportData.analysisId,
        title: reportData.title,
        content: reportData.content ?? undefined,
        format: reportData.format ?? "pdf",
        createdAt: reportData.createdAt ?? new Date(),
        updatedAt: reportData.updatedAt ?? new Date()
      });
      expect(createdReport).toBeDefined();
      expect(createdReport.id).toBe(reportData.id);
      expect(createdReport.title).toBe(reportData.title);
      expect(createdReport.content).toBe(reportData.content);

      // Retrieve report
      const retrievedReport = await reportRepo.findById(createdReport.id);
      expect(retrievedReport).toBeDefined();
      expect(retrievedReport?.title).toBe(reportData.title);
      expect(retrievedReport?.content).toBe(reportData.content);
    });
  });

  describe("InterviewRepository", () => {
    it("should create and retrieve an interview", async () => {
      // Create user
      const userData: TestUser = {
        id: "15000000-1500-1500-1500-150000000000",
        email: "interview@example.com",
        displayName: "Interview User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-interview"
      };

      await userRepo.save(userData);

      // Create project
      const projectData: TestProject = {
        id: "16000000-1600-1600-1600-160000000000",
        ownerUserId: userData.id,
        name: "Interview Project",
        description: "Project for interview testing",
        status: "active"
      };

      await projectRepo.save({
        id: projectData.id,
        ownerUserId: projectData.ownerUserId,
        name: projectData.name,
        description: projectData.description ?? undefined,
        status: projectData.status ?? "active",
        createdAt: projectData.createdAt ?? new Date(),
        updatedAt: projectData.updatedAt ?? new Date()
      });

      // Create analysis
      const analysisData: TestAnalysis = {
        id: "17000000-1700-1700-1700-170000000000",
        projectId: projectData.id,
        requestedByUserId: userData.id,
        title: "Interview Analysis",
        type: "code-review",
        summary: "Analysis for interview testing",
        scores: {
          overallScore: 85,
          securityScore: 90,
          qualityScore: 80,
          performanceScore: 75,
          maintainabilityScore: 85,
          readabilityScore: 90
        },
        status: "completed"
      };

      await analysisRepo.save(
        {
          id: analysisData.id,
          projectId: analysisData.projectId,
          requestedByUserId: analysisData.requestedByUserId,
          title: analysisData.title,
          type: analysisData.type,
          summary: analysisData.summary,
          scores: analysisData.scores,
          status: analysisData.status ?? "pending"
        },
        analysisData.requestedByUserId
      );

      // Create interview session
      const interviewData: TestInterview = {
        id: "18000000-1800-1800-1800-180000000000",
        analysisId: analysisData.id,
        title: "Test Interview",
        status: "scheduled"
      };

      const createdInterview = await interviewRepo.saveSession({
        id: interviewData.id,
        title: interviewData.title,
        status: interviewData.status as any, // Cast to match InterviewSession status type
        createdAt: interviewData.createdAt ?? new Date()
      });
      expect(createdInterview).toBeDefined();
      expect(createdInterview.id).toBe(interviewData.id);
      expect(createdInterview.title).toBe(interviewData.title);
      expect(createdInterview.status).toBe(interviewData.status);

      // Retrieve interview session
      const retrievedInterview = await interviewRepo.findSessionById(createdInterview.id);
      expect(retrievedInterview).toBeDefined();
      expect(retrievedInterview?.title).toBe(interviewData.title);
      expect(retrievedInterview?.status).toBe(interviewData.status);
    });
  });

  describe("NotificationRepository", () => {
    it("should create and retrieve a notification", async () => {
      // Create user
      const userData: TestUser = {
        id: "19000000-1900-1900-1900-190000000000",
        email: "notification@example.com",
        displayName: "Notification User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-notification"
      };

      await userRepo.save(userData);

      // Create notification
      const notificationData: TestNotification = {
        id: "20000000-2000-2000-2000-200000000000",
        userId: userData.id,
        type: "system",
        title: "Test Notification",
        body: "This is a test notification",
        readAt: undefined
      };

      const createdNotification = await notificationRepo.save({
        id: notificationData.id,
        userId: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title,
        body: notificationData.body,
        readAt: notificationData.readAt ?? null,
        createdAt: notificationData.createdAt ?? new Date(),
        updatedAt: notificationData.updatedAt ?? new Date()
      });
      expect(createdNotification).toBeDefined();
      expect(createdNotification.id).toBe(notificationData.id);
      expect(createdNotification.title).toBe(notificationData.title);
      expect(createdNotification.body).toBe(notificationData.body);

      // Retrieve notification
      const retrievedNotification = await notificationRepo.findById(createdNotification.id);
      expect(retrievedNotification).toBeDefined();
      expect(retrievedNotification?.title).toBe(notificationData.title);
      expect(retrievedNotification?.body).toBe(notificationData.body);
    });
  });

  describe("AuditLogRepository", () => {
    it("should create and retrieve an audit log", async () => {
      // Create user (optional for audit logs)
      const userData: TestUser = {
        id: "21000000-2100-2100-2100-210000000000",
        email: "audit@example.com",
        displayName: "Audit User",
        roles: ["11111111-1111-1111-1111-111111111112"] as UserRole[],
        isEmailVerified: true,
        mfaEnabled: false,
        passwordHash: "hashed-password-audit"
      };

      await userRepo.save(userData);

      // Create audit log
      const auditLogData: TestAuditLog = {
        id: "22000000-2200-2200-2200-220000000000",
        actorUserId: userData.id,
        eventType: "user.created",
        entityType: "User",
        entityId: userData.id,
        ipAddress: "127.0.0.1",
        userAgent: "test-agent",
        metadata: JSON.stringify({ test: "data" }) // Convert to string for storage
      };

      const createdAuditLog = await auditLogRepo.save({
        id: auditLogData.id,
        actorUserId: auditLogData.actorUserId ?? undefined,
        eventType: auditLogData.eventType,
        entityType: auditLogData.entityType,
        entityId: auditLogData.entityId ?? undefined,
        ipAddress: auditLogData.ipAddress ?? undefined,
        userAgent: auditLogData.userAgent ?? undefined,
        metadata: auditLogData.metadata ?? undefined,
        createdAt: auditLogData.createdAt ?? new Date()
      });
      expect(createdAuditLog).toBeDefined();
      expect(createdAuditLog.id).toBe(auditLogData.id);
      expect(createdAuditLog.eventType).toBe(auditLogData.eventType);
      expect(createdAuditLog.entityType).toBe(auditLogData.entityType);

      // Retrieve audit log
      const retrievedAuditLog = await auditLogRepo.findById(createdAuditLog.id);
      expect(retrievedAuditLog).toBeDefined();
      expect(retrievedAuditLog?.eventType).toBe(auditLogData.eventType);
      expect(retrievedAuditLog?.entityType).toBe(auditLogData.entityType);
    });
  });
});