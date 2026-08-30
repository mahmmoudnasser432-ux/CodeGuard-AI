import logging
import os
from typing import Dict, List, Optional
from app.models.analysis import AnalysisRequest, AnalysisResponse
from app.providers.base import AIProvider, AIProviderException
from app.providers.gemini_provider import GeminiProvider
from app.providers.openai_provider import OpenAIProvider
from app.providers.openrouter_provider import OpenRouterProvider
from app.providers.nvidia_provider import NvidiaProvider
from app.providers.fallback_provider import DeterministicFallbackProvider

logger = logging.getLogger("codeguard.providers.manager")


class ProviderManager:
    """
    Multi-Provider AI Orchestration Layer with Automatic Failover:
    Primary (AI_PROVIDER) -> Fallback Provider -> Tertiary Provider -> Deterministic Fallback
    """

    def __init__(
        self,
        primary_provider_name: Optional[str] = None,
        gemini_provider: Optional[AIProvider] = None,
        openai_provider: Optional[AIProvider] = None,
        openrouter_provider: Optional[AIProvider] = None,
        nvidia_provider: Optional[AIProvider] = None,
        fallback_provider: Optional[AIProvider] = None,
    ):
        self._explicit_primary_name = primary_provider_name
        self.gemini = gemini_provider or GeminiProvider()
        self.openai = openai_provider or OpenAIProvider()
        self.openrouter = openrouter_provider or OpenRouterProvider()
        self.nvidia = nvidia_provider or NvidiaProvider()
        self.fallback = fallback_provider or DeterministicFallbackProvider()

        self.providers: Dict[str, AIProvider] = {
            "gemini": self.gemini,
            "openai": self.openai,
            "openrouter": self.openrouter,
            "nvidia": self.nvidia,
            "fallback": self.fallback,
        }

    @property
    def primary_name(self) -> str:
        name = self._explicit_primary_name or os.getenv("AI_PROVIDER", "nvidia")
        return name.lower().strip()

    def get_failover_chain(self) -> List[AIProvider]:
        """Construct the ordered list of providers to attempt.

        Target Provider Order (primary = nvidia):
            1. NVIDIA NIM (PRIMARY)
            2. OpenRouter (SECONDARY)
            3. OpenAI (TERTIARY)
            4. Gemini (QUATERNARY)
            5. Deterministic Fallback
        """
        order_map = {
            "nvidia":     [self.nvidia,     self.openrouter, self.openai, self.gemini],
            "openrouter": [self.openrouter, self.nvidia,     self.openai, self.gemini],
            "openai":     [self.openai,     self.nvidia,     self.openrouter, self.gemini],
            "gemini":     [self.gemini,     self.nvidia,     self.openrouter, self.openai],
        }

        chain = order_map.get(
            self.primary_name,
            [self.nvidia, self.openrouter, self.openai, self.gemini],
        )
        return [*chain, self.fallback]

    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        """
        Execute analysis with automatic multi-provider failover.
        Tries providers in sequence and falls back gracefully.
        """
        chain = self.get_failover_chain()
        failures: List[str] = []
        attempted_remote_count = 0
        quota_failure_count = 0

        for provider in chain:
            provider_id = provider.name

            # Skip unconfigured remote providers (fallback is always available)
            if not provider.is_configured and provider_id != "fallback":
                logger.debug(f"Provider {provider_id} is not configured, skipping.")
                continue

            if provider_id != "fallback":
                attempted_remote_count += 1

            try:
                logger.info(f"Executing analysis with provider: {provider.display_name}")
                logger.info(
                    f"Executing analysis '{endpoint}' with provider: {provider.display_name} ({provider.model_name})"
                )
                response = await provider.analyze(endpoint, request)


                # If failover occurred before reaching this provider, annotate degradation
                if failures:
                    reason_summary = " -> ".join(failures)
                    if provider_id == "fallback":
                        if attempted_remote_count > 0 and quota_failure_count == attempted_remote_count:
                            response.source = "QUOTA_EXCEEDED"
                            response.analysisSource = "QUOTA_EXCEEDED"
                            response.degradationReason = (
                                f"Quota exhausted across all providers ({reason_summary}). Served by Deterministic Fallback Analyzer."
                            )
                        else:
                            response.source = "FALLBACK_ANALYZER"
                            response.analysisSource = "FALLBACK_ANALYZER"
                            response.degradationReason = (
                                f"All providers failed ({reason_summary}). Served by Deterministic Fallback Analyzer."
                            )
                    else:
                        response.degradationReason = (
                            f"Failover triggered ({reason_summary}). Served by {provider.display_name}."
                        )

                    logger.warning(
                        f"Analysis successfully resolved via failover to {provider.display_name}. Reason: {reason_summary}"
                    )

                return response

            except AIProviderException as e:
                err_msg = f"{provider_id} ({e})"
                failures.append(err_msg)
                if e.is_quota_exceeded:
                    quota_failure_count += 1
                logger.warning(
                    f"Provider {provider_id} failed: {e}. Attempting next provider in failover chain."
                )

            except Exception as e:
                err_msg = f"{provider_id} (Unexpected: {str(e)})"
                failures.append(err_msg)
                logger.exception(f"Unexpected error with provider {provider_id}: {e}")

        # Fallback safety net
        fallback_res = await self.fallback.analyze(endpoint, request)
        fallback_res.source = "FALLBACK_ANALYZER"
        fallback_res.analysisSource = "FALLBACK_ANALYZER"
        fallback_res.degradationReason = "All providers failed: " + " -> ".join(failures) if failures else "No remote AI provider configured."
        return fallback_res


# Global singleton instance
provider_manager = ProviderManager()
