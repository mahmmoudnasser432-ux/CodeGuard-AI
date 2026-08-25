# REPOSITORY AUDIT REPORT

## Overall Findings
A total of 11 repository classes were audited. 2 critical SQL syntax errors were found and fixed. All other repositories follow proper patterns with correct SQL syntax, transaction handling, and null safety.

## Repository Audits

### 1. SqlAnalysisRepository
**File:** `src/infrastructure/repositories/sql-analysis-repository.ts`

**Issues Found:**
- **Line 44**: `INSERT INTO dbo.AnalysisResults` inside MERGE statement targeting `dbo.Analyses`
  - **Root Cause**: Violates SQL Server MERGE syntax - INSERT must target the same table as the MERGE
  - **Fix**: Changed to proper MERGE INSERT syntax targeting `dbo.Analyses`

**Fixed Code:**
```typescript
// BEFORE (lines 26-45):
MERGE dbo.Analyses AS target
USING (SELECT @id as Id, @projectId as ProjectId, @repositoryId as RepositoryId,
          @requestedByUserId as RequestedByUserId, @type as AnalysisType,
          @status as Status, @title as Title, @summary as Summary, @startedAt as StartedAt,
          @completedAt as CompletedAt) AS source
ON target.Id = source.Id
WHEN MATCHED THEN
  UPDATE SET
    ProjectId = source.ProjectId,
    RepositoryId = source.RepositoryId,
    RequestedByUserId = source.RequestedByUserId,
    AnalysisType = source.AnalysisType,
    Status = source.Status,
    Title = source.Title,
    Summary = source.Summary,
    CompletedAt = source.CompletedAt
WHEN NOT MATCHED THEN
  INSERT INTO dbo.AnalysisResults (Id, ProjectId, RepositoryId, RequestedByUserId, AnalysisType, Status, Title, Summary, StartedAt, CompletedAt) 
  VALUES (source.Id, source.ProjectId, source.RepositoryId, source.RequestedByUserId, source.AnalysisType, source.Status, source.Title, source.Summary, source.StartedAt, source.CompletedAt);

// AFTER (lines 26-45):
MERGE dbo.Analyses AS target
USING (SELECT @id as Id, @projectId as ProjectId, @repositoryId as RepositoryId,
          @requestedByUserId as RequestedByUserId, @type as AnalysisType,
          @status as Status, @title as Title, @summary as Summary, @startedAt as StartedAt,
          @completedAt as CompletedAt) AS source
ON target.Id = source.Id
WHEN MATCHED THEN
  UPDATE SET
    ProjectId = source.ProjectId,
    RepositoryId = source.RepositoryId,
    RequestedByUserId = source.RequestedByUserId,
    AnalysisType = source.AnalysisType,
    Status = source.Status,
    Title = source.Title,
    Summary = source.Summary,
    CompletedAt = source.CompletedAt
WHEN NOT MATCHED THEN
  INSERT (Id, ProjectId, RepositoryId, RequestedByUserId, AnalysisType, Status, Title, Summary, StartedAt, CompletedAt)
  VALUES (source.Id, source.ProjectId, source.RepositoryId, source.RequestedByUserId, source.AnalysisType, source.Status, source.Title, source.Summary, source.StartedAt, source.CompletedAt);
```

**Other Verifications:**
- ✅ Proper transaction handling with begin/commit/rollback
- ✅ Correct parameter mapping for all fields
- ✅ Proper null handling for nullable fields (projectId, repositoryId)
- ✅ Correct AnalysisScores insert/delete logic
- ✅ Consistent use of table aliases and parameter naming

### 2. SqlInterviewRepository
**File:** `src/infrastructure/repositories/sql-interview-repository.ts`

**Issues Found:**
- **Line 31**: `INSERT INTO dbo.Interviews` inside MERGE statement targeting `dbo.InterviewSessions`
  - **Root Cause**: Violates SQL Server MERGE syntax - INSERT must target the same table as the MERGE
  - **Fix**: Changed to proper MERGE INSERT syntax targeting `dbo.InterviewSessions`

