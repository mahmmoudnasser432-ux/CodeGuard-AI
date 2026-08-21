# Phase 2 Authentication & Authorization Architecture

## Overview
This document outlines the authentication and authorization architecture for Phase 2 of the CodeGuard API. It builds upon the validated persistence layer from Phase 1 and implements secure user authentication, role-based access control, and token-based session management.

## Authentication Architecture

### Core Principles
1. **Stateless Authentication**: Using JWT tokens for session management
2. **Defense in Depth**: Multiple layers of security validation
3. **Least Privilege**: Users granted minimum permissions necessary
4. **Auditability**: All authentication and authorization events logged
5. **Token Security**: Short-lived access tokens with refresh token rotation

### Components
- **Auth Service**: Handles authentication logic (login, logout, token validation)
- **Token Service**: Manages JWT creation, validation, and refresh token handling
- **Password Service**: Secure password hashing and validation using bcrypt
- **Authorization Middleware**: Express middleware for route protection
- **Security Logger**: Uses existing AuditLogs table for security events

## JWT Strategy

### Access Tokens
- **Type**: Bearer JWT
- **Algorithm**: HS256 (symmetric) or RS256 (asymmetric) - TBD based on deployment needs
- **Expiration**: 15 minutes
- **Claims**:
  - `sub`: User ID (subject)
  - `email`: User email
  - `roles`: Array of role names
  - `permissions`: Array of permission strings (derived from roles)
  - `iat`: Issued at timestamp
  - `exp`: Expiration timestamp
  - `jti`: JWT ID (for token revocation tracking)
  - `type`: Token type ("access")

### Refresh Tokens
- **Type**: Cryptographically random string (32+ bytes)
- **Storage**: Hashed in database (similar to password storage)
- **Expiration**: 7 days
- **Rotation**: New refresh token issued on each use (refresh token rotation)
- **Revocation**: On logout, password change, or security event
- **Claims** (when decoded for validation):
  - `sub`: User ID
  - `jti`: Token ID (matches database record)
  - `type`: Token type ("refresh")
  - `iat`: Issued at timestamp
  - `exp`: Expiration timestamp

## Authorization Architecture

### Role-Based Access Control (RBAC)
#### Roles (Predefined in Seed Data)
1. **System/Admin**: Full system access
2. **Tenant/Admin**: Tenant-level administration
3. **Developer**: Code analysis and repository access
4. **Recruiter**: Interview management access
5. **Team Lead**: Project and team management
6. **Viewer**: Read-only access

#### Permissions (Fine-grained)
Permissions are assigned to roles and checked by middleware:
- `project:create`, `project:read`, `project:update`, `project:delete`
- `repository:import`, `repository:scan`
- `analysis:create`, `analysis:read`, `analysis:delete`
- `report:generate`, `report:read`, `report:delete`
- `interview:create`, `interview:read`, `interview:update`, `interview:delete`
- `user:read`, `user:update` (own profile only)
- `user:manage` (admin only - create/update/delete other users)
- `role:manage` (admin only)
- `audit:read` (admin only)

### Authorization Middleware
- **authenticateToken**: Verifies JWT signature and expiration
- **attachUser**: Attaches user object to request from token payload
- **checkRole**: Verifies user has required role(s)
- **checkPermission**: Verifies user has required permission(s)
- **composite**: Combine multiple checks (e.g., authenticate + authorize)

## Password Reset Flow

### Steps
1. **Request Reset**:
   - User provides email address
   - System generates cryptographically secure reset token (32+ bytes)
   - Token hashed and stored with expiration (1 hour)
   - Reset link sent via email (backend service - mocked in Phase 2)
   - Response: Success message (whether email exists or not - prevents enumeration)

2. **Validate Reset Token**:
   - User submits token and new password
   - System validates token format and checks hash
   - Token must be unexpired and unused
   - Password validated against strength requirements

3. **Execute Reset**:
   - Password hashed with bcrypt (cost: 12)
   - User's password hash updated
   - All existing refresh tokens invalidated (security measure)
   - Reset token marked as used
   - User notified of successful password change

### Security Considerations
- Rate limiting on reset requests (per IP and per email)
- Reset tokens expire after 1 hour
- Reset tokens are single-use
- Detailed logging of reset requests (success/fail)
- Protection against timing attacks in token comparison

