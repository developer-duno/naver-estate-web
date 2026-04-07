"""공인중개사 검증 신청 라우트 — 사용자용"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.audit import log_action
from crawler.business_api import verify_business_registration
from db.models import AgentVerification, UserProfile
from deps import get_current_user, get_db

logger = logging.getLogger(__name__)
router = APIRouter()

BUSINESS_NUMBER_RE = re.compile(r"^\d{10}$")


class VerifySubmitRequest(BaseModel):
    license_number: str = ""
    business_number: str
    office_name: str = ""
    representative_name: str

    @field_validator("business_number")
    @classmethod
    def validate_business_number(cls, v: str) -> str:
        clean = v.replace("-", "").strip()
        if not BUSINESS_NUMBER_RE.match(clean):
            raise ValueError("사업자등록번호는 10자리 숫자여야 합니다")
        return clean

    @field_validator("representative_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("대표자명은 필수입니다")
        return v


@router.post("/submit")
def submit_verification(
    body: VerifySubmitRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """중개사 검증 신청 — 사업자등록 자동 검증 + 저장"""
    user_id = user["user_id"]

    # 중복 신청 방지
    existing = db.execute(
        select(AgentVerification).where(AgentVerification.user_id == user_id)
    ).scalar_one_or_none()
    if existing:
        if existing.verification_status == "rejected":
            # 거부된 경우 재신청 허용 — 기존 레코드 업데이트
            existing.license_number = body.license_number or None
            existing.business_number = body.business_number
            existing.office_name = body.office_name or None
            existing.representative_name = body.representative_name
            existing.verification_status = "pending"
            existing.rejection_reason = None
            existing.reviewed_by = None
            existing.reviewed_at = None
            existing.business_verified = False
        else:
            raise HTTPException(status_code=409, detail="이미 검증 신청이 존재합니다")
    else:
        existing = AgentVerification(
            user_id=user_id,
            license_number=body.license_number or None,
            business_number=body.business_number,
            office_name=body.office_name or None,
            representative_name=body.representative_name,
        )
        db.add(existing)

    # 국세청 사업자등록 진위확인
    biz_result = verify_business_registration(body.business_number, body.representative_name)
    existing.business_verified = biz_result["valid"] is True

    # 자동 승인: 사업자등록 확인됨
    auto_approved = False
    if existing.business_verified:
        existing.verification_status = "approved"
        profile = db.get(UserProfile, user_id)
        if profile:
            profile.role = "expert"
            profile.status = "approved"
        auto_approved = True

    log_action(db, user_id, "verify_submit", "verification", user_id, {
        "business_verified": existing.business_verified,
        "auto_approved": auto_approved,
    })
    db.commit()

    # 캐시 무효화
    if auto_approved:
        from deps import _user_cache
        _user_cache.delete(f"profile:{user_id}")

    return {
        "status": "approved" if auto_approved else "pending",
        "business_verified": existing.business_verified,
        "business_message": biz_result["message"],
        "auto_approved": auto_approved,
    }


@router.get("/status")
def get_verification_status(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """내 검증 상태 조회"""
    v = db.execute(
        select(AgentVerification).where(AgentVerification.user_id == user["user_id"])
    ).scalar_one_or_none()

    if not v:
        return {"submitted": False}

    return {
        "submitted": True,
        "verification_status": v.verification_status,
        "business_verified": v.business_verified,
        "license_verified": v.license_verified,
        "rejection_reason": v.rejection_reason,
        "submitted_at": v.submitted_at.isoformat() if v.submitted_at else None,
        "reviewed_at": v.reviewed_at.isoformat() if v.reviewed_at else None,
    }
