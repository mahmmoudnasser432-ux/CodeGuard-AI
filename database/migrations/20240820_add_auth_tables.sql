-- RefreshTokens table
CREATE TABLE RefreshTokens (
    Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(255) NOT NULL,  -- bcrypt hash of refresh token
    Jti UNIQUEIDENTIFIER NOT NULL,     -- JWT ID for access token association
    UserAgentHash NVARCHAR(64) NULL,   -- SHA-256 of user agent
    IpHash NVARCHAR(64) NULL,          -- SHA-256 of IP address
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RevokedAt DATETIME2 NULL,
    CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserId) REFERENCES Users(Id)
);
CREATE INDEX IX_RefreshTokens_UserId ON RefreshTokens(UserId);
CREATE INDEX IX_RefreshTokens_Jti ON RefreshTokens(Jti);
CREATE INDEX IX_RefreshTokens_ExpiresAt ON RefreshTokens(ExpiresAt);
CREATE INDEX IX_RefreshTokens_RevokedAt ON RefreshTokens(RevokedAt) WHERE RevokedAt IS NOT NULL;

-- PasswordResetTokens table
CREATE TABLE PasswordResetTokens (
    Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(255) NOT NULL,  -- bcrypt hash
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UsedAt DATETIME2 NULL,
    CONSTRAINT FK_PasswordResetTokens_Users FOREIGN KEY (UserId) REFERENCES Users(Id)
);
CREATE INDEX IX_PasswordResetTokens_UserId ON PasswordResetTokens(UserId);
CREATE INDEX IX_PasswordResetTokens_ExpiresAt ON PasswordResetTokens(ExpiresAt);
CREATE INDEX IX_PasswordResetTokens_UsedAt ON PasswordResetTokens(UsedAt) WHERE UsedAt IS NOT NULL;

-- EmailVerificationTokens table
CREATE TABLE EmailVerificationTokens (
    Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(255) NOT NULL,  -- bcrypt hash
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    UsedAt DATETIME2 NULL,
    CONSTRAINT FK_EmailVerificationTokens_Users FOREIGN KEY (UserId) REFERENCES Users(Id)
);
CREATE INDEX IX_EmailVerificationTokens_UserId ON EmailVerificationTokens(UserId);
CREATE INDEX IX_EmailVerificationTokens_ExpiresAt ON EmailVerificationTokens(ExpiresAt);
CREATE INDEX IX_EmailVerificationTokens_UsedAt ON EmailVerificationTokens(UsedAt) WHERE UsedAt IS NOT NULL;