"""상세 크롤 워커 — 미크롤링 매물 상세를 일괄 수집"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from db.models import Article as ArticleModel
from services.upsert import build_detail_update_dict
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI

from ._shared import (
    DETAIL_COMMIT_INTERVAL,
    DETAIL_CRAWL_DELAY,
    DETAIL_FAILURE_THRESHOLD,
    _update_crawl_status,
)

logger = logging.getLogger(__name__)


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
