import json
import logging
import os
from typing import List, Optional

import httpx

from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding
from app.providers.base import AIProvider, AIProviderException

logger = logging.getLogger("codeguard.providers.nvidia")


class NvidiaProvider(AIProvider):
    """
    NVIDIA NIM AI Provider.

    Uses the NVIDIA NIM (Neural Inference Microservice) REST API which exposes
    an OpenAI-compatible /chat/completions endpoint at:
        https://integrate.api.nvidia.com/v1/chat/completions

    Required environment variables:
        NVIDIA_API_KEY   — NVIDIA API key (nvapi-... prefix expected)
        NVIDIA_MODEL     — Model identifier (default: meta/llama-3.2-11b-vision-instruct)
    """

    _BASE_URL = "https://integrate.api.nvidia.com/v1"

    CANDIDATE_MODELS = [
        "meta/llama-3.2-11b-vision-instruct",
        "meta/llama-3.2-90b-vision-instruct",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
    ]

    # Retryable HTTP status codes
    _RETRYABLE_STATUSES = {408, 429, 500, 502, 503, 504}

    # Status codes that indicate quota / rate limit exhaustion
    _QUOTA_STATUSES = {429}

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout_seconds: float = 45.0,
    ) -> None:
        self._explicit_api_key = api_key
        self._explicit_model_name = model_name
        self.timeout_seconds = timeout_seconds

    # ------------------------------------------------------------------
    # AIProvider interface
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "nvidia"

    @property
    def display_name(self) -> str:
        return "NVIDIA"

    @property
    def source_type(self) -> str:
        return "REAL_NVIDIA"

    @property
    def api_key(self) -> Optional[str]:
        return (
            self._explicit_api_key
            if self._explicit_api_key is not None
            else os.getenv("NVIDIA_API_KEY")
        )

    @property
    def model_name(self) -> str:
        return (
            self._explicit_model_name
            or os.getenv("NVIDIA_MODEL", "meta/llama-3.2-11b-vision-instruct")
        )

    @property
    def is_configured(self) -> bool:
        key = self.api_key
        return bool(key and key.strip())

    # ------------------------------------------------------------------
    # Core analysis
    # ------------------------------------------------------------------

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        """Execute code analysis via NVIDIA NIM chat/completions API with candidate model fallback."""
        if not self.is_configured:
            raise AIProviderException(
                "NvidiaProvider is not configured — NVIDIA_API_KEY is missing or empty.",
                provider=self.name,
            )

        prompt = self.build_system_prompt(endpoint, request)
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # Try active model first, followed by candidate models if 404 or 410 (model deprecated) occurs
        models_to_try: List[str] = [self.model_name] + [
            m for m in self.CANDIDATE_MODELS if m != self.model_name
        ]
        last_exception: Optional[Exception] = None

        for model in models_to_try:
            payload = {
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are CodeGuard AI, an elite static application security "
                            "analysis engine. Return JSON only — no markdown, no preamble."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 4000,
            }

            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        f"{self._BASE_URL}/chat/completions",
                        json=payload,
                        headers=headers,
                    )

                # If model is deprecated (410) or not found (404), try next candidate model
                if response.status_code in (404, 410) and model != models_to_try[-1]:
                    logger.warning(
                        f"NvidiaProvider model '{model}' returned HTTP {response.status_code}. "
                        f"Trying next candidate model..."
                    )
                    continue

                return self._handle_response(response, model, endpoint)

            except httpx.TimeoutException as exc:
                last_exception = exc
                logger.warning(
                    f"NvidiaProvider model '{model}' timed out after {self.timeout_seconds}s"
                )
                if model != models_to_try[-1]:
                    continue
                raise AIProviderException(
                    f"NVIDIA NIM timed out after {self.timeout_seconds}s",
                    provider=self.name,
                )
            except AIProviderException as exc:
                last_exception = exc
                if exc.is_quota_exceeded:
                    raise
                if "authentication" in str(exc).lower() or "forbidden" in str(exc).lower():
                    raise
                if model != models_to_try[-1]:
                    continue
                raise
            except Exception as exc:
                last_exception = exc
                logger.warning(f"NvidiaProvider unexpected error with model '{model}': {exc}")
                if model != models_to_try[-1]:
                    continue
                raise AIProviderException(str(exc), provider=self.name)

        if last_exception:
            raise AIProviderException(str(last_exception), provider=self.name)
        raise AIProviderException("NVIDIA NIM analysis failed across all candidate models", provider=self.name)

    # ------------------------------------------------------------------
    # Response handling
    # ------------------------------------------------------------------

    def _handle_response(self, response: httpx.Response, model_used: Optional[str] = None, endpoint: str = "") -> AnalysisResponse:
        """Parse NVIDIA NIM response and return a normalised AnalysisResponse."""
        status = response.status_code
        active_model = model_used or self.model_name

        if status == 401:
            raise AIProviderException(
                "NVIDIA NIM authentication failed — check NVIDIA_API_KEY.",
                provider=self.name,
            )

        if status == 403:
            raise AIProviderException(
                "NVIDIA NIM access forbidden — API key may lack required permissions.",
                provider=self.name,
            )

        if status in (404, 410):
            raise AIProviderException(
                f"NVIDIA NIM model not found or deprecated (HTTP {status}): '{active_model}'. "
                "Verify NVIDIA_MODEL is a supported NIM model identifier.",
                provider=self.name,
            )

        if status == 408:
            raise AIProviderException(
                "NVIDIA NIM request timed out (server-side 408).",
                provider=self.name,
            )

        if status in self._QUOTA_STATUSES:
            logger.warning(
                f"NvidiaProvider quota/rate-limit (HTTP {status}): "
                f"{response.text[:200]}"
            )
            raise AIProviderException(
                f"NVIDIA NIM quota exceeded / rate limited (HTTP {status})",
                is_quota_exceeded=True,
                provider=self.name,
            )

        if status in self._RETRYABLE_STATUSES:
            logger.warning(
                f"NvidiaProvider retryable error HTTP {status}: "
                f"{response.text[:200]}"
            )
            raise AIProviderException(
                f"NVIDIA NIM server error (HTTP {status})",
                provider=self.name,
            )

        if status != 200:
            logger.warning(
                f"NvidiaProvider unexpected HTTP {status}: {response.text[:400]}"
            )
            raise AIProviderException(
                f"NVIDIA NIM error (HTTP {status}): {response.text[:200]}",
                provider=self.name,
            )

        # --- Parse successful response ---
        try:
            data = response.json()
        except json.JSONDecodeError as exc:
            raise AIProviderException(
                f"NVIDIA NIM returned non-JSON body: {exc}",
                provider=self.name,
            )

        try:
            raw_text: str = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise AIProviderException(
                f"NVIDIA NIM response missing expected fields: {exc}. "
                f"Body: {str(data)[:300]}",
                provider=self.name,
            )

        parsed = self.parse_json_response(raw_text)

        generated_md = parsed.get("generatedMarkdown")
        if not generated_md and endpoint in ("documentation-generator", "interview-generator"):
            summary_text = parsed.get("summary", "Analysis completed successfully.")
            title = "Technical Assessment" if endpoint == "interview-generator" else "Technical Documentation"
            generated_md = f"# {title}\n\n{summary_text}"

        return AnalysisResponse(
            summary=parsed.get(
                "summary", "Analysis completed successfully via NVIDIA NIM."
            ),
            scores=AnalysisScore(
                **parsed.get(
                    "scores",
                    {
                        "overallScore": 85,
                        "securityScore": 85,
                        "qualityScore": 85,
                        "performanceScore": 85,
                        "maintainabilityScore": 85,
                        "readabilityScore": 85,
                    },
                )
            ),
            findings=[Finding(**f) for f in parsed.get("findings", [])],
            improvedCode=parsed.get("improvedCode"),
            generatedMarkdown=generated_md,
            source="REAL_NVIDIA",
            analysisSource="REAL_NVIDIA",
            provider="NVIDIA",
            model=active_model,
        )
