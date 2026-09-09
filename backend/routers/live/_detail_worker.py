"""상세 크롤 워커 — 미크롤링 매물 상세를 일괄 수집"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from db.models import Article as ArticleModel
from services.naver_call_counter import record_call
from services.upsert import build_detail_update_dict
from shared.constants import DETAIL_FAIL_CAP
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI

from ._shared import (
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
            # 매물 단위 오류가 상한(DETAIL_FAIL_CAP)에 도달한 매물은 제외 — 상세 보강
            # 배치(crawler/service_discover.py crawl_article_details)와 같은 기준이다.
            # 이 필터가 없으면 배치가 이미 포기한 매물을 사용자가 단지를 열 때마다
            # 다시 긁어 네이버 콜만 태운다(세션 396 백로그 §5-L). 온디맨드 경로는
            # detail_fail_count 를 올리지 않으므로 일일 정비 잡(03:50 CAP-1 부여)이
            # 설계한 "매물당 하루 1콜" 바운드와 경합하지 않는다.
            ArticleModel.detail_fail_count < DETAIL_FAIL_CAP,
        )
        .all()
    )
    # 상한 매물도 skipped 에 합산된다 — 화면의 "건너뜀"은 "이번에 상세를 안 긁는 매물"
    # 이라는 뜻이므로(이미 상세가 있는 매물 + 상한 매물) 의도된 집계다.
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
        record_call("article_detail_live")
        try:
            return article_no, NaverEstateAPI.get_article_detail(article_no)
        except Exception as e:
            logger.warning("Article detail fetch failed: %s → %s", article_no, e)
            return article_no, None

    # article_no → 루프에 필요한 속성 튜플 (ORM 인스턴스 아님)
    # 아래 순회마다 db.commit() 을 하는데 expire_on_commit=True(database.py) 라
    # ORM 인스턴스를 들고 있으면 다음 순회 art.* 접근이 PK 재조회 lazy-load 를 유발한다
    # (부하 구간엔 이 조회가 statement_timeout 방아쇠 — 세션 342 실사고).
    # crawler/service_discover.py crawl_article_details 의 선추출 패턴을 그대로 답습한다.
    art_map = {
        art.article_no: (
            art.trade_type_name,
            art.deal_or_warrant_prc,
            art.rent_prc,
            art.area2_m2,
        )
        for art in articles
    }
    crawled_count = 0
    failed_count = 0

    # 2스레드 병렬: 네트워크 I/O 병렬화, DB 쓰기는 메인 스레드에서 순차 처리
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(_fetch_detail, art.article_no) for art in articles]

        for i, future in enumerate(as_completed(futures)):
            article_no, detail_data = future.result()
            trade_type_name, deal_or_warrant_prc, rent_prc, area2_m2 = art_map[article_no]

            if detail_data and "error" not in detail_data:
                try:
                    domain_article = RealEstateArticle(
                        article_no=article_no,
                        trade_type_name=trade_type_name or "",
                    )
                    domain_article.deal_or_warrant_prc = deal_or_warrant_prc
                    domain_article.rent_prc = rent_prc
                    domain_article.area2_m2 = area2_m2
                    domain_article.update_from_detail(detail_data)

                    update_data = build_detail_update_dict(domain_article, detail_data)
                    db.query(ArticleModel).filter(
                        ArticleModel.article_no == article_no
                    ).update(update_data, synchronize_session=False)
                    crawled_count += 1
                except Exception as e:
                    logger.warning("Article detail update failed: %s → %s", article_no, e)
                    failed_count += 1
            else:
                failed_count += 1

            _update_crawl_status(complex_no, detail_crawled_count=i + 1)

            # 순회마다 commit — 옛 DETAIL_COMMIT_INTERVAL(50건) 배치 commit 은 위 UPDATE 가
            # 잡은 articles 행 잠금을 최대 50건 × (0.3s + shared throttle) 동안 쥔 채
            # 다음 fetch 를 기다려, 같은 매물을 upsert 하는 인기 크롤·12h 배치가 8초
            # statement_timeout 에 잘리게 했다(세션 396, 2026-09-09 14:45 13건 failed).
            # 위 선추출 덕에 commit expire 로 인한 lazy-load 폭풍은 없다.
            db.commit()

    db.commit()  # 나머지 커밋

    # 실패율 50% 초과 시 부분 완료 표시
    if total > 0 and failed_count > total * DETAIL_FAILURE_THRESHOLD:
        _update_crawl_status(complex_no, status="done_partial")

    logger.info("Detail crawl done for %s: %d/%d articles (failed: %d)",
                complex_no, crawled_count, total, failed_count)
