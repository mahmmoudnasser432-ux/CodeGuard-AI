# Database Summary

## Overview
The CodeGuard API uses Microsoft SQL Server as its primary data store, implementing a normalized relational schema designed for scalability and data integrity.

## Connection Details
- **Provider**: Microsoft SQL Server
- **Connection Package**: `mssql` (v11.0.1)
- **Connection Pooling**: Enabled with configurable min/max pool sizes
- **Security**: SQL Server Authentication (not Windows Integrated)
- **Encryption**: Enabled with trustServerCertificate configured per environment

## Schema Design
### Core Tables:
1. **Users** - System users with authentication information
2. **Roles** - Role-based access control definitions  
3. **UserRoles** - Many-to-many mapping of users to roles
4. **Projects** - Code projects owned by users
5. **Repositories** - Git repositories associated with projects
6. **Files** - File metadata within repositories
7. **Analyses** - Code analysis results
8. **AnalysisScores** - Detailed scoring for analyses
9. **Reports** - Generated reports from analyses
10. **InterviewSessions** - Technical interview sessions
11. **InterviewQuestions** - Questions within interview sessions
12. **InterviewResults** - Results of interview sessions
13. **Notifications** - User notifications
14. **AuditLogs** - System audit trail

### Key Relationships:
- Users →→ Roles (many-to-many via UserRoles)
- Projects → Users (one-to-many, ownership)
- Repositories → Projects (one-to-many)
- Files → Repositories (one-to-many)
- Analyses → Projects (one-to-many, nullable)
- Analyses → Repositories (one-to-many, nullable)
- Analyses → Users (one-to-many, requestedBy)
- AnalysisScores → Analyses (one-to-one)
- Reports → Analyses (one-to-many)
- InterviewSessions → Users (two foreign keys: candidate, recruiter)
- InterviewSessions → Repositories (one-to-many, nullable)
- InterviewQuestions → InterviewSessions (one-to-many)
- InterviewResults → InterviewSessions (one-to-one)
- Notifications → Users (one-to-many)
- AuditLogs → Users (one-to-many, nullable)

## Indexes for Performance:
- IX_Projects_OwnerUserId
- IX_Repositories_ProjectId  
- IX_Files_RepositoryId_Path
- IX_Analyses_RepositoryId_StartedAt
- IX_AnalysisScores_AnalysisId
- IX_AuditLogs_ActorUserId_CreatedAt
- IX_Sessions_UserId_ExpiresAt

## Constraints & Data Integrity:
- Primary keys on all tables using UNIQUEIDENTIFIER (GUID)
- Foreign key constraints enforcing referential integrity
- Unique constraints on Users.Email and Roles.Name
- Check constraints on score fields (0-100 range)
- Required fields enforced via NOT NULL constraints
- Default values for audit columns (CreatedAt, UpdatedAt)

## Seeded Data:
- **Roles**: 4 predefined roles (admin, developer, recruiter, team_lead)
- **Users**: 1 system user + demo users for testing
- **UserRoles**: Role assignments for system user

## Configuration:
Database connection parameters are managed through environment variables:
- SQLSERVER_HOST
- SQLSERVER_PORT  
- SQLSERVER_DATABASE
- SQLSERVER_USER
- SQLSERVER_PASSWORD
- NODE_ENV (affects trustServerCertificate setting)

## Maintenance Considerations:
- Connection pooling prevents exhaustion under load
- Parameterized queries eliminate SQL injection risk
- Indexes support common query patterns
- Constraints enforce data integrity at database level
- Explicit transaction handling ensures consistency