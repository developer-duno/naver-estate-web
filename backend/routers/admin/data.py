"""관리자 데이터/감사/설정 관리 라우트"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import AdminSetting, Article, AuditLog, RateLimitCounter
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)


class SettingUpdateRequest(BaseModel):
    value: dict


@router.delete("/data/stale")
def delete_stale_data(
    days: int = Query(90, ge=30),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """오래된 비활성 매물 데이터 삭제"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        delete(Article)
        .where(and_(Article.is_active == False, Article.updated_at < cutoff))
    )
    result = db.execute(stmt)
    deleted = result.rowcount
    log_action(db, admin["user_id"], "admin_data_cleanup", details={"days": days, "deleted": deleted})
    db.commit()
    return {"deleted": deleted, "cutoff_days": days}


@router.get("/audit-logs")
def get_audit_logs(
    user_id: str | None = None,
    action: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """감사 로그 조회"""
    conditions = []
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(AuditLog).where(where)).scalar() or 0

    stmt = (
        select(AuditLog)
        .where(where)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = db.execute(stmt).scalars().all()

    return {
        "items": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "action": l.action,
                "target_type": l.target_type,
                "target_id": l.target_id,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs  # noqa: E741
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/settings")
def get_all_settings(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """전체 설정 조회"""
    settings = db.execute(select(AdminSetting)).scalars().all()
    return {
        "items": [
            {
                "key": s.key,
                "value": s.value,
                "updated_by": s.updated_by,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in settings
        ]
    }


@router.patch("/settings/{key}")
def update_setting(
    key: str,
    body: SettingUpdateRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """설정 값 변경 (없으면 생성)"""
    setting = db.get(AdminSetting, key)
    if setting:
        setting.value = body.value
        setting.updated_by = admin["user_id"]
        setting.updated_at = datetime.now(timezone.utc)
    else:
        setting = AdminSetting(
            key=key,
            value=body.value,
            updated_by=admin["user_id"],
        )
        db.add(setting)

    log_action(db, admin["user_id"], "admin_setting_update", "setting", key, body.value)
    db.commit()
    return {"status": "updated", "key": key}


@router.post("/cleanup/rate-limits")
def cleanup_rate_limits(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """만료된 Rate Limit 카운터 정리"""
    now = datetime.now(timezone.utc)
    stmt = delete(RateLimitCounter).where(RateLimitCounter.expires_at < now)
    result = db.execute(stmt)
    deleted = result.rowcount
    db.commit()
    return {"deleted": deleted}


@router.get("/quota-status")
def get_quota_status(
    admin: dict = Depends(get_admin_user),
):
    """오늘의 공공데이터 API 쿼터 현황 조회"""
    from crawler.quota_db import get_api_quota_status
    from db.database import SessionLocal

    return get_api_quota_status(SessionLocal)
