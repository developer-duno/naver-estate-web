"""백그라운드 크롤 워커 — 매물 목록 수집 + 상세 크롤링 위임"""

import logging
import time

from db.database import SessionLocal
from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel
from services.cache import get_cache
from services.enricher import enrich_complex_detail
from services.upsert import delete_missing_articles, upsert_article
from shared.constants import NAVER_COMPLEX_ARTICLES_API, NAVER_LAND_BASE
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from utils import utcnow

from ._detail_worker import _crawl_details_for_complex
from ._shared import (
    INTER_PAGE_DELAY,
    PAGE_COMMIT_INTERVAL,
    _cache,
    _crawl_lock,
    _crawl_status,
    _update_crawl_status,
)

logger = logging.getLogger(__name__)


def _fetch_articles_all_trade_types(complex_no: str, page: int = 1):
    """Fetch articles with all trade types (A1=매매, B1=전세, B2=월세, B3=단기임대)."""
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
        # 크롤링 완료 마커 설정 (start-crawl 중복 방지, 동적 TTL 적용)
        _cache.set(f"crawl_done:{complex_no}", True)
        # complexes.py의 필터/통계/상세 캐시도 무효화 (레지스트리 기반, 순환 import 없음)
        complexes_cache = get_cache("complexes", dynamic=True)
        complexes_cache.delete(f"filter_options:{complex_no}")
        complexes_cache.delete(f"price_stats:{complex_no}")
        complexes_cache.delete(f"complex_detail:{complex_no}")
        complexes_cache.delete(f"articles_default:{complex_no}")
        complexes_cache.delete(f"pyeong_details:{complex_no}")
