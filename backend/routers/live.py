"""Live crawling API"""

import logging
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from deps import get_db
from db.models import Complex as ComplexModel, Article as ArticleModel
from db.database import SessionLocal
from routers.serializers import complex_to_dict, article_to_dict
from services.cache import TTLCache
from services.upsert import (
    upsert_complex_from_search,
    upsert_article,
    build_detail_update_dict,
    deactivate_missing_articles,
)
from services.enricher import enrich_complex_detail
from shared.constants import NAVER_COMPLEX_ARTICLES_API, NAVER_LAND_BASE
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI

logger = logging.getLogger(__name__)
router = APIRouter()

CRAWL_REAL_ESTATE_TYPES = {"APT", "ABYG", "JGC", "PRE", "OPST", "OBYG", "RDV"}

# ── TTL Cache ──
_cache = TTLCache()

# -- Background crawl progress tracking --
_crawl_status: dict[str, dict] = {}
_crawl_lock = threading.Lock()


def _utcnow():
    return datetime.now(timezone.utc)


@router.get("/search")
def live_search(
    q: str = Query(..., min_length=1, description="Search keyword"),
    db: Session = Depends(get_db),
):
    """Live keyword search - Naver API -> DB upsert -> return"""
    cache_key = f"search:{q}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_complexes = []
    page = 1

    while True:
        result = NaverEstateAPI.search_by_keyword(q, page=page)
        if not result or "error" in result:
            if page == 1:
                detail = result.get("error", "네이버 API 요청 실패") if result else "네이버 API 응답 없음"
                raise HTTPException(status_code=502, detail=str(detail))
            break

        complex_list = result.get("complexes") or result.get("complexList") or []
        if not complex_list:
            break

        for c_data in complex_list:
            re_type = c_data.get("realEstateTypeCode", "")
            if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                continue
            cpx = upsert_complex_from_search(db, c_data)
            if cpx:
                all_complexes.append(cpx)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)

    return {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }


@router.get("/region")
def live_region(
    sido: str = Query(...),
    sigungu: str = Query(None),
    dong: str = Query(None),
    db: Session = Depends(get_db),
):
    """Live region search - Naver API -> DB upsert -> return"""
    cache_key = f"region:{sido}:{sigungu}:{dong}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    keyword = sido
    if sigungu:
        keyword += f" {sigungu}"
    if dong:
        keyword += f" {dong}"

    all_complexes = []
    page = 1

    while True:
        result = NaverEstateAPI.search_by_keyword(keyword, page=page)
        if not result or "error" in result:
            if page == 1:
                detail = result.get("error", "네이버 API 요청 실패") if result else "네이버 API 응답 없음"
                raise HTTPException(status_code=502, detail=str(detail))
            break

        complex_list = result.get("complexes") or result.get("complexList") or []
        if not complex_list:
            break

        for c_data in complex_list:
            re_type = c_data.get("realEstateTypeCode", "")
            if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                continue
            cpx = upsert_complex_from_search(db, c_data, sido=sido, sigungu=sigungu, dong=dong)
            if cpx:
                all_complexes.append(cpx)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)

    result = {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }
    _cache.set(cache_key, result)
    return result


