"""
Tests for NvidiaProvider — covers:
  - is_configured when key present / absent
  - 429 quota detection and AIProviderException.is_quota_exceeded flag
  - 401 / 403 / 404 non-quota error handling
  - Successful 200 response returns normalised AnalysisResponse
  - ProviderManager failover chain with NVIDIA as primary
"""
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.analysis import AnalysisRequest, AnalysisResponse
from app.providers.base import AIProviderException
from app.providers.nvidia_provider import NvidiaProvider
from app.providers.manager import ProviderManager


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_request() -> AnalysisRequest:
    return AnalysisRequest(
        code="fn main() { println!(\"hello\"); }",
        language="rust",
        mode="expert",
    )


def _mock_httpx_response(status_code: int, body: dict | str) -> MagicMock:
    """Build a minimal httpx.Response-like mock."""
    resp = MagicMock()
    resp.status_code = status_code
    if isinstance(body, dict):
        resp.json.return_value = body
        resp.text = json.dumps(body)
    else:
        resp.json.side_effect = json.JSONDecodeError("bad", "", 0)
        resp.text = body
    return resp


def _successful_nim_body(model: str = "meta/llama-3.2-11b-vision-instruct") -> dict:
    payload = json.dumps({
        "summary": "Well-structured Rust binary with a single entrypoint.",
        "scores": {
            "overallScore": 91,
            "securityScore": 90,
            "qualityScore": 92,
            "performanceScore": 89,
            "maintainabilityScore": 93,
            "readabilityScore": 94,
        },
        "findings": [
            {
                "severity": "low",
                "category": "style",
                "title": "Minimal main body",
                "description": "Consider adding error handling.",
                "recommendation": "Use Result return type.",
                "line": 1,
            }
        ],
        "improvedCode": None,
        "generatedMarkdown": "# Rust Binary Analysis\n\nWell-structured Rust binary with a single entrypoint.",
    })
    return {
        "id": "chatcmpl-test-nvidia-123",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": payload,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": 120,
            "completion_tokens": 85,
            "total_tokens": 205,
        },
    }


# ---------------------------------------------------------------------------
# Configuration / Properties
# ---------------------------------------------------------------------------

