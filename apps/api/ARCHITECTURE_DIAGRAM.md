```mermaid
graph TD
    %% Define components
    subgraph Frontend[Frontend Layer]
        FA[Client Application<br/>(React/Vue/Angular)] 
    end
    
    subgraph Backend[Backend API Layer]
        API[Express.js REST API]
        Auth[Authentication Service]
        Analysis[AI Analysis Service]
        Email[Email Service]
        Token[Token Service]
    end
    
    subgraph Database[Database Layer]
        Users[Users Table]
        Roles[Roles Table]
        UserRoles[User-Junction Table]
        Projects[Projects Table]
        Analyses[Analyses Table]
        AnalysisScores[Analysis Scores Table]
        Sessions[Sessions Table]
        RefreshTokens[Refresh Tokens Table]
        EmailVerificationTokens[Email Verification Tokens Table]
        PasswordResetTokens[Password Reset Tokens Table]
        Notifications[Notifications Table]
        AuditLogs[Audit Logs Table]
        InterviewSessions[Interview Sessions Table]
        InterviewQuestions[Interview Questions Table]
        InterviewResults[Interview Results Table]
        Reports[Reports Table]
    end
    
    subgraph AIService[AI Service Layer]
        AI[External AI Analysis Service<br/>Expected at localhost:8000]
    end
    
    %% Communication paths
    FA -->|HTTP Requests<br/>(REST API)| API
    
    API -->|Routes Requests| Auth
    API -->|Routes Requests| Analysis
    API -->|Routes Requests| Email
    API -->|Routes Requests| Token
    
    Auth -->|Database Operations| Users
    Auth -->|Database Operations| Roles
    Auth -->|Database Operations| UserRoles
    Auth -->|Database Operations| Sessions
    Auth -->|Database Operations| RefreshTokens
    Auth -->|Database Operations| EmailVerificationTokens
    Auth -->|Database Operations| PasswordResetTokens
    
    Analysis -->|Database Operations| Projects
    Analysis -->|Database Operations| Analyses
    Analysis -->|Database Operations| AnalysisScores
    Analysis -->|Database Operations| Reports
    Analysis -->|HTTP Requests<br/>(to AI Service)| AI
    
    Email -->|Database Operations| Notifications
    Email -->|SMTP| Email[External Email Service]
    
    Token -->|Database Operations| Sessions
    Token -->|Database Operations| RefreshTokens
    
    AI -->|Database Operations (if implemented)| Analyses
    AI -->|Database Operations (if implemented)| AnalysisScores
    AI -->|Database Operations (if implemented)| Reports
    
    %% Styling
    classDef frontend fill:#E3F2FD,stroke:#2196F3,stroke-width:2px;
    classDef backend fill:#FFF3E0,stroke:#FF9800,stroke-width:2px;
    classDef database fill:#E8F5E8,stroke:#4CAF50,stroke-width:2px;
    classDef aiservice fill:#F3E5F5,stroke:#9C27B0,stroke-width:2px;
    
    class FA frontend;
    class API,Auth,Analysis,Email,Token backend;
    class Users,Roles,UserRoles,Projects,Analyses,AnalysisScores,Sessions,RefreshTokens,EmailVerificationTokens,PasswordResetTokens,Notifications,AuditLogs,InterviewSessions,InterviewQuestions,InterviewResults,Reports database;
    class AI aiservice;
```