"""관리자 데이터 수집 트리거 라우트"""

import logging
import threading
from typing import Literal

from fastapi import Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from auth.audit import log_action
from crawler.plain_words import explain_error
from db.models import CrawlJob
from deps import get_admin_user, get_db

from ._running import running_not_stale_clause
from ._shared import router

logger = logging.getLogger(__name__)

CollectorName = Literal[
    "crime-stats", "air-quality", "emergency", "childcare", "backfill-price", "metrics",
    # K-apt 관리비 (V051) — 매칭은 월 1회라 수동 트리거가 사실상 주 실행 경로.
    # ⚠ kapt-costs 는 공개 단지당 22콜(미공개는 3콜 — 세션 414)이라 기본 배치(500)면 최대 11,000콜 — 수동 실행 전 쿼터 확인.
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


# 수집기 이름 → 그 수집기가 crawl_jobs 에 남기는 job_type (각 수집기 코드에서 grep 한 값).
# ⚠ 스케줄러 잡 id 와 다르다(infra.md) — 예: backfill-price 는 `price_backfill`, metrics 는 `complex_metric`.
# 짝꿍 = frontend/src/lib/admin/collectors.ts 의 COLLECTORS[].jobType — 한쪽을 바꾸면 양쪽을 같이 바꾼다.
# 가드 = tests/test_admin_collect_background.py test_collector_job_type_map_matches_frontend_pairwise(짝 단위 8/8).
_COLLECTOR_JOB_TYPE: dict[str, str] = {
    "crime-stats": "crime_stats",
    "air-quality": "air_quality",
    "emergency": "emergency",
    "childcare": "childcare",
    "backfill-price": "price_backfill",
    "metrics": "complex_metric",
    "kapt-match": "kapt_match",
    "kapt-costs": "kapt_costs",
}

ALREADY_RUNNING_WORDS = "이미 돌고 있어요 — 끝난 뒤 다시 눌러 주세요"

# 이 프로세스가 지금 손으로 돌리는 수집기 — recrawl.py 의 `_recrawl_lock`/`_recrawl_running` 선례.
_collect_lock = threading.Lock()
_collect_running: set[str] = set()


def _run_collector_wrapped(collector_name: str, collector_fn) -> None:
    """백그라운드 스레드 본체 — 수집기 실행 → 성공이면 신선도 캐시 무효화 → 끝나면 플래그 해제.

    결과(성공·실패·몇 건)는 수집기가 자기 crawl_jobs 행에 남긴다 — 화면은 그 행을 본다.
    """
    try:
        collector_fn()
        # 수집 성공 시에만 freshness 캐시 무효화 → 화면 즉시 반영 (세션 260).
        # lazy import: __init__.py 가 collect 를 freshness 보다 먼저 import 하므로
        # top-level import 는 순환 → 서버 기동 ImportError (collect.py lazy 관행 답습).
        from routers.admin.freshness import invalidate_freshness_cache

        invalidate_freshness_cache()
        logger.info("[admin] 수동 수집 끝: %s", collector_name)
    except Exception:
        # 원문은 로그에만 — 응답은 이미 나갔고, 화면은 crawl_jobs 행의 우리말 사유를 본다.
        logger.exception("[admin] 수집 실패: %s", collector_name)
    finally:
        with _collect_lock:
            _collect_running.discard(collector_name)


@router.post("/collect/{collector_name}")
def trigger_collection(
    collector_name: CollectorName,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """관리자 수동 데이터 수집 트리거 — 백그라운드로 시작하고 곧바로 답한다(세션 420).

    옛 방식은 수집이 끝날 때까지 요청을 붙잡아, 한 시간짜리 수집(관리비·실거래가 소급)은
    화면이 120초 뒤 손을 떼 결과를 못 봤다. 이제 시작만 알리고, 진행·결과는 crawl_jobs 로 본다.
    같은 수집기가 이 프로세스에서 이미 돌거나(수동) crawl_jobs 에 running 이면(스케줄러) 409.
    """
    collector_fn = _get_collector(collector_name)
    log_action(db, admin["user_id"], "admin_collect_trigger", "collector", collector_name)
    db.commit()

    job_type = _COLLECTOR_JOB_TYPE[collector_name]
    with _collect_lock:
        if collector_name in _collect_running:
            raise HTTPException(status_code=409, detail=ALREADY_RUNNING_WORDS)
        # 스케줄러가 돌리는 회차와 겹치지 않게 — 유령(임계 지난 running)은 세지 않는다.
        busy = (
            db.query(CrawlJob.id)
            .filter(
                CrawlJob.job_type == job_type,
                CrawlJob.status == "running",
                running_not_stale_clause(),
            )
            .first()
        )
        if busy is not None:
            raise HTTPException(status_code=409, detail=ALREADY_RUNNING_WORDS)
        _collect_running.add(collector_name)

    try:
        threading.Thread(
            target=_run_collector_wrapped,
            args=(collector_name, collector_fn),
            name=f"admin-collect-{collector_name}",
            daemon=True,
        ).start()
    except Exception:
        # 스레드를 못 띄웠으면 플래그를 되돌린다 — 안 그러면 재시작 전까지 영영 409.
        with _collect_lock:
            _collect_running.discard(collector_name)
        raise
    return {"status": "started", "collector": collector_name}


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
        # 위와 같은 까닭 — 원문은 로그, 화면에는 우리말 한 줄.
        logger.exception("[admin] 소급 수집 실패: %s", complex_no)
        raise HTTPException(status_code=500, detail=f"소급 수집 실패: {explain_error(str(e))}")
