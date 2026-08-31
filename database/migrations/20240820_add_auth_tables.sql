-- RefreshTokens table
IF OBJECT_ID(N'dbo.RefreshTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.RefreshTokens (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(255) NOT NULL,
        Jti UNIQUEIDENTIFIER NOT NULL,
        UserAgentHash NVARCHAR(64) NULL,
        IpHash NVARCHAR(64) NULL,
        ExpiresAt DATETIME2 NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        RevokedAt DATETIME2 NULL,
        CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_RefreshTokens_UserId' AND object_id = OBJECT_ID(N'dbo.RefreshTokens'))
BEGIN
    CREATE INDEX IX_RefreshTokens_UserId ON dbo.RefreshTokens(UserId);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_RefreshTokens_Jti' AND object_id = OBJECT_ID(N'dbo.RefreshTokens'))
BEGIN
    CREATE INDEX IX_RefreshTokens_Jti ON dbo.RefreshTokens(Jti);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_RefreshTokens_ExpiresAt' AND object_id = OBJECT_ID(N'dbo.RefreshTokens'))
BEGIN
    CREATE INDEX IX_RefreshTokens_ExpiresAt ON dbo.RefreshTokens(ExpiresAt);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_RefreshTokens_RevokedAt' AND object_id = OBJECT_ID(N'dbo.RefreshTokens'))
BEGIN
    CREATE INDEX IX_RefreshTokens_RevokedAt ON dbo.RefreshTokens(RevokedAt) WHERE RevokedAt IS NOT NULL;
END;

-- PasswordResetTokens table
IF OBJECT_ID(N'dbo.PasswordResetTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.PasswordResetTokens (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(255) NOT NULL,
        ExpiresAt DATETIME2 NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UsedAt DATETIME2 NULL,
        CONSTRAINT FK_PasswordResetTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_PasswordResetTokens_UserId' AND object_id = OBJECT_ID(N'dbo.PasswordResetTokens'))
BEGIN
    CREATE INDEX IX_PasswordResetTokens_UserId ON dbo.PasswordResetTokens(UserId);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_PasswordResetTokens_ExpiresAt' AND object_id = OBJECT_ID(N'dbo.PasswordResetTokens'))
BEGIN
    CREATE INDEX IX_PasswordResetTokens_ExpiresAt ON dbo.PasswordResetTokens(ExpiresAt);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_PasswordResetTokens_UsedAt' AND object_id = OBJECT_ID(N'dbo.PasswordResetTokens'))
BEGIN
    CREATE INDEX IX_PasswordResetTokens_UsedAt ON dbo.PasswordResetTokens(UsedAt) WHERE UsedAt IS NOT NULL;
END;

-- EmailVerificationTokens table
IF OBJECT_ID(N'dbo.EmailVerificationTokens', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.EmailVerificationTokens (
        Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
        UserId UNIQUEIDENTIFIER NOT NULL,
        TokenHash NVARCHAR(255) NOT NULL,
        ExpiresAt DATETIME2 NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UsedAt DATETIME2 NULL,
        CONSTRAINT FK_EmailVerificationTokens_Users FOREIGN KEY (UserId) REFERENCES dbo.Users(Id)
    );
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_EmailVerificationTokens_UserId' AND object_id = OBJECT_ID(N'dbo.EmailVerificationTokens'))
BEGIN
    CREATE INDEX IX_EmailVerificationTokens_UserId ON dbo.EmailVerificationTokens(UserId);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_EmailVerificationTokens_ExpiresAt' AND object_id = OBJECT_ID(N'dbo.EmailVerificationTokens'))
BEGIN
    CREATE INDEX IX_EmailVerificationTokens_ExpiresAt ON dbo.EmailVerificationTokens(ExpiresAt);
END;

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = N'IX_EmailVerificationTokens_UsedAt' AND object_id = OBJECT_ID(N'dbo.EmailVerificationTokens'))
BEGIN
    CREATE INDEX IX_EmailVerificationTokens_UsedAt ON dbo.EmailVerificationTokens(UsedAt) WHERE UsedAt IS NOT NULL;
END;