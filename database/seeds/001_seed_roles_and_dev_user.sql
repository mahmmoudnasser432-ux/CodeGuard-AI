MERGE dbo.Roles AS target
USING (VALUES
    ('11111111-1111-1111-1111-111111111112', 'admin', 'Administrator with tenant and platform management permissions.'),
    ('22222222-2222-2222-2222-222222222223', 'developer', 'Developer who reviews and improves code.'),
    ('33333333-3333-3333-3333-333333333334', 'recruiter', 'Recruiter who evaluates candidates.'),
    ('44444444-4444-4444-4444-444444444445', 'team_lead', 'Team lead who reviews repository health and technical debt.')
) AS source (Id, Name, Description)
ON target.Id = source.Id
WHEN MATCHED THEN UPDATE SET Name = source.Name, Description = source.Description
WHEN NOT MATCHED THEN INSERT (Id, Name, Description) VALUES (source.Id, source.Name, source.Description);

DECLARE @SystemUserId UNIQUEIDENTIFIER = '00000000-0000-0000-0000-000000000001';

IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Id = @SystemUserId)
BEGIN
    INSERT INTO dbo.Users (Id, Email, PasswordHash, DisplayName, IsEmailVerified, MfaEnabled)
    VALUES (@SystemUserId, 'system@codeguard.local', NULL, 'CodeGuard System User', 1, 0);
END;

DECLARE @AdminRoleId UNIQUEIDENTIFIER = (SELECT Id FROM dbo.Roles WHERE Name = 'admin');
DECLARE @DeveloperRoleId UNIQUEIDENTIFIER = (SELECT Id FROM dbo.Roles WHERE Name = 'developer');
DECLARE @RecruiterRoleId UNIQUEIDENTIFIER = (SELECT Id FROM dbo.Roles WHERE Name = 'recruiter');
DECLARE @TeamLeadRoleId UNIQUEIDENTIFIER = (SELECT Id FROM dbo.Roles WHERE Name = 'team_lead');

-- Assign admin role to system user
IF @AdminRoleId IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @SystemUserId AND RoleId = @AdminRoleId)
BEGIN
    INSERT INTO dbo.UserRoles (UserId, RoleId)
    VALUES (@SystemUserId, @AdminRoleId);
END;

-- Assign developer role to system user (for backward compatibility with existing tests)
IF @DeveloperRoleId IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM dbo.UserRoles WHERE UserId = @SystemUserId AND RoleId = @DeveloperRoleId)
BEGIN
    INSERT INTO dbo.UserRoles (UserId, RoleId)
    VALUES (@SystemUserId, @DeveloperRoleId);
END;