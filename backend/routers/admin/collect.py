"""관리자 데이터 수집 트리거 라우트"""

import logging
from typing import Literal

from fastapi import Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)

CollectorName = Literal["crime-stats", "air-quality", "emergency", "childcare"]


def _get_collector(name: CollectorName):
    """수집기 이름 → 함수 매핑 (lazy import로 순환 참조 방지)"""
    if name == "crime-stats":
        from crawler.env_service import collect_crime_stats
        return collect_crime_stats
    if name == "air-quality":
        from crawler.env_service import collect_air_quality
        return collect_air_quality
    if name == "emergency":
        from crawler.env_service import collect_emergency_data
        return collect_emergency_data
    if name == "childcare":
        from crawler.env_service import collect_childcare_data
        return collect_childcare_data
    raise HTTPException(status_code=400, detail=f"알 수 없는 수집기: {name}")


@router.post("/collect/{collector_name}")
def trigger_collection(
    collector_name: CollectorName,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """관리자 수동 데이터 수집 트리거"""
    collector_fn = _get_collector(collector_name)
    log_action(db, admin["user_id"], "admin_collect_trigger", "collector", collector_name)
    db.commit()

    try:
        collector_fn()
        return {"status": "completed", "collector": collector_name}
    except Exception as e:
        logger.exception("[admin] 수집 실패: %s", collector_name)
        raise HTTPException(status_code=500, detail=f"수집 실패: {e}")


@router.get("/collect/crime-stats/status")
def get_crime_stats_status(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """범죄통계 수집 현황 조회"""
    from db.mb_models import Infra

    total_scored = db.execute(
        select(func.count()).select_from(Infra).where(Infra.crime_score.isnot(None))
    ).scalar() or 0

    last_updated = db.execute(
        select(func.max(Infra.crime_updated_at))
    ).scalar()

    # 등급 분포
    grade_rows = db.execute(
        select(Infra.crime_grade, func.count())
        .where(Infra.crime_grade.isnot(None))
        .group_by(Infra.crime_grade)
    ).all()
    grade_dist = {grade: count for grade, count in grade_rows}

    return {
        "total_scored": total_scored,
        "last_updated": last_updated.isoformat() if last_updated else None,
        "grade_dist": grade_dist,
    }
