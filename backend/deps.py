"""의존성 주입 — DB 세션, 인증 검증, 역할 기반 접근 제어"""

import logging
import os
from datetime import datetime, timezone
from typing import Generator

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import UserProfile
from services.cache import TTLCache
from utils import utcnow

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ADMIN_EMAILS = set(filter(None, os.getenv("ADMIN_EMAIL", "").split(",")))
if not ADMIN_EMAILS:
    logger.warning("[AUTH] ADMIN_EMAIL 환경변수 미설정 — 관리자 접근이 차단됩니다")

if not SUPABASE_JWT_SECRET and not SUPABASE_URL:
    logger.critical("SUPABASE_JWT_SECRET 또는 SUPABASE_URL 미설정 — JWT 인증이 작동하지 않습니다")

# HS256 = 레거시 대칭키(SUPABASE_JWT_SECRET). ES256 = 2026-09-09 Supabase 비대칭 서명키 전환분(JWKS).
# 전환 후에도 옛 HS256 토큰은 만료 전까지 유효하므로 두 경로를 함께 유지한다.
_ALLOWED_ALGORITHMS = ["HS256", "ES256"]

# JWKS 원격 조회 클라이언트 (지연 생성 싱글턴).
# PyJWKClient 가 키셋을 lifespan 초 동안 캐시하므로 요청마다 나가지 않는다
# (Supabase 공식 권장: 서버는 JWKS 로 로컬 검증, Auth 서버를 핫패스에 두지 말 것).
_JWKS_LIFESPAN_SECONDS = 600  # 공식 권장 10분
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient | None:
    """JWKS 클라이언트 싱글턴. SUPABASE_URL 미설정이면 None (ES256 검증 불가)."""
    global _jwks_client
    if not SUPABASE_URL:
        return None
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json",
            cache_keys=True,
            lifespan=_JWKS_LIFESPAN_SECONDS,
            timeout=5,
        )
    return _jwks_client


def _check_jwt_secret():
    """서버 시작 시 JWT secret 유효성 자가진단"""
    if not SUPABASE_JWT_SECRET:
        return
    secret_len = len(SUPABASE_JWT_SECRET)
    logger.info("[AUTH] JWT secret 설정됨 (길이: %d)", secret_len)
    try:
        test_payload = {"sub": "_selftest", "aud": "authenticated"}
        token = jwt.encode(test_payload, SUPABASE_JWT_SECRET, algorithm="HS256")
        jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
        logger.info("[AUTH] JWT secret 자가진단 통과 (HS256 라운드트립 성공)")
    except Exception as e:
        logger.error("[AUTH] JWT secret 자가진단 실패 — 로컬 검증이 작동하지 않을 수 있음: %s", e)


_check_jwt_secret()
# 부팅 로그로 새 코드 반영 여부를 판별하는 관례 (release.md §2 — zombie cross-check).
logger.info("[AUTH] 허용 알고리즘: HS256(secret) + ES256(JWKS)")

# 사용자 프로필 캐시 (5분 TTL — role/status 변경 시 admin.py에서 무효화)
_user_cache = TTLCache(ttl=300, max_size=200)


