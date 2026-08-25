# AUTH SERVICE REFRESH TOKEN FIX PLAN

## Issue Location
- **File:** `src/application/services/auth-service.ts`
- **Method:** `refreshAccessToken()` 
- **Lines:** 102-105

## Current Problematic Code
```typescript
// Create new access token
const accessToken = TokenService.createAccessToken(
  { id: userId, email: '', roles: ['USER' as UserRole] } as User, // We don't have full user object here, but JWT only needs id for sub
  newJti
);
```

## Fields Used by TokenService.createAccessToken()
From `src/application/services/token-service.ts` lines 24-43, the method reads:
- `user.id` → JWT `sub` claim
- `user.email` → JWT `email` claim  
- `user.roles` → JWT `roles` claim
- `user.displayName` → JWT `displayName` claim
- `user.isEmailVerified` → JWT `isEmailVerified` claim

## Valid UserRole Values
From `src/domain/entities/user.ts` (referenced in codebase):
- "developer"
- "recruiter" 
- "team_lead"
- "admin"

## Impact of Current Implementation
JWTs produced during token refresh contain:
1. **Empty email** (`email: ''`) instead of user's actual email
2. **Invalid role** (`'USER'`) instead of user's actual role(s) - 'USER' is not a valid UserRole
3. **Undefined displayName** (not provided in mock object)
4. **Undefined isEmailVerified** (not provided in mock object)

This breaks:
- Authorization checks relying on roles
- Profile display relying on email/displayName
- Email verification status checks
- Any JWT-dependent functionality requiring complete user data

## Minimal Fix Solution
1. **Inject UserRepository** into AuthService constructor
2. **Fetch complete user** in `refreshAccessToken()` using userId from stored token
3. **Use actual user object** (not mock) when creating new access token

## Required Code Changes

### Step 1: Modify AuthService Constructor
```typescript
export class AuthService {
  constructor(
    private sessionRepository: SessionRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private passwordResetTokenRepository: PasswordResetTokenRepository,
    private emailVerificationTokenRepository: EmailVerificationTokenRepository,
    private userRepository: UserRepository, // ADD THIS
    private emailService: EmailService = new EmailService()
  ) {}
```

### Step 2: Update refreshAccessToken Method
Replace lines 102-105:
```typescript
// OLD (lines 102-105):
const accessToken = TokenService.createAccessToken(
  { id: userId, email: '', roles: ['USER' as UserRole] } as User,
  newJti
);

// NEW:
// Fetch complete user from database
const user = await this.userRepository.findById(userId);
if (!user) {
  throw new Error('User not found during token refresh');
}

// Create new access token with complete user data
const accessToken = TokenService.createAccessToken(user, newJti);
```

## Verification After Fix
- JWTs during refresh will contain:
  - Correct user ID (`sub`)
  - Actual user email
  - Actual user roles (valid UserRole values)
  - Actual displayName
  - Actual isEmailVerified status
- All JWT-dependent functionality will work correctly after token refresh
- Maintains security integrity of authentication system

## Files to Modify
1. `src/application/services/auth-service.ts` - Add userRepository dependency and use it in refreshAccessToken()

## No Changes Needed
- `src/application/services/token-service.ts` (working correctly)
- `src/domain/entities/user.ts` (defines correct types)
- `src/domain/repositories/user-repository.ts` (interface already exists)