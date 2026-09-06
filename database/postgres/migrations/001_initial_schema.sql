-- PostgreSQL Initial Schema Migration for CodeGuard AI
-- Fully translated from SQL Server schema and migrations 001, 20240115, 20240820

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS "Roles" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "Name" VARCHAR(64) NOT NULL UNIQUE,
    "Description" VARCHAR(255) NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users Table
CREATE TABLE IF NOT EXISTS "Users" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "Email" VARCHAR(320) NOT NULL UNIQUE,
    "PasswordHash" VARCHAR(255) NULL,
    "DisplayName" VARCHAR(160) NOT NULL,
    "IsEmailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
    "MfaEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "FailedLoginCount" INT NOT NULL DEFAULT 0,
    "LockedUntil" TIMESTAMPTZ NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. UserRoles Join Table
CREATE TABLE IF NOT EXISTS "UserRoles" (
    "UserId" UUID NOT NULL,
    "RoleId" UUID NOT NULL,
    PRIMARY KEY ("UserId", "RoleId"),
    CONSTRAINT "FK_UserRoles_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE,
    CONSTRAINT "FK_UserRoles_Roles" FOREIGN KEY ("RoleId") REFERENCES "Roles"("Id") ON DELETE CASCADE
);

-- 4. Sessions Table
CREATE TABLE IF NOT EXISTS "Sessions" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "UserId" UUID NOT NULL,
    "RefreshTokenHash" VARCHAR(255) NOT NULL,
    "DeviceFingerprint" VARCHAR(255) NULL,
    "IpAddress" VARCHAR(64) NULL,
    "UserAgent" VARCHAR(512) NULL,
    "ExpiresAt" TIMESTAMPTZ NOT NULL,
    "RevokedAt" TIMESTAMPTZ NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "Jti" UUID NULL,
    CONSTRAINT "FK_Sessions_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- 5. Projects Table
CREATE TABLE IF NOT EXISTS "Projects" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "OwnerUserId" UUID NOT NULL,
    "Name" VARCHAR(180) NOT NULL,
    "Description" VARCHAR(1000) NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UpdatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Projects_Users" FOREIGN KEY ("OwnerUserId") REFERENCES "Users"("Id")
);

-- 6. Repositories Table
CREATE TABLE IF NOT EXISTS "Repositories" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "ProjectId" UUID NOT NULL,
    "Provider" VARCHAR(40) NOT NULL,
    "ExternalId" VARCHAR(255) NULL,
    "Name" VARCHAR(255) NOT NULL,
    "Url" VARCHAR(1000) NULL,
    "DefaultBranch" VARCHAR(120) NULL,
    "LastImportedAt" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_Repositories_Projects" FOREIGN KEY ("ProjectId") REFERENCES "Projects"("Id") ON DELETE CASCADE
);

-- 7. Files Table
CREATE TABLE IF NOT EXISTS "Files" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "RepositoryId" UUID NULL,
    "Path" VARCHAR(1000) NOT NULL,
    "Language" VARCHAR(80) NULL,
    "ContentHash" CHAR(64) NOT NULL,
    "SizeBytes" BIGINT NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Files_Repositories" FOREIGN KEY ("RepositoryId") REFERENCES "Repositories"("Id") ON DELETE CASCADE
);

-- 8. Analyses Table
CREATE TABLE IF NOT EXISTS "Analyses" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "ProjectId" UUID NULL,
    "RepositoryId" UUID NULL,
    "RequestedByUserId" UUID NOT NULL,
    "AnalysisType" VARCHAR(80) NOT NULL,
    "Title" VARCHAR(255) NULL,
    "Status" VARCHAR(40) NOT NULL,
    "Summary" TEXT NULL,
    "StartedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "CompletedAt" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_Analyses_Projects" FOREIGN KEY ("ProjectId") REFERENCES "Projects"("Id"),
    CONSTRAINT "FK_Analyses_Repositories" FOREIGN KEY ("RepositoryId") REFERENCES "Repositories"("Id"),
    CONSTRAINT "FK_Analyses_Users" FOREIGN KEY ("RequestedByUserId") REFERENCES "Users"("Id")
);