def get_db() -> Generator:
    """DB 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _verify_token_local(token: str) -> dict | None:
    """토큰을 로컬 검증. 실패 시 None 반환 (원격 폴백 허용).

    두 서명 방식을 모두 로컬에서 처리한다:
    - HS256: 레거시 대칭키(SUPABASE_JWT_SECRET). 비대칭 전환 전 발급분이 만료될 때까지 유효.
    - ES256: 2026-09-09 Supabase 비대칭 서명키 전환분. JWKS 공개키로 검증(10분 캐시).

    ES256 을 여기서 처리하지 않으면 매 요청이 _verify_token_remote(GoTrue /auth/v1/user)로
    폴백해 요청당 +0.3~0.5초가 붙는다 (세션 395 라이브 실측).
    """
    # Phase 1: 토큰 헤더 알고리즘 검사
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        logger.warning("[AUTH] JWT 헤더 파싱 실패 (잘못된 토큰 형식)")
        return None

    token_alg = header.get("alg", "unknown")
    if token_alg not in _ALLOWED_ALGORITHMS:
        logger.warning("[AUTH] JWT 알고리즘 불일치: 토큰=%s, 서버=%s", token_alg, _ALLOWED_ALGORITHMS)
        return None

    # Phase 1-b: 알고리즘별 검증 키 확보
    if token_alg == "ES256":
        client = _get_jwks_client()
        if client is None:
            logger.warning("[AUTH] ES256 토큰이나 SUPABASE_URL 미설정 — JWKS 검증 불가")
            return None
        try:
            key = client.get_signing_key_from_jwt(token).key
        except jwt.PyJWKClientError as e:
            # kid 미매칭·JWKS 응답 이상 등 (키 회전 직후 일시적일 수 있음 → 원격 폴백)
            logger.warning("[AUTH] JWKS 서명키 조회 실패 (kid 미매칭 등): %s", e)
            return None
        except Exception as e:
            # 네트워크·타임아웃 등 (PyJWKClient 는 urllib 예외를 그대로 올릴 수 있음)
            logger.warning("[AUTH] JWKS 조회 중 오류 (네트워크 등): %s", e)
            return None
        decode_key = key
        decode_algorithms = ["ES256"]
    else:
        decode_key = SUPABASE_JWT_SECRET
        decode_algorithms = ["HS256"]

    # Phase 2: 서명 + 클레임 검증
    try:
        payload = jwt.decode(
            token,
            decode_key,
            algorithms=decode_algorithms,
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            logger.warning("[AUTH] JWT에 sub 클레임 없음")
            return None
        return {
            "user_id": user_id,
            "email": payload.get("email", ""),
            "user_metadata": payload.get("user_metadata") or {},
        }
    except jwt.ExpiredSignatureError:
        logger.info("[AUTH] JWT 만료됨 (정상 — 토큰 갱신 필요)")
        return None
    except (jwt.InvalidAudienceError, jwt.MissingRequiredClaimError) as e:
        logger.warning("[AUTH] JWT 클레임 불일치 (audience 등): %s", e)
        return None
    except jwt.InvalidSignatureError as e:
        logger.warning("[AUTH] JWT 서명 검증 실패 (secret 불일치): %s", e)
        return None
    except jwt.PyJWTError as e:
        logger.warning("[AUTH] JWT 검증 실패 (기타): %s", e)
        return None


def _verify_token_remote(token: str) -> dict:
    """Supabase GoTrue API로 원격 검증 (JWT secret 미설정 시 폴백)"""
    if not SUPABASE_URL:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="인증 서비스 미설정",
        )
    try:
        resp = httpx.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_SERVICE_KEY,
            },
            timeout=5.0,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰 검증 실패")
        data = resp.json()
        user_id = data.get("id")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰")
        return {
            "user_id": user_id,
            "email": data.get("email", ""),
            "user_metadata": data.get("user_metadata") or {},
        }
    except httpx.HTTPError:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="인증 서비스 연결 실패")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict:
    """Supabase JWT 토큰 검증 + user_profiles 테이블에서 역할/상태/쿼터 조회.

    반환: {user_id, email, role, status, daily_crawl_quota, daily_export_quota}
    """
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="인증이 필요합니다")

    token = credentials.credentials

    # 1) 로컬 검증 시도 (빠름), 2) 실패 시 원격 검증 폴백
    # HS256 은 secret, ES256 은 JWKS(SUPABASE_URL) 로 검증하므로 둘 중 하나만 있어도 로컬 시도.
    # (secret 만 보고 게이트하면, 레거시 secret 을 제거한 뒤 ES256 이 매번 원격으로 새어 나간다.)
    verified = None
    if SUPABASE_JWT_SECRET or SUPABASE_URL:
        verified = _verify_token_local(token)
    if verified is None and SUPABASE_URL:
        verified = _verify_token_remote(token)
    if verified is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰 검증 실패")

    user_id = verified["user_id"]
    email = verified["email"]
    meta = verified.get("user_metadata") or {}

    # 캐시 확인 (5분 TTL — admin에서 role/status 변경 시 무효화)
    cached_profile = _user_cache.get(f"profile:{user_id}")
    if cached_profile is not None:
        return cached_profile

    # user_profiles 테이블에서 프로필 조회/자동 생성
    profile = db.get(UserProfile, user_id)
    if not profile:
        # 첫 로그인 시 프로필 자동 생성
        is_admin = email in ADMIN_EMAILS
        try:
            profile = UserProfile(
                user_id=user_id,
                email=email,
                role="admin" if is_admin else "user",
                status="approved" if is_admin else "pending",
                agree_marketing=bool(meta.get("agree_marketing", False)),
            )
            db.add(profile)
            db.commit()
            db.refresh(profile)
        except IntegrityError:
            # 동시 로그인으로 이미 생성된 경우 롤백 후 재조회
            db.rollback()
            profile = db.get(UserProfile, user_id)
            if not profile:
                raise HTTPException(status_code=500, detail="프로필 생성 실패")

    # 정지된 계정 차단
    if profile.status == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="계정이 정지되었습니다")

    result = {
        "user_id": user_id,
        "email": profile.email,
        "role": profile.role,
        "status": profile.status,
        "approved_until": profile.approved_until.isoformat() if profile.approved_until else None,
        "paid_until": profile.paid_until.isoformat() if profile.paid_until else None,
        "daily_crawl_quota": profile.daily_crawl_quota,
        "daily_export_quota": profile.daily_export_quota,
    }
    _user_cache.set(f"profile:{user_id}", result)
    return result


def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> dict | None:
    """선택적 인증 — 로그인 안 해도 접근 가능하지만 로그인 시 추가 기능"""
    if not credentials:
        return None
    try:
        return get_current_user(credentials, db)
    except HTTPException:
        return None


def _not_expired(iso: str | None) -> bool:
    """ISO 만료일이 아직 안 지났는지. naive datetime 방어 포함.

    ⚠ None 은 호출처가 의미를 정한다 — 이 함수는 '값이 있으면 미래인가'만 본다.
      approved_until=None(무기한 무료)과 paid_until=None(유료 이력 없음)은 의미가 정반대라
      None 처리를 여기서 하지 않고 get_approved_user 가 분기한다.

    naive datetime — DB 에 offset 없이 박힌 값이 있으면 aware utcnow() 와 비교 시
    TypeError(500). UTC aware 로 통일. (저장 측도 aware 강제하나 이중 방어.)
    """
    if iso is None:
        return False
    expiry = datetime.fromisoformat(iso)
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry >= utcnow()


def get_approved_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """승인된 사용자 전용 — pending 또는 (무료 승인·유료 이용권 모두 만료) 시 403.

    게이트 통과 = status=approved AND (무료 무기한 승인 OR approved_until 유효 OR paid_until 유효).
    - approved_until=None: 무기한 무료 승인 → 통과 (verify.py V-WORLD 매칭·관리자 승인 흐름).
    - approved_until=미래: 관리자 기한부 승인 유효 → 통과.
    - paid_until=미래: 유료 이용권 유효 → 통과.
    셋 중 하나라도 만족하면 OK. paid_until=None 은 '유료 이력 없음'이라 통과 근거가 아니다
    (approved_until=None '무기한 무료'와 의미 정반대 — _not_expired 가 None 처리 안 하고 여기서 분기).
    """
    if user.get("email") in ADMIN_EMAILS:
        return user  # 관리자는 항상 통과
    if user.get("status") != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 승인이 필요합니다")
    approved_until = user.get("approved_until")
    free_unlimited = approved_until is None  # 무료 무기한 승인 (관리자 기한 미설정)
    if free_unlimited or _not_expired(approved_until) or _not_expired(user.get("paid_until")):
        return user
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="승인 기간이 만료되었습니다")


def get_admin_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """관리자 전용 의존성 — role이 admin이거나 관리자 이메일이면 통과"""
    if user.get("role") != "admin" and user.get("email") not in ADMIN_EMAILS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )
    return user
