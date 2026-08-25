import json
import logging
import os
import sys
import time
from typing import Any, Dict

class SensitiveDataFilter(logging.Filter):
    """Filter that masks API keys and credentials from log messages."""
    def filter(self, record: logging.LogRecord) -> bool:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if isinstance(record.msg, str):
            if gemini_key and gemini_key in record.msg:
                record.msg = record.msg.replace(gemini_key, "[REDACTED_GEMINI_KEY]")
            # Mask potential key patterns
            if "AIza" in record.msg:
                import re
                record.msg = re.sub(r'AIza[0-9A-Za-z\-_]{35}', '[REDACTED_API_KEY]', record.msg)
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
