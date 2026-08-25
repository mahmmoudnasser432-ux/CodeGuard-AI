import asyncio
import json
import time
import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from google.api_core.exceptions import ResourceExhausted

from app.main import app
from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.core.cache import CacheService
from app.core.metrics import MetricsCollector
from app.core.retry import is_retryable_error
from app.core.gemini_service import GeminiService
from app.models.analysis import AnalysisRequest, AnalysisResponse, RepositoryContext


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_request():
    return AnalysisRequest(
        language="python",
        code="def add(a, b):\n    return a + b",
        mode="intermediate",
        repositoryContext=RepositoryContext(name="math-lib", branch="main"),
    )


# 1. Circuit Breaker Unit Tests
def test_circuit_breaker_transitions():
    cb = CircuitBreaker(failure_threshold=2, open_duration_seconds=0.2)
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute() is True

    # 1st failure
    cb.record_failure("error 1")
    assert cb.state == CircuitState.CLOSED

    # 2nd failure -> Tripped to OPEN
    cb.record_failure("error 2")
    assert cb.state == CircuitState.OPEN
    assert cb.can_execute() is False

    # Wait for cooldown -> Transitions to HALF_OPEN
    time.sleep(0.25)
    assert cb.state == CircuitState.HALF_OPEN
    assert cb.can_execute() is True  # 1 probe allowed

    # Probe succeeds -> Transitions to CLOSED
    cb.record_success()
    assert cb.state == CircuitState.CLOSED
    assert cb.can_execute() is True


def test_circuit_breaker_half_open_failure():
    cb = CircuitBreaker(failure_threshold=1, open_duration_seconds=0.1)
    cb.record_failure("initial fail")
    assert cb.state == CircuitState.OPEN

    time.sleep(0.15)
    assert cb.state == CircuitState.HALF_OPEN

    # Probe fails -> Back to OPEN
    cb.record_failure("probe failed")
    assert cb.state == CircuitState.OPEN


# 2. Smart Retry Strategy Tests
def test_retry_strategy_classification():
    # Retryable errors
    assert is_retryable_error(Exception("429 ResourceExhausted: Quota exceeded"))[0] is True
    assert is_retryable_error(Exception("503 Service Unavailable"))[0] is True
    assert is_retryable_error(Exception("500 Internal Server Error"))[0] is True
    assert is_retryable_error(Exception("502 Bad Gateway"))[0] is True
    assert is_retryable_error(Exception("504 Gateway Timeout"))[0] is True

    # Non-retryable errors
    assert is_retryable_error(Exception("400 Bad Request"))[0] is False
    assert is_retryable_error(Exception("401 Unauthorized"))[0] is False
    assert is_retryable_error(Exception("403 Forbidden"))[0] is False
    assert is_retryable_error(Exception("404 Not Found"))[0] is False


# 3. Cache Tests
def test_cache_service_hit_and_miss():
    cache = CacheService(default_ttl_seconds=60)
    cache.clear()

    key = cache.generate_cache_key("security-analysis", "python", "expert", "print('test')")
    assert cache.get(key) is None

    sample_val = {"summary": "Cached security summary", "scores": {"overallScore": 95}}
    cache.set(key, sample_val, ttl_seconds=10)

    # Cache hit
    cached = cache.get(key)
    assert cached is not None
    assert cached["summary"] == "Cached security summary"


# 4. Metrics Collector Tests
def test_metrics_collector():
    mc = MetricsCollector()
    mc.record_request()
    mc.record_success()
    mc.record_cache_hit()
    mc.record_duration(120.5)

    data = mc.get_metrics()
    assert data["analysis_requests_total"] == 1
    assert data["analysis_success_total"] == 1
    assert data["analysis_cache_hit_total"] == 1
    assert data["analysis_duration_ms"]["count"] == 1
    assert data["analysis_duration_ms"]["avg"] == 120.5


# 5. Gemini Service Reliability & Fallback Tests
@pytest.mark.anyio
async def test_gemini_success_and_cache_hit(sample_request):
    service = GeminiService(api_key="mock-key-123", max_retries=1)
    service._is_configured = True
    service.cache.clear()

    mock_model = MagicMock()
    mock_model.generate_content = MagicMock(
        return_value=MagicMock(
            text=json.dumps({
                "summary": "Real Gemini success summary.",
                "scores": {"overallScore": 90, "securityScore": 90, "qualityScore": 90, "performanceScore": 90, "maintainabilityScore": 90, "readabilityScore": 90},
                "findings": [],
                "improvedCode": None,
                "generatedMarkdown": None
            })
        )
    )

    with patch("google.generativeai.GenerativeModel", return_value=mock_model):
        # 1st call: Cache Miss -> Gemini Call
        res1 = await service.analyze("code-review", sample_request)
        assert res1.source == "REAL_GEMINI"
        assert res1.summary == "Real Gemini success summary."
        assert mock_model.generate_content.call_count == 1

        # 2nd call: Cache Hit -> Returns cached response without calling model again
        res2 = await service.analyze("code-review", sample_request)
        assert res2.source == "REAL_GEMINI"
        assert res2.summary == "Real Gemini success summary."
        assert mock_model.generate_content.call_count == 1  # Unchanged!


@pytest.mark.anyio
async def test_gemini_429_quota_exceeded_and_circuit_tripping(sample_request):
    service = GeminiService(api_key="mock-key-123", max_retries=1, failure_threshold=2)
    service._is_configured = True
    service.cache.clear()

    mock_model = MagicMock()
    mock_model.generate_content = MagicMock(side_effect=ResourceExhausted("429 ResourceExhausted: Quota exceeded"))

    with patch("google.generativeai.GenerativeModel", return_value=mock_model):
        # 1st 429 call
        res1 = await service.analyze("security-analysis", sample_request)
        assert res1.source == "QUOTA_EXCEEDED"
        assert res1.provider == "deterministic-rule-engine"
        assert "quota" in res1.degradationReason.lower()

        # 2nd 429 call -> Trips circuit breaker to OPEN
        res2 = await service.analyze("security-analysis", sample_request)
        assert res2.source == "QUOTA_EXCEEDED"
        assert service.circuit_breaker.state == CircuitState.OPEN

        # 3rd call -> Fast fallback by circuit breaker without calling model
        res3 = await service.analyze("security-analysis", sample_request)
        assert res3.source == "QUOTA_EXCEEDED"
        assert "quota" in res3.degradationReason.lower()


# 6. Endpoints Integration Tests (Health & Metrics)
def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.1.0"
    assert "gemini" in data
    assert "circuitBreaker" in data
    assert data["circuitBreaker"]["state"] in ["CLOSED", "OPEN", "HALF_OPEN"]
    assert "cache" in data


def test_metrics_endpoint(client):
    res = client.get("/metrics")
    assert res.status_code == 200
    data = res.json()
    assert "analysis_requests_total" in data
    assert "analysis_success_total" in data
    assert "analysis_fallback_total" in data
    assert "analysis_quota_exceeded_total" in data
    assert "analysis_cache_hit_total" in data
    assert "analysis_cache_miss_total" in data
    assert "analysis_duration_ms" in data
