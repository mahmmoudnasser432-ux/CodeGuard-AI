import enum
import logging
import time
from typing import Optional

logger = logging.getLogger("codeguard.circuit_breaker")


class CircuitState(str, enum.Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreaker:
    """
    Production-grade Circuit Breaker pattern implementation:
    - CLOSED: Normal operation. Requests route to Gemini.
    - OPEN: Tripped after `failure_threshold` consecutive failures. All requests bypass Gemini.
    - HALF_OPEN: Entered after `open_duration_seconds` cooldown. Allows 1 trial request.
      - If trial succeeds -> CLOSED.
      - If trial fails -> OPEN.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        open_duration_seconds: float = 60.0,
    ):
        self.failure_threshold = failure_threshold
        self.open_duration_seconds = open_duration_seconds
        self._state: CircuitState = CircuitState.CLOSED
        self._consecutive_failures: int = 0
        self._opened_at: float = 0.0
        self._last_failure_reason: Optional[str] = None
        self._half_open_probe_in_flight: bool = False

    @property
    def state(self) -> CircuitState:
        # Check if OPEN cooldown has elapsed to transition to HALF_OPEN
        if self._state == CircuitState.OPEN:
            if time.time() - self._opened_at >= self.open_duration_seconds:
                self._transition_to(CircuitState.HALF_OPEN, "Cooldown elapsed, testing trial request")
        return self._state

    def _transition_to(self, new_state: CircuitState, reason: str = ""):
        old_state = self._state
        self._state = new_state
        if new_state == CircuitState.OPEN:
            self._opened_at = time.time()
            self._half_open_probe_in_flight = False
            logger.warning(
                "CIRCUIT_OPENED",
                extra={"structured_data": {"event": "CIRCUIT_OPENED", "from": old_state.value, "to": new_state.value, "reason": reason}},
            )
            print(f"CIRCUIT_OPENED: {reason}")
        elif new_state == CircuitState.HALF_OPEN:
            self._half_open_probe_in_flight = False
            logger.info(
                "CIRCUIT_HALF_OPEN",
                extra={"structured_data": {"event": "CIRCUIT_HALF_OPEN", "from": old_state.value, "to": new_state.value, "reason": reason}},
            )
            print(f"CIRCUIT_HALF_OPEN: {reason}")
        elif new_state == CircuitState.CLOSED:
            self._consecutive_failures = 0
            self._opened_at = 0.0
            self._half_open_probe_in_flight = False
            self._last_failure_reason = None
            logger.info(
                "CIRCUIT_CLOSED",
                extra={"structured_data": {"event": "CIRCUIT_CLOSED", "from": old_state.value, "to": new_state.value, "reason": reason}},
            )
            print(f"CIRCUIT_CLOSED: {reason}")

    def can_execute(self) -> bool:
        """Determines if a request is permitted to call the underlying service."""
        current_state = self.state
        if current_state == CircuitState.CLOSED:
            return True
        if current_state == CircuitState.HALF_OPEN:
            # Allow 1 probe request through
            if not self._half_open_probe_in_flight:
                self._half_open_probe_in_flight = True
                return True
            return False
        # State is OPEN
        return False

    def record_success(self):
        """Records a successful response from the service."""
        if self._state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.CLOSED, "Trial request succeeded")
        else:
            self._consecutive_failures = 0

    def record_failure(self, error: Exception | str):
        """Records a failed response from the service."""
        self._last_failure_reason = str(error)
        if self._state == CircuitState.HALF_OPEN:
            self._transition_to(CircuitState.OPEN, f"Trial request failed: {error}")
        else:
            self._consecutive_failures += 1
            if self._consecutive_failures >= self.failure_threshold:
                self._transition_to(
                    CircuitState.OPEN,
                    f"Reached failure threshold ({self._consecutive_failures}/{self.failure_threshold}): {error}",
                )

    def force_open(self, reason: str = "Manual override"):
        self._consecutive_failures = self.failure_threshold
        self._transition_to(CircuitState.OPEN, reason)

    def force_close(self, reason: str = "Manual override"):
        self._transition_to(CircuitState.CLOSED, reason)

    def get_info(self) -> dict:
        return {
            "state": self.state.value,
            "consecutiveFailures": self._consecutive_failures,
            "failureThreshold": self.failure_threshold,
            "openDurationSeconds": self.open_duration_seconds,
            "lastFailureReason": self._last_failure_reason,
        }
