"""Live crawling API"""

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from starlette import status as http_status

from db.database import SessionLocal
from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel
from deps import get_approved_user, get_db
from routers.serializers import article_to_dict, complex_to_dict
from services.cache import get_cache
from services.enricher import enrich_complex_detail
from services.upsert import (
    build_detail_update_dict,
    delete_missing_articles,
    upsert_article,
    upsert_complex_from_search,
)
from shared.constants import NAVER_COMPLEX_ARTICLES_API, NAVER_LAND_BASE
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from utils import utcnow

logger = logging.getLogger(__name__)
router = APIRouter()

CRAWL_REAL_ESTATE_TYPES = {"APT", "ABYG", "JGC", "PRE", "OPST", "OBYG", "RDV"}

# ── Rate limit & 배치 상수 ──
MAX_SEARCH_PAGES = 50            # 검색 최대 페이지 (무한 루프 방지)
INTER_PAGE_DELAY = 0.1           # 페이지 간 대기 (초) — shared _throttle(1.0s)이 실제 제한
INTER_GROUP_DELAY = 0.2          # 검색 그룹 간 대기 (초)
DETAIL_CRAWL_DELAY = 0.3         # 상세 크롤링 건별 대기 (초) — shared _throttle과 합산
PAGE_COMMIT_INTERVAL = 5         # N페이지마다 DB 커밋
DETAIL_COMMIT_INTERVAL = 50      # N건마다 DB 커밋
DETAIL_FAILURE_THRESHOLD = 0.5   # 상세 크롤 실패율 임계치 (50% 초과 시 done_partial)

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
_cache = get_cache("live", dynamic=True)

# -- Background crawl progress tracking --
_crawl_status: dict[str, dict] = {}
_crawl_lock = threading.Lock()

# -- Price history collection --
_price_collect_status: dict[str, dict] = {}
_price_collect_lock = threading.Lock()
_price_collect_semaphore = threading.Semaphore(3)



def _parse_allowed_types(types: str | None) -> set[str]:
    """types 쿼리 파라미터를 허용 유형 set으로 변환"""
    if types and types.strip():
        return set(t.strip() for t in types.split(",") if t.strip()) & CRAWL_REAL_ESTATE_TYPES
    return set(CRAWL_REAL_ESTATE_TYPES)


def _search_one_group(keyword: str, suffix: str | None, group_codes: set[str],
                      allowed_types: set[str], upsert_kwargs: dict | None = None
                      ) -> tuple[list[dict], dict | None]:
    """단일 그룹 검색 (스레드 안전 — 자체 DB 세션 사용)"""
    complexes: list[dict] = []
    first_error = None
    search_keyword = f"{keyword} {suffix}" if suffix else keyword

    db = SessionLocal()
    try:
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
                if cpx:
                    complexes.append(cpx)

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(INTER_PAGE_DELAY)
    finally:
        db.close()

    return complexes, first_error


