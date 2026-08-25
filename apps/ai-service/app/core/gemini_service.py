import asyncio
import json
import logging
import os
import random
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import google.generativeai as genai
from dotenv import load_dotenv
from google.api_core.exceptions import GoogleAPIError, ResourceExhausted
from pydantic import ValidationError

from app.core.analyzer import analyze_code as fallback_analyze_code
from app.core.cache import cache_service
from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.core.metrics import metrics_collector
from app.core.retry import is_retryable_error
from app.models.analysis import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisScore,
    Finding,
)

# Load environment variables safely from multiple candidate locations
for env_path in [
    ".env",
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"),
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)

logger = logging.getLogger("codeguard.gemini_service")


class GeminiService:
    """
    Production Reliability AI Engine for CodeGuard:
    - Circuit Breaker with CLOSED, OPEN, HALF_OPEN state machine
    - SHA256 Caching Layer with 24-hour TTL
    - Smart Exponential Backoff Retry with Jitter
    - Quota Exceeded Detection & Graceful Fallback
    - In-Memory Metrics Collection
    - Structured Lifecycle Logging
    """

    CANDIDATE_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash"]

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
        max_retries: int = 3,
        failure_threshold: int = 5,
        open_duration_seconds: float = 60.0,
    ):
        self._api_key = api_key if api_key is not None else os.getenv("GEMINI_API_KEY")
        self.model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
        self.timeout_seconds = timeout_seconds or float(os.getenv("GEMINI_TIMEOUT_SECONDS", "30.0"))
        self.max_retries = int(os.getenv("MAX_RETRIES", str(max_retries)))

        self.circuit_breaker = CircuitBreaker(
            failure_threshold=int(os.getenv("FAILURE_THRESHOLD", str(failure_threshold))),
            open_duration_seconds=float(os.getenv("OPEN_DURATION_SECONDS", str(open_duration_seconds))),
        )
        self.cache = cache_service
        self.metrics = metrics_collector

        self._is_configured = False
        self._model = None

        if self._api_key and self._api_key.strip():
            self._configure_client()

    def _configure_client(self) -> None:
        """Configures the Google Gemini SDK securely."""
        try:
            genai.configure(api_key=self._api_key)
            self._model = genai.GenerativeModel(
                model_name=self.model_name,
                generation_config={
                    "response_mime_type": "application/json",
                    "temperature": 0.2,
                },
            )
            self._is_configured = True
            logger.info(
                "Gemini client successfully initialized",
                extra={"structured_data": {"model": self.model_name, "timeout": self.timeout_seconds}},
            )
        except Exception as exc:
            self._is_configured = False
            logger.error(
                "Failed to initialize Gemini client",
                extra={"structured_data": {"error": str(exc)}},
                exc_info=True,
            )

    @property
    def is_configured(self) -> bool:
        return self._is_configured and self._model is not None

    def __repr__(self) -> str:
        return f"<GeminiService(model='{self.model_name}', configured={self._is_configured}, circuit={self.circuit_breaker.state.value})>"

    def _create_analysis_prompt(self, request: AnalysisRequest, analysis_type: str) -> str:
        """Builds domain-specific structured prompt for Gemini."""
        repo_info = ""
        if request.repositoryContext:
            repo_info = (
                f"\nRepository Context: Name={request.repositoryContext.name}, "
                f"Branch={request.repositoryContext.branch or 'N/A'}, "
                f"CommitSha={request.repositoryContext.commitSha or 'N/A'}\n"
            )

        instructions_by_type = {
            "security-analysis": """
Analyze the code for security vulnerabilities, OWASP Top 10, CWE weaknesses, hardcoded secrets, injection vectors, authorization gaps, and insecure APIs.
Provide actionable remediation for each finding.
Scores should accurately reflect the security posture (e.g. critical vulnerabilities must decrease securityScore and overallScore).
""",
            "repository-analysis": """
Analyze the repository architecture, modularity, testability, code organization, dependency health, and engineering standards.
Identify architectural bottlenecks, technical debt, and maintainability concerns.
""",
            "documentation-generator": """
Generate comprehensive, professional documentation for the provided code.
Populate `generatedMarkdown` with complete Markdown documentation including: Overview, Architecture, Function/Class Signatures with Types and Parameters, Usage Examples, and Error Handling.
Provide clear summary and quality scores.
""",
            "interview-generator": """
Generate technical interview questions and evaluation rubrics based on the provided code.
Populate `generatedMarkdown` with:
1. Concept & Architecture questions (Beginner to Senior)
2. Code review / Bug-spotting questions
3. System design / Scalability questions
4. Detailed expected answer keys and evaluation criteria.
List key assessment areas in findings.
""",
            "performance-analysis": """
Analyze performance bottlenecks, computational complexity (Big-O), memory leaks, unindexed queries, blocking I/O, and inefficient iteration.
Provide concrete code optimizations in `improvedCode`.
""",
            "code-review": """
Conduct a comprehensive senior engineer code review covering correctness, style, idiomatic patterns, error handling, and testability.
Provide cleaned/refactored code in `improvedCode`.
""",
            "scoring-engine": """
Perform multi-dimensional code quality scoring across Security, Quality, Performance, Maintainability, and Readability.
Provide detailed findings explaining any score penalties.
""",
        }

        specific_instruction = instructions_by_type.get(
            analysis_type,
            "Analyze the code thoroughly and provide structured evaluation and recommendations.",
        )

        return f"""
You are CodeGuard AI, an enterprise-grade AI static analyzer and software engineering intelligence engine.
Your task is to perform an in-depth: {analysis_type}.

Target Language: {request.language}
Target Mode: {request.mode} (Adjust depth for {request.mode} engineer level)
{repo_info}

Analysis Instructions:
{specific_instruction}

Output Schema Requirement:
You MUST respond with a valid JSON object strictly matching this schema:
{{
    "summary": "Concise summary of the analysis findings and code health (string)",
    "scores": {{
        "overallScore": integer between 0 and 100,
        "securityScore": integer between 0 and 100,
        "qualityScore": integer between 0 and 100,
        "performanceScore": integer between 0 and 100,
        "maintainabilityScore": integer between 0 and 100,
        "readabilityScore": integer between 0 and 100
    }},
    "findings": [
        {{
            "severity": "critical" | "high" | "medium" | "low" | "info",
            "category": "Security" | "Performance" | "Quality" | "Maintainability" | "Architecture" | "Secrets" | "Documentation" | "Testing",
            "title": "Short title of the finding",
            "description": "Detailed explanation of why this is an issue",
            "recommendation": "Concrete steps to resolve or improve",
            "line": optional integer line number or null
        }}
    ],
    "improvedCode": "Complete improved/refactored code if applicable, or null",
    "generatedMarkdown": "Generated markdown documentation or interview questions if requested, or null"
}}

Rules:
1. Return ONLY the raw JSON object. Do NOT wrap in markdown fences or include explanatory text outside JSON.
2. Provide meaningful, realistic numerical scores between 0 and 100 based on actual code issues.
3. Every finding must have actionable recommendations.

Source Code:
```{request.language}
{request.code}
```
"""

    def _extract_and_parse_json(self, raw_text: str) -> Dict[str, Any]:
        """Extracts JSON from model response text with lenient control character handling."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            cleaned = cleaned.strip()

        try:
            return json.loads(cleaned, strict=False)
        except json.JSONDecodeError:
            sanitized = re.sub(
                r"[\x00-\x1f]",
                lambda m: "\\n" if m.group(0) == "\n" else "\\t" if m.group(0) == "\t" else "",
                cleaned,
            )
            return json.loads(sanitized, strict=False)

    async def _call_gemini_with_timeout(self, model: genai.GenerativeModel, prompt: str) -> str:
        """Executes call to Gemini in worker thread with timeout enforcement."""
        def _generate():
            response = model.generate_content(prompt)
            return response.text

        return await asyncio.wait_for(asyncio.to_thread(_generate), timeout=self.timeout_seconds)

    def _is_quota_error(self, exc: Exception) -> bool:
        """Determines if exception is 429 / ResourceExhausted / QuotaExceeded."""
        if isinstance(exc, ResourceExhausted):
            return True
        exc_msg = str(exc).lower()
        return "429" in exc_msg or "quota" in exc_msg or "resourceexhausted" in exc_msg or "quotaexceeded" in exc_msg

    async def _execute_with_smart_retry(self, prompt: str, analysis_type: str) -> Tuple[str, str]:
        """
        Smart retry strategy:
        - Retries only 429, 500, 502, 503, 504
        - Exponential backoff with jitter: 1s, 2s, 4s (+ 0.1-0.5s jitter)
        - Candidate model fallback chain
        """
        models_to_try = [self.model_name] + [m for m in self.CANDIDATE_MODELS if m != self.model_name]
        last_exception = None

        for target_model_name in models_to_try:
            try:
                target_model = genai.GenerativeModel(
                    model_name=target_model_name,
                    generation_config={
                        "response_mime_type": "application/json",
                        "temperature": 0.2,
                    },
                )
            except Exception as e:
                logger.debug(f"Failed to create model {target_model_name}: {e}")
                continue

            attempt = 0
            while attempt < self.max_retries:
                attempt += 1
                logger.info(
                    "GEMINI_REQUEST",
                    extra={
                        "structured_data": {
                            "event": "GEMINI_REQUEST",
                            "analysis_type": analysis_type,
                            "model": target_model_name,
                            "attempt": attempt,
                            "max_retries": self.max_retries,
                        }
                    },
                )
                try:
                    text = await self._call_gemini_with_timeout(target_model, prompt)
                    logger.info(
                        "GEMINI_SUCCESS",
                        extra={
                            "structured_data": {
                                "event": "GEMINI_SUCCESS",
                                "analysis_type": analysis_type,
                                "model": target_model_name,
                                "attempt": attempt,
                            }
                        },
                    )
                    return text, target_model_name

                except asyncio.TimeoutError as exc:
                    last_exception = exc
                    logger.warning(
                        "GEMINI_FAILURE",
                        extra={
                            "structured_data": {
                                "event": "GEMINI_FAILURE",
                                "analysis_type": analysis_type,
                                "model": target_model_name,
                                "attempt": attempt,
                                "reason": "timeout",
                            }
                        },
                    )

                except Exception as exc:
                    last_exception = exc
                    is_quota = self._is_quota_error(exc)
                    retryable, retry_reason = is_retryable_error(exc)

                    logger.warning(
                        "GEMINI_FAILURE",
                        extra={
                            "structured_data": {
                                "event": "GEMINI_FAILURE",
                                "analysis_type": analysis_type,
                                "model": target_model_name,
                                "attempt": attempt,
                                "error": str(exc),
                                "is_quota": is_quota,
                                "retryable": retryable,
                            }
                        },
                    )

                    if is_quota:
                        logger.warning(
                            "QUOTA_EXCEEDED",
                            extra={
                                "structured_data": {
                                    "event": "QUOTA_EXCEEDED",
                                    "analysis_type": analysis_type,
                                    "model": target_model_name,
                                    "error": str(exc),
                                }
                            },
                        )
                        # Break attempt loop for this model to try alternative candidate model
                        break

                    if not retryable:
                        # Non-retryable error (400, 401, 403, 404), do not retry
                        logger.info(f"Aborting retries for non-retryable error: {retry_reason}")
                        raise exc

                if attempt < self.max_retries:
                    # Exponential backoff with jitter: 1s, 2s, 4s
                    backoff = (2 ** (attempt - 1)) + random.uniform(0.1, 0.5)
                    await asyncio.sleep(backoff)

        raise last_exception or RuntimeError("Gemini generation failed across all retry attempts")

    async def analyze(self, analysis_type: str, request: AnalysisRequest) -> AnalysisResponse:
        """
        Executes full analysis pipeline:
        1. Metrics recording & ANALYSIS_STARTED log
        2. SHA256 Cache lookup (Hit -> return cached result)
        3. Circuit Breaker validation (Open -> fast-fail to fallback)
        4. Smart Gemini invocation (Success -> record metrics, cache response, return REAL_GEMINI)
        5. Quota / Error graceful degradation (Return QUOTA_EXCEEDED / FALLBACK_ANALYZER)
        """
        start_time = time.time()
        self.metrics.record_request()

        logger.info(
            "ANALYSIS_STARTED",
            extra={
                "structured_data": {
                    "event": "ANALYSIS_STARTED",
                    "analysis_type": analysis_type,
                    "language": request.language,
                    "mode": request.mode,
                    "code_length": len(request.code),
                }
            },
        )

        # ----------------------------------------------------
        # 1. Cache Lookup (SHA256 Key)
        # ----------------------------------------------------
        cache_key = self.cache.generate_cache_key(
            analysis_type=analysis_type,
            language=request.language,
            mode=request.mode,
            code=request.code,
        )

        cached_data = self.cache.get(cache_key)
        if cached_data:
            self.metrics.record_cache_hit()
            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            logger.info(
                "CACHE_HIT",
                extra={
                    "structured_data": {
                        "event": "CACHE_HIT",
                        "analysis_type": analysis_type,
                        "cache_key": cache_key,
                        "duration_ms": duration_ms,
                    }
                },
            )
            print(f"CACHE_HIT: {cache_key}")

            cached_response = AnalysisResponse.model_validate(cached_data)
            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": cached_response.source,
                        "from_cache": True,
                    }
                },
            )
            return cached_response

        self.metrics.record_cache_miss()
        logger.info(
            "CACHE_MISS",
            extra={
                "structured_data": {
                    "event": "CACHE_MISS",
                    "analysis_type": analysis_type,
                    "cache_key": cache_key,
                }
            },
        )
        print(f"CACHE_MISS: {cache_key}")

        # ----------------------------------------------------
        # 2. Check Client Configuration
        # ----------------------------------------------------
        if not self.is_configured:
            self.metrics.record_fallback()
            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            fallback_res = fallback_analyze_code(analysis_type, request)
            fallback_res.source = "FALLBACK_ANALYZER"
            fallback_res.analysisSource = "FALLBACK_ANALYZER"
            fallback_res.provider = "deterministic-rule-engine"
            fallback_res.degradationReason = "GEMINI_API_KEY is not configured in environment or .env."

            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": "FALLBACK_ANALYZER",
                    }
                },
            )
            return fallback_res

        # ----------------------------------------------------
        # 3. Circuit Breaker Check (Fast-fail if OPEN)
        # ----------------------------------------------------
        if not self.circuit_breaker.can_execute():
            self.metrics.record_quota_exceeded()
            self.metrics.record_fallback()
            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            logger.warning(
                "QUOTA_EXCEEDED",
                extra={
                    "structured_data": {
                        "event": "QUOTA_EXCEEDED",
                        "analysis_type": analysis_type,
                        "reason": "circuit_breaker_open",
                    }
                },
            )
            fallback_res = fallback_analyze_code(analysis_type, request)
            fallback_res.source = "QUOTA_EXCEEDED"
            fallback_res.analysisSource = "QUOTA_EXCEEDED"
            fallback_res.provider = "deterministic-rule-engine"
            fallback_res.degradationReason = "Gemini quota exhausted"
            fallback_res.summary += " [Notice: Analysis served by deterministic rule engine due to Gemini API quota exhaustion.]"

            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": "QUOTA_EXCEEDED",
                    }
                },
            )
            return fallback_res

        # ----------------------------------------------------
        # 4. Invoke Gemini with Smart Retry
        # ----------------------------------------------------
        prompt = self._create_analysis_prompt(request, analysis_type)

        try:
            raw_response, model_used = await self._execute_with_smart_retry(prompt, analysis_type)
            parsed_json = self._extract_and_parse_json(raw_response)
            response = AnalysisResponse.model_validate(parsed_json)
            response.source = "REAL_GEMINI"
            response.analysisSource = "REAL_GEMINI"
            response.provider = "google-gemini"
            response.model = model_used

            self.circuit_breaker.record_success()
            self.metrics.record_success()

            # Store in Cache for 24h
            self.cache.set(cache_key, response.model_dump())

            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": "REAL_GEMINI",
                        "model": model_used,
                        "overall_score": response.scores.overallScore,
                        "findings_count": len(response.findings),
                    }
                },
            )
            return response

        except (ValidationError, json.JSONDecodeError) as parse_error:
            self.circuit_breaker.record_failure(parse_error)
            self.metrics.record_fallback()
            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            fallback_res = fallback_analyze_code(analysis_type, request)
            fallback_res.source = "FALLBACK_ANALYZER"
            fallback_res.analysisSource = "FALLBACK_ANALYZER"
            fallback_res.provider = "deterministic-rule-engine"
            fallback_res.degradationReason = f"Failed to parse structured JSON from model: {parse_error}"

            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": "FALLBACK_ANALYZER",
                    }
                },
            )
            return fallback_res

        except Exception as error:
            is_quota = self._is_quota_error(error)
            self.circuit_breaker.record_failure(error)

            if is_quota:
                self.metrics.record_quota_exceeded()
                source_type = "QUOTA_EXCEEDED"
                degradation_reason = "Gemini quota exhausted"
                logger.warning(
                    "QUOTA_EXCEEDED",
                    extra={"structured_data": {"event": "QUOTA_EXCEEDED", "analysis_type": analysis_type, "error": str(error)}},
                )
            else:
                self.metrics.record_fallback()
                source_type = "FALLBACK_ANALYZER"
                degradation_reason = f"Gemini API execution error: {error}"

            # Try automatic failover to secondary providers (OpenAI, OpenRouter) before deterministic fallback
            try:
                from app.providers.manager import provider_manager
                for alt_provider in [provider_manager.openai, provider_manager.openrouter]:
                    if alt_provider.is_configured:
                        try:
                            logger.info(f"Attempting automatic failover to {alt_provider.display_name}")
                            alt_res = await alt_provider.analyze(analysis_type, request)
                            alt_res.degradationReason = f"Failover triggered from Gemini ({error}). Served by {alt_provider.display_name}."
                            self.cache.set(cache_key, alt_res.model_dump())
                            duration_ms = round((time.time() - start_time) * 1000, 2)
                            self.metrics.record_duration(duration_ms)
                            return alt_res
                        except Exception as alt_err:
                            logger.warning(f"Failover to {alt_provider.display_name} failed: {alt_err}")
            except Exception as e:
                logger.debug(f"Failover evaluation skipped: {e}")

            duration_ms = round((time.time() - start_time) * 1000, 2)
            self.metrics.record_duration(duration_ms)

            fallback_res = fallback_analyze_code(analysis_type, request)
            fallback_res.source = source_type
            fallback_res.analysisSource = source_type
            fallback_res.provider = "deterministic-rule-engine"
            fallback_res.degradationReason = degradation_reason
            if is_quota:
                fallback_res.summary += " [Notice: Analysis served by deterministic rule engine due to Gemini API quota exhaustion.]"

            logger.info(
                "ANALYSIS_COMPLETED",
                extra={
                    "structured_data": {
                        "event": "ANALYSIS_COMPLETED",
                        "analysis_type": analysis_type,
                        "duration_ms": duration_ms,
                        "source": source_type,
                        "error": str(error),
                    }
                },
            )
            return fallback_res


# Global singleton instance
gemini_service = GeminiService()
