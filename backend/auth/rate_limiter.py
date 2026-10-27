"""IP 기반 Rate Limiting 미들웨어

Redis 사용 가능 시 Redis sorted set 기반, 없으면 in-memory 폴백.
"""

import hmac
import logging
import os
import threading
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
# 서버 렌더(Vercel ISR) 전용 통 — 요청 머리 X-SSR-Key 가 env SSR_SHARED_KEY 와 같으면 IP 무관 전체 한 통 분당 300
# (세션 483 PR 3a · 설계 v2 O7). env 가 비면 기능 꺼짐 = 지금과 똑같음. 열쇠 값은 어디에도 찍지 않는다.
SSR_RATE_LIMIT = (300, 60)
SSR_RATE_KEY = "rl:ssr:all"

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


_SSR_TALLY_SEC = 3600
_ssr_tally = {"ok": 0, "bad": 0, "since": time.time()}
_ssr_tally_lock = threading.Lock()


def _ssr_key() -> str:
    """env 열쇠 — 앞뒤 공백 제거(붙여 넣다 끝 공백·줄바꿈이 섞여 조용히 일반 통으로 떨어지지 않게, 보완 F10)."""
    return os.getenv("SSR_SHARED_KEY", "").strip()


def _count_ssr(matched: bool) -> None:
    """열쇠 일치·불일치 횟수 — 한 시간에 한 번 한 줄 로그(값·길이 없이). 두 곳 열쇠가 어긋났는지 라이브에서 보는 길."""
    with _ssr_tally_lock:
        _ssr_tally["ok" if matched else "bad"] += 1
        now = time.time()
        if now - _ssr_tally["since"] < _SSR_TALLY_SEC:
            return
        ok, bad = _ssr_tally["ok"], _ssr_tally["bad"]
        _ssr_tally.update(ok=0, bad=0, since=now)
    logger.info("서버 렌더 열쇠 일치 %d · 불일치 %d (지난 1시간)", ok, bad)


def _is_ssr_request(request: Request) -> bool:
    """X-SSR-Key 머리가 SSR_SHARED_KEY 와 같은가 — env 가 비었거나 머리가 없으면 False. 비교는 hmac.compare_digest.

    둘 다 앞뒤 공백을 뗀 뒤 비교한다. 열쇠가 켜져 있고 머리가 왔을 때만 일치·불일치를 센다.
    """
    key = _ssr_key()
    if not key:
        return False
    given = (request.headers.get("x-ssr-key") or "").strip()
    if not given:
        return False
    matched = hmac.compare_digest(given.encode("utf-8"), key.encode("utf-8"))
    _count_ssr(matched)
    return matched


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

    def __init__(self, app, *args, **kwargs):
        super().__init__(app, *args, **kwargs)
        if _ssr_key():   # 켜질 때 한 줄(값·길이 없이) — 열쇠가 실제로 읽혔는지 라이브에서 확인하는 길(보완 F10)
            logger.info("서버 렌더 열쇠 설정됨 — 열쇠가 맞는 요청은 전용 통(분당 %d)", SSR_RATE_LIMIT[0])

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        if not path.startswith("/api/"):
            return await call_next(request)

        ip = _get_client_ip(request)
        started = time.perf_counter()

        rate_key = f"rl:{ip}:{path.split('/')[2] if len(path.split('/')) > 2 else 'api'}"
        if path == "/api/auth/login" or (path == "/api/signup" and request.method == "POST"):
            max_req, window = LOGIN_RATE_LIMIT
        elif _is_ssr_request(request):
            max_req, window = SSR_RATE_LIMIT
            rate_key = SSR_RATE_KEY
        else:
            max_req, window = RATE_LIMITS.get("/api/", (60, 60))

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
