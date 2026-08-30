import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding
from app.providers.base import AIProvider, AIProviderException
from app.providers.fallback_provider import DeterministicFallbackProvider
from app.providers.gemini_provider import GeminiProvider
from app.providers.manager import ProviderManager
from app.providers.openai_provider import OpenAIProvider
from app.providers.openrouter_provider import OpenRouterProvider
from app.providers.nvidia_provider import NvidiaProvider


@pytest.fixture
def sample_request() -> AnalysisRequest:
    return AnalysisRequest(
        language="python",
        code="def hello():\n    return 'world'",
        mode="expert",
    )


class MockHealthyProvider(AIProvider):
    def __init__(self, name="mock-ai", display_name="Mock AI", model_name="mock-v1", source_type="REAL_NVIDIA"):
        self._name = name
        self._display = display_name
        self._model = model_name
        self._source = source_type

    @property
    def name(self) -> str:
        return self._name

    @property
    def display_name(self) -> str:
        return self._display

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def source_type(self) -> str:
        return self._source

    @property
    def is_configured(self) -> bool:
        return True

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        return AnalysisResponse(
            summary=f"Analysis by {self._name}",
            scores=AnalysisScore(
                overallScore=90, securityScore=95, qualityScore=85,
                performanceScore=90, maintainabilityScore=85, readabilityScore=95
            ),
            findings=[Finding(severity="low", category="style", title="Good code", description="Code is clean", recommendation="Keep it up")],
            source=self._source,
            analysisSource=self._source,
            provider=self._display,
            model=self._model,
        )


class MockFailingProvider(AIProvider):
    def __init__(self, name="failing-ai", is_quota=False):
        self._name = name
        self.is_quota = is_quota

    @property
    def name(self) -> str:
        return self._name

    @property
    def display_name(self) -> str:
        return f"Failing {self._name}"

    @property
    def model_name(self) -> str:
        return "fail-v1"

    @property
    def source_type(self) -> str:
        return "REAL_NVIDIA"

    @property
    def is_configured(self) -> bool:
        return True

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        raise AIProviderException(f"Provider {self._name} failed", is_quota_exceeded=self.is_quota, provider=self._name)


def test_deterministic_fallback_provider(sample_request):
    provider = DeterministicFallbackProvider()
    assert provider.name == "fallback"
    assert provider.is_configured is True

    result = asyncio.run(provider.analyze("security-analysis", sample_request))
    assert result.summary is not None
    assert result.scores.overallScore >= 0
    assert result.provider == "deterministic-rule-engine"


