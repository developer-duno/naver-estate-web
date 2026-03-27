"""관리자 API 라우터 — 사용자/크롤링/데이터/감사로그/설정 관리"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import (
    AdminSetting,
    Article,
    AuditLog,
    Complex,
    CrawlJob,
    RateLimitCounter,
    UserProfile,
)
from deps import get_admin_user, get_db

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Pydantic 모델 ──

class UserUpdateRequest(BaseModel):
    role: str | None = None
    status: str | None = None
    approved_until: str | None = None  # ISO datetime 또는 null (무기한)
    daily_crawl_quota: int | None = None
    daily_export_quota: int | None = None


class SettingUpdateRequest(BaseModel):
    value: dict


# ── 사용자 관리 ──

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


# ── 크롤링 관리 ──

@router.get("/crawl-jobs")
def list_crawl_jobs(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 목록"""
    conditions = []
    if status:
        conditions.append(CrawlJob.status == status)

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(CrawlJob).where(where)).scalar() or 0

    stmt = (
        select(CrawlJob)
        .where(where)
        .order_by(CrawlJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    jobs = db.execute(stmt).scalars().all()

    return {
        "items": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/crawl-jobs/{job_id}/cancel")
def cancel_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 취소"""
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="취소할 수 없는 상태입니다")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    log_action(db, admin["user_id"], "admin_crawl_cancel", "crawl_job", str(job_id))
    db.commit()
    return {"status": "cancelled"}


# ── 상세 통계 ──

@router.get("/stats/detailed")
def get_detailed_stats(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """상세 통계 (관리자용)"""
    complex_count = db.execute(select(func.count()).select_from(Complex)).scalar() or 0
    article_count = db.execute(
        select(func.count()).select_from(Article).where(Article.is_active == True)
    ).scalar() or 0
    total_article_count = db.execute(select(func.count()).select_from(Article)).scalar() or 0
    user_count = db.execute(select(func.count()).select_from(UserProfile)).scalar() or 0

    # 오늘 크롤 수
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_crawl_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(CrawlJob.created_at >= today_start)
    ).scalar() or 0

    # 24시간 에러 수
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    error_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(
            and_(CrawlJob.status == "failed", CrawlJob.created_at >= yesterday)
        )
    ).scalar() or 0

    # 최근 5개 크롤 작업
    recent_jobs = db.execute(
        select(CrawlJob).order_by(CrawlJob.created_at.desc()).limit(5)
    ).scalars().all()

    # 마지막 크롤 시각
    last_crawl = db.execute(
        select(func.max(CrawlJob.completed_at)).where(CrawlJob.status == "completed")
    ).scalar()

    return {
        "complex_count": complex_count,
        "article_count": article_count,
        "total_article_count": total_article_count,
        "active_article_count": article_count,
        "user_count": user_count,
        "today_crawl_count": today_crawl_count,
        "error_count_24h": error_count,
        "last_crawl_at": last_crawl.isoformat() if last_crawl else None,
        "recent_crawl_jobs": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in recent_jobs
        ],
    }


# ── 데이터 관리 ──

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


# ── 감사 로그 ──

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


# ── 설정 관리 ──

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


# ── Rate Limit 카운터 정리 (만료된 항목 삭제) ──

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
