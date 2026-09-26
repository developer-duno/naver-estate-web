"""관리자 크롤작업 + 통계 라우트"""

import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from sqlalchemy import and_, func, select, text
from sqlalchemy.orm import Session

from auth.audit import log_action
from crawler.plain_words import explain_stored_error
from db.models import Article, Complex, CrawlJob, UserProfile
from deps import get_admin_user, get_db

from ._running import running_not_stale_clause
from ._shared import router

logger = logging.getLogger(__name__)


def _safe_fill_rate(filled: int, total: int) -> float | None:
    """채움률 계산 — 모집단 0건이면 None 반환.

    None 반환 = FE 가 "—" 표시 (데이터 없음 / backend 옛 코드 가동 구별 가능).
    0.0 반환 = FE 가 "0.00%" 표시 (실제 0% 채움률).
    세션 230 박제 [[feedback-multi-field-fill-silent]] 답습.
    """
    if not total:
        return None
    return round(filled / total, 4)


@router.get("/crawl-jobs")
def list_crawl_jobs(
    status: str | None = None,
    job_type: str | None = Query(None, description="작업 유형(job_type)으로 좁히기 — 없으면 전체"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 목록"""
    conditions = []
    if job_type:
        conditions.append(CrawlJob.job_type == job_type)
    if status:
        conditions.append(CrawlJob.status == status)
        # running 필터에는 stale(유령) 컷오프 적용 — 잡 유형별 임계(모니터와 같은 기준).
        # 옛 1시간 고정은 관리비(3h)·공시가격(16h) 처럼 오래 도는 작업을 화면에서 지웠다.
        if status == "running":
            conditions.append(running_not_stale_clause())

    where = and_(*conditions) if conditions else True
    total = db.execute(select(func.count()).select_from(CrawlJob).where(where)).scalar() or 0

    stmt = (
        select(CrawlJob)
        .where(where)
        .order_by(CrawlJob.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    jobs = db.execute(stmt).scalars().all()

    return {
        "items": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                # 원문 옆 우리말 한 줄 — 화면은 이쪽을 보이고 원문은 title 로 남긴다
                # (scheduler-status·recrawl 과 같은 함수, 세션 411·418).
                "error_plain": explain_stored_error(j.error_message),
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in jobs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/crawl-failures")
def list_crawl_failures(
    hours: int = Query(24, ge=1, le=720),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """최근 N시간(기본 24h) 동안 실패한 크롤 잡을 job_type 별로 집계.

    응답 예: { "window_hours": 24, "total": 12,
              "items": [{ "job_type": "complex_articles", "count": 8,
                          "last_error": "...", "last_error_plain": "...",
                          "last_failed_at": "..." }] }

    last_error_plain 은 **200자로 자르기 전** 원문으로 만든다 — 잘린 원문으로는
    뒤에 붙은 스윕 마커나 규칙에 걸리는 낱말을 놓칠 수 있다.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    # job_type 별 집계 (count + 가장 최근 실패 정보)
    rows = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("count"),
            func.max(CrawlJob.completed_at).label("last_failed_at"),
        )
        .where(
            and_(
                CrawlJob.status == "failed",
                CrawlJob.created_at >= cutoff,
            )
        )
        .group_by(CrawlJob.job_type)
        .order_by(func.count(CrawlJob.id).desc())
    ).all()

    items = []
    total = 0
    for r in rows:
        # 해당 job_type 의 가장 최근 실패 1건에서 error_message 가져오기
        last = db.execute(
            select(CrawlJob.error_message)
            .where(
                and_(
                    CrawlJob.status == "failed",
                    CrawlJob.created_at >= cutoff,
                    CrawlJob.job_type == r.job_type,
                )
            )
            .order_by(CrawlJob.completed_at.desc().nullslast(), CrawlJob.created_at.desc())
            .limit(1)
        ).scalar()
        items.append(
            {
                "job_type": r.job_type,
                "count": int(r.count),
                "last_error": (last[:200] if last else None),
                "last_error_plain": explain_stored_error(last),
                "last_failed_at": r.last_failed_at.isoformat() if r.last_failed_at else None,
            }
        )
        total += int(r.count)

    return {"window_hours": hours, "total": total, "items": items}


@router.post("/crawl-jobs/{job_id}/cancel")
def cancel_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """크롤 작업 취소"""
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail="취소할 수 없는 상태입니다")

    job.status = "cancelled"
    job.completed_at = datetime.now(timezone.utc)
    log_action(db, admin["user_id"], "admin_crawl_cancel", "crawl_job", str(job_id))
    db.commit()
    return {"status": "cancelled"}


@router.post("/crawl-jobs/{job_id}/pause")
def pause_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """running 상태 잡을 paused 로 전환.

    원자성: SQLAlchemy UPDATE ... WHERE status='running' 으로 race 차단.
    """
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != "running":
        raise HTTPException(
            status_code=409,
            detail=f"일시정지 불가 — 현재 상태: {job.status}",
        )
    job.status = "paused"
    log_action(db, admin["user_id"], "admin_crawl_pause", "crawl_job", str(job_id))
    db.commit()
    return {"status": "paused"}