def _fetch_articles_all_trade_types(complex_no: str, page: int = 1):
    """Fetch articles with all trade types (A1=매매, B1=전세, B2=월세, B3=단기임대).

    NaverEstateAPI.get_complex_articles() uses empty tradeType= which may exclude
    월세/단기임대. This helper explicitly includes all trade types.
    """
    token = NaverEstateAPI._ensure_jwt(complex_no)
    headers = {
        'Referer': f'{NAVER_LAND_BASE}/complexes/{complex_no}',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'

    url = (
        f"{NAVER_COMPLEX_ARTICLES_API}/{complex_no}"
        f"?realEstateType=APT%3AABYG%3AJGC%3APRE%3AOPST%3AOBYG%3ARDV"
        f"&tradeType=A1%3AB1%3AB2%3AB3"
        f"&tag=%3A%3A%3A%3A%3A%3A%3A%3A"
        f"&rentPriceMin=0&rentPriceMax=900000000"
        f"&priceMin=0&priceMax=900000000"
        f"&areaMin=0&areaMax=900000000"
        f"&oldBuildYears&recentlyBuildYears"
        f"&minHouseHoldCount&maxHouseHoldCount"
        f"&showArticle=false&sameAddressGroup=false"
        f"&minMaintenanceCost&maxMaintenanceCost"
        f"&priceType=RETAIL&directions="
        f"&page={page}&complexNo={complex_no}"
        f"&buildingNos=&areaNos=&type=list&order=rank"
    )
    return NaverEstateAPI._request_with_retry(url, extra_headers=headers)


@router.post("/{complex_no}/articles/start-crawl")
def start_live_crawl(complex_no: str):
    """Start background crawl, return immediately."""
    # Cache hit -> skip crawl
    cache_key = f"articles:{complex_no}"
    if _cache.get(cache_key) is not None:
        return {"complex_no": complex_no, "status": "cached"}

    # Already running? (Lock으로 check-then-set 원자화)
    with _crawl_lock:
        status = _crawl_status.get(complex_no)
        if status and status.get("status") in ("started", "running"):
            return {"complex_no": complex_no, "status": "already_running",
                    "current_page": status.get("current_page", 0),
                    "article_count": status.get("article_count", 0)}

        _crawl_status[complex_no] = {
            "status": "started",
            "current_page": 0,
            "article_count": 0,
            "has_more": True,
            "error": None,
        }

    t = threading.Thread(target=_background_crawl, args=(complex_no,), daemon=True)
    t.start()

    return {"complex_no": complex_no, "status": "started"}


@router.get("/{complex_no}/articles/crawl-status")
def get_crawl_status(complex_no: str):
    """Poll crawl progress."""
    with _crawl_lock:
        status = _crawl_status.get(complex_no)
        if not status:
            return {"complex_no": complex_no, "status": "idle",
                    "detail_phase": None, "detail_crawled_count": 0, "detail_total": 0}
        snapshot = {**status}
        if status.get("status") in ("done", "error"):
            _crawl_status.pop(complex_no, None)
    return {"complex_no": complex_no, **snapshot}


@router.get("/{complex_no}/articles")
def live_articles(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """Live article crawl - Naver API -> DB upsert -> return"""
    cache_key = f"articles:{complex_no}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_article_nos = set()
    page = 1

    while True:
        result = _fetch_articles_all_trade_types(complex_no, page=page)
        if not result or "error" in result:
            if page == 1:
                detail = result.get("error", "네이버 매물 API 요청 실패") if result else "네이버 API 응답 없음"
                raise HTTPException(status_code=502, detail=str(detail))
            break

        article_list = result.get("articleList") or []
        if not article_list:
            break

        for a_data in article_list:
            article = RealEstateArticle.from_dict(a_data)
            article.complex_no = complex_no
            upsert_article(db, article)
            all_article_nos.add(article.article_no)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    # Deactivate missing articles
    deactivate_missing_articles(db, complex_no, all_article_nos)

    # Update last_crawled_at
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
        {"last_crawled_at": _utcnow()}
    )
    db.commit()

    # Enrich complex detail if not yet done
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    if cpx:  # Always re-enrich to update new fields
        enrich_complex_detail(db, complex_no)

    # Return active articles + refreshed complex info from DB
    articles = (
        db.query(ArticleModel)
        .filter(ArticleModel.complex_no == complex_no, ArticleModel.is_active == True)
        .all()
    )

    # Re-fetch complex after enrichment to return updated info
    cpx_refreshed = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()

    result = {
        "articles": [article_to_dict(a) for a in articles],
        "total": len(articles),
        "page": 1,
        "page_size": len(articles),
        "complex": complex_to_dict(cpx_refreshed) if cpx_refreshed else None,
    }
    _cache.set(cache_key, result)
    return result


def _background_crawl(complex_no: str):
    """Run article crawl in background thread with per-page commits."""
    db = SessionLocal()
    try:
        _crawl_status[complex_no] = {
            "status": "running",
            "current_page": 0,
            "article_count": 0,
            "has_more": True,
            "error": None,
        }
        all_article_nos = set()
        page = 1

        while True:
            result = _fetch_articles_all_trade_types(complex_no, page=page)
            if not result or "error" in result:
                if page == 1:
                    _crawl_status[complex_no]["status"] = "error"
                    _crawl_status[complex_no]["error"] = str(
                        result.get("error", "네이버 API 요청 실패") if result else "네이버 API 응답 없음"
                    )
                    return
                break

            article_list = result.get("articleList") or []
            if not article_list:
                break

            for a_data in article_list:
                article = RealEstateArticle.from_dict(a_data)
                article.complex_no = complex_no
                upsert_article(db, article, commit=False, track_price=True)
                all_article_nos.add(article.article_no)

            # 5페이지마다 배치 커밋 (트랜잭션 오버헤드 감소)
            if page % 5 == 0:
                db.commit()

            _crawl_status[complex_no]["current_page"] = page
            _crawl_status[complex_no]["article_count"] = len(all_article_nos)

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(0.5)

        _crawl_status[complex_no]["has_more"] = False

        # Deactivate missing articles
        deactivate_missing_articles(db, complex_no, all_article_nos)

        # Update last_crawled_at
        db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
            {"last_crawled_at": _utcnow()}
        )
        db.commit()

        # Enrich complex detail if not yet done
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
        if cpx:  # Always re-enrich to update new fields
            enrich_complex_detail(db, complex_no)

        # Phase 2: 상세 정보 자동 크롤링
        _crawl_status[complex_no]["detail_phase"] = "running"
        try:
            _crawl_details_for_complex(db, complex_no)
        except Exception as e:
            logger.warning("Detail crawl phase failed: %s → %s", complex_no, e)
        _crawl_status[complex_no]["detail_phase"] = "done"

        _crawl_status[complex_no]["status"] = "done"
        logger.info("Background crawl done: %s -> %d articles", complex_no, len(all_article_nos))

    except Exception as e:
        logger.exception("Background crawl error: %s", complex_no)
        _crawl_status[complex_no]["status"] = "error"
        _crawl_status[complex_no]["error"] = str(e)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()
        # Invalidate cache so next DB read gets fresh data
        _cache.delete(f"articles:{complex_no}")


