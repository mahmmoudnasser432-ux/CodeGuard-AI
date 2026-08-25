from abc import ABC, abstractmethod
import json
import logging
import re
from typing import Any, Dict, Optional
from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding

logger = logging.getLogger("codeguard.providers.base")


class AIProviderException(Exception):
    """Base exception for AI provider failures."""

    def __init__(self, message: str, is_quota_exceeded: bool = False, provider: str = "unknown"):
        super().__init__(message)
        self.is_quota_exceeded = is_quota_exceeded
        self.provider = provider


class AIProvider(ABC):
    """Abstract Base Class for all AI Analysis Providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'gemini', 'openai', 'openrouter')."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable provider name."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Active model identifier."""
        pass

    @property
    @abstractmethod
    def source_type(self) -> str:
        """Source type enum matching frontend expectations."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Whether the provider has valid API credentials."""
        pass

    @abstractmethod
    async def analyze(self, endpoint: str, request: AnalysisRequest) -> AnalysisResponse:
        """Perform analysis for any supported endpoint."""
        pass

    async def security_analysis(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("security-analysis", request)

    async def code_review(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("code-review", request)

    async def performance_analysis(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("performance-analysis", request)

    async def repository_analysis(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("repository-analysis", request)

    async def documentation_generation(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("documentation-generator", request)

    async def interview_generation(self, request: AnalysisRequest) -> AnalysisResponse:
        return await self.analyze("interview-generator", request)

    def build_system_prompt(self, endpoint: str, request: AnalysisRequest) -> str:
        """Generate structured analysis instruction prompt."""
        repo_info = ""
        if request.repositoryContext:
            repo_info = f"\nRepository: {request.repositoryContext.name} (branch: {request.repositoryContext.branch or 'default'})"

        return f"""You are CodeGuard AI, an elite static application security, code review, and software architecture intelligence engine.
Analyze the following code for the task: '{endpoint}'.

Language: {request.language}
Analysis Mode: {request.mode}{repo_info}

CRITICAL: Return ONLY a valid, parseable JSON object matching this schema exactly. Do NOT wrap in markdown codeblocks or prepend any text.
{{
  "summary": "Detailed technical summary of the code and findings",
  "scores": {{
    "overallScore": 85,
    "securityScore": 90,
    "qualityScore": 80,
    "performanceScore": 85,
    "maintainabilityScore": 80,
    "readabilityScore": 85
  }},
  "findings": [
    {{
      "severity": "high",
      "category": "security",
      "title": "Finding title",
      "description": "Thorough technical description of the issue or insight",
      "recommendation": "Actionable, precise remediation instruction",
      "line": 1
    }}
  ],
  "improvedCode": "Optimized or remediated code snippet (or null if not applicable)",
  "generatedMarkdown": "Comprehensive markdown documentation or interview questions (or null if not applicable)"
}}

CODE TO ANALYZE:
{request.code}
"""

    def parse_json_response(self, text: str) -> Dict[str, Any]:
        """Extract and parse JSON object from LLM response text."""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
            cleaned = cleaned.strip()

        match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if match:
            cleaned = match.group(1)

        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as err:
            logger.warning(f"Failed to parse LLM JSON: {err}. Raw text: {text[:200]}")
            raise AIProviderException(f"Invalid JSON returned by LLM: {str(err)}", provider=self.name)
