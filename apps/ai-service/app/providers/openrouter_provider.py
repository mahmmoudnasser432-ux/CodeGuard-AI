import json
import logging
import os
from typing import List, Optional
import httpx

from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding
from app.providers.base import AIProvider, AIProviderException

logger = logging.getLogger("codeguard.providers.openrouter")


class OpenRouterProvider(AIProvider):
    """OpenRouter Provider (Multi-model routing gateway)."""

    CANDIDATE_MODELS = [
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek/deepseek-chat",
        "mistralai/mistral-small-24b-instruct-2501",
        "openai/gpt-4o-mini",
    ]

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout_seconds: float = 30.0,
    ):
        self._explicit_api_key = api_key
        self._explicit_model_name = model_name
        self.timeout_seconds = timeout_seconds
        self._base_url = "https://openrouter.ai/api/v1"

    @property
    def api_key(self) -> Optional[str]:
        return self._explicit_api_key if self._explicit_api_key is not None else os.getenv("OPENROUTER_API_KEY")

    @property
    def model_name(self) -> str:
        return self._explicit_model_name or os.getenv("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct")

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def display_name(self) -> str:
        return "OpenRouter"

    @property
    def source_type(self) -> str:
        return "REAL_OPENROUTER"

    @property
    def is_configured(self) -> bool:
        key = self.api_key
        return bool(key and key.strip())

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        if not self.is_configured:
            raise AIProviderException("OpenRouterProvider is not configured or missing OPENROUTER_API_KEY", provider=self.name)

        prompt = self.build_system_prompt(endpoint, request)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "HTTP-Referer": "https://codeguard.ai",
            "X-Title": "CodeGuard AI",
            "Content-Type": "application/json",
        }

        models_to_try: List[str] = [self.model_name] + [
            m for m in self.CANDIDATE_MODELS if m != self.model_name
        ]
        last_exception = None

        for model in models_to_try:
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are CodeGuard AI, an elite static application security analysis engine. Return JSON only.",
                    },
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1,
            }

            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        f"{self._base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )

                    if response.status_code in (404, 410) and model != models_to_try[-1]:
                        logger.warning(f"OpenRouter model '{model}' returned {response.status_code}, trying candidate...")
                        continue

                    if response.status_code == 429:
                        raise AIProviderException("OpenRouter rate limited / quota exhausted", is_quota_exceeded=True, provider=self.name)

                    if response.status_code != 200:
                        raise AIProviderException(f"OpenRouter error {response.status_code}: {response.text}", provider=self.name)

                    data = response.json()
                    raw_text = data["choices"][0]["message"]["content"]
                    parsed = self.parse_json_response(raw_text)

                    return AnalysisResponse(
                        summary=parsed.get("summary", "Analysis completed successfully via OpenRouter."),
                        scores=AnalysisScore(**parsed.get("scores", {
                            "overallScore": 86, "securityScore": 86, "qualityScore": 86,
                            "performanceScore": 86, "maintainabilityScore": 86, "readabilityScore": 86
                        })),
                        findings=[Finding(**f) for f in parsed.get("findings", [])],
                        improvedCode=parsed.get("improvedCode"),
                        generatedMarkdown=parsed.get("generatedMarkdown"),
                        source="REAL_OPENROUTER",
                        analysisSource="REAL_OPENROUTER",
                        provider="OpenRouter",
                        model=model,
                    )

            except httpx.TimeoutException as exc:
                last_exception = exc
                if model != models_to_try[-1]:
                    continue
                raise AIProviderException(f"OpenRouter timed out after {self.timeout_seconds}s", provider=self.name)
            except AIProviderException as exc:
                last_exception = exc
                if exc.is_quota_exceeded or "authentication" in str(exc).lower():
                    raise
                if model != models_to_try[-1]:
                    continue
                raise
            except Exception as e:
                last_exception = e
                logger.warning(f"OpenRouterProvider request failed for model {model}: {e}")
                if model != models_to_try[-1]:
                    continue
                raise AIProviderException(str(e), provider=self.name)

        if last_exception:
            raise AIProviderException(str(last_exception), provider=self.name)
        raise AIProviderException("OpenRouter analysis failed across all models", provider=self.name)
