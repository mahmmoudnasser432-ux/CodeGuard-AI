# Phase 2 Implementation Plan: Authentication & Authorization

## Current State Analysis

### 1. Session Entity Status
- **Domain Entity**: ❌ Does not exist
- **Repository Interface**: ❌ Does not exist  
- **SQL Table**: ✅ Existss (Sessions table from Phase 1)
- **Migration**: ✅ JTI column added (20240115_add_jti_to_sessions.sql)
- **API Contract**: ❌ Does not exist

### 2. Missing Components for Authentication
- **New Tables Required**:
  - RefreshTokens (separate from Sessions table for better design)
  - PasswordResetTokens
  - EmailVerificationTokens
- **Domain Entities**:
  - Session (authentication session)
  - PasswordResetToken
  - EmailVerificationToken
- **Repositories**:
  - SessionRepository
  - PasswordResetTokenRepository  
  - EmailVerificationTokenRepository
- **Services**:
  - AuthService (partially exists - needs expansion)
  - TokenService (new)
- **Controllers**:
  - AuthController (new)
- **Middleware**:
  - Enhanced authentication middleware (partially exists)
  - Authorization middleware (new)

## Implementation Steps

### Step 1: Create Missing Database Tables
```sql
-- RefreshTokens table (better approach than overloading Sessions table)
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
```

### Step 2: Create Domain Entities
- `src/domain/entities/session.ts` - Session entity
- `src/domain/entities/password-reset-token.ts` - PasswordResetToken entity  
- `src/domain/entities/email-verification-token.ts` - EmailVerificationToken entity

### Step 3: Create Repository Interfaces
- `src/domain/repositories/session-repository.ts` - SessionRepository interface
- `src/domain/repositories/password-reset-token-repository.ts` - PasswordResetTokenRepository interface
- `src/domain/repositories/email-verification-token-repository.ts` - EmailVerificationTokenRepository interface

### Step 4: Create SQL Repository Implementations
- `src/infrastructure/repositories/sql-session-repository.ts` - SqlSessionRepository
- `src/infrastructure/repositories/sql-password-reset-token-repository.ts` - SqlPasswordResetTokenRepository
- `src/infrastructure/repositories/sql-email-verification-token-repository.ts` - SqlEmailVerificationTokenRepository

### Step 5: Enhance AuthService
- Expand `src/application/services/auth-service.ts` with:
  - Refresh token generation and validation
  - Token rotation logic
  - Password reset token generation/validation
  - Email verification token generation/validation
  - Session management (create, invalidate, etc.)

### Step 6: Create TokenService (New)
- `src/application/services/token-service.ts` - Handle JWT creation, validation, JTI management

### Step 7: Create Authorization Middleware
- `src/interfaces/http/middleware/authorization.ts` - Role and permission checking

### Step 8: Create AuthController
- `src/interfaces/http/controllers/auth-controller.ts` - All authentication endpoints:
  - POST /auth/register
  - POST /auth/login
  - POST /auth/refresh
  - POST /auth/logout
  - POST /auth/reset-password/request
  - POST /auth/reset-password/validate
  - POST /auth/resend-verification
  - GET /auth/verify-email/:token
  - GET /auth/me

### Step 9: Update App Registration
- Register AuthController in `src/app.ts`
- Add authorization middleware to protected routes

### Step 10: Enhance Security Logging
- Add comprehensive security event logging to AuthController and services
- Utilize existing AuditLogs table for security events

## Dependencies to Add
- None required - all dependencies (bcryptjs, jsonwebtoken, etc.) already exist

## Environment Variables to Add
- `PASSWORD_RESET_EXPIRES_IN` (e.g., "1h")
- `EMAIL_VERIFICATION_EXPIRES_IN` (e.g., "24h")
- `MAX_FAILED_LOGIN_ATTEMPTS` (e.g., 5)
- `ACCOUNT_LOCKOUT_DURATION` (e.g., "15m")

## Files to Modify
1. `src/application/services/auth-service.ts` - Expand existing service
2. `src/interfaces/http/middleware/auth.ts` - Enhance existing middleware
3. `src/app.ts` - Register new auth controller
4. Various infrastructure files to reference new repositories

## New Files to Create
1. Database migration scripts for new tables
2. 3 new domain entity files
3. 3 new repository interface files  
4. 3 new SQL repository implementation files
5. 1 new token service file
6. 1 new authorization middleware file
7. 1 new auth controller file

## Integration Points
- Session entity will use JTI column added to Sessions table
- AuthService will coordinate between TokenService, repositories, and validation logic
- AuthController will orchestrate authentication flows
- Authorization middleware will protect routes based on roles/permissions
- Security events will be logged to existing AuditLogs table

## Success Criteria
- All authentication endpoints functional and secure
- Proper JWT validation and refresh token rotation
- Role-based access control working
- Password reset and email verification flows complete
- Comprehensive security event logging
- No regression in existing functionality