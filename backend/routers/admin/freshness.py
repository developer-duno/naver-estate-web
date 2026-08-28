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
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from db.mb_models import Infra, MBTrade, OfficetelPresaleSchedule, RentalScheduleOfficial, UnsoldHistory
from db.models import Article, Complex, ComplexOfficialPrice, ComplexPriceHistory, CrawlJob
from deps import get_admin_user, get_db
from services.cache import get_cache

from ._shared import router
from .freshness_meta import FRESHNESS_ITEMS

# data-freshness 캐시 (세션 260). compute_freshness 가 8종목 풀 테이블 집계라 5초+.
# 관리자 화면(30초 폴링)·수동 수집 후 무효화만 캐시 공유. monitor 는 직접 compute 유지
# (10분 1회라 캐시 이득 0 + stale 캐시 false alarm 위험). 고정 5분 TTL.
_FRESHNESS_CACHE_NAME = "freshness"
_FRESHNESS_CACHE_KEY = "data_freshness"

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


def _approx_count(db: Session, table_name: str, exact_stmt) -> int:
    """대형 테이블 행수 근사 — pg_class.reltuples (인덱스 없이 즉시, 풀스캔 회피).

    articles(121만)·trades(80만)·complex_price_history(36만)·complexes(6.4만) 의 정확 count 는 풀스캔이라
    부하 시 8초 statement_timeout 을 넘겨 monitor 를 죽였다(세션 342). freshness 의 count 는
    화면 "대략 N건" 표시용이라 근사로 충분. reltuples 는 autovacuum/analyze 후 갱신되며
    평상시 오차 <1%(실측 0%). SQLite(테스트)는 reltuples 가 없으므로 정확 count 로 폴백.
    """
    dialect_name = db.bind.dialect.name if db.bind else ""
    if dialect_name != "postgresql":
        return db.execute(exact_stmt).scalar() or 0
    approx = db.execute(
        text("SELECT reltuples::bigint FROM pg_class WHERE relname = :t").bindparams(t=table_name)
    ).scalar()
    # reltuples = -1 (ANALYZE 한 번도 안 됨) 또는 None 이면 정확 count 로 폴백.
    if approx is None or approx < 0:
        return db.execute(exact_stmt).scalar() or 0
    return int(approx)


