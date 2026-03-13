"""의존성 주입 — DB 세션, 인증 검증, 역할 기반 접근 제어"""

import logging
import os
from typing import Generator

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from sqlalchemy.exc import IntegrityError

from db.database import SessionLocal
from db.models import UserProfile

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")

if not SUPABASE_JWT_SECRET and not SUPABASE_URL:
    logger.critical("SUPABASE_JWT_SECRET 또는 SUPABASE_URL 미설정 — JWT 인증이 작동하지 않습니다")


def get_db() -> Generator:
    """DB 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _verify_token_local(token: str) -> dict:
    """JWT secret으로 로컬 검증"""
    try:
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="유효하지 않은 토큰")
        return {"user_id": user_id, "email": payload.get("email", "")}
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="토큰 검증 실패")


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
        return {"user_id": user_id, "email": data.get("email", "")}
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

    # JWT secret이 있으면 로컬 검증, 없으면 Supabase API로 원격 검증
    if SUPABASE_JWT_SECRET:
        verified = _verify_token_local(token)
    else:
        verified = _verify_token_remote(token)

    user_id = verified["user_id"]
    email = verified["email"]

    # user_profiles 테이블에서 프로필 조회/자동 생성
    profile = db.get(UserProfile, user_id)
    if not profile:
        # 첫 로그인 시 프로필 자동 생성 (항상 일반 user 역할)
        try:
            profile = UserProfile(
                user_id=user_id,
                email=email,
                role="user",
                status="approved",
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

    return {
        "user_id": user_id,
        "email": profile.email,
        "role": profile.role,
        "status": profile.status,
        "daily_crawl_quota": profile.daily_crawl_quota,
        "daily_export_quota": profile.daily_export_quota,
    }


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


def get_admin_user(
    user: dict = Depends(get_current_user),
) -> dict:
    """관리자 전용 의존성 — role이 admin이 아니면 403"""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )
    return user
