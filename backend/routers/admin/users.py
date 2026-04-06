"""관리자 사용자 관리 라우트"""

import logging

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import UserProfile
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)


class UserUpdateRequest(BaseModel):
    role: str | None = None
    status: str | None = None
    approved_until: str | None = None  # ISO datetime 또는 null (무기한)
    daily_crawl_quota: int | None = None
    daily_export_quota: int | None = None


@router.get("/users")
def list_users(
    status: str | None = None,
    role: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """사용자 목록 (필터/페이지네이션)"""
    conditions = []
    if status:
        conditions.append(UserProfile.status == status)
    if role:
        conditions.append(UserProfile.role == role)

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(UserProfile).where(where)).scalar() or 0

    stmt = (
        select(UserProfile)
        .where(where)
        .order_by(UserProfile.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    users = db.execute(stmt).scalars().all()

    return {
        "items": [
            {
                "user_id": u.user_id,
                "email": u.email,
                "display_name": u.display_name,
                "role": u.role,
                "status": u.status,
                "daily_crawl_quota": u.daily_crawl_quota,
                "daily_export_quota": u.daily_export_quota,
                "approved_until": u.approved_until.isoformat() if u.approved_until else None,
                "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
                "login_count": u.login_count,
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "updated_at": u.updated_at.isoformat() if u.updated_at else None,
            }
            for u in users
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: str,
    body: UserUpdateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """사용자 역할/상태/쿼터 변경"""
    profile = db.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")

    changes = {}
    if body.role is not None and body.role in ("user", "admin", "expert"):
        changes["role"] = body.role
        profile.role = body.role
    if body.status is not None and body.status in ("pending", "approved", "rejected", "suspended"):
        changes["status"] = body.status
        profile.status = body.status
    if body.approved_until is not None:
        from datetime import datetime
        try:
            profile.approved_until = datetime.fromisoformat(body.approved_until) if body.approved_until else None
        except ValueError:
            raise HTTPException(status_code=400, detail="잘못된 날짜 형식 (ISO 8601)")
        changes["approved_until"] = body.approved_until
    if body.daily_crawl_quota is not None:
        changes["daily_crawl_quota"] = body.daily_crawl_quota
        profile.daily_crawl_quota = body.daily_crawl_quota
    if body.daily_export_quota is not None:
        changes["daily_export_quota"] = body.daily_export_quota
        profile.daily_export_quota = body.daily_export_quota

    if not changes:
        raise HTTPException(status_code=400, detail="변경 사항이 없습니다")

    log_action(db, admin["user_id"], "admin_user_update", "user", user_id, changes)
    db.commit()
    # 프로필 캐시 무효화 (role/status 즉시 반영)
    from deps import _user_cache
    _user_cache.delete(f"profile:{user_id}")
    return {"status": "updated", "changes": changes}


@router.delete("/users/{user_id}")
def suspend_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """사용자 비활성화 (soft delete: status='suspended')"""
    profile = db.get(UserProfile, user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    if profile.user_id == admin["user_id"]:
        raise HTTPException(status_code=400, detail="자기 자신을 정지할 수 없습니다")

    profile.status = "suspended"
    log_action(db, admin["user_id"], "admin_user_suspend", "user", user_id)
    db.commit()
    # 프로필 캐시 무효화 (정지 즉시 반영)
    from deps import _user_cache
    _user_cache.delete(f"profile:{user_id}")
    return {"status": "suspended"}
