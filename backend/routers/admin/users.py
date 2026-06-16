"""관리자 사용자 관리 라우트 — 사용자 + 검증 심사"""

import logging
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import AgentVerification, UserProfile
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
                "agree_marketing": u.agree_marketing,
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
        try:
            parsed = datetime.fromisoformat(body.approved_until) if body.approved_until else None
        except ValueError:
            raise HTTPException(status_code=400, detail="잘못된 날짜 형식 (ISO 8601)")
        # offset 없는 ISO(naive)면 UTC aware 로 통일 — 비교 측(get_approved_user)이
        # aware utcnow() 와 비교하므로 naive 저장 시 TypeError(500) 발생 (timezone-consistency).
        if parsed is not None and parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        profile.approved_until = parsed
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


# ── 검증 심사 ──


@router.get("/verifications")
def list_verifications(
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """검증 신청 목록 (관리자용)"""
    conditions = []
    if status:
        conditions.append(AgentVerification.verification_status == status)

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(AgentVerification).where(where)).scalar() or 0

    stmt = (
        select(AgentVerification)
        .where(where)
        .order_by(AgentVerification.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = db.execute(stmt).scalars().all()

    # 이메일 조회를 위해 user_ids 일괄 조회
    user_ids = [v.user_id for v in items]
    email_map: dict[str, str] = {}
    if user_ids:
        profiles = db.execute(select(UserProfile).where(UserProfile.user_id.in_(user_ids))).scalars().all()
        email_map = {p.user_id: p.email for p in profiles}

    # 자격증 서류 signed URL 생성
    from services.storage import create_signed_url
    doc_url_map: dict[str, str | None] = {}
    for v in items:
        doc_url_map[v.user_id] = create_signed_url(v.license_doc_path) if v.license_doc_path else None

    return {
        "items": [
            {
                "id": v.id,
                "user_id": v.user_id,
                "email": email_map.get(v.user_id, ""),
                "license_number": v.license_number,
                "business_number": v.business_number,
                "office_name": v.office_name,
                "representative_name": v.representative_name,
                "phone": v.phone,
                "business_verified": v.business_verified,
                "broker_verified": v.broker_verified,
                "broker_jurirno": v.broker_jurirno,
                "broker_status": v.broker_status,
                "license_verified": v.license_verified,
                "license_doc_url": doc_url_map.get(v.user_id),
                "verification_status": v.verification_status,
                "rejection_reason": v.rejection_reason,
                "submitted_at": v.submitted_at.isoformat() if v.submitted_at else None,
                "reviewed_at": v.reviewed_at.isoformat() if v.reviewed_at else None,
            }
            for v in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/verifications/{verification_id}/approve")
def approve_verification(
    verification_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """검증 승인 — role=expert, status=approved 자동 변경"""
    v = db.get(AgentVerification, verification_id)
    if not v:
        raise HTTPException(status_code=404, detail="검증 신청을 찾을 수 없습니다")
    if v.verification_status != "pending":
        raise HTTPException(status_code=409, detail="이미 처리된 검증 신청입니다")

    v.verification_status = "approved"
    v.reviewed_by = admin["user_id"]
    v.reviewed_at = datetime.now(timezone.utc)

    profile = db.get(UserProfile, v.user_id)
    if profile:
        profile.role = "expert"
        profile.status = "approved"

    log_action(db, admin["user_id"], "admin_verify_approve", "verification", str(verification_id))
    db.commit()

    from deps import _user_cache
    _user_cache.delete(f"profile:{v.user_id}")

    # 승인 이메일 알림 (best-effort)
    if profile and profile.email:
        from services.email import build_approval_email, send_email
        subj, html = build_approval_email(profile.email)
        send_email(profile.email, subj, html)

    return {"status": "approved"}


class RejectRequest(BaseModel):
    reason: str = Field(..., max_length=500)


@router.patch("/verifications/{verification_id}/reject")
def reject_verification(
    verification_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """검증 거부 — 사유 필수"""
    v = db.get(AgentVerification, verification_id)
    if not v:
        raise HTTPException(status_code=404, detail="검증 신청을 찾을 수 없습니다")
    if v.verification_status != "pending":
        raise HTTPException(status_code=409, detail="이미 처리된 검증 신청입니다")
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="거부 사유를 입력해주세요")

    v.verification_status = "rejected"
    v.rejection_reason = body.reason.strip()
    v.reviewed_by = admin["user_id"]
    v.reviewed_at = datetime.now(timezone.utc)

    log_action(db, admin["user_id"], "admin_verify_reject", "verification", str(verification_id), {"reason": body.reason})
    db.commit()

    # 거부 이메일 알림 (best-effort)
    user_profile = db.get(UserProfile, v.user_id)
    if user_profile and user_profile.email:
        from services.email import build_rejection_email, send_email
        subj, html = build_rejection_email(user_profile.email, body.reason.strip())
        send_email(user_profile.email, subj, html)

    return {"status": "rejected"}
