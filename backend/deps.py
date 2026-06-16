"""의존성 주입 — DB 세션, 인증 검증, 역할 기반 접근 제어"""

import logging
import os
from datetime import datetime, timezone
from typing import Generator

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
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

_ALLOWED_ALGORITHMS = ["HS256"]


def _check_jwt_secret():
    """서버 시작 시 JWT secret 유효성 자가진단"""
    if not SUPABASE_JWT_SECRET:
        return
    secret_len = len(SUPABASE_JWT_SECRET)
    logger.info("[AUTH] JWT secret 설정됨 (길이: %d)", secret_len)
    try:
        test_payload = {"sub": "_selftest", "aud": "authenticated"}
        token = jwt.encode(test_payload, SUPABASE_JWT_SECRET, algorithm=_ALLOWED_ALGORITHMS[0])
        jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=_ALLOWED_ALGORITHMS, audience="authenticated")
        logger.info("[AUTH] JWT secret 자가진단 통과 (HS256 라운드트립 성공)")
    except Exception as e:
        logger.error("[AUTH] JWT secret 자가진단 실패 — 로컬 검증이 작동하지 않을 수 있음: %s", e)


_check_jwt_secret()

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
    """JWT secret으로 로컬 검증. 실패 시 None 반환 (원격 폴백 허용)."""
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

    # Phase 2: 서명 + 클레임 검증
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=_ALLOWED_ALGORITHMS,
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
    verified = None
    if SUPABASE_JWT_SECRET:
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


def get_approved_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """승인된 사용자 전용 — pending/만료 시 403"""
    if user.get("email") in ADMIN_EMAILS:
        return user  # 관리자는 항상 통과
    if user.get("status") != "approved":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 승인이 필요합니다")
    approved_until = user.get("approved_until")
    if approved_until:
        expiry = datetime.fromisoformat(approved_until)
        # naive datetime 방어 — 기존 DB 에 offset 없이 박힌 approved_until 이 있으면
        # aware utcnow() 와 비교 시 TypeError(500) 발생. UTC aware 로 통일해 비교.
        # (저장 측 admin/users.py 도 aware 강제하나, 이미 박힌 행 보호용 이중 방어.)
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry < utcnow():
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="승인 기간이 만료되었습니다")
    return user


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