def _search_all_types(keyword: str, allowed_types: set[str], db: Session,
                      upsert_kwargs: dict | None = None):
    """매물유형 그룹별로 네이버 API 검색 → upsert → 결과 병합 (병렬)

    네이버 검색 API는 realEstateType 파라미터를 무시하므로,
    키워드에 유형명을 추가하여 해당 유형 결과를 가져옴.
    예: "대전" → "대전", "대전 오피스텔", "대전 재건축"
    """
    # 실행할 그룹 필터링
    groups_to_search = [
        (suffix, group_codes)
        for suffix, group_codes in KEYWORD_SUFFIX_GROUPS
        if group_codes & allowed_types
    ]

    if not groups_to_search:
        return []

    all_complexes: list[dict] = []
    seen: set[str] = set()
    first_error = None

    # 그룹별 병렬 호출
    with ThreadPoolExecutor(max_workers=len(groups_to_search)) as executor:
        futures = {
            executor.submit(
                _search_one_group, keyword, suffix, group_codes,
                allowed_types, upsert_kwargs,
            ): (suffix, group_codes)
            for suffix, group_codes in groups_to_search
        }
        for future in as_completed(futures):
            complexes, error = future.result()
            if error and first_error is None:
                first_error = error
            for cpx in complexes:
                if cpx["complex_no"] not in seen:
                    seen.add(cpx["complex_no"])
                    all_complexes.append(cpx)

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
            "phase": "articles",
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
        # done/error는 프론트가 수신 후 pop — 즉시 pop하면 프론트가 놓칠 수 있음
        if status.get("_polled_final"):
            _crawl_status.pop(complex_no, None)
        elif status.get("status") in ("done", "error"):
            status["_polled_final"] = True  # 다음 poll에서 정리
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

    # Enrich complex detail
    enrich_complex_detail(db, complex_no)

    # Return active articles + refreshed complex info from DB
    articles = (
        db.query(ArticleModel)
        .filter(ArticleModel.complex_no == complex_no, ArticleModel.is_active == True)
        .all()
    )

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


def _update_crawl_status(complex_no: str, **updates):
    """스레드 안전한 크롤 상태 업데이트"""
    with _crawl_lock:
        if complex_no in _crawl_status:
            _crawl_status[complex_no].update(updates)