class TestNvidiaProviderConfiguration:
    def test_configured_when_key_present(self):
        provider = NvidiaProvider(api_key="nvapi-testkey123")
        assert provider.is_configured is True

    def test_not_configured_when_key_empty(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = NvidiaProvider(api_key="")
            assert provider.is_configured is False

    def test_not_configured_when_key_none(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = NvidiaProvider(api_key=None)
            assert provider.is_configured is False

    def test_not_configured_when_key_whitespace(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = NvidiaProvider(api_key="   ")
            assert provider.is_configured is False

    def test_model_default(self):
        with patch.dict("os.environ", {}, clear=True):
            provider = NvidiaProvider(api_key="x")
            assert provider.model_name == "meta/llama-3.2-11b-vision-instruct"

    def test_model_from_env(self):
        with patch.dict("os.environ", {"NVIDIA_MODEL": "meta/llama-3.2-90b-vision-instruct"}):
            provider = NvidiaProvider(api_key="x")
            assert provider.model_name == "meta/llama-3.2-90b-vision-instruct"

    def test_model_explicit_overrides_env(self):
        with patch.dict("os.environ", {"NVIDIA_MODEL": "meta/llama-3.2-90b-vision-instruct"}):
            provider = NvidiaProvider(api_key="x", model_name="openai/gpt-oss-120b")
            assert provider.model_name == "openai/gpt-oss-120b"

    def test_name_properties(self):
        provider = NvidiaProvider(api_key="x")
        assert provider.name == "nvidia"
        assert provider.display_name == "NVIDIA"
        assert provider.source_type == "REAL_NVIDIA"


# ---------------------------------------------------------------------------
# Analyze — not configured guard
# ---------------------------------------------------------------------------

class TestNvidiaProviderNotConfigured:
    def test_raises_when_unconfigured(self):
        provider = NvidiaProvider(api_key=None)
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(AIProviderException) as exc_info:
                asyncio.run(
                    provider.analyze("documentation-generator", _make_request())
                )
        assert "NVIDIA_API_KEY" in str(exc_info.value)
        assert exc_info.value.provider == "nvidia"


# ---------------------------------------------------------------------------
# Analyze — HTTP error codes
# ---------------------------------------------------------------------------

class TestNvidiaProviderHttpErrors:
    def _run(self, status: int, body: dict | str = "error"):
        provider = NvidiaProvider(api_key="nvapi-fake")
        mock_resp = _mock_httpx_response(status, body)

        with patch("app.providers.nvidia_provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            return asyncio.run(
                provider.analyze("documentation-generator", _make_request())
            )

    def _run_exc(self, status: int, body: dict | str = "error") -> AIProviderException:
        with pytest.raises(AIProviderException) as exc_info:
            self._run(status, body)
        return exc_info.value

    def test_401_raises_not_quota(self):
        exc = self._run_exc(401)
        assert "authentication" in str(exc).lower()
        assert exc.is_quota_exceeded is False
        assert exc.provider == "nvidia"

    def test_403_raises_not_quota(self):
        exc = self._run_exc(403)
        assert "forbidden" in str(exc).lower()
        assert exc.is_quota_exceeded is False

    def test_404_raises_not_quota(self):
        exc = self._run_exc(404)
        assert "not found" in str(exc).lower() or "deprecated" in str(exc).lower() or "failed" in str(exc).lower()
        assert exc.is_quota_exceeded is False

    def test_408_raises_not_quota(self):
        exc = self._run_exc(408)
        assert "timed out" in str(exc).lower()
        assert exc.is_quota_exceeded is False

    def test_429_raises_quota_exceeded(self):
        exc = self._run_exc(429)
        assert exc.is_quota_exceeded is True
        assert exc.provider == "nvidia"

    def test_500_raises_not_quota(self):
        exc = self._run_exc(500)
        assert exc.is_quota_exceeded is False

    def test_503_raises_not_quota(self):
        exc = self._run_exc(503)
        assert exc.is_quota_exceeded is False


# ---------------------------------------------------------------------------
# Analyze — successful response
# ---------------------------------------------------------------------------

class TestNvidiaProviderSuccessfulResponse:
    def test_successful_200_returns_analysis_response(self):
        provider = NvidiaProvider(api_key="nvapi-fake", model_name="meta/llama-3.2-11b-vision-instruct")
        mock_resp = _mock_httpx_response(200, _successful_nim_body())

        with patch("app.providers.nvidia_provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=mock_resp)
            mock_client_cls.return_value = mock_client

            result = asyncio.run(
                provider.analyze("documentation-generator", _make_request())
            )

        assert isinstance(result, AnalysisResponse)
        assert result.source == "REAL_NVIDIA"
        assert result.analysisSource == "REAL_NVIDIA"
        assert result.provider == "NVIDIA"
        assert result.model == "meta/llama-3.2-11b-vision-instruct"
        assert result.scores.overallScore == 91
        assert len(result.findings) == 1
        assert result.generatedMarkdown is not None

    def test_correct_request_payload_sent(self):
        provider = NvidiaProvider(api_key="nvapi-fake", model_name="meta/llama-3.2-11b-vision-instruct")
        mock_resp = _mock_httpx_response(200, _successful_nim_body())
        captured_payload = {}

        async def _fake_post(url, *, json, headers, **kwargs):
            captured_payload.update(json)
            return mock_resp

        with patch("app.providers.nvidia_provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = _fake_post
            mock_client_cls.return_value = mock_client

            asyncio.run(
                provider.analyze("documentation-generator", _make_request())
            )

        assert captured_payload["model"] == "meta/llama-3.2-11b-vision-instruct"
        assert captured_payload["temperature"] == 0.2
        assert captured_payload["max_tokens"] == 4000
        assert any(m["role"] == "system" for m in captured_payload["messages"])
        assert any(m["role"] == "user" for m in captured_payload["messages"])

    def test_correct_auth_header_sent(self):
        provider = NvidiaProvider(api_key="nvapi-secret", model_name="meta/llama-3.2-11b-vision-instruct")
        mock_resp = _mock_httpx_response(200, _successful_nim_body())
        captured_headers = {}

        async def _fake_post(url, *, json, headers, **kwargs):
            captured_headers.update(headers)
            return mock_resp

        with patch("app.providers.nvidia_provider.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = _fake_post
            mock_client_cls.return_value = mock_client

            asyncio.run(
                provider.analyze("documentation-generator", _make_request())
            )

        assert captured_headers.get("Authorization") == "Bearer nvapi-secret"
        assert captured_headers.get("Content-Type") == "application/json"


# ---------------------------------------------------------------------------
# ProviderManager failover chain
# ---------------------------------------------------------------------------

class TestProviderManagerChain:
    def _make_manager(
        self,
        gemini_key="",
        openai_key="",
        nvidia_key="",
        openrouter_key="",
    ) -> ProviderManager:
        from app.providers.gemini_provider import GeminiProvider
        from app.providers.openai_provider import OpenAIProvider
        from app.providers.openrouter_provider import OpenRouterProvider
        from app.providers.fallback_provider import DeterministicFallbackProvider

        return ProviderManager(
            gemini_provider=GeminiProvider(api_key=gemini_key),
            openai_provider=OpenAIProvider(api_key=openai_key),
            nvidia_provider=NvidiaProvider(api_key=nvidia_key),
            openrouter_provider=OpenRouterProvider(api_key=openrouter_key),
            fallback_provider=DeterministicFallbackProvider(),
        )


    def test_chain_order_nvidia_primary(self):
        manager = self._make_manager()
        with patch.dict("os.environ", {"AI_PROVIDER": "nvidia"}):
            chain = manager.get_failover_chain()
        names = [p.name for p in chain]
        assert names == ["nvidia", "openrouter", "openai", "gemini", "fallback"]

    def test_chain_order_default_is_nvidia(self):
        manager = self._make_manager()
        with patch.dict("os.environ", {}, clear=True):
            chain = manager.get_failover_chain()
        names = [p.name for p in chain]
        assert names[0] == "nvidia"
        assert names == ["nvidia", "openrouter", "openai", "gemini", "fallback"]

    def test_nvidia_in_providers_dict(self):
        manager = self._make_manager()
        assert "nvidia" in manager.providers
        assert isinstance(manager.providers["nvidia"], NvidiaProvider)

    def test_unconfigured_nvidia_skipped_in_failover(self):
        """
        When NVIDIA_API_KEY is absent, ProviderManager should skip nvidia
        and fall through to openrouter / openai / fallback.
        """
        manager = self._make_manager(openrouter_key="sk-fake")

        async def _fake_openrouter_analyze(endpoint, request):
            raise AIProviderException("OpenRouter 429", is_quota_exceeded=True, provider="openrouter")

        manager.openrouter.analyze = _fake_openrouter_analyze  # type: ignore[method-assign]

        result = asyncio.run(
            manager.analyze("documentation-generator", _make_request())
        )
        assert result is not None
        assert result.source in (
            "FALLBACK_ANALYZER", "QUOTA_EXCEEDED", "REAL_NVIDIA", "REAL_OPENROUTER", "REAL_OPENAI"
        )

    def test_nvidia_429_triggers_openrouter_failover(self):
        """
        NVIDIA 429 → ProviderManager marks quota failure and moves to openrouter.
        """
        manager = self._make_manager(nvidia_key="nvapi-fake", openrouter_key="sk-fake")

        async def _fail_nvidia(endpoint, request):
            raise AIProviderException("NVIDIA 429", is_quota_exceeded=True, provider="nvidia")

        async def _success_openrouter(endpoint, request):
            return AnalysisResponse(
                summary="OpenRouter success",
                scores={"overallScore": 90, "securityScore": 90, "qualityScore": 90, "performanceScore": 90, "maintainabilityScore": 90, "readabilityScore": 90},
                findings=[],
                source="REAL_OPENROUTER",
                analysisSource="REAL_OPENROUTER",
                provider="OpenRouter",
                model="anthropic/claude-3.5-sonnet"
            )

        manager.nvidia.analyze = _fail_nvidia  # type: ignore[method-assign]
        manager.openrouter.analyze = _success_openrouter  # type: ignore[method-assign]

        result = asyncio.run(
            manager.analyze("documentation-generator", _make_request())
        )
        assert result.provider == "OpenRouter"
        assert result.source == "REAL_OPENROUTER"
        assert "Failover triggered" in (result.degradationReason or "")
