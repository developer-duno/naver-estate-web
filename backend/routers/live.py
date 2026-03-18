"""Live crawling API"""

import logging
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from deps import get_db, get_approved_user
from db.models import Complex as ComplexModel, Article as ArticleModel
from db.database import SessionLocal
from routers.serializers import complex_to_dict, article_to_dict
from services.cache import TTLCache
from services.upsert import (
    upsert_complex_from_search,
    upsert_article,
    build_detail_update_dict,
    delete_missing_articles,
)
from services.enricher import enrich_complex_detail
from shared.constants import NAVER_COMPLEX_ARTICLES_API, NAVER_LAND_BASE
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()

CRAWL_REAL_ESTATE_TYPES = {"APT", "ABYG", "JGC", "PRE", "OPST", "OBYG", "RDV"}

# ── Rate limit & 배치 상수 ──
MAX_SEARCH_PAGES = 50            # 검색 최대 페이지 (무한 루프 방지)
INTER_PAGE_DELAY = 0.5           # 페이지 간 대기 (초)
INTER_GROUP_DELAY = 0.3          # 검색 그룹 간 대기 (초)
DETAIL_CRAWL_DELAY = 1.0         # 상세 크롤링 건별 대기 (초)
PAGE_COMMIT_INTERVAL = 5         # N페이지마다 DB 커밋
DETAIL_COMMIT_INTERVAL = 50      # N건마다 DB 커밋

# 네이버 검색 API는 realEstateType 파라미터를 무시함
# 키워드에 유형명을 추가해야 해당 유형 결과가 반환됨
# JGC는 그룹0(아파트 계열)과 그룹2("재건축" 전용)에 모두 존재.
# 기본 검색에서 APT와 함께 나오는 JGC + "재건축" 키워드로만 잡히는 JGC를 모두 확보.
# seen set으로 중복 제거됨.
KEYWORD_SUFFIX_GROUPS = [
    (None, {"APT", "ABYG", "JGC", "PRE"}),           # 기본 검색 = 아파트 계열
    ("오피스텔", {"OPST", "OBYG"}),                     # "대전 오피스텔"
    ("재건축", {"JGC"}),                                # "대전 재건축" (더 정확한 결과)
]

# ── TTL Cache ──
_cache = TTLCache()

# -- Background crawl progress tracking --
_crawl_status: dict[str, dict] = {}
_crawl_lock = threading.Lock()



def _parse_allowed_types(types: str | None) -> set[str]:
    """types 쿼리 파라미터를 허용 유형 set으로 변환"""
    if types and types.strip():
        return set(t.strip() for t in types.split(",") if t.strip()) & CRAWL_REAL_ESTATE_TYPES
    return set(CRAWL_REAL_ESTATE_TYPES)


def _search_all_types(keyword: str, allowed_types: set[str], db: Session,
                      upsert_kwargs: dict | None = None):
    """매물유형 그룹별로 네이버 API 검색 → upsert → 결과 병합

    네이버 검색 API는 realEstateType 파라미터를 무시하므로,
    키워드에 유형명을 추가하여 해당 유형 결과를 가져옴.
    예: "대전" → "대전", "대전 오피스텔", "대전 재건축"
    """
    all_complexes: list[dict] = []
    seen: set[str] = set()
    first_error = None

    for suffix, group_codes in KEYWORD_SUFFIX_GROUPS:
        if not (group_codes & allowed_types):
            continue

        search_keyword = f"{keyword} {suffix}" if suffix else keyword
        page = 1
        while page <= MAX_SEARCH_PAGES:
            result = NaverEstateAPI.search_by_keyword(search_keyword, page=page)
            if not result or "error" in result:
                if page == 1 and first_error is None:
                    first_error = result
                break

            complex_list = result.get("complexes") or result.get("complexList") or []
            if not complex_list:
                break

            for c_data in complex_list:
                re_type = c_data.get("realEstateTypeCode", "")
                if not re_type or re_type not in allowed_types:
                    continue
                cpx = upsert_complex_from_search(db, c_data, **(upsert_kwargs or {}))
                if cpx and cpx["complex_no"] not in seen:
                    seen.add(cpx["complex_no"])
                    all_complexes.append(cpx)

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(INTER_PAGE_DELAY)

        # 그룹 간 대기 (rate limit 방지)
        if suffix:
            time.sleep(INTER_GROUP_DELAY)

    # 모든 그룹 실패 + 결과 0건이면 502
    if not all_complexes and first_error is not None:
        detail = first_error.get("error", "네이버 API 요청 실패") if first_error else "네이버 API 응답 없음"
        raise HTTPException(status_code=502, detail=str(detail))

    return all_complexes


def _build_search_response(all_complexes: list[dict], db: Session) -> dict:
    """검색 결과에 매물 수 추가"""
    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)
    return {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }


@router.get("/search")
def live_search(
    q: str = Query(..., min_length=1, max_length=100, description="Search keyword"),
    types: str = Query(None, max_length=100, description="매물유형 코드 (쉼표 구분: APT,OPST,JGC 등)"),
    db: Session = Depends(get_db),
):
    """Live keyword search - Naver API -> DB upsert -> return"""
    allowed_types = _parse_allowed_types(types)
    cache_key = f"search:{q}:{','.join(sorted(allowed_types))}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    all_complexes = _search_all_types(q, allowed_types, db)
    response = _build_search_response(all_complexes, db)
    _cache.set(cache_key, response)
    return response


@router.get("/region")
def live_region(
    sido: str = Query(...),
    sigungu: str = Query(None),
    dong: str = Query(None),
    types: str = Query(None, max_length=100, description="매물유형 코드 (쉼표 구분: APT,OPST,JGC 등)"),
    db: Session = Depends(get_db),
):
    """Live region search - Naver API -> DB upsert -> return"""
    allowed_types = _parse_allowed_types(types)
    cache_key = f"region:{sido}:{sigungu}:{dong}:{','.join(sorted(allowed_types))}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    keyword = sido
    if sigungu and sigungu != sido:
        keyword += f" {sigungu}"
    if dong:
        keyword += f" {dong}"

    all_complexes = _search_all_types(
        keyword, allowed_types, db,
        upsert_kwargs={"sido": sido, "sigungu": sigungu, "dong": dong},
    )
    response = _build_search_response(all_complexes, db)
    _cache.set(cache_key, response)
    return response


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
def start_live_crawl(complex_no: str, user: dict = Depends(get_approved_user)):
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
        time.sleep(INTER_PAGE_DELAY)

    # Deactivate missing articles
    delete_missing_articles(db, complex_no, all_article_nos)

    # Update last_crawled_at
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
        {"last_crawled_at": utcnow()}
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
            "phase": "articles",
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

            if page % PAGE_COMMIT_INTERVAL == 0:
                db.commit()

            _crawl_status[complex_no]["current_page"] = page
            _crawl_status[complex_no]["article_count"] = len(all_article_nos)

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(INTER_PAGE_DELAY)

        _crawl_status[complex_no]["has_more"] = False

        # Deactivate missing articles
        delete_missing_articles(db, complex_no, all_article_nos)

        # Update last_crawled_at
        db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
            {"last_crawled_at": utcnow()}
        )
        db.commit()

        # 단지정보 보강
        _crawl_status[complex_no]["phase"] = "enriching"
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
        if cpx:
            enrich_complex_detail(db, complex_no)

        # Phase 2: 상세 정보 자동 크롤링
        _crawl_status[complex_no]["phase"] = "details"
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

        if (i + 1) % DETAIL_COMMIT_INTERVAL == 0:
            db.commit()

        time.sleep(DETAIL_CRAWL_DELAY)

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
