"""관리자 데이터 신선도 라우트

스케줄러 completed 여부와 별개로 "DB 행이 실제로 갱신되었는가" 를
8개 종목별로 한 번에 보여준다. 헛바퀴 감지를 위해 종목마다:
  - last_updated: DB 행에 박힌 마지막 갱신 시각
  - last_job: 마지막 수집 작업 시각·처리 건수 (crawl_jobs)
  - new_rows: last_job.started_at 이후 새로 들어온 행 수 (가능한 종목만)
  - status: green/yellow/red/unknown + 헛바퀴면 red 격상
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.mb_models import Infra, MBTrade, UnsoldHistory
from db.models import Article, Complex, ComplexPriceHistory, CrawlJob
from deps import get_admin_user, get_db

from ._shared import router
from .freshness_meta import FRESHNESS_ITEMS

# batch 윈도우 — 같은 scheduler_job_id 의 잡들이 이 시간 안에 연속 끝나면 한 batch.
# crawl_articles_batch (50단지) 가 보통 수 분~10분 안에 끝남. 60분이면 한 batch 가
# 통째로 들어오고 그 다음 interval (12h) 와는 충분히 구분된다.
_BATCH_WINDOW_MINUTES = 60


def _to_utc(value):
    """date / naive datetime / aware datetime → tz-aware UTC datetime (또는 None)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    return None


def _status(last_updated: datetime | None, expected: int, now: datetime) -> str:
    """신호등: green/yellow/red/unknown — yellow=1.5x, red=3x"""
    if last_updated is None:
        return "unknown"
    age = (now - last_updated).total_seconds()
    if age <= expected * 1.5:
        return "green"
    if age <= expected * 3.0:
        return "yellow"
    return "red"


def _last_job(db: Session, scheduler_job_id: str) -> dict | None:
    """마지막 batch 통계 — 같은 scheduler_job_id 의 잡들이 _BATCH_WINDOW_MINUTES
    안에 연속 실행된 묶음의 processed/total 합산.

    `crawl_articles_batch` 가 50단지 한 번에 도는 동안 단지별로 CrawlJob row 가
    N개 생긴다. 마지막 1건만 보면 0/0 잡 (매물 0건 단지) 이 우연히 마지막이면
    "처리 0/0" 으로 misleading. batch 합산 = 진짜 활동량 (세션 219 false alarm
    회귀 가드).
    """
    # 1) 가장 최근 completed_at 1건으로 batch 의 "끝" 식별
    tail = db.execute(
        select(CrawlJob.completed_at, CrawlJob.started_at)
        .where(
            (CrawlJob.scheduler_job_id == scheduler_job_id)
            & (CrawlJob.status == "completed"),
        )
        .order_by(CrawlJob.completed_at.desc())
        .limit(1)
    ).first()
    if tail is None:
        return None
    batch_end = tail.completed_at
    # 2) batch 시작 = 마지막 completed_at 에서 _BATCH_WINDOW_MINUTES 이전까지의 잡들
    window_start = batch_end - timedelta(minutes=_BATCH_WINDOW_MINUTES)
    agg = db.execute(
        select(
            func.min(CrawlJob.started_at).label("batch_start"),
            func.max(CrawlJob.completed_at).label("batch_end"),
            func.coalesce(func.sum(CrawlJob.processed_items), 0).label("proc_sum"),
            func.coalesce(func.sum(CrawlJob.total_items), 0).label("total_sum"),
        )
        .where(
            (CrawlJob.scheduler_job_id == scheduler_job_id)
            & (CrawlJob.status == "completed")
            & (CrawlJob.completed_at >= window_start),
        )
    ).first()
    if agg is None or agg.batch_start is None:
        return None
    started = agg.batch_start
    completed = agg.batch_end
    return {
        "started_at": _to_utc(started).isoformat() if started else None,
        "completed_at": _to_utc(completed).isoformat() if completed else None,
        "processed_items": int(agg.proc_sum or 0),
        "total_items": int(agg.total_sum or 0),
        "_started_at_dt": _to_utc(started),  # 내부 계산용 (new_rows = batch 시작 기준)
    }