@router.post("/crawl-jobs/{job_id}/resume")
def resume_crawl_job(
    job_id: int,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """paused 상태 잡을 pending 으로 복원 (스케줄러가 다음 라운드에 픽업)."""
    job = db.get(CrawlJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job.status != "paused":
        raise HTTPException(
            status_code=409,
            detail=f"재개 불가 — 현재 상태: {job.status}",
        )
    job.status = "pending"
    log_action(db, admin["user_id"], "admin_crawl_resume", "crawl_job", str(job_id))
    db.commit()
    return {"status": "pending"}


# ── 상세 통계 캐시 ──
# 운영 부하 시간대(단지 관리비 받기·정부 실거래가 받기가 같이 도는 아침)에 아래 count 중
# 한 문장이 8초 statement_timeout 을 넘겨 500 이 났다(2026-09-26 06:27~28 두 번, QueryCanceled).
# statement_timeout 은 합계가 아니라 **문장마다** 걸린다(평소 8초, 이 경로 재계산 때만 30초).
# 느린 문장은 `article_detail_filled`(상세 채움 매물 count) 하나다 — 09-26 12:55 낮 백필 중
# 실측 4.8초, 나머지 10문장은 각각 0.2초 미만(11문장 합계 5.3초). 그래서
#   ① 결과를 프로세스 안에 5분 보관한다. 관리자 전용 전역 집계라 보는 사람마다 다른 값이 없다
#      → 한 벌만 보관해도 남의 숫자를 보여 주는 일이 없다(사용자와 무관).
#   ② 다시 계산할 때만 이 요청의 트랜잭션에 한해 시간 제한을 30초로 올린다(PostgreSQL 전용).
# 숫자는 최대 5분 늦을 수 있다(의도 — 버그 아님). 계산이 실패하면 옛 값으로 몰래 대신하지
# 않고 그대로 500 을 낸다(.claude/rules/error-propagation.md 취지).
_STATS_CACHE_TTL_SEC = 300
_STATS_STATEMENT_TIMEOUT_MS = 30_000
_stats_cache: dict | None = None
_stats_cache_at: float | None = None  # time.monotonic() 기준 계산 시각
# 동시에 여러 요청이 와도 한 요청만 계산하고 나머지는 기다렸다가 그 결과를 받는다.
_stats_lock = threading.Lock()
# 잠금을 기다리는 상한. 계산 도중 DB 연결이 멈추면(망 끊김 — 클라이언트 쪽 소켓은 시간 제한이
# 없다) 뒤따르는 요청이 스레드풀을 하나씩 잡은 채 끝없이 기다리게 되므로, 넘으면 503 으로 돌려보낸다.
_STATS_LOCK_WAIT_SEC = 60
_STATS_BUSY_DETAIL = "상세 통계를 계산하는 중이에요. 잠시 뒤 다시 열어 주세요."


def _reset_stats_cache() -> None:
    """상세 통계 캐시만 비운다 — 테스트 격리용(conftest setup_db 가 부른다)."""
    global _stats_cache, _stats_cache_at
    with _stats_lock:
        _stats_cache = None
        _stats_cache_at = None


def _raise_statement_timeout_for_stats(db: Session) -> bool:
    """이 트랜잭션의 문장마다 시간 제한 30초 — 다른 요청은 연결 때 걸린 8초 그대로.

    한도는 문장 하나하나에 걸린다(11문장 합계가 아니다). 이론상 잠금 보유 상한은 문장 수 × 30초지만
    실측상 한 문장(`article_detail_filled`)이 시간을 거의 다 쓴다.

    SET LOCAL 은 현재 트랜잭션이 끝나면 사라진다(NullPool 이라 연결도 요청마다 새것).
    SQLite(CI)에는 이 문법이 없어 실행하지 않는다(domain-mapping-ssot.md 룰 3 dialect 분기).
    반환값 = 실제로 올렸는지.
    """
    dialect_name = db.bind.dialect.name if db.bind else ""
    if dialect_name != "postgresql":
        return False
    db.execute(text(f"SET LOCAL statement_timeout = {_STATS_STATEMENT_TIMEOUT_MS}"))
    return True


def _cached_detailed_stats(
    db: Session, now: float | None = None, lock_wait_sec: float | None = None
) -> dict:
    """5분 안이면 보관한 결과, 아니면 다시 계산해 보관한 뒤 반환.

    now = time.monotonic() 값. 시험에서 시각을 밖에서 넣기 위한 인자(실제 대기 금지).
    lock_wait_sec = 잠금 대기 상한(기본 _STATS_LOCK_WAIT_SEC). 시험에서 짧게 넣기 위한 인자.
    잠금을 그 안에 못 얻으면 503. 얻은 잠금은 예외가 나도 finally 에서 반드시 푼다.
    """
    global _stats_cache, _stats_cache_at
    now = time.monotonic() if now is None else now
    wait = _STATS_LOCK_WAIT_SEC if lock_wait_sec is None else lock_wait_sec
    if not _stats_lock.acquire(timeout=wait):
        raise HTTPException(status_code=503, detail=_STATS_BUSY_DETAIL)
    try:
        if (
            _stats_cache is not None
            and _stats_cache_at is not None
            and now - _stats_cache_at < _STATS_CACHE_TTL_SEC
        ):
            return _stats_cache
        # 순서가 핵심 — 시간 제한을 먼저 올리고 나서 계산한다(뒤집으면 수정이 무력화된다).
        _raise_statement_timeout_for_stats(db)
        result = _compute_detailed_stats(db)  # 실패하면 예외 그대로 — 캐시도 안 바뀐다
        _stats_cache = result
        _stats_cache_at = now
        return result
    finally:
        _stats_lock.release()


@router.get("/stats/detailed")
def get_detailed_stats(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """상세 통계 (관리자용) — 5분 캐시라 숫자는 최대 5분 늦을 수 있다."""
    return _cached_detailed_stats(db)


def _compute_detailed_stats(db: Session) -> dict:
    """상세 통계 실제 계산 — count 들 + 최근 작업 5건."""
    complex_count = db.execute(select(func.count()).select_from(Complex)).scalar() or 0
    article_count = db.execute(
        select(func.count()).select_from(Article).where(Article.is_active == True)
    ).scalar() or 0
    total_article_count = db.execute(select(func.count()).select_from(Article)).scalar() or 0
    user_count = db.execute(select(func.count()).select_from(UserProfile)).scalar() or 0

    # 오늘 크롤 수 — 한국 사용자가 보는 화면이라 '오늘'은 KST 자정 기준
    # (UTC 자정이면 KST 오전 9시에야 리셋돼 하루가 어긋난다)
    # ⚠ 쿼리 바인딩은 반드시 UTC 로 변환 — created_at 저장값이 UTC(utcnow)라
    #   CI SQLite 의 ISO 문자열 비교에서 오프셋 표기가 어긋나면 결과가 틀어진다
    # ⚠ microsecond=0 은 필수 — 소수부가 남으면 SQLite 바인딩 문자열에 '.xxxxxx' 가 붙어
    #   저장 포맷(소수부 없음)과의 문자열 비교가 어긋난다 (제약: 지우지 말 것)
    kst_midnight = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    today_start = kst_midnight.astimezone(timezone.utc)
    today_crawl_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(CrawlJob.created_at >= today_start)
    ).scalar() or 0

    # 24시간 에러 수
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    error_count = db.execute(
        select(func.count()).select_from(CrawlJob).where(
            and_(CrawlJob.status == "failed", CrawlJob.created_at >= yesterday)
        )
    ).scalar() or 0

    # 최근 5개 크롤 작업
    recent_jobs = db.execute(
        select(CrawlJob).order_by(CrawlJob.created_at.desc()).limit(5)
    ).scalars().all()

    # 마지막 크롤 시각
    last_crawl = db.execute(
        select(func.max(CrawlJob.completed_at)).where(CrawlJob.status == "completed")
    ).scalar()

    # 채움률 3건 (PR 6a)
    # `func.count().filter()` = PostgreSQL FILTER + SQLite CASE WHEN SQLAlchemy 자동 변환
    # 인덱스 부재 풀스캔 발생하나 admin 빈도 낮음 (1~3명) → 허용
    complex_detail_filled = db.execute(
        select(func.count()).select_from(Complex).where(Complex.detail_crawled_at.isnot(None))
    ).scalar() or 0
    article_detail_filled = db.execute(
        select(func.count()).select_from(Article).where(
            and_(Article.detail_crawled == True, Article.is_active == True)
        )
    ).scalar() or 0
    complex_metric_filled = db.execute(
        select(func.count()).select_from(Complex).where(
            and_(
                Complex.nearby_median_price.isnot(None),
                Complex.jeonse_rate.isnot(None),
                Complex.recent_trades_6m.isnot(None),
            )
        )
    ).scalar() or 0

    return {
        "complex_count": complex_count,
        "article_count": article_count,
        "total_article_count": total_article_count,
        "active_article_count": article_count,
        "user_count": user_count,
        "today_crawl_count": today_crawl_count,
        "error_count_24h": error_count,
        "complex_detail_fill_rate": _safe_fill_rate(complex_detail_filled, complex_count),
        "article_detail_fill_rate": _safe_fill_rate(article_detail_filled, article_count),
        "complex_metric_fill_rate": _safe_fill_rate(complex_metric_filled, complex_count),
        "last_crawl_at": last_crawl.isoformat() if last_crawl else None,
        "recent_crawl_jobs": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "target_id": j.target_id,
                "status": j.status,
                "total_items": j.total_items,
                "processed_items": j.processed_items,
                "error_message": j.error_message,
                # 원문 옆 우리말 한 줄 — 화면은 이쪽을 보이고 원문은 title 로 남긴다
                # (scheduler-status·recrawl 과 같은 함수, 세션 411·418).
                "error_plain": explain_stored_error(j.error_message),
                "started_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
                "created_at": j.created_at.isoformat() if j.created_at else None,
            }
            for j in recent_jobs
        ],
    }
