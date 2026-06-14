"""공인중개사 검증 신청 라우트 — 사용자용"""

import logging
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from auth.audit import log_action
from crawler.business_api import check_business_status, verify_business_registration
from crawler.vworld_client import search_broker_office
from db.models import AgentVerification, UserProfile
from deps import get_current_user, get_db
from services.storage import upload_license_doc

logger = logging.getLogger(__name__)
router = APIRouter()

BUSINESS_NUMBER_RE = re.compile(r"^\d{10}$")
START_DATE_RE = re.compile(r"^\d{8}$")
PHONE_RE = re.compile(r"^\d{9,11}$")  # 연락처 9~11자리 (선택 입력)

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}


class VerifySubmitRequest(BaseModel):
    business_number: str
    office_name: str  # 중개사무소 상호 — V-WORLD 중개사 대조 키 (필수, V034)
    representative_name: str
    start_date: str  # 개업일자 YYYYMMDD — 국세청 validate 필수 (없으면 항상 500)
    phone: str = ""  # 연락처 — 선택 입력 (B2B 가입 마찰 최소화)

    @field_validator("business_number")
    @classmethod
    def validate_business_number(cls, v: str) -> str:
        clean = v.replace("-", "").strip()
        if not BUSINESS_NUMBER_RE.match(clean):
            raise ValueError("사업자등록번호는 10자리 숫자여야 합니다")
        return clean

    @field_validator("office_name")
    @classmethod
    def validate_office_name(cls, v: str) -> str:
        # V-WORLD 중개사 대조에 상호가 필요 — 필수 (국토부 등록 상호와 같아야 자동인증)
        v = v.strip()
        if not v:
            raise ValueError("중개사무소명은 필수입니다")
        return v

    @field_validator("representative_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("대표자명은 필수입니다")
        return v

    @field_validator("start_date")
    @classmethod
    def validate_start_date(cls, v: str) -> str:
        # 국세청 validate API 는 b_no·p_nm·start_dt 3필드 전부 필수 (세션 304 라이브 실측)
        clean = v.replace("-", "").strip()
        if not START_DATE_RE.match(clean):
            raise ValueError("개업일자는 YYYYMMDD 8자리 숫자여야 합니다")
        return clean

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # 선택 입력 — 빈값 허용. 입력 시 하이픈·공백 제거 후 9~11자리 숫자 검증.
        clean = v.replace("-", "").replace(" ", "").strip()
        if not clean:
            return ""
        if not PHONE_RE.match(clean):
            raise ValueError("연락처는 9~11자리 숫자여야 합니다")
        return clean


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
            existing.business_number = body.business_number
            existing.office_name = body.office_name or None
            existing.representative_name = body.representative_name
            existing.phone = body.phone or None
            existing.verification_status = "pending"
            existing.rejection_reason = None
            existing.reviewed_by = None
            existing.reviewed_at = None
            existing.business_verified = False
            existing.license_verified = False
            existing.broker_verified = False
            existing.broker_jurirno = None
            existing.broker_status = None
        else:
            raise HTTPException(status_code=409, detail="이미 검증 신청이 존재합니다")
    else:
        existing = AgentVerification(
            user_id=user_id,
            business_number=body.business_number,
            office_name=body.office_name or None,
            representative_name=body.representative_name,
            phone=body.phone or None,
        )
        db.add(existing)

    # 국세청 사업자등록 진위확인 (b_no·p_nm·start_dt 3필드 전부 전달 — 누락 시 500)
    biz_result = verify_business_registration(
        body.business_number, body.representative_name, body.start_date
    )
    existing.business_verified = biz_result["valid"] is True

    # 영업상태 게이트 — 진위확인(validate) 통과 시에만 status 조회 (실패면 어차피 pending)
    # b_stt_cd: "01" 계속 / "02" 휴업 / "03" 폐업 / "" 미등록 / None 조회실패
    biz_status = check_business_status(body.business_number) if existing.business_verified else None
    biz_message = biz_result["message"]

    auto_approved = False
    broker = None  # V-WORLD 대조 결과 (audit 기록용)
    if existing.business_verified:
        if biz_status in ("02", "03"):
            # 휴업·폐업 = expert 부적격 (진위는 맞지만 영업 안 함). rejected + 사유 안내.
            existing.verification_status = "rejected"
            existing.rejection_reason = (
                "국세청에 휴업/폐업 상태로 등록된 사업자입니다. "
                "영업 중인 사업자등록번호로만 인증할 수 있어요."
            )
            biz_message = existing.rejection_reason
        elif biz_status == "":
            # 미등록 = validate 통과인데 영업상태 미등록 (모순) → 수동심사(pending 유지)
            biz_message = "사업자 영업상태 확인이 필요해 관리자 심사 후 안내드립니다."
        else:
            # "01" 계속 또는 None(조회실패) → 국세청 진위확인 통과. 추가로 V-WORLD 중개사 대조.
            # 국세청은 "사업자 진위 + 영업중"만 확인 → 식당·카페도 통과. V-WORLD 로 "진짜 중개사무소"
            # 인지까지 확인해야 가짜 자동승인을 막는다. 매칭+영업중일 때만 자동 승인.
            broker = search_broker_office(body.office_name, body.representative_name)
            if broker and broker["matched"] and broker["active"]:
                # 진짜 중개사무소 + 영업중 → 자동 승인
                existing.broker_verified = True
                existing.broker_jurirno = broker["jurirno"]
                existing.broker_status = broker["status_name"]
                existing.verification_status = "approved"
                profile = db.get(UserProfile, user_id)
                if profile:
                    profile.role = "expert"
                    profile.status = "approved"
                auto_approved = True
            else:
                # 미매칭 / 휴폐업 중개사 / V-WORLD 조회실패(None) → 자동승인 보류(pending), 관리자 수동심사.
                # rejected 가 아닌 pending 인 이유: 상호 표기차·신규개업 미반영 등 false negative 방어
                # (진짜 중개사가 막히는 손해 > 가짜가 수동심사로 넘어가는 손해).
                existing.broker_verified = False
                existing.broker_status = (broker["status_name"] if broker and broker["matched"]
                                          else "국토부 미매칭")
                biz_message = (
                    "사업자등록은 확인됐어요. 중개사무소 등록 확인을 위해 "
                    "관리자 심사 후 안내드립니다."
                )

    log_action(db, user_id, "verify_submit", "verification", user_id, {
        "business_verified": existing.business_verified,
        "business_status_code": biz_status,
        "broker_matched": bool(broker and broker["matched"]) if broker is not None else None,
        "broker_status": broker["status_name"] if broker and broker["matched"] else None,
        "auto_approved": auto_approved,
        "phone": body.phone or None,
    })
    db.commit()

    # 캐시 무효화
    if auto_approved:
        from deps import _user_cache
        _user_cache.delete(f"profile:{user_id}")

    return {
        "status": existing.verification_status if existing.business_verified else "pending",
        "business_verified": existing.business_verified,
        "business_message": biz_message,
        "business_status_code": biz_status,
        "auto_approved": auto_approved,
    }


@router.post("/upload-license")
async def upload_license(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """자격증 서류 업로드 — Supabase Storage에 저장"""
    user_id = user["user_id"]

    # 검증 신청 존재 확인
    v = db.execute(
        select(AgentVerification).where(AgentVerification.user_id == user_id)
    ).scalar_one_or_none()
    if not v:
        raise HTTPException(status_code=404, detail="검증 신청을 먼저 해주세요")

    # Content-Type 검증
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="허용되지 않는 파일 형식입니다 (JPG, PNG, PDF만 가능)",
        )

    # 파일 크기 검증
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="파일 크기가 5MB를 초과합니다")

    # 확장자 결정
    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "application/pdf": ".pdf"}
    ext = ext_map.get(file.content_type, ".bin")
    path = f"{user_id}/license{ext}"

    # Supabase Storage 업로드
    result = upload_license_doc(path, content, file.content_type)
    if not result["success"]:
        raise HTTPException(status_code=502, detail=result["message"])

    v.license_doc_path = path
    db.commit()

    return {"uploaded": True, "path": path}


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
        "license_doc_uploaded": bool(v.license_doc_path),
        "rejection_reason": v.rejection_reason,
        "phone": v.phone,
        "submitted_at": v.submitted_at.isoformat() if v.submitted_at else None,
        "reviewed_at": v.reviewed_at.isoformat() if v.reviewed_at else None,
    }
