import threading
import time
from typing import Any, Dict, List


class MetricsCollector:
    """
    Thread-safe Metrics Collector tracking analysis throughput, latency,
    cache hits/misses, and degradation statuses.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self.requests_total: int = 0
        self.success_total: int = 0
        self.fallback_total: int = 0
        self.quota_exceeded_total: int = 0
        self.cache_hit_total: int = 0
        self.cache_miss_total: int = 0

        self._durations: List[float] = []
        self._max_samples: int = 1000
        self._created_at: float = time.time()

    def record_request(self):
        with self._lock:
            self.requests_total += 1

    def record_success(self):
        with self._lock:
            self.success_total += 1

    def record_fallback(self):
        with self._lock:
            self.fallback_total += 1

    def record_quota_exceeded(self):
        with self._lock:
            self.quota_exceeded_total += 1

    def record_cache_hit(self):
        with self._lock:
            self.cache_hit_total += 1

    def record_cache_miss(self):
        with self._lock:
            self.cache_miss_total += 1

    def record_duration(self, duration_ms: float):
        with self._lock:
            self._durations.append(duration_ms)
            if len(self._durations) > self._max_samples:
                self._durations.pop(0)

    def get_metrics(self) -> Dict[str, Any]:
        with self._lock:
            durations = self._durations
            count = len(durations)
            avg_ms = round(sum(durations) / count, 2) if count > 0 else 0.0
            min_ms = round(min(durations), 2) if count > 0 else 0.0
            max_ms = round(max(durations), 2) if count > 0 else 0.0
            last_ms = round(durations[-1], 2) if count > 0 else 0.0
            total_duration_ms = round(sum(durations), 2)

            return {
                "analysis_requests_total": self.requests_total,
                "analysis_success_total": self.success_total,
                "analysis_fallback_total": self.fallback_total,
                "analysis_quota_exceeded_total": self.quota_exceeded_total,
                "analysis_cache_hit_total": self.cache_hit_total,
                "analysis_cache_miss_total": self.cache_miss_total,
                "analysis_duration_ms": {
                    "count": count,
                    "avg": avg_ms,
                    "min": min_ms,
                    "max": max_ms,
                    "last": last_ms,
                    "total": total_duration_ms,
                },
                "uptime_seconds": round(time.time() - self._created_at, 2),
            }

    def reset(self):
        with self._lock:
            self.requests_total = 0
            self.success_total = 0
            self.fallback_total = 0
            self.quota_exceeded_total = 0
            self.cache_hit_total = 0
            self.cache_miss_total = 0
            self._durations.clear()


# Global metrics collector instance
metrics_collector = MetricsCollector()
