from fastapi import APIRouter
from app.core.analyzer import analyze_code
from app.models.analysis import AnalysisRequest, AnalysisResponse

router = APIRouter()


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "codeguard-ai-service"}


def register_analysis_route(path: str):
    @router.post(f"/{path}", response_model=AnalysisResponse)
    def endpoint(request: AnalysisRequest) -> AnalysisResponse:
        return analyze_code(path, request)


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