def _get_article_counts(db: Session, complex_nos: list[str]) -> dict[str, int]:
    """Get active article counts per complex"""
    if not complex_nos:
        return {}
    from sqlalchemy import func
    rows = (
        db.query(ArticleModel.complex_no, func.count(ArticleModel.article_no))
        .filter(ArticleModel.complex_no.in_(complex_nos), ArticleModel.is_active == True)
        .group_by(ArticleModel.complex_no)
        .all()
    )
    return {r[0]: r[1] for r in rows}


def _crawl_details_for_complex(db, complex_no: str):
    """단지의 미크롤링 매물 상세를 일괄 수집 (백그라운드 워커에서 호출)"""
    articles = (
        db.query(ArticleModel)
        .filter(
            ArticleModel.complex_no == complex_no,
            ArticleModel.is_active == True,
            ArticleModel.detail_crawled == False,
        )
        .all()
    )
    if not articles:
        return

    total = len(articles)
    _crawl_status[complex_no]["detail_total"] = total
    _crawl_status[complex_no]["detail_crawled_count"] = 0

    for i, art in enumerate(articles):
        try:
            detail_data = NaverEstateAPI.get_article_detail(art.article_no)
            if detail_data and "error" not in detail_data:
                domain_article = RealEstateArticle(
                    article_no=art.article_no,
                    trade_type_name=art.trade_type_name or "",
                )
                domain_article.deal_or_warrant_prc = art.deal_or_warrant_prc
                domain_article.rent_prc = art.rent_prc
                domain_article.area2_m2 = art.area2_m2
                domain_article.update_from_detail(detail_data)

                update_data = build_detail_update_dict(domain_article, detail_data)
                db.query(ArticleModel).filter(
                    ArticleModel.article_no == art.article_no
                ).update(update_data, synchronize_session=False)
        except Exception as e:
            logger.warning("Article detail crawl failed: %s → %s", art.article_no, e)

        _crawl_status[complex_no]["detail_crawled_count"] = i + 1

        # 50건 단위 커밋
        if (i + 1) % 50 == 0:
            db.commit()

        time.sleep(1.0)  # 레이트 리밋

    db.commit()  # 나머지 커밋
    logger.info("Detail crawl done for %s: %d articles", complex_no, total)


@router.get("/article/{article_no}/detail")
def live_article_detail(
    article_no: str,
    db: Session = Depends(get_db),
):
    """매물 상세 실시간 조회 — 네이버 API에서 직접 가져와 DB 반영 후 반환"""
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
