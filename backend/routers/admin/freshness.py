"""관리자 데이터 신선도 라우트

스케줄러 completed 여부와 별개로 "DB 행이 실제로 갱신되었는가" 를
8개 종목별로 한 번에 보여준다. 각 종목 1쿼리(MAX + COUNT 동시) 실행.
"""

from datetime import date, datetime, timezone

from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.mb_models import Infra, MBTrade, UnsoldHistory
from db.models import Article, Complex, ComplexPriceHistory, CrawlJob
from deps import get_admin_user, get_db

from ._shared import router
from .freshness_meta import FRESHNESS_ITEMS


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
    """신호등: green/yellow/red/unknown — 메모: yellow=1.5x, red=3x"""
    if last_updated is None:
        return "unknown"
    age = (now - last_updated).total_seconds()
    if age <= expected * 1.5:
        return "green"
    if age <= expected * 3.0:
        return "yellow"
    return "red"


@router.get("/data-freshness")
def get_data_freshness(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """8개 종목의 행 수 + 마지막 갱신 시각 + 신호등 일괄 반환."""
    now = datetime.now(timezone.utc)

    # 종목별 (max_col_or_subquery, count_target) — None 이면 fallback 처리
    raw: dict[str, tuple] = {
        "complexes": db.execute(select(func.max(Complex.last_crawled_at), func.count(Complex.complex_no))).one(),
        "articles": db.execute(select(func.max(Article.updated_at), func.count(Article.article_no))).one(),
        "complex_price_history": db.execute(select(func.max(ComplexPriceHistory.recorded_at), func.count(ComplexPriceHistory.id))).one(),
        "unsold": db.execute(select(func.max(UnsoldHistory.recorded_at), func.count(UnsoldHistory.id))).one(),
        "air_quality": db.execute(select(func.max(Infra.air_updated_at), func.count(Infra.apartment_id).filter(Infra.air_updated_at.isnot(None)))).one(),
        # childcare: infra 에 *_updated_at 없음 → crawl_jobs 의 마지막 completed 시각 fallback
        # count 는 같은 row 의 processed_items (마지막 배치 처리 건수)
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
        items.append({
            "key": key,
            "label": meta["label"],
            "count": int(count or 0),
            "last_updated": last_updated.isoformat() if last_updated else None,
            "expected_interval_seconds": meta["expected_interval_seconds"],
            "status": _status(last_updated, meta["expected_interval_seconds"], now),
        })

    return {"items": items, "generated_at": now.isoformat()}
