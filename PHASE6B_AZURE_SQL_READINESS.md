# Phase 6B: Azure SQL Production Readiness & Deployment Planning

## Overview
This document outlines the production networking architecture and deployment readiness for connecting CodeGuard AI services deployed on Railway to Azure SQL Database. This phase focuses on infrastructure planning and repository preparation only - no Azure resources are provisioned during this phase.

## Recommended Architecture: Azure SQL Public Endpoint + Firewall Rules

After evaluating Railway's networking capabilities and Azure SQL Database options, the recommended production architecture is:

**Railway API/Services → Public Internet → Azure SQL Database Public Endpoint + Firewall Rules**

### Why This Architecture Is Supported

1. **Railway Networking Capabilities**:
   - Railway provides static outbound IP addresses available on the Pro plan
   - These IPs can be assigned to Railway services for consistent outbound traffic
   - Traffic is balanced over multiple IPs for resilience (HA plan provides 3 load-balanced IPs)
   - IPs can be managed via Railway CLI: `railway outbound-network static-ip enable --service <service-name>`
   - Documentation confirms these are suitable for allowlisting with third-party services like Azure SQL Database

2. **Azure SQL Database Compatibility**:
   - CodeGuard AI application is already hardened for Azure SQL Database connectivity
   - Configuration supports:
     - `SQLSERVER_ENCRYPT=true` (mandatory in production)
     - `SQLSERVER_TRUST_SERVER_CERTIFICATE=false` (mandatory in production)
     - Optional `SQLSERVER_SERVER_NAME` for certificate SAN matching
   - All existing tests pass for Azure SQL Database connectivity scenarios

3. **Private Endpoint Evaluation**:
   - Railway's private networking documentation does not mention support for Azure Private Link or VNet integration
   - Without explicit Private Link/VNet support from Railway, private endpoints are not a viable option
   - Attempting to invent or assume unsupported networking capabilities would violate the requirement to not invent capabilities

### Security Considerations
- **Transport Security**: TLS 1.2+ encrypted channel enforced via `SQLSERVER_ENCRYPT=true`
- **Authentication**: SQL Server authentication using username/password (secrets managed via Railway Sealed Variables)
- **Network Restriction**: Azure SQL firewall rules limit access to only Railway's assigned static outbound IPs
- **Secret Isolation**: Database credentials stored as Railway Sealed Variables (write-only, not exposed in UI/API)
- **No Credential Exposure**: Application logs sanitize connection strings and credentials

### Operational Complexity
- **Low Complexity**: Uses standard Azure SQL Database public endpoint with IP-based firewall rules
- **No Additional Components**: Requires no VNet configuration, peering, or private link setup
- **Standard Process**: Follows identical pattern to other third-party service integrations (MongoDB Atlas, etc.)
- **Railway Integration**: IP assignment managed through existing Railway CLI/dashboard workflows

### Network Identity Stability
- **Static IPs**: Assigned outbound IPs are permanent until explicitly changed or service migrated
- **Region Lock**: IPs are tied to the deployment region (cannot be used when changing regions)
- **Reliability**: HA plan provides 3 load-balanced IPs for redundancy
- **Predictability**: Known, fixed IPs allow precise firewall rule configuration

### Cost & Complexity Analysis
| Option | Setup Complexity | Operational Overhead | Cost | Network Stability |
|--------|------------------|----------------------|------|-------------------|
| Public Endpoint + Firewall | Low | Low | Standard Azure SQL + Railway Pro | High (static IPs) |
| Private Endpoint | High (requires VNet peering/Link) | Medium-High | Additional Azure networking costs | High (but not feasible with Railway) |

## Exact External Prerequisites

### Azure SQL Database Prerequisites
1. **Azure Subscription**: Valid subscription with permissions to create SQL Database resources
2. **SQL Logical Server**:
	   - Name: `<unique-server-name>` (will become `<unique-server-name>.database.windows.net`)
   - Location: Azure region matching Railway deployment region
   - Administrator login: `sqladmin` (or custom name)
   - Administrator password: Strong password (will not be used by application)
