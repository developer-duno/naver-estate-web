"""사용자 프로필 API 라우터"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from deps import get_db, get_current_user
from db.models import UserProfile

router = APIRouter()


@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """현재 로그인 사용자 프로필 조회"""
    profile = db.get(UserProfile, user["user_id"])
    if not profile:
        return user  # 프로필이 없으면 JWT 정보만 반환

    return {
        "user_id": profile.user_id,
        "email": profile.email,
        "display_name": profile.display_name,
        "role": profile.role,
        "status": profile.status,
        "daily_crawl_quota": profile.daily_crawl_quota,
        "daily_export_quota": profile.daily_export_quota,
        "last_login_at": profile.last_login_at.isoformat() if profile.last_login_at else None,
        "login_count": profile.login_count,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
    }


@router.post("/login-record")
def record_login(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """로그인 기록 업데이트 (프론트엔드에서 로그인 성공 후 호출)"""
    profile = db.get(UserProfile, user["user_id"])
    if profile:
        profile.last_login_at = datetime.now(timezone.utc)
        profile.login_count = (profile.login_count or 0) + 1
        db.commit()
    return {"status": "recorded"}