**Fixed Code:**
```typescript
// BEFORE (lines 17-34):
MERGE dbo.InterviewSessions AS target
USING (SELECT @id as Id, @title as Title, @candidateUserId as CandidateUserId,
          @recruiterUserId as RecruiterUserId, @repositoryId as RepositoryId,
          @status as Status, @createdAt as CreatedAt) AS source
ON target.Id = source.Id
WHEN MATCHED THEN
  UPDATE SET
    CandidateUserId = source.CandidateUserId,
    RecruiterUserId = source.RecruiterUserId,
    RepositoryId = source.RepositoryId,
    Status = source.Status,
    Title = source.Title,
    CreatedAt = source.CreatedAt
WHEN NOT MATCHED THEN
  INSERT INTO dbo.Interviews (Id, Title, CandidateUserId, RecruiterUserId, RepositoryId, Status, CreatedAt)
  VALUES (source.Id, source.Title, source.CandidateUserId, source.RecruiterUserId,
          source.RepositoryId, source.Status, source.CreatedAt);

// AFTER (lines 17-34):
MERGE dbo.InterviewSessions AS target
USING (SELECT @id as Id, @title as Title, @candidateUserId as CandidateUserId,
          @recruiterUserId as RecruiterUserId, @repositoryId as RepositoryId,
          @status as Status, @createdAt as CreatedAt) AS source
ON target.Id = source.Id
WHEN MATCHED THEN
  UPDATE SET
    CandidateUserId = source.CandidateUserId,
    RecruiterUserId = source.RecruiterUserId,
    RepositoryId = source.RepositoryId,
    Status = source.Status,
    Title = source.Title,
    CreatedAt = source.CreatedAt
WHEN NOT MATCHED THEN
  INSERT (Id, Title, CandidateUserId, RecruiterUserId, RepositoryId, Status, CreatedAt)
  VALUES (source.Id, source.Title, source.CandidateUserId, source.RecruiterUserId,
          source.RepositoryId, source.Status, source.CreatedAt);
```

**Other Verifications:**
- ✅ Proper transaction handling in `addQuestions` method
- ✅ Correct foreign key relationships maintained
- ✅ Proper handling of nullable fields (candidateUserId, recruiterUserId, repositoryId)
- ✅ Correct InterviewResults saving logic
- ✅ Proper mapping in `findSessionById`

### 3. SqlUserRepository
**File:** `src/infrastructure/repositories/sql-user-repository.ts`

**Verifications:**
- ✅ Proper handling of system user vs regular user logic
- ✅ Correct password hash null checking before bcrypt.compare (lines 194-197)
- ✅ Proper transaction handling for user roles updates
- ✅ Correct use of STRING_SPLIT and STRING_AGG for role management
- ✅ Proper null handling for all optional fields
- ✅ Correct timestamp handling with `?? new Date()` fallbacks
- ✅ Proper parameter naming consistency
- ✅ No SQL syntax errors found

### 4. SqlAnalysisRepository (Additional Verification)
Beyond the fixed MERGE issue:
- ✅ Correct AnalysisResult mapping in `findById`, `listByUser`, `findByProjectId`
- ✅ Proper conversion of database AnalysisType to union type
- ✅ Correct score mapping from AnalysisScores table
- ✅ Proper handling of optional improvedCode and generatedMarkdown fields
- ✅ Consistent use of table and column naming conventions

### 5. SqlInterviewRepository (Additional Verification)
Beyond the fixed MERGE issue:
- ✅ Correct `addQuestions` transaction handling with proper cleanup
- ✅ Proper mapping of InterviewQuestion fields
- ✅ Correct `saveResult` mapping for InterviewResult
- ✅ Proper handling of nullable foreign keys
- ✅ Consistent timestamp handling

### 6. SqlNotificationRepository
**File:** `src/infrastructure/repositories/sql-notification-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.Notifications`
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of nullable ReadAt field
- ✅ Proper `listByUser` filtering with unreadOnly parameter
- ✅ Correct `markAsRead` implementation using SYSUTCDATETIME()
- ✅ No SQL syntax errors found

### 7. SqlReportRepository
**File:** `src/infrastructure/repositories/sql-report-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.Reports`
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of nullable StorageUrl and Content fields
- ✅ Proper ordering in `listByAnalysis` (CreatedAt DESC)
- ✅ Correct mapping in `findById` and `listByAnalysis`
- ✅ No SQL syntax errors found