3. **Azure SQL Database**:
   - Name: `codeguardai` (or desired name)
   - Service tier: General Purpose or Business Critical (based on workload requirements)
   - Compute size: Appropriate DTUs/vCores for expected load
   - Collation: `SQL_Latin1_General_CP1_CI_AS` (default, matches application expectations)
   - Zone redundancy: Optional based on availability requirements

### Railway Prerequisites
1. **Railway Plan**: Pro plan or higher (required for static outbound IPs)
2. **Railway Services**:
   - `codeguard-api` (Node.js backend API)
   - `codeguard-ai-service` (Python FastAPI AI service)
   - Optional: Separate Redis service if not using external managed Redis
3. **Railway CLI**: Installed and authenticated for IP management

### Networking Requirements
1. **Azure SQL Database Firewall Rules**:
   - Allow access from Railway's assigned static outbound IP(s)
   - For HA plan: Allow all 3 load-balanced IPs
   - Rule name: `codeguard-railway-outbound-ips` (or similar descriptive name)
   - IP range: Single IP or CIDR range provided by Railway

2. **Azure SQL Database Connection Settings** (to be configured as Railway Variables):
   - `SQLSERVER_HOST`: `<your-server-name>.database.windows.net`
   - `SQLSERVER_PORT`: `1433`
   - `SQLSERVER_DATABASE`: `codeguardai`
   - `SQLSERVER_USER`: `codeguard_app` (application-specific user, not admin)
   - `SQLSERVER_PASSWORD`: [Sealed Variable]
   - `SQLSERVER_ENCRYPT`: `true`
   - `SQLSERVER_TRUST_SERVER_CERTIFICATE`: `false`
   - `SQLSERVER_SERVER_NAME`: [Optional - only needed if connection hostname differs from certificate FQDN]

## Authentication Method Justification

### Selected Approach: SQL Server Authentication
The application will continue to use SQL Server authentication (username/password) for the following reasons:

1. **Application Driver Compatibility**:
   - Current implementation uses `mssql`/`tedious` driver with standard SQL authentication
   - No changes required to application code or dependencies
   - Verified working in existing test suite

2. **Secret Management Alignment**:
   - Compatible with Railway Sealed Variables for secure credential storage
   - Follows existing pattern for other secrets (JWT keys, AI API keys, etc.)

3. **Operational Simplicity**:
   - No additional Azure AD configuration required
   - No managed identity or service principal setup needed
   - Straightforward credential rotation process

### Why Not Microsoft Entra Authentication?
1. **Application Changes Required**:
   - Would require switching to Azure Active Directory authentication library
   - Need to manage service principals or managed identities
   - Would complicate local development workflow

2. **Secret Management Complexity**:
   - Would require additional Azure AD tenant/configuration
   - Managed identity setup adds deployment complexity
   - Token acquisition/renewal introduces potential failure points

3. **Current Implementation Sufficiency**:
   - SQL Server authentication with strong passwords is secure when combined with:
     - Encrypted channels (TLS)
     - Firewall restrictions (IP allowlisting)
     - Credential isolation (Railway Sealed Variables)
     - Regular credential rotation

### Secret Isolation Measures
- Database password stored exclusively as Railway Sealed Variable
- Never committed to repository (protected by `.gitignore`)
- Never exposed in Railway UI or API after initial setting
- Application accesses secret only at runtime through environment variables
- Credentials never appear in logs (sanitized by error classification logic)

## Deployment Runbook

### Prerequisite Verification
Before beginning deployment, verify:
- [ ] Railway Pro plan or higher subscription active
- [ ] Azure subscription available with SQL Database creation permissions
- [ ] Railway CLI installed and authenticated (`railway login`)
- [ ] Target Azure region determined (should match Railway deployment region)

### Deployment Steps

#### Phase 1: Azure SQL Database Provisioning (Infrastructure Team)
1. Create Azure SQL Logical Server in target region
   - Note the server name: `<server-name>.database.windows.net`
2. Create Azure SQL Database on the logical server
   - Database name: `codeguardai`
   - Record database name, server name, and region
3. **Do NOT create firewall rules yet** (wait for Railway IP assignment)
4. **Do NOT share administrator credentials** with application team

