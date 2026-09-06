-- PostgreSQL Migration: Seed System Roles
-- Translated from database/seeds/001_seed_roles_and_dev_user.sql
-- Zero plaintext passwords, API keys, tokens, or credentials.
--
-- SECURITY COMPLIANCE NOTE:
-- In accordance with production security standards, default user accounts (dev/admin)
-- are NOT created automatically by schema migrations in shared or demo databases.
-- All user accounts must be provisioned at deployment or runtime with explicitly
-- injected credentials.
--
-- This migration provisions only the immutable system roles required for foreign key constraints.

INSERT INTO "Roles" ("Id", "Name", "Description")
VALUES
    ('11111111-1111-1111-1111-111111111112', 'admin', 'Administrator with tenant and platform management permissions.'),
    ('22222222-2222-2222-2222-222222222223', 'developer', 'Developer who reviews and improves code.'),
    ('33333333-3333-3333-3333-333333333334', 'recruiter', 'Recruiter who evaluates candidates.'),
    ('44444444-4444-4444-4444-444444444445', 'team_lead', 'Team lead who reviews repository health and technical debt.')
ON CONFLICT ("Id") DO UPDATE SET
    "Name" = EXCLUDED."Name",
    "Description" = EXCLUDED."Description";