def _background_crawl(complex_no: str):
    """Run article crawl in background thread with per-page commits."""
    db = SessionLocal()
    try:
        with _crawl_lock:
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

        # 기존 가격 일괄 조회 (N+1 방지)
        existing_prices = {
            row[0]: (row[1], row[2])
            for row in db.query(
                ArticleModel.article_no, ArticleModel.numeric_price, ArticleModel.numeric_rent_price
            ).filter(
                ArticleModel.complex_no == complex_no, ArticleModel.is_active == True
            ).all()
        }

        while True:
            result = _fetch_articles_all_trade_types(complex_no, page=page)
            if not result or "error" in result:
                if page == 1:
                    _update_crawl_status(complex_no,
                        status="error",
                        error=str(result.get("error", "네이버 API 요청 실패") if result else "네이버 API 응답 없음"),
                    )
                    return
                break

            article_list = result.get("articleList") or []
            if not article_list:
                break

            for a_data in article_list:
                article = RealEstateArticle.from_dict(a_data)
                article.complex_no = complex_no
                upsert_article(db, article, commit=False, track_price=True, existing_prices=existing_prices)
                all_article_nos.add(article.article_no)

            if page % PAGE_COMMIT_INTERVAL == 0:
                db.commit()

            _update_crawl_status(complex_no, current_page=page, article_count=len(all_article_nos))

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(INTER_PAGE_DELAY)

        _update_crawl_status(complex_no, has_more=False)

        # Deactivate missing articles
        delete_missing_articles(db, complex_no, all_article_nos)

        # Update last_crawled_at
        db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
            {"last_crawled_at": utcnow()}
        )
        db.commit()

        # 단지정보 보강
        _update_crawl_status(complex_no, phase="enriching")
        cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
        if cpx:
            enrich_complex_detail(db, complex_no)

        # Phase 2: 상세 정보 자동 크롤링
        _update_crawl_status(complex_no, phase="details", detail_phase="running")
        try:
            _crawl_details_for_complex(db, complex_no)
        except Exception as e:
            logger.warning("Detail crawl phase failed: %s → %s", complex_no, e)
        # done_partial이 설정되었으면 유지, 아니면 done으로 설정
        with _crawl_lock:
            current_status = _crawl_status.get(complex_no, {}).get("status")
        final_status = current_status if current_status == "done_partial" else "done"
        _update_crawl_status(complex_no, detail_phase="done", status=final_status)
        logger.info("Background crawl done: %s -> %d articles", complex_no, len(all_article_nos))

    except Exception as e:
        logger.exception("Background crawl error: %s", complex_no)
        _update_crawl_status(complex_no, status="error", error=str(e))
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()
        # Invalidate cache so next DB read gets fresh data
        _cache.delete(f"articles:{complex_no}")
        # complexes.py의 필터/통계 캐시도 무효화 (레지스트리 기반, 순환 import 없음)
        complexes_cache = get_cache("complexes", dynamic=True)
        complexes_cache.delete(f"filter_options:{complex_no}")
        complexes_cache.delete(f"price_stats:{complex_no}")


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
    total_active = db.query(ArticleModel).filter(
        ArticleModel.complex_no == complex_no,
        ArticleModel.is_active == True,
    ).count()
    articles = (
        db.query(ArticleModel)
        .filter(
            ArticleModel.complex_no == complex_no,
            ArticleModel.is_active == True,
            ArticleModel.detail_crawled == False,
        )
        .all()
    )
    skipped = total_active - len(articles)
    if not articles:
        _update_crawl_status(complex_no, detail_total=0, detail_crawled_count=0,
                             detail_skipped_count=skipped)
        return

    total = len(articles)
    _update_crawl_status(complex_no, detail_total=total, detail_crawled_count=0,
                         detail_skipped_count=skipped)

    def _fetch_detail(article_no: str):
        """워커 스레드: 네트워크 요청만 수행, DB 접근 금지. rate limiting 포함."""
        time.sleep(DETAIL_CRAWL_DELAY)  # 워커 안에서 rate limiting
        try:
            return article_no, NaverEstateAPI.get_article_detail(article_no)
        except Exception as e:
            logger.warning("Article detail fetch failed: %s → %s", article_no, e)
            return article_no, None

    # article_no → DB article 매핑
    art_map = {art.article_no: art for art in articles}
    crawled_count = 0
    failed_count = 0

    # 2스레드 병렬: 네트워크 I/O 병렬화, DB 쓰기는 메인 스레드에서 순차 처리
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(_fetch_detail, art.article_no) for art in articles]

        for i, future in enumerate(as_completed(futures)):
            article_no, detail_data = future.result()
            art = art_map[article_no]

            if detail_data and "error" not in detail_data:
                try:
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
                    crawled_count += 1
                except Exception as e:
                    logger.warning("Article detail update failed: %s → %s", art.article_no, e)
                    failed_count += 1
            else:
                failed_count += 1

            _update_crawl_status(complex_no, detail_crawled_count=i + 1)

            if (i + 1) % DETAIL_COMMIT_INTERVAL == 0:
                db.commit()

    db.commit()  # 나머지 커밋

    # 실패율 50% 초과 시 부분 완료 표시
    if total > 0 and failed_count > total * DETAIL_FAILURE_THRESHOLD:
        _update_crawl_status(complex_no, status="done_partial")

    logger.info("Detail crawl done for %s: %d/%d articles (failed: %d)",
                complex_no, crawled_count, total, failed_count)


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


# ── 실거래가 on-demand 수집 ──

_PRICE_COLLECT_TIMEOUT = 600  # 10분
_PRICE_COLLECT_TTL = 86400    # 24시간 — 마지막 수집 후 이 시간 내 재수집 스킵


def _cleanup_stale_price_collects():
    """10분 이상 된 수집 상태 자동 정리 (lock 내에서 호출)."""
    now = time.time()
    expired = [k for k, v in _price_collect_status.items()
               if now - v.get("started_at", now) > _PRICE_COLLECT_TIMEOUT]
    for k in expired:
        _price_collect_status.pop(k, None)


