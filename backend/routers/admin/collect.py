"""관리자 데이터 수집 트리거 라우트"""

import logging
from typing import Literal

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from deps import get_admin_user, get_db

from ._shared import router

logger = logging.getLogger(__name__)

CollectorName = Literal[
    "crime-stats", "air-quality", "emergency", "childcare", "backfill-price", "metrics",
    # K-apt 관리비 (V051) — 매칭은 월 1회라 수동 트리거가 사실상 주 실행 경로.
    # ⚠ kapt-costs 는 단지당 22콜이라 기본 배치(500)면 11,000콜 — 수동 실행 전 쿼터 확인.
    "kapt-match", "kapt-costs",
]


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
    if name == "backfill-price":
        from crawler.service_public import backfill_price_batch
        return backfill_price_batch
    if name == "metrics":
        from crawler.service_metrics import collect_complex_metrics
        return collect_complex_metrics
    if name == "kapt-match":
        from crawler.service_kapt import match_kapt_complexes
        return match_kapt_complexes
    if name == "kapt-costs":
        from crawler.service_kapt import collect_kapt_costs
        return collect_kapt_costs
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
        result = collector_fn()
        # 수집 성공 시에만 freshness 캐시 무효화 → 화면 즉시 반영 (세션 260).
        # lazy import: __init__.py 가 collect 를 freshness 보다 먼저 import 하므로
        # top-level import 는 순환 → 서버 기동 ImportError (collect.py lazy 관행 답습).
        from routers.admin.freshness import invalidate_freshness_cache

        invalidate_freshness_cache()
        response = {"status": "completed", "collector": collector_name}
        # 세션 362: backfill-price(backfill_price_batch)는 quota_exhausted 등을 dict로
        # 반환하는데 기존엔 이 값을 통째로 버려 "쿼터 소진으로 0단지 처리"도 화면엔 그냥
        # "완료"로만 보였다. dict 반환 수집기만 응답에 펼쳐 넣는다(나머지 4개는 None 반환).
        if isinstance(result, dict):
            response.update(result)
        return response
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


@router.post("/backfill-price/{complex_no}")
def backfill_price(
    complex_no: str,
    months_back: int = Query(60, ge=1, le=120),
    admin: dict = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """특정 단지의 과거 실거래가 소급 수집 (국토교통부 API)"""
    log_action(db, admin["user_id"], "admin_backfill_price", "complex", complex_no)
    db.commit()

    try:
        from crawler.service_public import backfill_price_history
        result = backfill_price_history(complex_no, months_back=months_back)
        return {"status": "completed", **result}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("[admin] 소급 수집 실패: %s", complex_no)
        raise HTTPException(status_code=500, detail=f"소급 수집 실패: {e}")
