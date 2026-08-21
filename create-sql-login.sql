-- SQL Script to create SQL Login and User for CodeGuardAI
-- Execute this script using sqlcmd with Windows Authentication

:setvar DatabaseName CodeGuardAI
:setvar Username CodeGuardAI_user
:setvar Password "CodeGuardAI_Strong_Password_123!"

-- Check if database exists, if not create it
IF DB_NAME() <> '$(DatabaseName)'
BEGIN
    PRINT 'Switching to master database...'
END

USE master;
GO

-- Drop login if it already exists (clean start)
IF EXISTS (SELECT * FROM sys.server_principals WHERE name = '$(Username)')
BEGIN
    PRINT 'Dropping existing login: $(Username)'
    DROP LOGIN [$(Username)];
END
GO

-- Create new SQL login
PRINT 'Creating new SQL login: $(Username)'
CREATE LOGIN [$(Username)]
WITH PASSWORD = '$(Password)',
     CHECK_POLICY = OFF,
     CHECK_EXPIRATION = OFF;
GO

-- Create database if it doesn't exist
IF DB_ID('$(DatabaseName)') IS NULL
BEGIN
    PRINT 'Creating database: $(DatabaseName)'
    CREATE DATABASE [$(DatabaseName)];
END
GO

-- Switch to the target database
USE [$(DatabaseName)];
GO

-- Drop user if it already exists (clean start)
IF EXISTS (SELECT * FROM sys.database_principals WHERE name = '$(Username)')
BEGIN
    PRINT 'Dropping existing user: $(Username)'
    DROP USER [$(Username)];
END
GO

-- Create database user for the login
PRINT 'Creating database user: $(Username)'
CREATE USER [$(Username)] FOR LOGIN [$(Username)];
GO

-- Grant necessary permissions
PRINT 'Granting permissions to user: $(Username)'
ALTER ROLE db_owner ADD MEMBER [$(Username)];
GO

-- Alternative: Grant specific permissions if db_owner is too much
-- GRANT CREATE TABLE, CREATE PROCEDURE, CREATE VIEW, CREATE FUNCTION TO [$(Username)];
-- GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE TO [$(Username)];

PRINT 'SQL Login and User creation completed successfully!'
PRINT 'Login: $(Username)'
PRINT 'Password: $(Password)'
PRINT 'Database: $(DatabaseName)'
GO