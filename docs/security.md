# Security Model

## Controls

- Authentication uses short-lived JWT access tokens and hashed refresh tokens.
- Authorization uses role-based access control for developer, recruiter, team lead, and admin roles.
- Passwords are hashed with bcrypt using a cost factor of 12.
- HTTP responses include hardened security headers and clickjacking protection.
- API rate limiting reduces brute-force and resource exhaustion risk.
- Request validation is performed at all public DTO boundaries.
- SQL Server access must use parameterized queries and stored credentials from Key Vault in production.
- Audit logs record authentication, authorization, imports, analysis execution, report generation, and administrative actions.

## Upload And Repository Safety

- ZIP uploads must be scanned, size-limited, decompressed in isolated temporary storage, and protected against zip-slip paths.
- Repository cloning must enforce timeout, size, branch, and file-count limits.
- Analysis must avoid executing submitted code.
- Secrets detected in source should be redacted before sending to third-party AI providers.

## Production Hardening Backlog

- Add CSRF protection for cookie-backed browser sessions.
- Add MFA enrollment and challenge routes.
- Add device trust lifecycle and session revocation UI.
- Add centralized security event streaming to SIEM.
- Add SAST, dependency scanning, container scanning, and IaC scanning to CI.
