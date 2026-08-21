from app.models.analysis import AnalysisRequest, AnalysisResponse, AnalysisScore, Finding


RISK_PATTERNS = [
    ("critical", "Security", "Dynamic code execution", "Avoid eval-like execution paths.", "Replace dynamic execution with explicit parsing or allowlisted dispatch."),
    ("high", "Security", "Hardcoded secret", "The code appears to contain a credential-like value.", "Move secrets to a managed vault and inject through environment variables."),
    ("medium", "Performance", "Nested iteration", "Nested loops can become expensive as input grows.", "Measure complexity and consider indexes, maps, streaming, or pagination."),
    ("medium", "Maintainability", "Large function", "Large blocks are harder to test and review.", "Extract cohesive helpers with clear inputs and outputs.")
]


def score_code(request: AnalysisRequest) -> AnalysisScore:
    lowered = request.code.lower()
    risk_count = sum(1 for _, _, title, _, _ in RISK_PATTERNS if title.lower().split()[0] in lowered)
    line_count = len(request.code.splitlines())
    complexity_penalty = min(25, line_count // 80 * 5)
    risk_penalty = risk_count * 8
    overall = max(30, 92 - risk_penalty - complexity_penalty)

    return AnalysisScore(
        overallScore=overall,
        securityScore=max(20, overall - (15 if "eval(" in lowered or "password" in lowered else 0)),
        qualityScore=max(30, overall - (5 if "todo" in lowered else 0)),
        performanceScore=max(35, overall - (10 if "for " in lowered and "for " in lowered[lowered.find("for ") + 1:] else 0)),
        maintainabilityScore=max(35, overall - complexity_penalty),
        readabilityScore=max(35, overall - (8 if line_count > 250 else 0))
    )


def analyze_code(kind: str, request: AnalysisRequest) -> AnalysisResponse:
    lowered = request.code.lower()
    findings: list[Finding] = []

    if "eval(" in lowered:
        findings.append(Finding(
            severity="critical",
            category="Security",
            title="Unsafe dynamic execution",
            description="Dynamic execution can allow command or code injection when input is user controlled.",
            recommendation="Replace eval with a parser, allowlisted command map, or a typed expression evaluator."
        ))
    if "password" in lowered or "secret" in lowered or "api_key" in lowered:
        findings.append(Finding(
            severity="high",
            category="Secrets",
            title="Potential secret exposure",
            description="Credential-like values should not live in source code or logs.",
            recommendation="Store secrets in Azure Key Vault or another managed secret store."
        ))
    if "select *" in lowered:
        findings.append(Finding(
            severity="medium",
            category="Database",
            title="Unbounded column selection",
            description="Selecting all columns can leak data and create performance regressions.",
            recommendation="Select explicit columns and enforce least-privilege data access."
        ))

    if not findings:
        findings.append(Finding(
            severity="info",
            category="Quality",
            title="No obvious high-risk pattern found",
            description="The deterministic analyzer did not detect common security or performance issues.",
            recommendation="Run provider-backed analysis in production for deeper semantic review."
        ))

    summary = f"{kind.replace('-', ' ').title()} completed for {request.language} code with {len(findings)} finding(s)."
    generated = None
    if kind == "documentation-generator":
        generated = f"# Generated Documentation\n\n## Overview\n\n{summary}\n\n## Notes\n\nReview findings before publishing."

    return AnalysisResponse(
        summary=summary,
        scores=score_code(request),
        findings=findings,
        improvedCode=request.code if kind != "code-review" else request.code.strip(),
        generatedMarkdown=generated
    )
