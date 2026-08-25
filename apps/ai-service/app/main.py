from contextlib import asynccontextmanager
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables safely from candidate paths
for env_path in [
    ".env",
    os.path.join(os.path.dirname(__file__), "..", ".env"),
    os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"),
]:
    if os.path.exists(env_path):
        load_dotenv(env_path)

from app.api.routes import router
from app.core.logging_config import setup_logging
from app.providers.manager import provider_manager

# Setup structured application logging
logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 3: Startup Diagnostics
    gemini_conf = provider_manager.gemini.is_configured
    openai_conf = provider_manager.openai.is_configured
    openrouter_conf = provider_manager.openrouter.is_configured
    active_prov = provider_manager.primary_name

    startup_diagnostics = {
        "gemini_configured": gemini_conf,
        "openai_configured": openai_conf,
        "openrouter_configured": openrouter_conf,
        "active_provider": active_prov,
        "gemini_model": provider_manager.gemini.model_name,
        "openai_model": provider_manager.openai.model_name,
        "openrouter_model": provider_manager.openrouter.model_name,
    }

    # Structured and human-readable logging
    logger.info("FastAPI startup diagnostics", extra={"structured_data": startup_diagnostics})

    print("\n" + "=" * 64)
    print("CodeGuard AI Service — Provider Configuration Status:")
    print(f"  Active Primary Provider : {active_prov.upper()}")
    print(f"  Gemini                  : {'CONFIGURED (' + provider_manager.gemini.model_name + ')' if gemini_conf else 'NOT CONFIGURED'}")
    print(f"  OpenAI                  : {'CONFIGURED (' + provider_manager.openai.model_name + ')' if openai_conf else 'NOT CONFIGURED'}")
    print(f"  OpenRouter              : {'CONFIGURED (' + provider_manager.openrouter.model_name + ')' if openrouter_conf else 'NOT CONFIGURED'}")
    print("  Deterministic Fallback  : ALWAYS AVAILABLE (ast-rules-v1)")
    print("=" * 64 + "\n")

    logger.info("CodeGuard AI service startup complete")
    yield
    logger.info("CodeGuard AI service shutdown")


app = FastAPI(
    title="CodeGuard AI Service",
    version="0.1.0",
    description="Multi-Provider AI Analysis Service (Gemini, OpenAI, OpenRouter, AST Fallback).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