-- 9. AnalysisScores Table
CREATE TABLE IF NOT EXISTS "AnalysisScores" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "AnalysisId" UUID NOT NULL,
    "OverallScore" INT NOT NULL CHECK ("OverallScore" BETWEEN 0 AND 100),
    "SecurityScore" INT NOT NULL CHECK ("SecurityScore" BETWEEN 0 AND 100),
    "QualityScore" INT NOT NULL CHECK ("QualityScore" BETWEEN 0 AND 100),
    "PerformanceScore" INT NOT NULL CHECK ("PerformanceScore" BETWEEN 0 AND 100),
    "MaintainabilityScore" INT NOT NULL CHECK ("MaintainabilityScore" BETWEEN 0 AND 100),
    "ReadabilityScore" INT NOT NULL CHECK ("ReadabilityScore" BETWEEN 0 AND 100),
    CONSTRAINT "FK_AnalysisScores_Analyses" FOREIGN KEY ("AnalysisId") REFERENCES "Analyses"("Id") ON DELETE CASCADE
);

-- 10. Reports Table
CREATE TABLE IF NOT EXISTS "Reports" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "AnalysisId" UUID NOT NULL,
    "Title" VARCHAR(255) NULL,
    "Format" VARCHAR(40) NOT NULL,
    "StorageUrl" VARCHAR(1000) NULL,
    "Content" TEXT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Reports_Analyses" FOREIGN KEY ("AnalysisId") REFERENCES "Analyses"("Id") ON DELETE CASCADE
);

-- 11. InterviewSessions Table
CREATE TABLE IF NOT EXISTS "InterviewSessions" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "CandidateUserId" UUID NULL,
    "RecruiterUserId" UUID NULL,
    "RepositoryId" UUID NULL,
    "Title" VARCHAR(255) NULL,
    "Status" VARCHAR(40) NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_InterviewSessions_Candidate" FOREIGN KEY ("CandidateUserId") REFERENCES "Users"("Id"),
    CONSTRAINT "FK_InterviewSessions_Recruiter" FOREIGN KEY ("RecruiterUserId") REFERENCES "Users"("Id"),
    CONSTRAINT "FK_InterviewSessions_Repositories" FOREIGN KEY ("RepositoryId") REFERENCES "Repositories"("Id")
);

-- 12. InterviewQuestions Table
CREATE TABLE IF NOT EXISTS "InterviewQuestions" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "InterviewSessionId" UUID NOT NULL,
    "Prompt" TEXT NOT NULL,
    "ExpectedAnswer" TEXT NOT NULL,
    "EvaluationCriteria" TEXT NOT NULL,
    "Difficulty" VARCHAR(40) NOT NULL,
    CONSTRAINT "FK_InterviewQuestions_Sessions" FOREIGN KEY ("InterviewSessionId") REFERENCES "InterviewSessions"("Id") ON DELETE CASCADE
);

-- 13. InterviewResults Table
CREATE TABLE IF NOT EXISTS "InterviewResults" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "InterviewSessionId" UUID NOT NULL,
    "TechnicalScore" INT NOT NULL CHECK ("TechnicalScore" BETWEEN 0 AND 100),
    "CommunicationScore" INT NOT NULL CHECK ("CommunicationScore" BETWEEN 0 AND 100),
    "ProblemSolvingScore" INT NOT NULL CHECK ("ProblemSolvingScore" BETWEEN 0 AND 100),
    "Recommendation" TEXT NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_InterviewResults_Sessions" FOREIGN KEY ("InterviewSessionId") REFERENCES "InterviewSessions"("Id") ON DELETE CASCADE
);

-- 14. Notifications Table
CREATE TABLE IF NOT EXISTS "Notifications" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "UserId" UUID NOT NULL,
    "Type" VARCHAR(80) NOT NULL,
    "Title" VARCHAR(180) NOT NULL,
    "Body" VARCHAR(1000) NOT NULL,
    "ReadAt" TIMESTAMPTZ NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_Notifications_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- 15. AuditLogs Table
