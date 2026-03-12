"""IP 기반 Rate Limiting 미들웨어"""

import logging
import time
from collections import defaultdict

from auth.audit import _mask_ip

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# 인메모리 IP별 요청 카운터 (프로세스 단위)
# TODO: Redis 기반으로 전환하여 다중 워커/서버 재시작 시에도 카운터 유지
_ip_counters: dict[str, list[float]] = defaultdict(list)

# Rate limit 정책
RATE_LIMITS = {
    # path_prefix: (max_requests, window_seconds)
    "/api/": (60, 60),  # 미인증 기본: 60/분
}

LOGIN_RATE_LIMIT = (5, 300)  # 로그인: 5/5분


def _get_client_ip(request: Request) -> str:
    """클라이언트 IP 추출 (프록시 고려).

    X-Forwarded-For: "client, proxy1, proxy2" 형태.
    공격자가 헤더를 조작해도 리버스 프록시가 마지막에 추가한 IP는 신뢰 가능.
    단일 프록시 환경: 뒤에서 첫 번째가 실제 클라이언트.
    다중 프록시 환경: 뒤에서 두 번째가 실제 클라이언트.
    """
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",")]
        if len(parts) == 1:
            return parts[0]
        # 다중 프록시: 뒤에서 두 번째 = 프록시가 기록한 클라이언트 IP
        return parts[-2]
    if request.client:
        return request.client.host
    return "unknown"


def _clean_old_entries(entries: list[float], window: float) -> list[float]:
    """윈도우 밖의 오래된 타임스탬프 제거"""
    cutoff = time.time() - window
    return [t for t in entries if t > cutoff]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP 기반 Rate Limiting.

    인증된 사용자(admin)는 제한 없음.
    인증된 일반 사용자는 2배 한도.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # 헬스체크, 정적 파일은 제외
        if not path.startswith("/api/"):
            return await call_next(request)

        ip = _get_client_ip(request)

        # 인증 여부와 관계없이 동일한 Rate Limit 적용
        # (토큰 유효성 검증은 엔드포인트 레벨에서 처리)
        multiplier = 1

        # 로그인 엔드포인트 특별 처리
        if path == "/api/auth/login" or (path == "/api/signup" and request.method == "POST"):
            max_req, window = LOGIN_RATE_LIMIT
        else:
            max_req, window = RATE_LIMITS.get("/api/", (60, 60))

        max_req *= multiplier
        rate_key = f"{ip}:{path.split('/')[2] if len(path.split('/')) > 2 else 'api'}"

        _ip_counters[rate_key] = _clean_old_entries(_ip_counters[rate_key], window)

        # 빈 리스트면 키 삭제 — 메모리 누수 방지
        if not _ip_counters[rate_key]:
            del _ip_counters[rate_key]
            return await call_next(request)

        if len(_ip_counters[rate_key]) >= max_req:
            logger.warning("Rate limit exceeded: ip=%s path=%s", _mask_ip(ip), path)
            return JSONResponse(
                status_code=429,
                content={"detail": "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."},
                headers={"Retry-After": str(window)},
            )

        _ip_counters[rate_key].append(time.time())
        return await call_next(request)
