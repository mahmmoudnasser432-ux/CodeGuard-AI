import asyncio
import pytest

from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding
from app.providers.base import AIProvider, AIProviderException
from app.providers.manager import ProviderManager


@pytest.fixture
def sample_request() -> AnalysisRequest:
    return AnalysisRequest(
        language="python",
        code="def authenticate_user(username, password):\n    return True",
        mode="expert",
    )


class MockProvider(AIProvider):
    def __init__(
        self,
        name: str,
        display_name: str,
        model_name: str,
        source_type: str,
        fails: bool = False,
        is_quota: bool = False,
        configured: bool = True,
    ):
        self._name = name
        self._display = display_name
        self._model = model_name
        self._source = source_type
        self.fails = fails
        self.is_quota = is_quota
        self._configured = configured

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
        return self._configured

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        if self.fails:
            raise AIProviderException(
                f"{self._display} failed: {'Quota exceeded (429)' if self.is_quota else 'Server error (500)'}",
                is_quota_exceeded=self.is_quota,
                provider=self._name,
            )

        return AnalysisResponse(
            summary=f"Analysis completed by {self._display}.",
            scores=AnalysisScore(
                overallScore=92, securityScore=95, qualityScore=90,
                performanceScore=88, maintainabilityScore=92, readabilityScore=95
            ),
            findings=[
                Finding(
                    severity="low",
                    category="Security",
                    title="Mock Finding",
                    description="Code evaluated cleanly.",
                    recommendation="No action needed.",
                )
            ],
            source=self._source,
            analysisSource=self._source,
            provider=self._name if self._name != "gemini" else "google-gemini",
            model=self._model,
        )


# CASE 1: Gemini succeeds
def test_case_1_gemini_succeeds(sample_request):
    gemini = MockProvider("gemini", "Google Gemini", "gemini-3.6-flash", "REAL_GEMINI")
    openai = MockProvider("openai", "OpenAI", "gpt-4o-mini", "REAL_OPENAI")
    openrouter = MockProvider("openrouter", "OpenRouter", "claude-3.5-sonnet", "REAL_OPENROUTER")

    manager = ProviderManager(
        primary_provider_name="gemini",
        gemini_provider=gemini,
        openai_provider=openai,
        openrouter_provider=openrouter,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "google-gemini"
    assert response.model == "gemini-3.6-flash"
    assert response.source == "REAL_GEMINI"
    assert response.degradationReason is None


# CASE 2: Gemini quota exceeded -> OpenAI succeeds
def test_case_2_gemini_quota_exceeded_openai_succeeds(sample_request):
    gemini = MockProvider("gemini", "Google Gemini", "gemini-3.6-flash", "REAL_GEMINI", fails=True, is_quota=True)
    openai = MockProvider("openai", "OpenAI", "gpt-4o-mini", "REAL_OPENAI", fails=False)
    openrouter = MockProvider("openrouter", "OpenRouter", "claude-3.5-sonnet", "REAL_OPENROUTER")

    manager = ProviderManager(
        primary_provider_name="gemini",
        gemini_provider=gemini,
        openai_provider=openai,
        openrouter_provider=openrouter,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "openai"
    assert response.model == "gpt-4o-mini"
    assert response.source == "REAL_OPENAI"
    assert response.degradationReason is not None
    assert "Failover triggered" in response.degradationReason
    assert "Google Gemini failed: Quota exceeded" in response.degradationReason
    assert "Served by OpenAI" in response.degradationReason


# CASE 3: Gemini fails -> OpenAI fails -> OpenRouter succeeds
def test_case_3_gemini_and_openai_fail_openrouter_succeeds(sample_request):
    gemini = MockProvider("gemini", "Google Gemini", "gemini-3.6-flash", "REAL_GEMINI", fails=True, is_quota=False)
    openai = MockProvider("openai", "OpenAI", "gpt-4o-mini", "REAL_OPENAI", fails=True, is_quota=False)
    openrouter = MockProvider("openrouter", "OpenRouter", "claude-3.5-sonnet", "REAL_OPENROUTER", fails=False)

    manager = ProviderManager(
        primary_provider_name="gemini",
        gemini_provider=gemini,
        openai_provider=openai,
        openrouter_provider=openrouter,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.provider == "openrouter"
    assert response.model == "claude-3.5-sonnet"
    assert response.source == "REAL_OPENROUTER"
    assert response.degradationReason is not None
    assert "Served by OpenRouter" in response.degradationReason


# CASE 4: All providers fail (general errors) -> Fallback Analyzer
def test_case_4_all_providers_fail_general_error(sample_request):
    gemini = MockProvider("gemini", "Google Gemini", "gemini-3.6-flash", "REAL_GEMINI", fails=True, is_quota=False)
    openai = MockProvider("openai", "OpenAI", "gpt-4o-mini", "REAL_OPENAI", fails=True, is_quota=False)
    openrouter = MockProvider("openrouter", "OpenRouter", "claude-3.5-sonnet", "REAL_OPENROUTER", fails=True, is_quota=False)

    manager = ProviderManager(
        primary_provider_name="gemini",
        gemini_provider=gemini,
        openai_provider=openai,
        openrouter_provider=openrouter,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.source == "FALLBACK_ANALYZER"
    assert response.provider == "deterministic-rule-engine"
    assert response.model == "ast-rules-v1"
    assert response.degradationReason is not None
    assert "All providers failed" in response.degradationReason


# CASE 5: Quota exhausted everywhere -> QUOTA_EXCEEDED
def test_case_5_quota_exhausted_everywhere(sample_request):
    gemini = MockProvider("gemini", "Google Gemini", "gemini-3.6-flash", "REAL_GEMINI", fails=True, is_quota=True)
    openai = MockProvider("openai", "OpenAI", "gpt-4o-mini", "REAL_OPENAI", fails=True, is_quota=True)
    openrouter = MockProvider("openrouter", "OpenRouter", "claude-3.5-sonnet", "REAL_OPENROUTER", fails=True, is_quota=True)

    manager = ProviderManager(
        primary_provider_name="gemini",
        gemini_provider=gemini,
        openai_provider=openai,
        openrouter_provider=openrouter,
    )

    response = asyncio.run(manager.analyze("security-analysis", sample_request))
    assert response.source == "QUOTA_EXCEEDED"
    assert response.provider == "deterministic-rule-engine"
    assert response.degradationReason is not None
    assert "Quota exhausted across all providers" in response.degradationReason