def compute_freshness(db: Session) -> dict:
    """8개 종목 신선도 + 헛바퀴 감지 신호 계산 (DB 세션만 의존).

    라우터·monitor 양쪽이 호출. 응답 형식은 기존 /data-freshness 와 동일.
    """
    now = datetime.now(timezone.utc)

    # 종목별 (last_updated, count) — 1쿼리씩
    raw: dict[str, tuple] = {
        "complexes": db.execute(select(func.max(Complex.last_crawled_at), func.count(Complex.complex_no))).one(),
        "articles": db.execute(select(func.max(Article.updated_at), func.count(Article.article_no))).one(),
        "complex_price_history": db.execute(select(func.max(ComplexPriceHistory.recorded_at), func.count(ComplexPriceHistory.id))).one(),
        "unsold": db.execute(select(func.max(UnsoldHistory.recorded_at), func.count(UnsoldHistory.id))).one(),
        "air_quality": db.execute(select(func.max(Infra.air_updated_at), func.count(Infra.apartment_id).filter(Infra.air_updated_at.isnot(None)))).one(),
        "childcare": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "collect_childcare") & (CrawlJob.status == "completed"),
            )
        ).one(),
        "crime_stats": db.execute(select(func.max(Infra.crime_updated_at), func.count(Infra.apartment_id).filter(Infra.crime_score.isnot(None)))).one(),
        "public_trades": db.execute(select(func.max(MBTrade.recorded_at), func.count(MBTrade.id))).one(),
    }

    items = []
    for meta in FRESHNESS_ITEMS:
        key = meta["key"]
        last_raw, count = raw[key]
        last_updated = _to_utc(last_raw)
        sched_id = meta.get("scheduler_job_id")

        # 작업 메타 (해당 종목에 정기 job 있는 경우만)
        job = _last_job(db, sched_id) if sched_id else None
        job_start = job.get("_started_at_dt") if job else None

        # N0: 작업 시작 후 신규 행 수 (가능한 종목만)
        new_rows: int | None = None
        new_rows_kind = meta.get("new_rows_kind")  # "created_at" | "recorded_at" | None
        if job_start and new_rows_kind == "created_at" and key == "articles":
            new_rows = int(db.execute(
                select(func.count(Article.article_no)).where(Article.created_at >= job_start)
            ).scalar() or 0)
        elif job_start and new_rows_kind == "created_at" and key == "complexes":
            new_rows = int(db.execute(
                select(func.count(Complex.complex_no)).where(Complex.created_at >= job_start)
            ).scalar() or 0)
        elif job_start and new_rows_kind == "recorded_at" and key == "complex_price_history":
            new_rows = int(db.execute(
                select(func.count(ComplexPriceHistory.id)).where(ComplexPriceHistory.recorded_at >= job_start)
            ).scalar() or 0)

        # 헛바퀴 감지: 작업 메타로 status 격상
        status = _status(last_updated, meta["expected_interval_seconds"], now)
        spinning = False
        if job is not None:
            # processed_items=0 이고 total_items>0 이면 헛바퀴
            if job["processed_items"] == 0 and job["total_items"] > 0:
                spinning = True
            # N0 측정 가능 + 작업 후 신규 행 0 + 종목 특성상 신규가 기대되는 경우
            if new_rows is not None and new_rows == 0 and meta.get("new_rows_expected", False):
                spinning = True
        if spinning and status in ("green", "yellow"):
            status = "red"

        # 응답 객체 (내부 _started_at_dt 제거)
        last_job_out = None
        if job is not None:
            last_job_out = {k: v for k, v in job.items() if not k.startswith("_")}

        items.append({
            "key": key,
            "label": meta["label"],
            "count": int(count or 0),
            "last_updated": last_updated.isoformat() if last_updated else None,
            "expected_interval_seconds": meta["expected_interval_seconds"],
            "status": status,
            "spinning": spinning,
            "last_job": last_job_out,
            "new_rows": new_rows,
        })

    return {"items": items, "generated_at": now.isoformat()}


@router.get("/data-freshness")
def get_data_freshness(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """8개 종목 신선도 + 헛바퀴 감지 신호 일괄 반환."""
    return compute_freshness(db)
