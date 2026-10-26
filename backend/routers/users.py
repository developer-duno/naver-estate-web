"""사용자 프로필 API 라우터"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.models import UserProfile
from deps import get_current_user, get_db, is_approved_user

router = APIRouter()


@router.get("/me")
def get_my_profile(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """현재 로그인 사용자 프로필 조회"""
    profile = db.get(UserProfile, user["user_id"])
    # 승인 중개사인가 — BE 승인 게이트(get_approved_user)와 같은 판정. 프런트 자동 새로 받기 가드가 본다(세션 481)
    is_approved_broker = is_approved_user(user)
    if not profile:
        return {**user, "is_approved_broker": is_approved_broker}  # 프로필이 없으면 JWT 정보만 반환

    return {
        "is_approved_broker": is_approved_broker,
        "user_id": profile.user_id,
        "email": profile.email,
        "display_name": profile.display_name,
        "role": profile.role,
        "status": profile.status,
        "daily_crawl_quota": profile.daily_crawl_quota,
        "daily_export_quota": profile.daily_export_quota,
        "last_login_at": profile.last_login_at.isoformat() if profile.last_login_at else None,
        "login_count": profile.login_count,
        "paid_until": profile.paid_until.isoformat() if profile.paid_until else None,
        "created_at": profile.created_at.isoformat() if profile.created_at else None,
        "updated_at": profile.updated_at.isoformat() if profile.updated_at else None,
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