## Email Verification Flow

### Steps
1. **During Registration**:
   - User provides email, password, and other required info
   - System creates user account with `isEmailVerified = false`
   - Email verification token generated and stored (hashed)
   - Verification link sent via email
   - Account remains unverified until link clicked

2. **Verification Process**:
   - User clicks verification link with token
   - System validates token format and checks hash
   - Token must be unexpired (typically 24-48 hours)
   - User's `isEmailVerified` flag set to true
   - Verification token marked as used
   - User redirected to login page with success message

3. **Resend Verification**:
   - User can request new verification email
   - Rate limited to prevent abuse
   - New token generated and old one invalidated

### Security Considerations
- Verification tokens expire after 24 hours
- Tokens are single-use
- Rate limiting on verification requests
- Logging of verification attempts
- Protection against enumeration (similar responses whether email exists or not)

## Security Event Logging

### Event Types to Log
All security-relevant events using existing `AuditLogs` table:
1. **Authentication Events**:
   - `USER_LOGIN_SUCCESS`
   - `USER_LOGIN_FAILURE` (invalid credentials)
   - `USER_LOGIN_FAILURE` (account locked)
   - `USER_LOGIN_FAILURE` (email not verified)
   - `USER_LOGOUT`

2. **Token Events**:
   - `TOKEN_CREATED` (access token issued)
   - `TOKEN_REFRESHED` (refresh token used)
   - `TOKEN_REVOKED` (logout/password change)
   - `TOKEN_VALIDATION_FAILURE` (invalid/expired token)

3. **Password Events**:
   - `PASSWORD_RESET_REQUESTED`
   - `PASSWORD_RESET_SUCCESS`
   - `PASSWORD_RESET_FAILURE` (invalid/expired token)
   - `PASSWORD_CHANGED` (user-initiated)
   - `PASSWORD_CHANGED` (admin-initiated)

4. **Account Events**:
   - `ACCOUNT_LOCKED` (after failed attempts)
   - `ACCOUNT_UNLOCKED` (manual or time-based)
   - `EMAIL_VERIFICATION_SENT`
   - `EMAIL_VERIFIED`
   - `USER_CREATED` (self-registration or admin)
   - `USER_UPDATED` (profile changes)
   - `USER_DELETED`

5. **Authorization Events**:
   - `ACCESS_DENIED` (insufficient permissions)
   - `PERMISSION_GRANTED` (successful authorization)

### AuditLog Field Mapping
- `ActorUserId`: User performing action (nullable for system events)
- `EventType`: String identifier from list above
- `EntityType`: "USER", "TOKEN", "PASSWORD_RESET", etc.
- `EntityId`: ID of affected entity (UserId, TokenId, etc.)
- `IpAddress`: Client IP address
- `UserAgent`: Client user agent string
- `Metadata`: JSON string with additional context (risk assessment, details)

## Database Schema Changes

### Existing Tables (No Changes Required)
- Users (already has fields needed: Id, Email, PasswordHash, IsEmailVerified, etc.)
- Roles, UserRoles (RBAC foundation already in place)

### New Tables Required

#### 1. RefreshTokens
```sql
CREATE TABLE RefreshTokens (
    Id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(255) NOT NULL,  -- bcrypt hash of refresh token
    Jti UNIQUEIDENTIFIER NOT NULL,     -- JWT ID for access token association
    ExpiresAt DATETIME2 NOT NULL,
    CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    RevokedAt DATETIME2 NULL,
    CONSTRAINT FK_RefreshTokens_Users FOREIGN KEY (UserId) REFERENCES Users(Id)
);
CREATE INDEX IX_RefreshTokens_UserId ON RefreshTokens(UserId);
CREATE INDEX IX_RefreshTokens_Jti ON RefreshTokens(Jti);
CREATE INDEX IX_RefreshTokens_ExpiresAt ON RefreshTokens(ExpiresAt);
CREATE INDEX IX_RefreshTokens_RevokedAt ON RefreshTokens(RevokedAt) WHERE RevokedAt IS NOT NULL;
```

#### 2. PasswordResetTokens
```sql
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
```

