# API Surface

## Health

`GET /health`

Returns service health.

## Analyses

All analysis endpoints accept:

```json
{
  "language": "typescript",
  "code": "export const value = 1;",
  "mode": "expert"
}
```

Endpoints:

- `POST /api/analyses/code-review`
- `POST /api/analyses/security-analysis`
- `POST /api/analyses/performance-analysis`
- `POST /api/analyses/documentation-generator`
- `POST /api/analyses/interview-generator`
- `POST /api/analyses/repository-analysis`
- `POST /api/analyses/scoring-engine`

Responses include summary, scores, findings, improved code, and generated markdown when applicable.
