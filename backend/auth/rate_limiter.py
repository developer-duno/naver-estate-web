"""IP 기반 Rate Limiting 미들웨어

Redis 사용 가능 시 Redis sorted set 기반, 없으면 in-memory 폴백.
"""

import logging
import os
import time
from collections import defaultdict

from auth.audit import _mask_ip

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Rate limit 정책
RATE_LIMITS = {
    "/api/": (60, 60),  # 기본: 60/분
}
LOGIN_RATE_LIMIT = (5, 300)  # 로그인: 5/5분

# ── Redis 또는 In-Memory 백엔드 선택 ──

_redis_client = None
_use_redis = False

REDIS_URL = os.getenv("REDIS_URL")
if REDIS_URL:
    try:
        import redis
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        _use_redis = True
        logger.info("Rate limiter: Redis 연결 성공 (%s)", REDIS_URL.split("@")[-1] if "@" in REDIS_URL else "localhost")
    except Exception as e:
        logger.warning("Rate limiter: Redis 연결 실패, in-memory 폴백 (%s)", e)
        _redis_client = None
        _use_redis = False
else:
    logger.info("Rate limiter: REDIS_URL 미설정, in-memory 모드")

# In-memory 폴백용
_ip_counters: dict[str, list[float]] = defaultdict(list)


def _get_client_ip(request: Request) -> str:
    """클라이언트 IP 추출 (프록시 고려)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",")]
        if len(parts) == 1:
            return parts[0]
        return parts[-2]
    if request.client:
        return request.client.host
    return "unknown"


def _check_rate_limit_redis(rate_key: str, max_req: int, window: int) -> bool:
    """Redis sorted set으로 rate limit 체크. 초과 시 True 반환."""
    now = time.time()
    pipe = _redis_client.pipeline()
    pipe.zremrangebyscore(rate_key, 0, now - window)  # 만료된 엔트리 삭제
    pipe.zcard(rate_key)  # 현재 카운트
    pipe.zadd(rate_key, {str(now): now})  # 현재 요청 추가
    pipe.expire(rate_key, window)  # TTL 설정
    results = pipe.execute()
    current_count = results[1]
    return current_count >= max_req


def _check_rate_limit_memory(rate_key: str, max_req: int, window: int) -> bool:
    """In-memory 폴백으로 rate limit 체크. 초과 시 True 반환."""
    now = time.time()
    cutoff = now - window
    _ip_counters[rate_key] = [t for t in _ip_counters[rate_key] if t > cutoff]

    if len(_ip_counters[rate_key]) >= max_req:
        return True

    _ip_counters[rate_key].append(now)
    return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP 기반 Rate Limiting.

    Redis 가용 시 분산 환경 지원, 불가 시 프로세스 단위 in-memory.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        ip = _get_client_ip(request)

        if path == "/api/auth/login" or (path == "/api/signup" and request.method == "POST"):
            max_req, window = LOGIN_RATE_LIMIT
        else:
            max_req, window = RATE_LIMITS.get("/api/", (60, 60))

        rate_key = f"rl:{ip}:{path.split('/')[2] if len(path.split('/')) > 2 else 'api'}"

        exceeded = (
            _check_rate_limit_redis(rate_key, max_req, window)
            if _use_redis
            else _check_rate_limit_memory(rate_key, max_req, window)
        )

        if exceeded:
            logger.warning("Rate limit exceeded: ip=%s path=%s", _mask_ip(ip), path)
            return JSONResponse(
                status_code=429,
                content={"detail": "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."},
                headers={"Retry-After": str(window)},
            )

        return await call_next(request)
