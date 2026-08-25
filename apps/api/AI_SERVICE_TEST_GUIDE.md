# AI Service Testing Guide

## Prerequisites
1. Python 3.8+ installed
2. Node.js installed (for backend)
3. SQL Server running and accessible

## Step 1: Start the AI Service

Navigate to the AI service directory:
```bash
cd ../ai-service
```

Install dependencies:
```bash
pip install -r requirements.txt
```

Start the service:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The service will be available at http://localhost:8000

## Step 2: Verify AI Service is Running

Test the health endpoint:
```bash
curl http://localhost:8000/health
```
Expected response:
```json
{"status":"ok","service":"codeguard-ai-service"}
```

## Step 3: Test Analysis Endpoints Directly on AI Service

Use the following sample payload for all tests:
```json
{
  "language": "javascript",
  "code": "function add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3));",
  "mode": "expert"
}
```

### Security Analysis
```bash
curl -X POST http://localhost:8000/security-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Performance Analysis
```bash
curl -X POST http://localhost:8000/performance-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Code Review
```bash
curl -X POST http://localhost:8000/code-review \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Documentation Generator
```bash
curl -X POST http://localhost:8000/documentation-generator \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Interview Generator
```bash
curl -X POST http://localhost:8000/interview-generator \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Repository Analysis
```bash
curl -X POST http://localhost:8000/repository-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Scoring Engine
```bash
curl -X POST http://localhost:8000/scoring-engine \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

## Step 4: Start the Backend API

In a new terminal, navigate back to the API directory:
```bash
cd ../api
```

Install dependencies (if needed):
```bash
npm install
```

Start the backend:
```bash
npm run dev
```
or
```bash
npm start
```

The backend will be available at http://localhost:3000 (or port specified in env)

## Step 5: Test Analysis Endpoints Through Backend

Use the same sample payload but send to `/api/analyses/*`:

### Security Analysis via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/security-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Performance Analysis via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/performance-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Code Review via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/code-review \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Documentation Generator via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/documentation-generator \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Interview Generator via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/interview-generator \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Repository Analysis via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/repository-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

### Scoring Engine via Backend
```bash
curl -X POST http://localhost:3000/api/analyses/scoring-engine \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"function add(a, b) { return a + b; }\n\nconsole.log(add(2, 3));","mode":"expert"}'
```

## Expected Responses

All endpoints should return a 201 Created status with JSON response containing:
- `id`: UUID of the analysis
- `type`: The analysis type (e.g., "security-analysis")
- `summary`: Text summary of the analysis
- `scores`: Object with overallScore, securityScore, qualityScore, etc. (0-100)
- `findings`: Array of findings with severity, category, title, description, recommendation
- `improvedCode`: Suggested code improvements (if applicable)
- `generatedMarkdown`: Generated documentation (for documentation-generator only)

## Step 6: Verify Database Storage

After successful requests, analysis records should be saved in SQL Server:
- `Analyses` table: Contains analysis metadata
- `AnalysisScores` table: Contains the detailed scores
- You can verify using SQL Server Management Studio or query tools

## Sample Error Cases to Test

### Invalid Language
```bash
curl -X POST http://localhost:8000/security-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"invalid","code":"test","mode":"expert"}'
```
Expected: 422 Unprocessable Entity (validation error)

### Empty Code
```bash
curl -X POST http://localhost:8000/security-analysis \
  -H "Content-Type: application/json" \
  -d '{"language":"javascript","code":"","mode":"expert"}'
```
Expected: 422 Unprocessable Entity (validation error)

## Troubleshooting

### AI Service Not Running
If you get connection errors:
1. Verify the AI service is running on port 8000
2. Check the service logs for errors
3. Ensure no other service is using port 8000

### Backend Connection Issues
If backend can't reach AI service:
1. Verify `AI_SERVICE_URL` in `src/config/env.ts` is set to `"http://localhost:8000"`
2. Ensure AI service is running and accessible
3. Check firewall/network settings

### Database Connection Issues
If analysis records aren't saved:
1. Verify SQL Server is running and accessible
2. Check connection parameters in environment variables
3. Verify database migrations have been run (`npm run migrate`)