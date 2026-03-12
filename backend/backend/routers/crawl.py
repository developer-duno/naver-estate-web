"""크롤링 트리거 API 엔드포인트"""

import logging
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from deps import get_current_user, get_db
from auth.permissions import require_role, check_quota
from auth.audit import log_action
from crawler.service import crawl_complex_articles, crawl_article_details
from db.models import CrawlJob

router = APIRouter()
logger = logging.getLogger(__name__)

# 동시 크롤링 중복 방지 — dict로 타임아웃 복구 지원
_crawling_lock = threading.Lock()
_crawling_complexes: dict[str, float] = {}  # {complex_no: start_monotonic}
_CRAWL_TIMEOUT = 1800  # 30분 — 이 시간 초과 시 자동 해제


@router.post("/complex/{complex_no}")
def trigger_complex_crawl(
    complex_no: str,
    request: Request,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """단지 매물 크롤링 트리거 (admin/expert만, 일일 쿼터 적용)"""
    require_role(user, ["admin", "expert"])

    # admin은 쿼터 무제한
    if user["role"] != "admin":
        check_quota(db, user["user_id"], "crawl", user["daily_crawl_quota"])

    # DB 기반 중복 검사 (다중 워커 환경에서도 안전)
    running_job = db.query(CrawlJob).filter(
        CrawlJob.target_id == complex_no,
        CrawlJob.status.in_(["pending", "running"]),
    ).first()
    if running_job:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="이미 크롤링이 진행 중입니다.",
        )

    with _crawling_lock:
        now = time.monotonic()
        expired = [k for k, v in _crawling_complexes.items() if now - v > _CRAWL_TIMEOUT]
        for k in expired:
            logger.warning("크롤 락 타임아웃 해제: %s", k)
            _crawling_complexes.pop(k)

        if complex_no in _crawling_complexes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="이미 크롤링이 진행 중입니다.",
            )
        _crawling_complexes[complex_no] = now

    # 감사 로그
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    log_action(db, user["user_id"], "crawl_trigger", "complex", complex_no, ip=client_ip)

    def _run():
        try:
            crawl_complex_articles(complex_no)
        except Exception:
            logger.exception("크롤링 실패: %s", complex_no)
        finally:
            with _crawling_lock:
                _crawling_complexes.pop(complex_no, None)

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {"status": "started", "complex_no": complex_no}


@router.post("/details")
def trigger_detail_crawl(
    request: Request,
    batch_size: int = Query(100, ge=1, le=500),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """매물 상세 보강 크롤링 트리거 (admin/expert만)"""
    require_role(user, ["admin", "expert"])

    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else None)
    log_action(db, user["user_id"], "crawl_detail_trigger", details={"batch_size": batch_size}, ip=client_ip)

    def _run():
        try:
            crawl_article_details(batch_size=batch_size)
        except Exception:
            logger.exception("상세 크롤링 실패")

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()

    return {"status": "started", "batch_size": batch_size}
