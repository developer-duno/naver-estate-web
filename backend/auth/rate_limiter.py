"""IP 기반 Rate Limiting 미들웨어

Redis 사용 가능 시 Redis sorted set 기반, 없으면 in-memory 폴백.
"""

import logging
import os
import time
from collections import defaultdict

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from auth.audit import _mask_ip
from services import traffic_metrics

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
    """클라이언트 IP 추출 (Cloudflare Named Tunnel 전제).

    ⚠ X-Forwarded-For 는 신뢰하지 않는다 — 클라이언트가 임의로 위조할 수 있어
    rate-limit 버킷을 가짜 IP 로 분산시키는 429 우회 통로가 된다(세션 355 라이브 실측:
    위조 XFF 65회 → 전부 다른 버킷, 차단 0). Cloudflare 는 CF-Connecting-IP 를 실제
    접속 IP 로 **항상 덮어쓰므로**(클라이언트가 보내도 CF 가 재설정) 이것만 신뢰한다.
    터널을 안 거치는 로컬 직접 호출(watchdog 헬스체크 등)은 헤더가 없어 직접 연결
    IP(request.client.host) 로 폴백한다.
    """
    cf_ip = request.headers.get("cf-connecting-ip")
    if cf_ip:
        return cf_ip.strip()
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


def _traffic_identity(request: Request, ip: str) -> str:
    """트래픽 집계용 식별자 원문 (traffic_metrics 안에서 즉시 해시된다).

    로그인 사용자는 Authorization 토큰, 비로그인은 IP.

    ⚠ 미들웨어는 의존성 주입(get_current_user) 전이라 **검증된 user_id 를 알 수 없다**.
    미검증 JWT payload 의 sub 를 꺼내 쓰면 위조된 sub 가 집계에 섞인다. 토큰 문자열
    자체를 식별자로 삼으면 위조해도 "다른 방문자 1명"이 될 뿐 남을 사칭할 수 없고,
    같은 사람의 연속 요청은 같은 토큰이라 하나로 묶인다. 토큰은 저장되지 않는다
    (traffic_metrics._hash_identity 가 salt+SHA-256 앞 12자만 남긴다).
    토큰은 갱신되면(기본 1시간) 다른 식별자가 되므로 고유 방문자 수는 과대추정될 수
    있다 — 정확한 사용자 수가 아니라 "대략적인 활동 주체 수"로 읽어야 한다.
    """
    auth_header = request.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return f"u:{token}"
    return f"ip:{ip}"


def _record_traffic(request: Request, ip: str, status_code: int, started: float) -> None:
    """트래픽 계측 1건 기록 (best-effort).

    계측 실패가 실제 응답을 깨뜨려서는 안 되므로 흡수하되, **조용히 삼키지 않고**
    로그를 남긴다(관측 장치가 죽은 걸 관측할 수 없으면 의미가 없다).
    """
    try:
        elapsed_ms = (time.perf_counter() - started) * 1000
        traffic_metrics.record_request(
            path=request.url.path,
            status_code=status_code,
            duration_ms=elapsed_ms,
            identity_raw=_traffic_identity(request, ip),
        )
    except Exception:
        logger.warning("traffic_metrics 기록 실패 (요청 처리에는 영향 없음)", exc_info=True)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP 기반 Rate Limiting + 트래픽 계측.

    Redis 가용 시 분산 환경 지원, 불가 시 프로세스 단위 in-memory.

    트래픽 계측을 별도 미들웨어로 분리하지 않은 이유 = 이 미들웨어가 이미 모든
    `/api/` 요청이 반드시 지나는 길목이고 클라이언트 IP 추출까지 끝내 두기 때문.
    미들웨어를 하나 더 쌓으면 요청마다 ASGI 래핑이 한 겹 더 늘 뿐 얻는 게 없다.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        ip = _get_client_ip(request)
        started = time.perf_counter()

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
            # 차단된 요청도 계측한다 — 남용 감지에 가장 중요한 신호라 빠뜨리면 안 된다.
            _record_traffic(request, ip, 429, started)
            return JSONResponse(
                status_code=429,
                content={"detail": "요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요."},
                headers={"Retry-After": str(window)},
            )

        # unhandled 예외(진짜 500)도 계측해야 한다 — try 없이 두면 예외가 아래 줄을
        # 건너뛰어 **5xx 율이 구조적으로 항상 0** 이 된다(세션 398 적대검증이 TestClient 로
        # 재현: /api/boom 이 레코드에 아예 안 남고 total 도 1 로 집계). 오류율을 보려고 만든
        # 계측이 정작 진짜 오류를 못 보는 사각이라 반드시 예외 경로에서도 기록한 뒤 재전파한다.
        try:
            response = await call_next(request)
        except Exception:
            _record_traffic(request, ip, 500, started)
            raise
        _record_traffic(request, ip, response.status_code, started)
        return response
