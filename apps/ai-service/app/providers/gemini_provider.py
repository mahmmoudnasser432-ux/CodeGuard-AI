import asyncio
import logging
import os
from typing import Optional
import google.generativeai as genai
from google.api_core.exceptions import GoogleAPIError, ResourceExhausted

from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding
from app.providers.base import AIProvider, AIProviderException

logger = logging.getLogger("codeguard.providers.gemini")


class GeminiProvider(AIProvider):
    """Google Gemini AI Provider."""

    CANDIDATE_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash"]

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout_seconds: float = 30.0,
    ):
        self._explicit_api_key = api_key
        self._explicit_model_name = model_name
        self.timeout_seconds = timeout_seconds
        self._model = None
        self._configured_key = None

        self._ensure_configured()

    @property
    def api_key(self) -> Optional[str]:
        return self._explicit_api_key if self._explicit_api_key is not None else os.getenv("GEMINI_API_KEY")

    @property
    def model_name(self) -> str:
        return self._explicit_model_name or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

    def _ensure_configured(self) -> bool:
        key = self.api_key
        if not key or not key.strip():
            self._model = None
            return False

        if self._model is not None and self._configured_key == key:
            return True

        try:
            genai.configure(api_key=key)
            self._model = genai.GenerativeModel(self.model_name)
            self._configured_key = key
            logger.info(f"GeminiProvider initialized with model {self.model_name}")
            return True
        except Exception as e:
            logger.warning(f"Failed to configure GeminiProvider: {e}")
            self._model = None
            return False

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def display_name(self) -> str:
        return "Google Gemini"

    @property
    def source_type(self) -> str:
        return "REAL_GEMINI"

    @property
    def is_configured(self) -> bool:
        return self._ensure_configured()

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        if not self.is_configured or self._model is None:
            raise AIProviderException("GeminiProvider is not configured or missing GEMINI_API_KEY", provider=self.name)

        prompt = self.build_system_prompt(endpoint, request)

        try:
            loop = asyncio.get_running_loop()
            response = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: self._model.generate_content(prompt)),
                timeout=self.timeout_seconds,
            )

            raw_text = response.text
            parsed = self.parse_json_response(raw_text)

            return AnalysisResponse(
                summary=parsed.get("summary", "Analysis completed successfully."),
                scores=AnalysisScore(**parsed.get("scores", {
                    "overallScore": 85, "securityScore": 85, "qualityScore": 85,
                    "performanceScore": 85, "maintainabilityScore": 85, "readabilityScore": 85
                })),
                findings=[Finding(**f) for f in parsed.get("findings", [])],
                improvedCode=parsed.get("improvedCode"),
                generatedMarkdown=parsed.get("generatedMarkdown"),
                source="REAL_GEMINI",
                analysisSource="REAL_GEMINI",
                provider="google-gemini",
                model=self.model_name,
            )

        except ResourceExhausted as e:
            logger.warning(f"GeminiProvider quota exhausted: {e}")
            raise AIProviderException(f"Quota exceeded: {str(e)}", is_quota_exceeded=True, provider=self.name)
        except asyncio.TimeoutError:
            logger.warning(f"GeminiProvider timed out after {self.timeout_seconds}s")
            raise AIProviderException(f"Timeout after {self.timeout_seconds}s", provider=self.name)
        except Exception as e:
            logger.warning(f"GeminiProvider analysis failed: {e}")
            raise AIProviderException(str(e), provider=self.name)
