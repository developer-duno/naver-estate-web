"""관리자 데이터/감사/설정 관리 라우트"""

import logging
from datetime import datetime, timezone

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import AdminSetting, AuditLog, RateLimitCounter
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)


class SettingUpdateRequest(BaseModel):
    value: dict


# 세션 401: `DELETE /data/stale`(오래된 비활성 매물 물리삭제) **제거**. 사장님 결정.
#
# prod 실측(2026-09-13)으로 드러난 위험:
#   · 기본값 days=90 으로 한 번 호출하면 934,258건(전체 매물 1,494,484 의 63%)이 지워진다.
#     무제한 DELETE 소요 실측 **2.55s·2.88s** — 8초 statement_timeout 이 막아주지 못한다
#     (조사 착수 시엔 "타임아웃이 우연히 막아줄 것"으로 봤으나 실측이 그 가정을 반증했다).
#   · 대상은 **전부 2026년 생성분**이고 466,530건은 상세 수집 완료분이라,
#     네이버에서 이미 내려간 매물이라 재수집이 원리적으로 불가능하다.
#   · **7,076개 단지는 삭제 즉시 가격 근거가 0** 이 된다(complex_price_history 없음 +
#     살아있는 매물 없음 + complexes 의 nearby_median_price·jeonse_rate·recent_trades_6m 전부 NULL).
#     반포주공1단지·잠실주공5단지·고덕래미안힐스테이트 등 재건축 대단지가 포함된다.
#   · 되돌리는 유일한 경로 = Supabase 프로젝트 전체 롤백(mibunyang 데이터 동반) — infra.md §DB 백업.
#   · 입력 상한이 없어 days=10**9 이면 timedelta OverflowError → **HTTP 500**(실측 재현).
#   · 그런데 audit_logs 의 admin_data_cleanup 이력은 **0건** = 만들어진 뒤 한 번도 안 눌렸다.
# ⇒ 쓰지 않는데 누르면 재앙인 경로라, 안전장치를 붙이는 대신 제거를 택했다.
#   화면(app/admin/data/page.tsx 카드)·FE 래퍼(lib/api/admin.ts deleteStaleData)도 함께 제거 —
#   화면만 지우면 관리자 토큰으로 직접 호출하는 경로가 남는다.
#   admin-labels.ts 의 `admin_data_cleanup` 라벨은 과거 감사 로그 표시용으로 유지.


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