CREATE TABLE IF NOT EXISTS "AuditLogs" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "ActorUserId" UUID NULL,
    "EventType" VARCHAR(120) NOT NULL,
    "EntityType" VARCHAR(120) NULL,
    "EntityId" UUID NULL,
    "IpAddress" VARCHAR(64) NULL,
    "UserAgent" VARCHAR(512) NULL,
    "Metadata" TEXT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FK_AuditLogs_Users" FOREIGN KEY ("ActorUserId") REFERENCES "Users"("Id")
);

-- 16. RefreshTokens Table
CREATE TABLE IF NOT EXISTS "RefreshTokens" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "UserId" UUID NOT NULL,
    "TokenHash" VARCHAR(255) NOT NULL,
    "Jti" UUID NOT NULL,
    "UserAgentHash" VARCHAR(64) NULL,
    "IpHash" VARCHAR(64) NULL,
    "ExpiresAt" TIMESTAMPTZ NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "RevokedAt" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_RefreshTokens_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- 17. PasswordResetTokens Table
CREATE TABLE IF NOT EXISTS "PasswordResetTokens" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "UserId" UUID NOT NULL,
    "TokenHash" VARCHAR(255) NOT NULL,
    "ExpiresAt" TIMESTAMPTZ NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UsedAt" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_PasswordResetTokens_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- 18. EmailVerificationTokens Table
CREATE TABLE IF NOT EXISTS "EmailVerificationTokens" (
    "Id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    "UserId" UUID NOT NULL,
    "TokenHash" VARCHAR(255) NOT NULL,
    "ExpiresAt" TIMESTAMPTZ NOT NULL,
    "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "UsedAt" TIMESTAMPTZ NULL,
    CONSTRAINT "FK_EmailVerificationTokens_Users" FOREIGN KEY ("UserId") REFERENCES "Users"("Id") ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS "IX_Projects_OwnerUserId" ON "Projects"("OwnerUserId");
CREATE INDEX IF NOT EXISTS "IX_Repositories_ProjectId" ON "Repositories"("ProjectId");
CREATE INDEX IF NOT EXISTS "IX_Files_RepositoryId_Path" ON "Files"("RepositoryId", "Path");
CREATE INDEX IF NOT EXISTS "IX_Analyses_RepositoryId_StartedAt" ON "Analyses"("RepositoryId", "StartedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_AnalysisScores_AnalysisId" ON "AnalysisScores"("AnalysisId");
CREATE INDEX IF NOT EXISTS "IX_AuditLogs_ActorUserId_CreatedAt" ON "AuditLogs"("ActorUserId", "CreatedAt" DESC);
CREATE INDEX IF NOT EXISTS "IX_Sessions_UserId_ExpiresAt" ON "Sessions"("UserId", "ExpiresAt");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_UserId" ON "RefreshTokens"("UserId");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_Jti" ON "RefreshTokens"("Jti");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_ExpiresAt" ON "RefreshTokens"("ExpiresAt");
CREATE INDEX IF NOT EXISTS "IX_RefreshTokens_RevokedAt" ON "RefreshTokens"("RevokedAt") WHERE "RevokedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_PasswordResetTokens_UserId" ON "PasswordResetTokens"("UserId");
CREATE INDEX IF NOT EXISTS "IX_PasswordResetTokens_ExpiresAt" ON "PasswordResetTokens"("ExpiresAt");
CREATE INDEX IF NOT EXISTS "IX_PasswordResetTokens_UsedAt" ON "PasswordResetTokens"("UsedAt") WHERE "UsedAt" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "IX_EmailVerificationTokens_UserId" ON "EmailVerificationTokens"("UserId");
CREATE INDEX IF NOT EXISTS "IX_EmailVerificationTokens_ExpiresAt" ON "EmailVerificationTokens"("ExpiresAt");
CREATE INDEX IF NOT EXISTS "IX_EmailVerificationTokens_UsedAt" ON "EmailVerificationTokens"("UsedAt") WHERE "UsedAt" IS NOT NULL;