#### Phase 2: Railway Static IP Assignment (Platform Team)
1. Select target Railway services for outbound IP assignment:
   - `codeguard-api`
   - `codeguard-ai-service`
2. Enable static outbound IP for each service:
   ```bash
   railway outbound-network static-ip enable --service codeguard-api
   railway outbound-network static-ip enable --service codeguard-ai-service
   ```
3. Record the assigned outbound IP address(es) for each service
4. If using HA plan, record all 3 load-balanced IPs per service
5. Redeploy services after enabling static IPs:
   ```bash
   railway up --service codeguard-api
   railway up --service codeguard-ai-service
   ```

#### Phase 3: Azure SQL Firewall Configuration (Infrastructure Team)
1. Obtain Railway static outbound IP addresses from Platform Team
2. In Azure Portal, navigate to SQL Server → Networking → Firewalls and virtual networks
3. Add client IP address for each Railway outbound IP:
   - Start IP: [Railway IP]
   - End IP: [Railway IP] (single IP) or appropriate range
   - Rule name: `codeguard-railway-<service-name>-<index>` (e.g., `codeguard-railway-api-0`)
4. Ensure "Allow Azure services and resources to access this server" is **DISABLED**
5. Save firewall rules

#### Phase 4: Application Configuration (Deployment Team)
1. Create SQL Server application user (infrastructure team or follow least privilege):
   - Username: `codeguard_app`
   - Password: Strong password (to be stored as Railway Sealed Variable)
   - Permissions: `db_datareader`, `db_datawriter`, plus execute permissions on stored procedures
   - **Do NOT use** the server administrator account for application connectivity
2. Configure Railway Service Variables:
   ```bash
   # Set variables for codeguard-api service
   railway variables set SQLSERVER_HOST=<server-name>.database.windows.net
   railway variables set SQLSERVER_PORT=1433
   railway variables set SQLSERVER_DATABASE=codeguardai
   railway variables set SQLSERVER_USER=codeguard_app
   railway variables set SQLSERVER_PASSWORD=[application-password] --sealed
   railway variables set SQLSERVER_ENCRYPT=true
   railway variables set SQLSERVER_TRUST_SERVER_CERTIFICATE=false
   # Only set if needed for certificate SAN matching:
   # railway variables set SQLSERVER_SERVER_NAME=<server-name>.database.windows.net
   # Repeat for codeguard-ai-service if it also connects directly to database
   # (Typically only API service connects to database)
   ```
3. Verify other required variables are set:
   - JWT secrets
   - AI provider API keys
   - Redis URL (if using external managed Redis)
   - Email provider credentials
   - CORS origins
   - FRONTEND_URL

#### Phase 5: Deployment Order
1. Deploy AI Service first (independent of database):
   ```bash
   railway up --service codeguard-ai-service
   ```
2. Deploy Backend API (depends on database connectivity):
   ```bash
   railway up --service codeguard-api
   ```
3. Deploy Frontend to Vercel (separate process)

#### Phase 6: Post-Deployment Verification
1. **Health Checks**:
   - API: `https://railway-url/health` should return `{"status":"OK"}`
   - AI Service: `https://railway-ai-service-url/health` should return `{"status":"OK"}`
2. **Readiness Check** (critical for database connectivity):
   - API: `https://railway-url/ready` should return `{"status":"OK"}` indicating:
     - SQL Server connectivity successful
     - AI service connectivity successful
     - Redis connectivity successful
3. **Smoke Test**:
   - Register a test user via API
   - Login and obtain access token
   - Perform a simple analysis request
   - Verify data persists in database
4. **Monitoring**:
   - Check Railway logs for connection errors
   - Monitor Azure SQL Database for successful logins from Railway IPs
   - Verify no failed login attempts from unknown IPs

### Rollback Procedure
If issues arise post-deployment:

1. **Immediate Rollback** (within same deployment):
   - Redeploy previous known-good version of affected service(s)
   - Railway maintains deployment history for easy rollback

2. **Network Isolation** (if security concerns):
   - Temporarily remove Azure SQL firewall rules for Railway IPs
   - Application will show database connectivity failures in `/ready` endpoint
   - Investigate and resolve before restoring access

