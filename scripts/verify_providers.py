#!/usr/bin/env python3
"""
CodeGuard AI — Multi-Provider End-to-End Verification Script
Tests configuration status, failover chains, and live analysis execution across all AI providers.
"""

import asyncio
import os
import sys

# Add apps/ai-service to Python path so modules can be imported directly
ai_service_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "apps", "ai-service"))
if ai_service_dir not in sys.path:
    sys.path.insert(0, ai_service_dir)

from dotenv import load_dotenv

# Load root .env
for env_path in [
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    os.path.join(ai_service_dir, ".env"),
    ".env",
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)

from app.models.analysis import AnalysisRequest
from app.providers.manager import provider_manager


async def main():
    print("=" * 70)
    print(" CODEGUARD AI -- MULTI-PROVIDER VERIFICATION & DIAGNOSTICS")
    print("=" * 70)

    # 1. Provider Configuration Status
    gemini_conf = provider_manager.gemini.is_configured
    openai_conf = provider_manager.openai.is_configured
    openrouter_conf = provider_manager.openrouter.is_configured

    print("\n[1] Provider Configuration Status:")
    print(f"  * Google Gemini : {'CONFIGURED' if gemini_conf else 'NOT CONFIGURED'} (Model: {provider_manager.gemini.model_name})")
    print(f"  * OpenAI        : {'CONFIGURED' if openai_conf else 'NOT CONFIGURED'} (Model: {provider_manager.openai.model_name})")
    print(f"  * OpenRouter    : {'CONFIGURED' if openrouter_conf else 'NOT CONFIGURED'} (Model: {provider_manager.openrouter.model_name})")
    print(f"  * Deterministic : ALWAYS AVAILABLE (Model: {provider_manager.fallback.model_name})")

    # 2. Active Primary Provider
    print("\n[2] Active Primary Provider:")
    print(f"  * AI_PROVIDER : {provider_manager.primary_name.upper()}")

    # 3. Failover Chain
    chain = provider_manager.get_failover_chain()
    chain_names = [f"{p.display_name} ({p.model_name})" for p in chain]
    print("\n[3] Failover Resolution Chain:")
    for idx, name in enumerate(chain_names, 1):
        print(f"  {idx}. {name}")

    # 4. Execute Test Analysis
    sample_code = """
import os
import psycopg2

def get_user_data(user_id):
    # Potential SQL Injection vulnerability for testing
    query = "SELECT * FROM users WHERE id = '" + user_id + "'"
    conn = psycopg2.connect(os.getenv("DATABASE_URL"))
    cursor = conn.cursor()
    cursor.execute(query)
    return cursor.fetchall()
"""
    request = AnalysisRequest(
        language="python",
        code=sample_code.strip(),
        mode="expert",
    )

    print("\n[4] Executing Test Analysis ('security-analysis')...")
    try:
        response = await provider_manager.analyze("security-analysis", request)

        failover_triggered = bool(
            response.degradationReason
            or response.source in ["FALLBACK_ANALYZER", "QUOTA_EXCEEDED"]
            or (response.provider != provider_manager.primary_name and response.provider != "google-gemini" and provider_manager.primary_name == "gemini")
        )

        # 5. Display Verification Results
        print("\n[5] Analysis Execution Results:")
        print(f"  * Provider Used      : {response.provider}")
        print(f"  * Model Used         : {response.model}")
        print(f"  * Source             : {response.source}")
        print(f"  * Overall Score      : {response.scores.overallScore}/100")
        print(f"  * Findings Detected  : {len(response.findings)}")
        print(f"  * Failover Triggered : {'YES [Activated]' if failover_triggered else 'NO (Primary Succeeded)'}")
        if response.degradationReason:
            print(f"  * Degradation Reason : {response.degradationReason[:250]}...")

        print("\n" + "-" * 70)
        print("Summary Preview:")
        print(f"  {response.summary[:200]}...")
        print("-" * 70)

        print("\n[SUCCESS] Verification Completed Successfully.")

    except Exception as e:
        print(f"\n[FAILURE] Analysis Failed with unexpected error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
