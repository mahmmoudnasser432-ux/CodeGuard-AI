from typing import Literal
from pydantic import BaseModel, Field


class RepositoryContext(BaseModel):
    name: str
    branch: str | None = None
    commitSha: str | None = None


class AnalysisRequest(BaseModel):
    language: Literal["javascript", "typescript", "python", "java", "cpp", "csharp", "php"]
    code: str = Field(min_length=1, max_length=200_000)
    mode: Literal["beginner", "intermediate", "expert"] = "expert"
    repositoryContext: RepositoryContext | None = None


class AnalysisScore(BaseModel):
    overallScore: int = Field(ge=0, le=100)
    securityScore: int = Field(ge=0, le=100)
    qualityScore: int = Field(ge=0, le=100)
    performanceScore: int = Field(ge=0, le=100)
    maintainabilityScore: int = Field(ge=0, le=100)
    readabilityScore: int = Field(ge=0, le=100)


class Finding(BaseModel):
    severity: Literal["critical", "high", "medium", "low", "info"]
    category: str
    title: str
    description: str
    recommendation: str
    line: int | None = None


class AnalysisResponse(BaseModel):
    summary: str
    scores: AnalysisScore
    findings: list[Finding]
    improvedCode: str | None = None
    generatedMarkdown: str | None = None
    source: Literal[
        "REAL_GEMINI",
        "REAL_OPENAI",
        "REAL_OPENROUTER",
        "FALLBACK_ANALYZER",
        "QUOTA_EXCEEDED",
    ] = "REAL_GEMINI"
    analysisSource: Literal[
        "REAL_GEMINI",
        "REAL_OPENAI",
        "REAL_OPENROUTER",
        "FALLBACK_ANALYZER",
        "QUOTA_EXCEEDED",
    ] = "REAL_GEMINI"
    provider: str = "google-gemini"
    model: str | None = None
    degradationReason: str | None = None