#### 3. EmailVerificationTokens
```sql
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

### Modified Tables (Add Columns if Missing)
#### Users Table (verify these exist from Phase 1 seed)
- `IsEmailVerified BIT NOT NULL DEFAULT 0`
- `MfaEnabled BIT NOT NULL DEFAULT 0` (for future MFA)
- `FailedLoginCount INT NOT NULL DEFAULT 0`
- `LockedUntil DATETIME2 NULL`
- `PasswordHash NVARCHAR(255) NULL` (already exists)
- `UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()` (already exists)

## API Endpoint Specifications

### Authentication Endpoints

#### 1. User Registration
```
POST /api/auth/register
```
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123!",
  "displayName": "John Doe"
}
```
**Responses**:
- `201 Created`: Registration successful, verification email sent
- `400 Bad Request`: Validation error (weak password, invalid email, etc.)
- `409 Conflict`: Email already registered
- `500 Internal Server Error`: Server error

#### 2. User Login
```
POST /api/auth/login
```
**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123!"
}
```
**Responses**:
- `200 OK`: 
```json
{
  "accessToken": "jwt_token_here",
  "refreshToken": "refresh_token_here",
  "expiresIn": 900,  // seconds
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "isEmailVerified": true,
    "roles": ["developer"]
  }
}
```
- `401 Unauthorized`: Invalid credentials
- `403 Forbidden`: Email not verified or account locked
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

#### 3. Refresh Access Token
```
POST /api/auth/refresh
```
**Request Body**:
```json
{
  "refreshToken": "refresh_token_here"
}
```
**Responses**:
- `200 OK`: New access token issued
```json
{
  "accessToken": "new_jwt_token_here",
  "expiresIn": 900
}
```
- `401 Unauthorized`: Invalid or expired refresh token
- `400 Bad Request`: Missing refresh token
- `500 Internal Server Error`: Server error

#### 4. User Logout
```
POST /api/auth/logout
```
**Headers**:
```
Authorization: Bearer <access_token>
```
**Request Body** (optional):
```json
{
  "refreshToken": "refresh_token_to_revoke"  // if provided, revokes specific token
}
```
**Responses**:
- `200 OK`: Logout successful
- `401 Unauthorized`: Invalid access token
- `500 Internal Server Error`: Server error

### Password Management Endpoints

#### 1. Request Password Reset
```
POST /api/auth/reset-password/request
```
**Request Body**:
```json
{
  "email": "user@example.com"
}
```
**Responses**:
- `200 OK`: Reset email sent if account exists (always returns success to prevent enumeration)
- `400 Bad Request`: Invalid email format
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

#### 2. Validate and Set New Password
```
POST /api/auth/reset-password/validate
```
**Request Body**:
```json
{
  "token": "reset_token_here",
  "newPassword": "newSecurePassword123!"
}
```
**Responses**:
- `200 OK`: Password reset successful
- `400 Bad Request`: Invalid token, weak password, or validation error
- `410 Gone`: Token expired or already used
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### Email Verification Endpoints

#### 1. Verify Email Address
```
GET /api/auth/verify-email/:token
```
**URL Parameter**:
- `token`: Email verification token

**Responses**:
- `200 OK`: Email verified successfully
- `400 Bad Request`: Invalid token format
- `410 Gone`: Token expired or already used
- `500 Internal Server Error`: Server error

#### 2. Resend Verification Email
```
POST /api/auth/resend-verification
```
**Request Body**:
```json
{
  "email": "user@example.com"
}
```
**Responses**:
- `200 OK`: Verification email sent if account exists and unverified
- `400 Bad Request`: Invalid email format
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

## Implementation Roadmap

### Phase 2.1: Core Authentication (Weeks 1-2)
- [ ] Create Auth Service with login/logout logic
- [ ] Implement Token Service with JWT handling
- [ ] Add Password Service with bcrypt hashing
- [ ] Create database tables for tokens (RefreshTokens, PasswordResetTokens, EmailVerificationTokens)
- [ ] Implement login and registration endpoints
- [ ] Add authentication middleware
- [ ] Implement basic security event logging to AuditLogs
- [ ] Write unit tests for auth services

### Phase 2.2: Token Management & Security (Weeks 3-4)
- [ ] Implement refresh token rotation
- [ ] Add access token expiration handling
- [ ] Implement refresh token revocation on logout/password change
- [ ] Add password reset flow (request and validate)
- [ ] Add email verification flow
- [ ] Implement rate limiting for auth endpoints
- [ ] Add comprehensive security event logging
- [ ] Write integration tests for auth flows

### Phase 2.3: Authorization & RBAC (Weeks 5-6)
- [ ] Define permission system and role mappings
- [ ] Implement authorization middleware (role and permission checking)
- [ ] Protect existing API endpoints with appropriate authorization
- [ ] Create admin-only endpoints for user/role management
- [ ] Add authorization event logging
- [ ] Write tests for authorization logic
- [ ] Perform security review and penetration testing preparation

### Phase 2.4: Hardening & Monitoring (Weeks 7-8)
- [ ] Implement account lockout after failed attempts
- [ ] Add password strength validation
- [ ] Add secure headers (helmet.js configuration)
- [ ] Implement CORS policies
- [ ] Add request/response logging for audit trails
- [ ] Create health check endpoints for auth service
- [ ] Perform load testing on auth endpoints
- [ ] Final security audit and vulnerability scanning

## Dependencies
- **bcryptjs**: Password hashing (already in package.json)
- **jsonwebtoken**: JWT creation and validation (add to dependencies)
- **dotenv**: Environment configuration (already in package.json)
- **express-rate-limit**: Rate limiting for auth endpoints (add to dependencies)
- **helmet**: Security headers (already in package.json)

## Environment Variables Required
- `JWT_ACCESS_SECRET`: Secret for signing access tokens
- `JWT_REFRESH_SECRET`: Secret for signing refresh tokens (if using JWT for refresh, else not needed)
- `JWT_ACCESS_EXPIRES_IN`: Access token expiration (e.g., "15m")
- `JWT_REFRESH_EXPIRES_IN`: Refresh token expiration (e.g., "7d")
- `PASSWORD_RESET_EXPIRES_IN`: Password reset token expiration (e.g., "1h")
- `EMAIL_VERIFICATION_EXPIRES_IN`: Email verification token expiration (e.g., "24h")
- `MAX_FAILED_LOGIN_ATTEMPTS`: Account lockout threshold (e.g., 5)
- `ACCOUNT_LOCKOUT_DURATION`: Lockout duration (e.g., "15m")
- `RATE_LIMIT_WINDOW_MS`: Rate limit window (e.g., 900000 for 15 minutes)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (e.g., 5)

## Security Considerations
1. **Token Storage**: Refresh tokens hashed in database (never stored plaintext)
2. **Token Rotation**: Refresh tokens rotated on use to prevent replay attacks
3. **Short Expiration**: Access tokens short-lived to limit damage if stolen
4. **HTTP Only Cookies**: Consider for future enhancement (currently using Authorization header)
5. **HTTPS Required**: All auth endpoints must be served over HTTPS in production
6. **CSRF Protection**: Not needed for API using Authorization header (would be needed for cookie-based)
7. **Input Validation**: Strict validation on all auth endpoints
8. **Error Messages**: Generic messages to prevent enumeration (timing attack safe)
9. **Logging**: Security events logged with sufficient detail for forensics but no sensitive data
10. **Secrets Management**: JWT secrets and other sensitive config managed via environment variables

## Compliance & Standards
- **OWASP ASVS**: Aligned with Authentication and Session Management requirements
- **NIST 800-63B**: Follows guidelines for memorized secrets and verifiers
- **GDPR**: Personal data handling considerations for email and user data
- **SOC 2**: Applicable security controls for availability and confidentiality

## Success Criteria
- [ ] All authentication flows work correctly with valid/invalid inputs
- [ ] Authorization properly restricts access based on roles/permissions
- [ ] Tokens are properly expired and cannot be reused after expiration
- [ ] Refresh token rotation prevents replay attacks
- [ ] Password reset and email verification flows are secure
- [ ] All security events are logged to AuditLogs table
- [ ] Rate limiting prevents brute force attacks
- [ ] No authentication bypass vulnerabilities
- [ ] Secure password storage using industry-standard bcrypt
- [ ] All auth-related API endpoints have comprehensive test coverage