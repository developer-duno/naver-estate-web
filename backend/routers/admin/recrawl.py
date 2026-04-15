"""관리자 매물 일괄 재크롤 라우트.

- GET  /api/admin/recrawl/status — 지금 실행 안전도(🟢/🟡/🔴) 판정
- POST /api/admin/recrawl/articles — 즉시 일괄 재크롤 (백그라운드 스레드)

안전장치: 전역 flag 기반 중복 실행 차단(한 세션에 1회만 허용),
throttle 싱글톤 및 단지별 active guard는 service_discover 측에 이미 적용됨.
"""

import logging
import re
import threading
from datetime import datetime, timedelta, timezone

from fastapi import Body, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.audit import log_action
from db.models import Complex, CrawlJob
from deps import get_admin_user, get_db

from ._shared import router

# complex_no 형식: 숫자 1~20자리 (Complex.complex_no = String(20))
_COMPLEX_NO_RE = re.compile(r"^\d{1,20}$")

logger = logging.getLogger(__name__)

_KST = timezone(timedelta(hours=9))

# 전역 재크롤 상태 — APScheduler max_instances=1과 동일 보장을 프로세스 내에서도 수행
_recrawl_lock = threading.Lock()
_recrawl_running = False


def _classify_safety(now_kst_hour: int, running_count: int) -> tuple[str, str]:
    """현재 KST 시각과 실행 중 job 수 기반 안전도 판정.

    🟢 safe : 05~10시 KST + running 0건 (자동 작업 가장 한가한 구간)
    🔴 danger: 22~02시 (사용자 피크) 또는 running ≥2건 (자동 배치 겹침)
    🟡 warn : 그 외 (10~22시 활동 시간, running 1건)
    """
    if 22 <= now_kst_hour or now_kst_hour < 2 or running_count >= 2:
        return "danger", "지금 실행하면 네이버 API에 부담이 크거나 자동 작업과 충돌합니다"
    if 5 <= now_kst_hour < 10 and running_count == 0:
        return "safe", "가장 한가한 시간대입니다 — 바로 실행해도 안전합니다"
    return "warn", "주의 — 자동 작업이 돌 수 있는 시간대입니다. 경고를 확인 후 실행하세요"


