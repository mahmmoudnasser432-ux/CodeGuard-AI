from typing import Any, Dict
from fastapi import APIRouter
from app.core.gemini_service import gemini_service
from app.models.analysis import AnalysisRequest, AnalysisResponse
from app.providers.manager import provider_manager

router = APIRouter()


@router.get("/health")
def health() -> Dict[str, Any]:
    """Health endpoint exposing service, Gemini state, multi-provider status, Circuit Breaker, and Cache."""
    return {
        "status": "healthy",
        "service": "codeguard-ai-service",
        "version": "0.1.0",
        "gemini": {
            "configured": provider_manager.gemini.is_configured,
            "model": provider_manager.gemini.model_name,
        },
        "primaryProvider": provider_manager.primary_name,
        "providers": {
            "gemini": {
                "configured": provider_manager.gemini.is_configured,
                "model": provider_manager.gemini.model_name,
            },
            "openai": {
                "configured": provider_manager.openai.is_configured,
                "model": provider_manager.openai.model_name,
            },
            "openrouter": {
                "configured": provider_manager.openrouter.is_configured,
                "model": provider_manager.openrouter.model_name,
            },
            "fallback": {
                "configured": True,
                "model": "ast-rules-v1",
            },
        },
        "circuitBreaker": {
            "state": gemini_service.circuit_breaker.state.value,
        },
        "cache": {
            "connected": gemini_service.cache.is_connected,
        },
    }


@router.get("/metrics")
def metrics() -> Dict[str, Any]:
    """Metrics endpoint exposing throughput, latency, cache, and error counters in JSON format."""
    return gemini_service.metrics.get_metrics()


def register_analysis_route(path: str):
    @router.post(f"/{path}", response_model=AnalysisResponse)
    async def endpoint(request: AnalysisRequest) -> AnalysisResponse:
        return await gemini_service.analyze(path, request)


for route in [
    "security-analysis",
    "performance-analysis",
    "code-review",
    "documentation-generator",
    "interview-generator",
    "repository-analysis",
    "scoring-engine",
]:
    register_analysis_route(route)
