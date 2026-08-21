# Architecture Summary

## Overview
The CodeGuard API follows a clean, layered architecture with clear separation of concerns between domain logic, application logic, and infrastructure concerns.

## Layered Architecture
```
Presentation Layer (API Controllers)
        ↓
Application Layer (Use Cases/Services)
        ↓
Domain Layer (Entities, Repositories Interfaces, Domain Services)
        ↓
Infrastructure Layer (Database Implementations, External Services)
        ↓
Persistence Layer (SQL Server Database)
```

## Key Components

### 1. Domain Layer
- **Entities**: Core business objects (Analysis, User, Project, etc.)
- **Repository Interfaces**: Contracts for data access (IAnalysisRepository, IUserRepository, etc.)
- **Domain Services**: Business logic that doesn't belong to entities

### 2. Infrastructure Layer
- **Repository Implementations**: Concrete implementations of repository interfaces using SQL Server
- **Database Connection**: Centralized SQL Server connection pooling
- **Configuration**: Environment-based configuration management

### 3. Persistence Layer
- **SQL Server Database**: Relational database storing all application data
- **Schema**: Normalized tables with proper relationships and constraints

## Repository Pattern Implementation
Each repository follows the same pattern:
- Implements a domain interface (e.g., `AnalysisRepository`)
- Uses dependency injection for database connectivity
- Implements CRUD operations using parameterized queries
- Handles transactions for operations requiring atomicity
- Maps database records to domain entities

## Technology Stack
- **Runtime**: Node.js with TypeScript
- **ORM/DBAL**: Direct SQL Server access via `mssql` package
- **Connection Pooling**: Built-in connection pooling via `mssql.ConnectionPool`
- **Query Style**: Parameterized SQL queries to prevent injection
- **Transaction Management**: Explicit transaction handling for data consistency

## Cross-Cutting Concerns
- **Configuration**: Centralized environment configuration
- **Error Handling**: Consistent error propagation patterns
- **Logging**: Structured logging via Pino
- **Security**: Parameterized queries prevent SQL injection