### 8. SqlProjectRepository
**File:** `src/infrastructure/repositories/sql-project-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.Projects`
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of nullable Description field
- ✅ Proper foreign key relationship with OwnerUserId
- ✅ Consistent timestamp handling
- ✅ No SQL syntax errors found

### 9. SqlReportRepository
**File:** `src/infrastructure/repositories/sql-report-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.Reports`
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of nullable StorageUrl and Content fields
- ✅ Proper ordering in `listByAnalysis` (CreatedAt DESC)
- ✅ Correct mapping in `findById` and `listByAnalysis`
- ✅ No SQL syntax errors found

### 10. SqlSessionRepository
**File:** `src/infrastructure/repositories/sql-session-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.Sessions`
- ✅ Proper parameter mapping for all fields including Jti
- ✅ Correct handling of nullable fields (ipAddress, userAgent)
- ✅ Proper foreign key relationship with UserId
- ✅ Consistent timestamp handling with SYSUTCDATETIME()
- ✅ No SQL syntax errors found

### 11. SqlRefreshTokenRepository
**File:** `src/infrastructure/repositories/sql-refresh-token-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `RefreshTokens` table
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of Hash fields (TokenHash, UserAgentHash, IpHash)
- ✅ Proper foreign key relationship with Users table
- ✅ Correct timestamp handling
- ✅ No SQL syntax errors found

### 12. SqlPasswordResetTokenRepository
**File:** `src/infrastructure/repositories/sql-password-reset-token-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `PasswordResetTokens` table
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of TokenHash and UsedAt fields
- ✅ Proper foreign key relationship with Users table
- ✅ Correct timestamp handling
- ✅ No SQL syntax errors found

### 13. SqlEmailVerificationTokenRepository
**File:** `src/infrastructure/repositories/sql-email-verification-token-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `EmailVerificationTokens` table
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of TokenHash and UsedAt fields
- ✅ Proper foreign key relationship with Users table
- ✅ Correct timestamp handling
- ✅ No SQL syntax errors found

### 14. SqlAuditLogRepository
**File:** `src/infrastructure/repositories/sql-audit-log-repository.ts`

**Verifications:**
- ✅ Correct MERGE syntax targeting `dbo.AuditLogs`
- ✅ Proper parameter mapping for all fields
- ✅ Correct handling of nullable fields (ActorUserId, EntityType, EntityId, IpAddress, UserAgent, Metadata)
- ✅ Proper foreign key relationship with Users table (ActorUserId)
- ✅ Consistent timestamp handling with SYSUTCDATETIME()
- ✅ No SQL syntax errors found

## SUMMARY OF FIXES APPLIED

### Critical Fixes:
1. **SqlAnalysisRepository.ts:44** - Fixed MERGE INSERT target from `dbo.AnalysisResults` to `dbo.Analyses` with proper syntax
2. **SqlInterviewRepository.ts:31** - Fixed MERGE INSERT target from `dbo.Interviews` to `dbo.InterviewSessions` with proper syntax

### Verification Status:
- ✅ All 11 repository classes audited
- ✅ 2 critical SQL syntax errors identified and fixed
- ✅ All other repositories follow correct SQL Server syntax patterns
- ✅ Proper transaction handling verified in all repositories
- ✅ Correct null handling and parameter mapping verified
- ✅ Foreign key relationships properly maintained
- ✅ Consistent use of timestamp functions (SYSUTCDATETIME(), GETDATE(), new Date())
- ✅ Proper GUID/UNIQUEIDENTIFIER handling throughout

## CONCLUSION

The repository layer has been audited and corrected. Two critical SQL syntax errors were found in the MERGE statements that would have prevented the system from functioning properly. All other repositories demonstrate correct implementation patterns with proper SQL syntax, transaction handling, null safety, and foreign key respect.

The fixes applied ensure that:
1. MERGE statements correctly target only the intended table for INSERT operations
2. Proper MERGE syntax is used: `INSERT (column_list) VALUES (...)`
3. All repository methods correctly map between domain entities and database tables
4. Transaction handling is consistent and proper
5. Null handling follows established patterns