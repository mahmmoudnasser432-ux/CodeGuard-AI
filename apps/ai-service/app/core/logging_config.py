import json
import logging
import os
import re
import sys
import time
from typing import Any, Dict

class SensitiveDataFilter(logging.Filter):
    """Filter that masks API keys and credentials from log messages."""

    PATTERNS = [
        (re.compile(r'AIza[0-9A-Za-z\-_]{16,}'), '[REDACTED_API_KEY]'),
        (re.compile(r'nvapi-[0-9A-Za-z\-_]{16,}'), '[REDACTED_NVIDIA_KEY]'),
        (re.compile(r'sk-or-[0-9A-Za-z\-_]{16,}'), '[REDACTED_OPENROUTER_KEY]'),
        (re.compile(r'sk-proj-[0-9A-Za-z\-_]{16,}'), '[REDACTED_OPENAI_KEY]'),
        (re.compile(r'sk-[0-9A-Za-z\-_]{16,}'), '[REDACTED_OPENAI_KEY]'),
    ]

    def _redact_text(self, text: str) -> str:
        # Also redact configured environment variable values if they appear in text
        env_mappings = [
            ("GEMINI_API_KEY", "[REDACTED_GEMINI_KEY]"),
            ("NVIDIA_API_KEY", "[REDACTED_NVIDIA_KEY]"),
            ("OPENROUTER_API_KEY", "[REDACTED_OPENROUTER_KEY]"),
            ("OPENAI_API_KEY", "[REDACTED_OPENAI_KEY]"),
        ]
        for env_var, placeholder in env_mappings:
            val = os.getenv(env_var)
            if val and len(val) >= 8 and val in text:
                text = text.replace(val, placeholder)

        for pattern, replacement in self.PATTERNS:
            text = pattern.sub(replacement, text)
        return text

    def _redact_value(self, val: Any) -> Any:
        if isinstance(val, str):
            return self._redact_text(val)
        if isinstance(val, dict):
            return {k: self._redact_value(v) for k, v in val.items()}
        if isinstance(val, (list, tuple)):
            cleaned = [self._redact_value(v) for v in val]
            return tuple(cleaned) if isinstance(val, tuple) else cleaned
        return val

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self._redact_text(record.msg)

        if record.args:
            if isinstance(record.args, dict):
                record.args = {k: self._redact_value(v) for k, v in record.args.items()}
            elif isinstance(record.args, (list, tuple)):
                clean_args = [self._redact_value(v) for v in record.args]
                record.args = tuple(clean_args) if isinstance(record.args, tuple) else clean_args

        return True


class StructuredJsonFormatter(logging.Formatter):
    """JSON formatter for structured application logs."""
    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt or "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "structured_data") and isinstance(record.structured_data, dict):
            # Ensure no sensitive keys inside structured data
            clean_data = {}
            for k, v in record.structured_data.items():
                if "key" in k.lower() or "secret" in k.lower() or "token" in k.lower():
                    clean_data[k] = "[REDACTED]"
                else:
                    clean_data[k] = v
            log_obj["data"] = clean_data

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)


def setup_logging(log_level: str = "INFO") -> logging.Logger:
    """Setup structured application logging with sensitive data filtering."""
    root_logger = logging.getLogger()
    
    # Avoid duplicate handlers if setup_logging is called multiple times
    if not root_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(StructuredJsonFormatter())
        handler.addFilter(SensitiveDataFilter())
        root_logger.addHandler(handler)
        root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    else:
        for handler in root_logger.handlers:
            handler.setFormatter(StructuredJsonFormatter())
            handler.addFilter(SensitiveDataFilter())
        root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))

    app_logger = logging.getLogger("codeguard.ai_service")
    return app_logger
