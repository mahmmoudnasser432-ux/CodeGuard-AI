import asyncio
import json
import logging
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from google.api_core.exceptions import ResourceExhausted

from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.core.gemini_service import GeminiService
from app.core.logging_config import SensitiveDataFilter, StructuredJsonFormatter
from app.models.analysis import AnalysisRequest, AnalysisResponse, RepositoryContext


@pytest.fixture
def sample_request():
    return AnalysisRequest(
        language="python",
        code="def authenticate(user, password):\n    query = f\"SELECT * FROM users WHERE user='{user}' AND pass='{password}'\"\n    return db.execute(query)",
        mode="expert",
        repositoryContext=RepositoryContext(name="codeguard-core", branch="main", commitSha="abc1234"),
    )


def test_gemini_service_init_without_key():
    service = GeminiService(api_key="")
    assert not service.is_configured
    assert "<GeminiService" in repr(service)
    assert "configured=False" in repr(service)


def test_gemini_service_prompt_generation_all_types(sample_request):
    service = GeminiService(api_key="")
    
    types = [
        "security-analysis",
        "repository-analysis",
        "documentation-generator",
        "interview-generator",
        "performance-analysis",
        "code-review",
        "scoring-engine",
    ]
    for analysis_type in types:
        prompt = service._create_analysis_prompt(sample_request, analysis_type)
        assert "CodeGuard AI" in prompt
        assert sample_request.code in prompt
        assert sample_request.language in prompt
        assert sample_request.repositoryContext.name in prompt
        assert "overallScore" in prompt


def test_extract_and_parse_json():
    service = GeminiService(api_key="")
    
    # Test raw json
    raw = '{"summary": "test", "scores": {"overallScore": 90, "securityScore": 85, "qualityScore": 90, "performanceScore": 95, "maintainabilityScore": 90, "readabilityScore": 90}, "findings": []}'
    parsed = service._extract_and_parse_json(raw)
    assert parsed["summary"] == "test"
    assert parsed["scores"]["overallScore"] == 90

    # Test markdown fenced json
    fenced = '```json\n{"summary": "fenced test", "scores": {"overallScore": 80, "securityScore": 75, "qualityScore": 80, "performanceScore": 85, "maintainabilityScore": 80, "readabilityScore": 80}, "findings": []}\n```'
    parsed_fenced = service._extract_and_parse_json(fenced)
    assert parsed_fenced["summary"] == "fenced test"


@pytest.mark.anyio
async def test_analyze_security_analysis_with_gemini(sample_request):
    service = GeminiService(api_key="mock-key-12345")
    service._is_configured = True
    service.cache.clear()
    
    mock_model = MagicMock()
    mock_model.generate_content = MagicMock(
        return_value=MagicMock(
            text=json.dumps({
                "summary": "Critical SQL injection vulnerability detected.",
                "scores": {
                    "overallScore": 45,
                    "securityScore": 20,
                    "qualityScore": 60,
                    "performanceScore": 75,
                    "maintainabilityScore": 70,
                    "readabilityScore": 85,
                },
                "findings": [
                    {
                        "severity": "critical",
                        "category": "Security",
                        "title": "SQL Injection in authenticate()",
                        "description": "User-supplied password and user variables are directly concatenated into the SQL statement.",
                        "recommendation": "Use parameterized queries or prepared statements.",
                        "line": 2,
                    }
                ],
                "improvedCode": "def authenticate(user, password):\n    query = 'SELECT * FROM users WHERE user=? AND pass=?'\n    return db.execute(query, (user, password))",
                "generatedMarkdown": None,
            })
        )
    )
    service._model = mock_model

    with patch("google.generativeai.GenerativeModel", return_value=mock_model):
        result = await service.analyze("security-analysis", sample_request)
        assert isinstance(result, AnalysisResponse)
        assert result.source == "REAL_GEMINI"
        assert result.analysisSource == "REAL_GEMINI"
        assert result.scores.securityScore == 20
        assert len(result.findings) == 1
        assert result.findings[0].severity == "critical"
        assert result.findings[0].title == "SQL Injection in authenticate()"
        assert "parameterized" in result.findings[0].recommendation


@pytest.mark.anyio
async def test_analyze_quota_exceeded_handling(sample_request):
    service = GeminiService(api_key="mock-key-12345", max_retries=1, timeout_seconds=0.1, failure_threshold=1)
    service._is_configured = True
    service.cache.clear()
    
    mock_model = MagicMock()
    mock_model.generate_content = MagicMock(side_effect=ResourceExhausted("429 ResourceExhausted: Quota exceeded for metric"))
    
    with patch("google.generativeai.GenerativeModel", return_value=mock_model):
        result = await service.analyze("security-analysis", sample_request)
        assert isinstance(result, AnalysisResponse)
        assert result.source == "QUOTA_EXCEEDED"
        assert result.provider == "deterministic-rule-engine"
        assert "quota" in result.degradationReason.lower()
        assert service.circuit_breaker.state == CircuitState.OPEN


@pytest.mark.anyio
async def test_circuit_breaker_fast_fallback(sample_request):
    service = GeminiService(api_key="mock-key-12345")
    service._is_configured = True
    service.circuit_breaker.force_open("Manual trip for test")
    assert not service.circuit_breaker.can_execute()

    result = await service.analyze("security-analysis", sample_request)
    assert result.source == "QUOTA_EXCEEDED"
    assert "quota" in result.degradationReason.lower()


@pytest.mark.anyio
async def test_analyze_fallback_when_not_configured(sample_request):
    service = GeminiService(api_key="")
    result = await service.analyze("repository-analysis", sample_request)
    assert isinstance(result, AnalysisResponse)
    assert result.source == "FALLBACK_ANALYZER"
    assert "Repository Analysis" in result.summary


def test_sensitive_data_filter():
    import os
    with patch.dict(os.environ, {"GEMINI_API_KEY": "secret-gemini-key-9999"}):
        filt = SensitiveDataFilter()
        record = logging.LogRecord(
            name="test", level=logging.INFO, pathname="", lineno=0,
            msg="Connected with key secret-gemini-key-9999 and token AIzaSyD3x918237498172348917234891723489",
            args=(), exc_info=None
        )
        filt.filter(record)
        assert "secret-gemini-key-9999" not in record.msg
        assert "[REDACTED_GEMINI_KEY]" in record.msg
        assert "[REDACTED_API_KEY]" in record.msg
