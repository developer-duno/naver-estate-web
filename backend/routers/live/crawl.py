"""크롤 라우트 — 매물 크롤링 시작/상태/상세"""

import logging
import threading

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from auth.permissions import check_quota
from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel
from deps import get_approved_user, get_db
from routers.serializers import article_to_dict
from services.naver_call_counter import record_call
from services.upsert import build_detail_update_dict
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI

from ._crawl_bg import _background_crawl
from ._shared import _cache, _crawl_lock, _crawl_status, router

logger = logging.getLogger(__name__)


@router.post("/{complex_no}/articles/start-crawl")
def start_live_crawl(
    complex_no: str,
    force: bool = False,
    user: dict = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """Start background crawl, return immediately.

    force=True 면 `crawl_done` 쿨다운 캐시를 무시하고 강제로 크롤 시작.
    사용자가 수동 버튼을 10초 내 재클릭한 경우 FE 가 force=1 을 붙임.
    네이버 API 과호출 방지는 `_active_complexes` 가드가 담당.
    """
    # 최근 크롤링 완료 여부 확인 (동적 TTL 적용) — force=True 면 스킵
    done_key = f"crawl_done:{complex_no}"
    if not force and _cache.get(done_key) is not None:
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
        last_crawled_at = (
            cpx.last_crawled_at.isoformat() if cpx and cpx.last_crawled_at else None
        )
        return {
            "complex_no": complex_no,
            "status": "cached",
            "last_crawled_at": last_crawled_at,
        }

    # Already running? (Lock으로 check-then-set 원자화)
    with _crawl_lock:
        status = _crawl_status.get(complex_no)
        if status and status.get("status") in ("started", "running"):
            return {"complex_no": complex_no, "status": "already_running",
                    "current_page": status.get("current_page", 0),
                    "article_count": status.get("article_count", 0)}

        _crawl_status[complex_no] = {
            "status": "started",
            "phase": "articles",
            "current_page": 0,
            "article_count": 0,
            "has_more": True,
            "error": None,
        }

    # 일일 크롤 쿼터 차감 — 신규 크롤 시작 경로에서만 (cached·already_running 은 위에서 이미 return).
    # expert 1명이 전국 단지를 무제한 스크래핑해 네이버 IP 차단을 유발하는 것을 막는다
    # (infra.md §IP차단 방지). admin 은 무제한 (articles.py export 패턴 답습).
    # 쿼터 초과(429) 시 위에서 세팅한 started 상태를 되돌려 유령 status 잔존을 막는다.
    if user["role"] != "admin":
        try:
            check_quota(db, user["user_id"], "crawl", user["daily_crawl_quota"])
            db.commit()
        except HTTPException:
            with _crawl_lock:
                _crawl_status.pop(complex_no, None)
            raise

    t = threading.Thread(target=_background_crawl, args=(complex_no,), daemon=True)
    t.start()

    # 현재 DB 상 last_crawled_at 동봉 — FE 가 배지 즉시 힌트로 사용
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    last_crawled_at = (
        cpx.last_crawled_at.isoformat() if cpx and cpx.last_crawled_at else None
    )
    return {
        "complex_no": complex_no,
        "status": "started",
        "last_crawled_at": last_crawled_at,
    }


@router.get("/{complex_no}/articles/crawl-status")
def get_crawl_status(complex_no: str):
    """Poll crawl progress."""
    with _crawl_lock:
        status = _crawl_status.get(complex_no)
        if not status:
            return {"complex_no": complex_no, "status": "idle",
                    "detail_phase": None, "detail_crawled_count": 0, "detail_total": 0}
        snapshot = {**status}
        # done/error는 프론트가 수신 후 pop — 즉시 pop하면 프론트가 놓칠 수 있음
        if status.get("_polled_final"):
            _crawl_status.pop(complex_no, None)
        elif status.get("status") in ("done", "done_partial", "error"):
            status["_polled_final"] = True  # 다음 poll에서 정리
    return {"complex_no": complex_no, **snapshot}


@router.get("/article/{article_no}/detail")
def live_article_detail(
    article_no: str,
    db: Session = Depends(get_db),
):
    """매물 상세 실시간 조회 — 네이버 API에서 직접 가져와 DB 반영 후 반환.

    인증 없음 — 비로그인 매물 상세 열람은 의도된 공개 기능
    (frontend/src/components/ArticleDetail.tsx 공개 단지 상세 페이지에서 호출,
    getArticleLive() 는 Authorization 헤더를 보내지 않음).
    네이버 API 호출(NaverEstateAPI.get_article_detail)은 클래스 레벨 공유 throttle
    (MIN_REQUEST_INTERVAL=1초 강제 간격 + 429 지수 백오프, shared/naver_api.py)과
    10분 TTL 캐시(CACHE_TTL=600)로 방어. IP 단위 방어는 RateLimitMiddleware 가
    /api/* 전체에 이미 분당 60회로 적용 중(auth/rate_limiter.py)."""
    # DB에서 기존 매물 + 단지 정보 조회
    art = db.query(ArticleModel).filter(ArticleModel.article_no == article_no).first()
    complex_obj = None
    if art and art.complex_no:
        complex_obj = db.query(ComplexModel).filter(ComplexModel.complex_no == art.complex_no).first()

    # 이미 상세 크롤링 완료 + 핵심 필드가 채워진 경우 바로 반환
    if art and art.detail_crawled:
        # 이전 버그로 detail_crawled=True이지만 필드가 비어있을 수 있음 → 재크롤링
        has_detail = art.heating_type or art.jibun_address or art.use_approve_ymd
        if has_detail:
            return article_to_dict(art, complex_obj)

    # 네이버 API에서 상세 정보 가져오기
    record_call("article_detail_live_fallback")
    detail_data = NaverEstateAPI.get_article_detail(article_no)
    if not detail_data or "error" in detail_data:
        if art:
            return article_to_dict(art, complex_obj)
        raise HTTPException(status_code=404, detail="매물 정보를 찾을 수 없습니다")

    if not art:
        raise HTTPException(status_code=404, detail="매물 정보를 찾을 수 없습니다")

    # 도메인 객체로 변환 후 상세 업데이트
    domain_article = RealEstateArticle(
        article_no=art.article_no,
        trade_type_name=art.trade_type_name or "",
    )
    domain_article.deal_or_warrant_prc = art.deal_or_warrant_prc
    domain_article.rent_prc = art.rent_prc
    domain_article.area2_m2 = art.area2_m2
    domain_article.update_from_detail(detail_data)

    # DB 업데이트
    update_data = build_detail_update_dict(domain_article, detail_data)
    db.query(ArticleModel).filter(ArticleModel.article_no == article_no).update(
        update_data, synchronize_session=False
    )
    db.commit()

    # 갱신된 데이터 반환
    db.expire_all()
    art = db.query(ArticleModel).filter(ArticleModel.article_no == article_no).first()
    return article_to_dict(art, complex_obj)