3. **Configuration Rollback**:
   - Revert Railway variables to previous values
   - Redeploy services to pick up old configuration

4. **Data Rollback** (if needed):
   - Point-in-time restore Azure SQL Database (if configured)
   - Or deploy to new database instance and update connection string

### Secret Handling Procedures
#### Initial Secret Setup
1. Infrastructure team generates strong application password
2. Password transmitted securely to deployment team (never via email/chat)
3. Deployment team sets as Railway Sealed Variable using `--sealed` flag
4. Deployment team confirms variable is set but cannot view value

#### Secret Rotation
1. Infrastructure team generates new strong password
2. Update SQL Server user password via Azure Portal or CLI
3. Deployment team updates Railway Sealed Variable:
   ```bash
   railway variables set SQLSERVER_PASSWORD=[new-password] --sealed --service codeguard-api
   railway up --service codeguard-api
   ```
4. Monitor for authentication failures during rotation window
5. Old password can be retained temporarily for rollback capability

#### Emergency Revocation
1. Immediately change SQL Server user password in Azure Portal
2. Application will begin receiving authentication failures
3. Deploy updated password as Railway Sealed Variable
4. Restore service connectivity

## Migration Order
As the deployment pipeline already handles, the order is:
1. GitHub push to main branch
2. Deploy AI Service to Railway (independent of database)
3. Deploy Backend API to Railway (requires database connectivity)
4. Deploy Frontend to Vercel (independent of backend)

The deterministic migration engine in `apps/api/src/migration-runner.ts` will:
1. Automatically create `dbo._migrations` table on first connection
2. Execute migration files in filename order (e.g., `001_initial.sql`)
3. Verify SHA-256 checksums of applied migrations
4. Abort startup if any applied migration has been modified
5. Run each migration in a dedicated database transaction

## /ready Verification Specifics
The `/ready` endpoint performs these checks (as seen in the codebase):
1. **SQL Server Connectivity**: Attempts to open connection and run `SELECT 1`
2. **AI Service Connectivity**: Makes HTTP request to AI service health endpoint
3. **Redis Connectivity**: Attempts to ping Redis server
4. Returns 200 OK only if all checks pass
5. Returns 503 Service Unavailable with details if any check fails

This makes `/ready` the definitive verification point for Azure SQL Database connectivity in production.

## Unresolved Infrastructure Prerequisites
The following items must be addressed outside this repository before production deployment:

1. **Azure Subscription**: Must be provisioned and accessible
2. **Azure SQL Database Resources**: Logical server and database must be created
3. **Railway Plan Upgrade**: To Pro plan or higher for static outbound IPs
4. **Infrastructure-TO-Application Handoff**:
   - Azure SQL Database connection details (server name)
   - Railway static outbound IP addresses (after assignment)
   - SQL Server application credentials (username + strong password)
5. **Monitoring & Alerting Setup**:
   - Azure SQL Database performance monitoring
   - Railway deployment health checks
   - Database connection failure alerting
6. **Disaster Recovery Planning**:
   - Azure SQL Database backup/restore procedures tested
   - Railway rollback procedures validated
   - Cross-region replication considered (if required)

## Verification Status
- [x] Relevant API tests pass (`npm run test:all -w apps/api`)
- [x] Database connection tests pass (`npx vitest run tests/database.connection.test.ts -w apps/api`)
- [x] Full monorepo build succeeds (`npm run build`)
- [x] No whitespace issues (`git diff --check` passes)
- [x] No Azure resources created during this phase
- [x] No commits or pushes made during this phase
- [x] Repository remains in clean state

## Conclusion
The recommended production networking architecture for CodeGuard AI is:
**Azure SQL Database Public Endpoint + Firewall Rules allowing Railway Static Outbound IPs**

This approach is:
- Actually supported by Railway's documented networking capabilities
- Secure when combined with TLS encryption, IP-restricted firewall, and sealed credential storage
- Operationally simple with minimal moving parts
- Cost-effective requiring no additional Azure networking components
- Verified compatible with existing application code and test suite
- Aligned with Railway's stated use case for third-party service allowlisting

No changes to application dependencies, SDKs, or code are required to implement this architecture.