def compute_freshness(db: Session) -> dict:
    """8개 종목 신선도 + 헛바퀴 감지 신호 계산 (DB 세션만 의존).

    라우터·monitor 양쪽이 호출. 응답 형식은 기존 /data-freshness 와 동일.
    """
    now = datetime.now(timezone.utc)

    # 종목별 (last_updated, count) — 1쿼리씩.
    # ⚠ 대형 테이블(articles 121만·trades 80만·complex_price_history 36만·complexes 6.4만)은
    # max+count 를 묶으면 count 풀스캔이 max 인덱스를 무효화하고, 정확 count 풀스캔 자체가
    # 부하 시 8초 statement_timeout 을 넘겨 monitor 를 죽였다(세션 342).
    # → max 는 인덱스 역스캔(ms)으로 분리, count 는 reltuples 근사(_approx_count, 즉시)로.
    # ⚠ "max 는 인덱스 역스캔" 은 해당 컬럼에 인덱스가 있어야만 성립한다 — articles 는
    # V038(updated_at)·V039(created_at), trades·complex_price_history·complexes 는
    # V048(세션 381) 로 인덱스를 갖췄다. 인덱스 없이 분리만 하면 여전히 풀스캔(Seq Scan)이다.
    # 소형 테이블은 정확 count 유지(풀스캔 부담 0). 메모리 [[feedback-combined-aggregate-index-void]] 답습.
    art_max = db.execute(select(func.max(Article.updated_at))).scalar()
    art_count = _approx_count(db, "articles", select(func.count(Article.article_no)))
    cph_max = db.execute(select(func.max(ComplexPriceHistory.recorded_at))).scalar()
    cph_count = _approx_count(db, "complex_price_history", select(func.count(ComplexPriceHistory.id)))
    trade_max = db.execute(select(func.max(MBTrade.recorded_at))).scalar()
    trade_count = _approx_count(db, "trades", select(func.count(MBTrade.id)))
    cpx_max = db.execute(select(func.max(Complex.last_crawled_at))).scalar()
    cpx_count = _approx_count(db, "complexes", select(func.count(Complex.complex_no)))
    # V050(세션 385): official_price 도 동일 패턴으로 분리 — max 는 ix_complex_official_prices_collected_at
    # 인덱스 스캔, count 는 _approx_count 근사. 138,795행(28MB)이라 지금 당장 8초 timeout 위험은
    # 없었으나(EXPLAIN 33.5ms), 월 1회 갱신 데이터를 10분마다 풀스캔하는 낭비를 V048과 함께 정리.
    op_max = db.execute(select(func.max(ComplexOfficialPrice.collected_at))).scalar()
    op_count = _approx_count(db, "complex_official_prices", select(func.count(ComplexOfficialPrice.id)))
    raw: dict[str, tuple] = {
        "complexes": (cpx_max, cpx_count),
        "articles": (art_max, art_count),
        "complex_price_history": (cph_max, cph_count),
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
        # 세션 359: Infra.emergency_updated_at 컬럼 없음 — childcare 와 동일하게
        # CrawlJob.completed_at 경유로 최신성 측정.
        "emergency": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "collect_emergency") & (CrawlJob.status == "completed"),
            )
        ).one(),
        "crime_stats": db.execute(select(func.max(Infra.crime_updated_at), func.count(Infra.apartment_id).filter(Infra.crime_score.isnot(None)))).one(),
        "public_trades": (trade_max, trade_count),
        # 신규 3종 (세션 359) — "조용한 실패"(0건인데 status=completed) 가 monitor.py
        # 의 작업실패 감지를 우회하는 사각지대를 이 신선도 축으로 메운다. 전량 upsert
        # 구조라 created_at 없이 fetched_at/collected_at 최신성만 측정(air_quality 패턴 답습).
        "officetel_presale": db.execute(
            select(func.max(OfficetelPresaleSchedule.fetched_at), func.count(OfficetelPresaleSchedule.id))
        ).one(),
        "rental_presale": db.execute(
            select(func.max(RentalScheduleOfficial.fetched_at), func.count(RentalScheduleOfficial.id))
        ).one(),
        "official_price": (op_max, op_count),
        # 세션 359: 매물 상세 보강(crawl_details) — "몇 시간이고 0건만 처리해도
        # completed 로 조용히 끝나는" 사각지대 사례. articles 카드는 crawl_articles
        # (매물 목록 수집, 별개 잡) 기준이라 이 잡을 못 잡는다.
        "article_detail": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "crawl_details") & (CrawlJob.status == "completed"),
            )
        ).one(),
        # 세션 359: 시급하지 않다고 분류됐던 잡도 마저 메움(사장님 지시 — 전체 적용).
        "complex_metric": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "collect_metrics") & (CrawlJob.status == "completed"),
            )
        ).one(),
        # 세션 359: test_scheduler_monitoring_coverage.py(CI 커버리지 검사)가 실제로
        # 찾아낸 사각지대 — article_detail과 동일 패턴.
        "complex_detail_apt": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "complex_detail_APT") & (CrawlJob.status == "completed"),
            )
        ).one(),
        "complex_detail_opst": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "complex_detail_OPST") & (CrawlJob.status == "completed"),
            )
        ).one(),
        # V051: K-apt 관리비 연동 2종 — CrawlJob 경유(childcare 패턴). 관리비
        # 테이블을 직접 스캔하지 않는 이유는 max+count 풀스캔이 monitor 10분 주기에
        # 얹히는 것을 피하기 위함(세션 342 답습) + 매칭 잡은 애초에 쓰는 테이블이 다름.
        "kapt_match": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "kapt_match") & (CrawlJob.status == "completed"),
            )
        ).one(),
        "kapt_costs": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "kapt_costs") & (CrawlJob.status == "completed"),
            )
        ).one(),
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


def get_freshness_cached(db: Session) -> dict:
    """compute_freshness 의 5분 TTL 캐시 래퍼 (라우터 전용).

    monitor 는 호출하지 않는다 (직접 compute 로 실시간 알림 보장). 관리자 화면은 30초
    폴링이라 캐시 없이는 풀스캔 부하가 크다. 수집 직후 invalidate_freshness_cache() 로
    무효화되므로 수동 수집 결과는 즉시 반영된다.
    """
    cache = get_cache(_FRESHNESS_CACHE_NAME)  # dynamic 인자 없음 = 고정 5분 TTL
    cached = cache.get(_FRESHNESS_CACHE_KEY)
    if cached is not None:
        return cached
    result = compute_freshness(db)
    cache.set(_FRESHNESS_CACHE_KEY, result)
    return result


def invalidate_freshness_cache() -> None:
    """수집 직후 호출 → 다음 data-freshness 조회가 fresh compute (화면 즉시 반영)."""
    get_cache(_FRESHNESS_CACHE_NAME).delete(_FRESHNESS_CACHE_KEY)


@router.get("/data-freshness")
def get_data_freshness(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """8개 종목 신선도 + 헛바퀴 감지 신호 일괄 반환 (5분 캐시)."""
    return get_freshness_cached(db)
