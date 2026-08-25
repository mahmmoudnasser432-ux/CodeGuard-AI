import logging
from app.core.analyzer import analyze_code as deterministic_analyze_code
from app.models.analysis import AnalysisRequest, AnalysisResponse
from app.providers.base import AIProvider

logger = logging.getLogger("codeguard.providers.fallback")


class DeterministicFallbackProvider(AIProvider):
    """Deterministic Rule-based static analyzer for graceful offline fallback."""

    @property
    def name(self) -> str:
        return "fallback"

    @property
    def display_name(self) -> str:
        return "Deterministic Fallback Analyzer"

    @property
    def model_name(self) -> str:
        return "ast-rules-v1"

    @property
    def source_type(self) -> str:
        return "FALLBACK_ANALYZER"

    @property
    def is_configured(self) -> bool:
        return True

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        res = deterministic_analyze_code(endpoint, request)
        res.provider = "deterministic-rule-engine"
        res.model = "ast-rules-v1"
        res.source = "FALLBACK_ANALYZER"
        res.analysisSource = "FALLBACK_ANALYZER"
        return res
