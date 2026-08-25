import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("codeguard.cache")

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class CacheService:
    """
    Production-grade Redis Caching Layer with fallback in-memory TTL dictionary.
    Cache Key format: SHA256(analysis_type + language + mode + source_code)
    Default TTL: 86400s (24 hours)
    """

    def __init__(
        self,
        redis_url: Optional[str] = None,
        default_ttl_seconds: int = 86400,
    ):
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        self.default_ttl_seconds = int(os.getenv("CACHE_TTL_SECONDS", str(default_ttl_seconds)))
        self._redis_client = None
        self._memory_cache: Dict[str, Dict[str, Any]] = {}
        self._is_redis_connected = False
        self._init_redis()

    def _init_redis(self):
        if not REDIS_AVAILABLE:
            logger.info("Redis package not available, using in-memory TTL cache.")
            return

        try:
            self._redis_client = redis.Redis.from_url(
                self.redis_url,
                socket_timeout=1.5,
                socket_connect_timeout=1.5,
                decode_responses=True,
            )
            # Ping with timeout to verify connectivity
            self._redis_client.ping()
            self._is_redis_connected = True
            logger.info(
                "Redis cache connected successfully",
                extra={"structured_data": {"url": self.redis_url.split("@")[-1]}},
            )
        except Exception as e:
            self._is_redis_connected = False
            logger.info(
                f"Redis server unavailable ({e}). Using robust in-memory fallback cache.",
                extra={"structured_data": {"reason": str(e)}},
            )

    @property
    def is_connected(self) -> bool:
        if self._redis_client:
            try:
                self._redis_client.ping()
                self._is_redis_connected = True
                return True
            except Exception:
                self._is_redis_connected = False
                return False
        return False

    @staticmethod
    def generate_cache_key(
        analysis_type: str,
        language: str,
        mode: str,
        code: str,
    ) -> str:
        """Generates a SHA256 digest over the analysis parameters and source code."""
        normalized_str = f"{analysis_type}:{language.lower().strip()}:{mode.lower().strip()}:{code.strip()}"
        return hashlib.sha256(normalized_str.encode("utf-8")).hexdigest()

    def get(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieves cached analysis result if present and not expired."""
        # 1. Try Redis
        if self._redis_client:
            try:
                cached_str = self._redis_client.get(f"analysis:{cache_key}")
                if cached_str:
                    return json.loads(cached_str)
            except Exception as e:
                logger.debug(f"Redis get failed ({e}), checking memory cache.")

        # 2. Try In-Memory Fallback
        entry = self._memory_cache.get(cache_key)
        if entry:
            if time.time() < entry["expires_at"]:
                return entry["data"]
            else:
                del self._memory_cache[cache_key]

        return None

    def set(
        self,
        cache_key: str,
        value: Dict[str, Any],
        ttl_seconds: Optional[int] = None,
    ) -> bool:
        """Stores analysis result into cache with TTL."""
        ttl = ttl_seconds or self.default_ttl_seconds
        payload_str = json.dumps(value)

        # 1. Store in Redis
        if self._redis_client:
            try:
                self._redis_client.set(f"analysis:{cache_key}", payload_str, ex=ttl)
                return True
            except Exception as e:
                logger.debug(f"Redis set failed ({e}), storing in memory.")

        # 2. Store in In-Memory Fallback
        self._memory_cache[cache_key] = {
            "data": value,
            "expires_at": time.time() + ttl,
        }
        return True

    def clear(self):
        """Clears memory and redis caches."""
        self._memory_cache.clear()
        if self._redis_client:
            try:
                keys = self._redis_client.keys("analysis:*")
                if keys:
                    self._redis_client.delete(*keys)
            except Exception:
                pass


# Global cache singleton instance
cache_service = CacheService()
