import logging
from typing import Tuple

logger = logging.getLogger("codeguard.retry")

# Explicit error codes classification
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
NON_RETRYABLE_STATUS_CODES = {400, 401, 403, 404, 422}


def is_retryable_error(exc: Exception) -> Tuple[bool, str]:
    """
    Evaluates whether an exception is transient/retryable or permanent.
    Returns: (is_retryable: bool, reason: str)
    """
    exc_str = str(exc).lower()

    # Check for non-retryable status codes or client errors
    for non_code in NON_RETRYABLE_STATUS_CODES:
        if f" {non_code} " in f" {exc_str} " or f"{non_code}:" in exc_str or f"status={non_code}" in exc_str:
            return False, f"Non-retryable HTTP client error status {non_code}"

    # Check for retryable status codes
    for retry_code in RETRYABLE_STATUS_CODES:
        if f" {retry_code} " in f" {exc_str} " or f"{retry_code}:" in exc_str or f"status={retry_code}" in exc_str:
            return True, f"Retryable server/rate status {retry_code}"

    if "resourceexhausted" in exc_str or "quota" in exc_str or "rate limit" in exc_str or "too many requests" in exc_str:
        return True, "Rate limit / quota exceeded"

    if "unavailable" in exc_str or "deadline exceeded" in exc_str or "timeout" in exc_str or "connection" in exc_str:
        return True, "Transient network / server error"

    # Default to False for unknown exceptions to prevent uncontrolled loops
    return False, f"Unhandled exception type {type(exc).__name__}"