def test_provider_manager_nvidia_primary_success(sample_request):
    nvidia_mock = MockHealthyProvider(name="nvidia", display_name="NVIDIA", model_name="meta/llama-3.2-11b-vision-instruct", source_type="REAL_NVIDIA")
    openrouter_mock = MockHealthyProvider(name="openrouter", display_name="OpenRouter", model_name="meta-llama/llama-3.3-70b-instruct", source_type="REAL_OPENROUTER")
    openai_mock = MockHealthyProvider(name="openai", display_name="OpenAI", model_name="gpt-4o-mini", source_type="REAL_OPENAI")
    gemini_mock = MockHealthyProvider(name="gemini", display_name="Gemini", model_name="gemini-3.6-flash", source_type="REAL_GEMINI")

    manager = ProviderManager(
        primary_provider_name="nvidia",
        nvidia_provider=nvidia_mock,
        openrouter_provider=openrouter_mock,
        openai_provider=openai_mock,
        gemini_provider=gemini_mock,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "NVIDIA"
    assert response.source == "REAL_NVIDIA"
    assert response.degradationReason is None


def test_failover_nvidia_to_openrouter(sample_request):
    nvidia_failing = MockFailingProvider(name="nvidia", is_quota=True)
    openrouter_healthy = MockHealthyProvider(name="openrouter", display_name="OpenRouter", model_name="meta-llama/llama-3.3-70b-instruct", source_type="REAL_OPENROUTER")
    openai_mock = MockHealthyProvider(name="openai", display_name="OpenAI", model_name="gpt-4o-mini", source_type="REAL_OPENAI")
    gemini_mock = MockHealthyProvider(name="gemini", display_name="Gemini", model_name="gemini-3.6-flash", source_type="REAL_GEMINI")

    manager = ProviderManager(
        primary_provider_name="nvidia",
        nvidia_provider=nvidia_failing,
        openrouter_provider=openrouter_healthy,
        openai_provider=openai_mock,
        gemini_provider=gemini_mock,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "OpenRouter"
    assert response.source == "REAL_OPENROUTER"
    assert response.degradationReason is not None
    assert "Failover triggered" in response.degradationReason
    assert "OpenRouter" in response.degradationReason


def test_failover_nvidia_openrouter_to_openai(sample_request):
    nvidia_failing = MockFailingProvider(name="nvidia", is_quota=True)
    openrouter_failing = MockFailingProvider(name="openrouter", is_quota=False)
    openai_healthy = MockHealthyProvider(name="openai", display_name="OpenAI", model_name="gpt-4o-mini", source_type="REAL_OPENAI")
    gemini_mock = MockHealthyProvider(name="gemini", display_name="Gemini", model_name="gemini-3.6-flash", source_type="REAL_GEMINI")

    manager = ProviderManager(
        primary_provider_name="nvidia",
        nvidia_provider=nvidia_failing,
        openrouter_provider=openrouter_failing,
        openai_provider=openai_healthy,
        gemini_provider=gemini_mock,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "OpenAI"
    assert response.source == "REAL_OPENAI"
    assert response.degradationReason is not None
    assert "OpenAI" in response.degradationReason


def test_failover_all_to_deterministic_fallback(sample_request):
    nvidia_failing = MockFailingProvider(name="nvidia", is_quota=True)
    openrouter_failing = MockFailingProvider(name="openrouter", is_quota=False)
    openai_failing = MockFailingProvider(name="openai", is_quota=False)
    gemini_failing = MockFailingProvider(name="gemini", is_quota=False)

    manager = ProviderManager(
        primary_provider_name="nvidia",
        nvidia_provider=nvidia_failing,
        openrouter_provider=openrouter_failing,
        openai_provider=openai_failing,
        gemini_provider=gemini_failing,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.source in ["FALLBACK_ANALYZER", "QUOTA_EXCEEDED"]
    assert response.provider == "deterministic-rule-engine"
    assert response.scores.overallScore >= 0


def test_provider_selection_strategy(sample_request):
    nvidia_mock = MockHealthyProvider(name="nvidia", display_name="NVIDIA", model_name="meta/llama-3.2-11b-vision-instruct", source_type="REAL_NVIDIA")
    openrouter_mock = MockHealthyProvider(name="openrouter", display_name="OpenRouter", model_name="meta-llama/llama-3.3-70b-instruct", source_type="REAL_OPENROUTER")
    openai_mock = MockHealthyProvider(name="openai", display_name="OpenAI", model_name="gpt-4o-mini", source_type="REAL_OPENAI")
    gemini_mock = MockHealthyProvider(name="gemini", display_name="Gemini", model_name="gemini-3.6-flash", source_type="REAL_GEMINI")

    manager = ProviderManager(
        primary_provider_name="nvidia",
        nvidia_provider=nvidia_mock,
        openrouter_provider=openrouter_mock,
        openai_provider=openai_mock,
        gemini_provider=gemini_mock,
    )

    chain = manager.get_failover_chain()
    assert chain[0].name == "nvidia"
    assert chain[1].name == "openrouter"
    assert chain[2].name == "openai"
    assert chain[3].name == "gemini"
    assert chain[4].name == "fallback"

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "NVIDIA"
    assert response.source == "REAL_NVIDIA"