@router.post("/{complex_no}/price-history/start-collect")
def start_price_collect(
    complex_no: str,
    user: dict = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """실거래가 시세 on-demand 수집 시작 (백그라운드). 24시간 TTL 내 재수집 스킵."""
    from datetime import timedelta

    from auth.permissions import check_quota, require_role
    from db.models import ComplexPriceHistory, UserProfile

    require_role(user, ["admin", "expert"])

    # 단지 존재 확인
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

    # TTL 체크 — 24시간 이내 수집된 데이터가 있으면 스킵
    cutoff = utcnow() - timedelta(seconds=_PRICE_COLLECT_TTL)
    recent = (
        db.query(ComplexPriceHistory)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.recorded_at >= cutoff,
        )
        .first()
    )
    if recent:
        return {"complex_no": complex_no, "status": "fresh"}

    # 쿼터 확인
    profile = db.query(UserProfile).filter(UserProfile.user_id == user["user_id"]).first()
    quota_limit = profile.daily_price_collect_quota if profile else 5
    check_quota(db, user["user_id"], "price_collect", quota_limit)

    # 이미 수집 중인지 확인 (2분 이상 running이면 stale로 간주)
    with _price_collect_lock:
        _cleanup_stale_price_collects()
        status = _price_collect_status.get(complex_no)
        if status and status.get("status") == "running":
            elapsed = time.time() - status.get("started_at", 0)
            if elapsed < 120:  # 2분 이내면 진짜 수집 중
                raise HTTPException(status_code=409, detail="이미 수집 중입니다")
            # 2분 이상이면 stale — 정리하고 새로 시작
            _price_collect_status.pop(complex_no, None)
        elif status:
            # done/error 상태는 정리하고 새 수집 허용
            _price_collect_status.pop(complex_no, None)

    # Semaphore 확인 (동시 3개 제한)
    if not _price_collect_semaphore.acquire(blocking=False):
        raise HTTPException(
            status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
            detail="동시 수집 요청이 가득 찼습니다. 잠시 후 다시 시도해주세요.",
        )

    # 상태 등록
    with _price_collect_lock:
        _price_collect_status[complex_no] = {
            "status": "running",
            "collected": 0,
            "failed": 0,
            "total": 0,
            "started_at": time.time(),
        }

    db.commit()  # 쿼터 카운터 반영

    def _progress_callback(collected: int, failed: int, total: int):
        """수집 중 실시간 진행률 업데이트"""
        with _price_collect_lock:
            st = _price_collect_status.get(complex_no)
            if st and st["status"] == "running":
                st["collected"] = collected
                st["failed"] = failed
                st["total"] = total

    def _run():
        collect_db = SessionLocal()
        try:
            from crawler.service import collect_price_history_for_complex
            result = collect_price_history_for_complex(
                collect_db, complex_no, on_progress=_progress_callback,
            )
            with _price_collect_lock:
                _price_collect_status[complex_no].update({
                    "status": "done",
                    "collected": result["collected"],
                    "failed": result["failed"],
                    "total": result["total"],
                })
            # 캐시 무효화
            from routers.complexes import _price_history_cache
            _price_history_cache.delete_by_prefix(f"price_history:{complex_no}:")
        except Exception as e:
            logger.exception("시세 수집 실패: %s", complex_no)
            with _price_collect_lock:
                st = _price_collect_status.get(complex_no)
                if st:
                    st["status"] = "error"
                    st["error"] = str(e)[:200]
        finally:
            collect_db.close()
            _price_collect_semaphore.release()

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"complex_no": complex_no, "status": "started"}


@router.get("/{complex_no}/price-history/collect-status")
def get_price_collect_status(complex_no: str):
    """실거래가 수집 진행 상태 폴링."""
    with _price_collect_lock:
        _cleanup_stale_price_collects()
        status = _price_collect_status.get(complex_no)
        if not status:
            return {"complex_no": complex_no, "status": "idle",
                    "collected": 0, "failed": 0, "total": 0}
        snapshot = {k: v for k, v in status.items() if not k.startswith("_")}
        # done/error 상태는 프론트가 한 번 확인 후 정리
        if status.get("_polled_final"):
            _price_collect_status.pop(complex_no, None)
        elif status.get("status") in ("done", "error"):
            status["_polled_final"] = True
    return {"complex_no": complex_no, **snapshot}
