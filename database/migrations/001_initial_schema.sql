IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.SchemaMigrations (
        Id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL UNIQUE,
        AppliedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.Roles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Roles (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        Name NVARCHAR(64) NOT NULL UNIQUE,
        Description NVARCHAR(255) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        Email NVARCHAR(320) NOT NULL UNIQUE,
        PasswordHash NVARCHAR(255) NULL,
        DisplayName NVARCHAR(160) NOT NULL,
        IsEmailVerified BIT NOT NULL DEFAULT 0,
        MfaEnabled BIT NOT NULL DEFAULT 0,
        FailedLoginCount INT NOT NULL DEFAULT 0,
        LockedUntil DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    );
END;

IF OBJECT_ID(N'dbo.UserRoles', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.UserRoles (
        UserId UNIQUEIDENTIFIER NOT NULL,
        RoleId UNIQUEIDENTIFIER NOT NULL,
        PRIMARY KEY (UserId, RoleId),
        CONSTRAINT FK_UserRoles_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_UserRoles_Roles FOREIGN KEY (RoleId) REFERENCES dbo.Roles(Id)
    );
END;

IF OBJECT_ID(N'dbo.Sessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Sessions (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        RefreshTokenHash NVARCHAR(255) NOT NULL,
        DeviceFingerprint NVARCHAR(255) NULL,
        IpAddress NVARCHAR(64) NULL,
        UserAgent NVARCHAR(512) NULL,
        ExpiresAt DATETIME2 NOT NULL,
        RevokedAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Sessions_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.Projects', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Projects (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        OwnerUserId UNIQUEIDENTIFIER NOT NULL,
        Name NVARCHAR(180) NOT NULL,
        Description NVARCHAR(1000) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Projects_Users FOREIGN KEY (OwnerUserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.Repositories', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Repositories (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        ProjectId UNIQUEIDENTIFIER NOT NULL,
        Provider NVARCHAR(40) NOT NULL,
        ExternalId NVARCHAR(255) NULL,
        Name NVARCHAR(255) NOT NULL,
        Url NVARCHAR(1000) NULL,
        DefaultBranch NVARCHAR(120) NULL,
        LastImportedAt DATETIME2 NULL,
        CONSTRAINT FK_Repositories_Projects FOREIGN KEY (ProjectId) REFERENCES dbo.Projects(Id)
    );
END;

IF OBJECT_ID(N'dbo.Files', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Files (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        RepositoryId UNIQUEIDENTIFIER NULL,
        Path NVARCHAR(1000) NOT NULL,
        Language NVARCHAR(80) NULL,
        ContentHash CHAR(64) NOT NULL,
        SizeBytes BIGINT NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Files_Repositories FOREIGN KEY (RepositoryId) REFERENCES dbo.Repositories(Id)
    );
END;

IF OBJECT_ID(N'dbo.Analyses', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Analyses (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        ProjectId UNIQUEIDENTIFIER NULL,
        RepositoryId UNIQUEIDENTIFIER NULL,
        RequestedByUserId UNIQUEIDENTIFIER NOT NULL,
        AnalysisType NVARCHAR(80) NOT NULL,
        Status NVARCHAR(40) NOT NULL,
        Summary NVARCHAR(MAX) NULL,
        StartedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CompletedAt DATETIME2 NULL,
        CONSTRAINT FK_Analyses_Projects FOREIGN KEY (ProjectId) REFERENCES dbo.Projects(Id),
        CONSTRAINT FK_Analyses_Repositories FOREIGN KEY (RepositoryId) REFERENCES dbo.Repositories(Id),
        CONSTRAINT FK_Analyses_Users FOREIGN KEY (RequestedByUserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.AnalysisScores', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AnalysisScores (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        AnalysisId UNIQUEIDENTIFIER NOT NULL,
        OverallScore INT NOT NULL CHECK (OverallScore BETWEEN 0 AND 100),
        SecurityScore INT NOT NULL CHECK (SecurityScore BETWEEN 0 AND 100),
        QualityScore INT NOT NULL CHECK (QualityScore BETWEEN 0 AND 100),
        PerformanceScore INT NOT NULL CHECK (PerformanceScore BETWEEN 0 AND 100),
        MaintainabilityScore INT NOT NULL CHECK (MaintainabilityScore BETWEEN 0 AND 100),
        ReadabilityScore INT NOT NULL CHECK (ReadabilityScore BETWEEN 0 AND 100),
        CONSTRAINT FK_AnalysisScores_Analyses FOREIGN KEY (AnalysisId) REFERENCES dbo.Analyses(Id)
    );
END;

IF OBJECT_ID(N'dbo.Reports', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Reports (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        AnalysisId UNIQUEIDENTIFIER NOT NULL,
        Format NVARCHAR(40) NOT NULL,
        StorageUrl NVARCHAR(1000) NULL,
        Content NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Reports_Analyses FOREIGN KEY (AnalysisId) REFERENCES dbo.Analyses(Id)
    );
END;

IF OBJECT_ID(N'dbo.InterviewSessions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InterviewSessions (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        CandidateUserId UNIQUEIDENTIFIER NULL,
        RecruiterUserId UNIQUEIDENTIFIER NULL,
        RepositoryId UNIQUEIDENTIFIER NULL,
        Status NVARCHAR(40) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_InterviewSessions_Candidate FOREIGN KEY (CandidateUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_InterviewSessions_Recruiter FOREIGN KEY (RecruiterUserId) REFERENCES dbo.Users(Id),
        CONSTRAINT FK_InterviewSessions_Repositories FOREIGN KEY (RepositoryId) REFERENCES dbo.Repositories(Id)
    );
END;

IF OBJECT_ID(N'dbo.InterviewQuestions', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InterviewQuestions (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        InterviewSessionId UNIQUEIDENTIFIER NOT NULL,
        Prompt NVARCHAR(MAX) NOT NULL,
        ExpectedAnswer NVARCHAR(MAX) NOT NULL,
        EvaluationCriteria NVARCHAR(MAX) NOT NULL,
        Difficulty NVARCHAR(40) NOT NULL,
        CONSTRAINT FK_InterviewQuestions_Sessions FOREIGN KEY (InterviewSessionId) REFERENCES dbo.InterviewSessions(Id)
    );
END;

IF OBJECT_ID(N'dbo.InterviewResults', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.InterviewResults (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        InterviewSessionId UNIQUEIDENTIFIER NOT NULL,
        TechnicalScore INT NOT NULL CHECK (TechnicalScore BETWEEN 0 AND 100),
        CommunicationScore INT NOT NULL CHECK (CommunicationScore BETWEEN 0 AND 100),
        ProblemSolvingScore INT NOT NULL CHECK (ProblemSolvingScore BETWEEN 0 AND 100),
        Recommendation NVARCHAR(MAX) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_InterviewResults_Sessions FOREIGN KEY (InterviewSessionId) REFERENCES dbo.InterviewSessions(Id)
    );
END;

IF OBJECT_ID(N'dbo.Notifications', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Notifications (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        Type NVARCHAR(80) NOT NULL,
        Title NVARCHAR(180) NOT NULL,
        Body NVARCHAR(1000) NOT NULL,
        ReadAt DATETIME2 NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_Notifications_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
END;

IF OBJECT_ID(N'dbo.AuditLogs', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.AuditLogs (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        ActorUserId UNIQUEIDENTIFIER NULL,
        EventType NVARCHAR(120) NOT NULL,
        EntityType NVARCHAR(120) NULL,
        EntityId UNIQUEIDENTIFIER NULL,
        IpAddress NVARCHAR(64) NULL,
        UserAgent NVARCHAR(512) NULL,
        Metadata NVARCHAR(MAX) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_AuditLogs_Users FOREIGN KEY (ActorUserId) REFERENCES dbo.Users(Id)
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Projects_OwnerUserId')
    CREATE INDEX IX_Projects_OwnerUserId ON dbo.Projects(OwnerUserId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Repositories_ProjectId')
    CREATE INDEX IX_Repositories_ProjectId ON dbo.Repositories(ProjectId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Files_RepositoryId_Path')
    CREATE INDEX IX_Files_RepositoryId_Path ON dbo.Files(RepositoryId, Path);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Analyses_RepositoryId_StartedAt')
    CREATE INDEX IX_Analyses_RepositoryId_StartedAt ON dbo.Analyses(RepositoryId, StartedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AnalysisScores_AnalysisId')
    CREATE INDEX IX_AnalysisScores_AnalysisId ON dbo.AnalysisScores(AnalysisId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_AuditLogs_ActorUserId_CreatedAt')
    CREATE INDEX IX_AuditLogs_ActorUserId_CreatedAt ON dbo.AuditLogs(ActorUserId, CreatedAt DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Sessions_UserId_ExpiresAt')
    CREATE INDEX IX_Sessions_UserId_ExpiresAt ON dbo.Sessions(UserId, ExpiresAt);