@router.get("/recrawl/status")
def get_recrawl_status(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """일괄 재크롤 안전도 + 현재 실행 중 작업 목록 반환.

    started_at이 1시간 이상 지난 running 행은 stale(유령)로 간주해 count에서
    제외 — startup sweep의 런타임 방어 레이어. 운영자 안전도 판정이 방치된
    crawl_jobs 잔재로 위험으로 떨어지는 문제 방지.
    """
    from datetime import datetime as _dt

    now_kst = datetime.now(_KST)
    stale_cutoff = _dt.now(timezone.utc) - timedelta(hours=1)
    running_jobs = (
        db.query(CrawlJob)
        .filter(CrawlJob.status == "running", CrawlJob.started_at >= stale_cutoff)
        .order_by(CrawlJob.started_at.desc())
        .limit(10)
        .all()
    )
    level, message = _classify_safety(now_kst.hour, len(running_jobs))

    with _recrawl_lock:
        currently_running = _recrawl_running

    return {
        "level": level,
        "message": message,
        "current_kst_hour": now_kst.hour,
        "running_jobs_count": len(running_jobs),
        "running_jobs": [
            {
                "id": j.id,
                "job_type": j.job_type,
                "scheduler_job_id": j.scheduler_job_id,
                "started_at": j.started_at.isoformat() if j.started_at else None,
            }
            for j in running_jobs
        ],
        "recrawl_in_progress": currently_running,
        "recommended_window_kst": "05:00~10:00",
        "estimated_seconds_per_100": 300,
    }


def _run_batch_wrapped(batch_size: int, parent_job_id: int):
    """백그라운드 실행 wrapper — 부모 CrawlJob 진행률 갱신 + 전역 flag 해제.

    crawl_articles_batch는 단지마다 `complex_articles` row를 개별로 남기므로
    관리자 입장에선 "100단지짜리 일괄 작업"의 집계 단일 행이 필요. 부모 job은
    이 wrapper가 만들고, 루프가 끝나면 하위 row count로 processed_items 갱신 후
    completed로 마감한다.
    """
    global _recrawl_running
    from sqlalchemy import text

    from db.database import SessionLocal

    start_ts = datetime.now(timezone.utc)
    try:
        from crawler.service_discover import crawl_articles_batch
        crawl_articles_batch(batch_size=batch_size, scheduler_job_id="admin_recrawl")
        logger.info("[admin] 일괄 재크롤 완료 — batch_size=%d", batch_size)
        final_status = "completed"
        err_msg = None
    except Exception as e:
        logger.exception("[admin] 일괄 재크롤 실패")
        final_status = "failed"
        err_msg = str(e)[:500]
    finally:
        # 부모 job 행에 진행률 + 상태 반영
        db = SessionLocal()
        try:
            child_count = db.execute(
                text("""
                    SELECT COUNT(*) FROM crawl_jobs
                    WHERE scheduler_job_id = 'admin_recrawl'
                      AND job_type = 'complex_articles'
                      AND started_at >= :start
                """),
                {"start": start_ts},
            ).scalar() or 0
            parent = db.get(CrawlJob, parent_job_id)
            if parent:
                parent.status = final_status
                parent.processed_items = child_count
                parent.completed_at = datetime.now(timezone.utc)
                parent.error_message = err_msg
                db.commit()
        except Exception:
            logger.exception("부모 job 마감 실패 id=%s", parent_job_id)
            db.rollback()
        finally:
            db.close()

        with _recrawl_lock:
            _recrawl_running = False


@router.post("/recrawl/articles")
def run_recrawl_articles(
    payload: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """매물 일괄 재크롤을 백그라운드 스레드로 시작.

    Body: {"batch_size": int 50~500, 기본 100, "force": bool 기본 False}
    🔴 danger일 때는 `force=true` 없이는 거부.
    """
    global _recrawl_running
    batch_size = int(payload.get("batch_size", 100))
    force = bool(payload.get("force", False))
    if batch_size < 50 or batch_size > 500:
        raise HTTPException(status_code=400, detail="batch_size는 50~500 사이여야 합니다")

    # 중복 실행 차단
    with _recrawl_lock:
        if _recrawl_running:
            raise HTTPException(status_code=409, detail="이미 일괄 재크롤이 진행 중입니다")

        # 안전도 재확인 — 🔴면 force 없이 거부. stale 1시간 이상은 제외
        now_kst_hour = datetime.now(_KST).hour
        stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        running_count = (
            db.query(CrawlJob)
            .filter(CrawlJob.status == "running", CrawlJob.started_at >= stale_cutoff)
            .count()
        )
        level, message = _classify_safety(now_kst_hour, running_count)
        if level == "danger" and not force:
            raise HTTPException(status_code=409, detail=f"위험 상태 — {message}")

        _recrawl_running = True

    # 부모 CrawlJob 생성 — 진행률 집계 단일 행
    parent = CrawlJob(
        job_type="bulk_recrawl",
        scheduler_job_id="admin_recrawl",
        status="running",
        total_items=batch_size,
        processed_items=0,
        started_at=datetime.now(timezone.utc),
    )
    db.add(parent)
    db.flush()
    parent_id = parent.id

    log_action(
        db,
        admin["user_id"],
        "admin_recrawl_articles",
        "batch",
        str(batch_size),
        details={"level": level, "force": force, "parent_job_id": parent_id},
    )
    db.commit()

    t = threading.Thread(
        target=_run_batch_wrapped, args=(batch_size, parent_id), daemon=True
    )
    t.start()

    return {
        "status": "started",
        "batch_size": batch_size,
        "level": level,
        "message": message,
        "parent_job_id": parent_id,
    }


@router.get("/recrawl/progress")
def get_recrawl_progress(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """가장 최근 bulk_recrawl 부모 job의 진행률 반환 (카드 내 폴링용).

    스케줄러 자동 작업과 섞이지 않는 단일 집계 뷰. 최근 1시간 이내 job이
    없으면 None 반환.
    """
    from sqlalchemy import text

    cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
    parent = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "bulk_recrawl",
            CrawlJob.started_at >= cutoff,
        )
        .order_by(CrawlJob.started_at.desc())
        .first()
    )
    if not parent:
        return {"job": None}

    # 실행 중이면 하위 complex_articles 행 수를 실시간 집계
    live_processed = parent.processed_items
    if parent.status == "running":
        live_processed = db.execute(
            text("""
                SELECT COUNT(*) FROM crawl_jobs
                WHERE scheduler_job_id = 'admin_recrawl'
                  AND job_type = 'complex_articles'
                  AND started_at >= :start
            """),
            {"start": parent.started_at},
        ).scalar() or 0

    return {
        "job": {
            "id": parent.id,
            "status": parent.status,
            "total_items": parent.total_items,
            "processed_items": int(live_processed),
            "started_at": parent.started_at.isoformat() if parent.started_at else None,
            "completed_at": parent.completed_at.isoformat() if parent.completed_at else None,
            "error_message": parent.error_message,
        }
    }


def _run_single_recrawl(complex_no: str, sido: str | None, sigungu: str | None):
    """백그라운드 스레드 wrapper — crawl_complex_articles 단건 호출."""
    try:
        from crawler.service_discover import crawl_complex_articles
        crawl_complex_articles(
            complex_no=complex_no,
            sido=sido,
            sigungu=sigungu,
            scheduler_job_id="admin_single_recrawl",
        )
        logger.info("[admin] 단건 재크롤 완료 — complex_no=%s", complex_no)
    except Exception:
        logger.exception("[admin] 단건 재크롤 실패 complex_no=%s", complex_no)


@router.post("/recrawl/single")
def run_recrawl_single(
    payload: dict = Body(default_factory=dict),
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """특정 단지 1개를 즉시 강제 재크롤.

    Body: {"complex_no": str, "force": bool 기본 False}
    - complex_no 형식: 숫자 1~20자리
    - Complex 테이블에 존재하지 않으면 404
    - 1시간 이내 같은 단지 재크롤 있으면 force=False 시 409
    """
    complex_no = str(payload.get("complex_no", "")).strip()
    force = bool(payload.get("force", False))

    # 입력 검증 — 숫자만 1~20자리
    if not _COMPLEX_NO_RE.match(complex_no):
        raise HTTPException(
            status_code=400,
            detail="complex_no는 숫자 1~20자리여야 합니다",
        )

    # 단지 존재 확인
    complex_row = db.get(Complex, complex_no)
    if complex_row is None:
        raise HTTPException(status_code=404, detail="해당 단지를 찾을 수 없습니다")

    # 1시간 내 중복 차단 (force 없이만)
    if not force:
        recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        recent = (
            db.query(CrawlJob)
            .filter(
                CrawlJob.job_type == "complex_articles",
                CrawlJob.target_id == complex_no,
                CrawlJob.started_at >= recent_cutoff,
            )
            .first()
        )
        if recent is not None:
            raise HTTPException(
                status_code=409,
                detail="이 단지는 1시간 내에 이미 재크롤된 이력이 있습니다. force=true 로 우회 가능",
            )

    log_action(
        db,
        admin["user_id"],
        "admin_recrawl_single",
        "complex",
        complex_no,
        details={"force": force},
    )
    db.commit()

    t = threading.Thread(
        target=_run_single_recrawl,
        args=(complex_no, complex_row.sido, complex_row.sigungu),
        daemon=True,
    )
    t.start()

    return {
        "status": "started",
        "complex_no": complex_no,
        "complex_name": complex_row.complex_name,
    }
