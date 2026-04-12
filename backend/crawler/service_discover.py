"""크롤링 서비스 — 단지 발견 + 매물 수집 + 상세 보강

A. 단지 발견: 지역별 키워드 검색으로 단지 목록 수집
B. 매물 수집: 단지별 전체 매물 크롤링
C. 상세 보강: 매물 상세 정보 크롤링
"""

import logging
import os

from dotenv import load_dotenv

from crawler.utils import AdaptiveThrottle
from db.database import SessionLocal
from db.models import Article, Complex, CrawlJob
from services.enricher import enrich_complex_detail
from services.upsert import (
    build_detail_update_dict,
    delete_missing_articles,
    upsert_article,
    upsert_complex_from_search,
)
from shared.constants import KOREA_REGIONS
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from utils import utcnow

load_dotenv()
logger = logging.getLogger(__name__)

# 적응형 쓰로틀 — 429 발생 시 자동으로 간격 증가, 정상화 시 서서히 복귀
_throttle_discover = AdaptiveThrottle(min_interval=2.0, max_interval=10.0)  # 단지 발견
_throttle_articles = AdaptiveThrottle(min_interval=2.0, max_interval=10.0)  # 매물 수집
_throttle_details = AdaptiveThrottle(min_interval=1.5, max_interval=10.0)   # 상세 보강

# 크롤링 대상 부동산 유형 (기본: 아파트 관련 4종)
CRAWL_REAL_ESTATE_TYPES = set(
    os.getenv("CRAWL_REAL_ESTATE_TYPES", "APT:ABYG:JGC:PRE:OPST:OBYG:RDV").split(":")
)


# ── A. 단지 발견 ──

def discover_complexes_by_region(sido: str, sigungu: str, dong: str = None, scheduler_job_id: str | None = None):
    """지역 키워드로 네이버 검색 → complexes 테이블 upsert"""
    keyword = f"{sido} {sigungu}"
    if dong:
        keyword += f" {dong}"

    db = SessionLocal()
    job = CrawlJob(job_type="complex_list", target_id=keyword, scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        page = 1
        total_found = 0
        while True:
            result = NaverEstateAPI.search_by_keyword(keyword, page=page)
            if not result or "error" in result:
                break

            complex_list = result.get("complexes") or result.get("complexList") or []
            if not complex_list:
                break

            for c_data in complex_list:
                # 설정된 부동산 유형만 필터링
                re_type = c_data.get("realEstateTypeCode", "")
                if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                    continue
                upsert_complex_from_search(db, c_data, sido, sigungu, dong)
                total_found += 1

            # 다음 페이지가 있는지 확인
            if not result.get("isMoreData", False):
                break
            page += 1
            _throttle_discover.wait()

        job.status = "completed"
        job.processed_items = total_found
        job.completed_at = utcnow()
        db.commit()
        logger.info("단지 발견 완료: %s → %d건", keyword, total_found)

    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("단지 발견 실패: %s", keyword)
    finally:
        db.close()


def discover_all_regions(scheduler_job_id: str | None = None):
    """전국 모든 지역 순회하며 단지 발견"""
    for sido, sigungu_dict in KOREA_REGIONS.items():
        for sigungu, dong_list in sigungu_dict.items():
            logger.info("단지 발견 시작: %s %s", sido, sigungu)
            discover_complexes_by_region(sido, sigungu, scheduler_job_id=scheduler_job_id)
            _throttle_discover.wait(extra_delay=0.5)  # 지역 간 딜레이


# ── B. 매물 수집 ──

def crawl_complex_articles(complex_no: str, sido: str = None, sigungu: str = None, scheduler_job_id: str | None = None):
    """단지의 전체 매물 크롤링 → articles 테이블 upsert"""
    db = SessionLocal()
    job = CrawlJob(job_type="complex_articles", target_id=complex_no, scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        page = 1
        all_article_nos = set()
        total_articles = 0

        # 기존 가격 일괄 조회 (N+1 방지)
        existing_prices = {
            row[0]: (row[1], row[2])
            for row in db.query(
                Article.article_no, Article.numeric_price, Article.numeric_rent_price
            ).filter(
                Article.complex_no == complex_no, Article.is_active == True
            ).all()
        }

        while True:
            result = NaverEstateAPI.get_complex_articles(complex_no, page=page)
            if not result or "error" in result:
                break

            article_list = result.get("articleList") or []
            if not article_list:
                break

            for a_data in article_list:
                article = RealEstateArticle.from_dict(a_data)
                article.complex_no = complex_no
                upsert_article(db, article, track_price=True, existing_prices=existing_prices)
                all_article_nos.add(article.article_no)
                total_articles += 1

            if not result.get("isMoreData", False):
                break
            page += 1
            _throttle_articles.wait()

        # 이번 크롤링에서 안 보인 매물 → is_active = False
        delete_missing_articles(db, complex_no, all_article_nos)

        # 단지 last_crawled_at 업데이트
        db.query(Complex).filter(Complex.complex_no == complex_no).update(
            {"last_crawled_at": utcnow()}
        )

        # 단지 상세 정보 보강 (1회성: detail_crawled_at이 없는 경우만)
        cpx = db.query(Complex).filter(Complex.complex_no == complex_no).first()
        if cpx and not cpx.detail_crawled_at:
            enrich_complex_detail(db, complex_no)

        job.status = "completed"
        job.total_items = total_articles
        job.processed_items = total_articles
        job.completed_at = utcnow()
        db.commit()
        logger.info("매물 수집 완료: complex %s → %d건", complex_no, total_articles)

    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("매물 수집 실패: complex %s", complex_no)
    finally:
        NaverEstateAPI.clear_cache()
        db.close()


def crawl_popular_complexes(batch_size: int = 100, scheduler_job_id: str | None = None):
    """인기 단지 선제적 크롤링 — 최근 사용자가 조회한 단지 우선.

    선정 기준: last_crawled_at 최근순 (= 사용자가 실제 검색/조회한 단지)
    IP 차단 방지를 위해 단지 간 2초 대기.
    """
    db = SessionLocal()
    job = CrawlJob(job_type="popular_crawl", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        # 1순위: 사용자가 최근 조회한 단지 (last_crawled_at 최신순)
        complexes = (
            db.query(Complex)
            .filter(Complex.last_crawled_at.isnot(None))
            .order_by(Complex.last_crawled_at.desc())
            .limit(batch_size)
            .all()
        )

        # 폴백: 인기 단지가 없으면 최근 등록된 단지로 로테이션
        if not complexes:
            complexes = (
                db.query(Complex)
                .filter(Complex.total_household_count.isnot(None))
                .order_by(Complex.total_household_count.desc())
                .limit(batch_size)
                .all()
            )
            if complexes:
                logger.info("인기 단지 0개 → 세대수 상위 %d개 단지로 폴백", len(complexes))

        total = len(complexes)
        logger.info("인기 단지 선제적 크롤링 시작: %d개 단지", total)
        processed = 0
        failed = 0
        failed_nos: list[str] = []
        for cpx in complexes:
            try:
                crawl_complex_articles(cpx.complex_no, cpx.sido, cpx.sigungu)
                processed += 1
            except Exception:
                failed += 1
                failed_nos.append(str(cpx.complex_no))
                logger.exception("인기 단지 크롤링 개별 실패: complex %s", cpx.complex_no)
            _throttle_articles.wait(extra_delay=0.5)

        job.total_items = total
        job.processed_items = processed
        job.completed_at = utcnow()
        if failed == 0:
            job.status = "completed"
        elif processed == 0:
            job.status = "failed"
            job.error_message = f"전체 {total}개 단지 실패: {', '.join(failed_nos[:20])}"
        else:
            job.status = "completed"
            job.error_message = f"{failed}/{total}개 단지 실패: {', '.join(failed_nos[:20])}"
        db.commit()
        logger.info("인기 단지 선제적 크롤링 완료: 성공 %d / 실패 %d / 전체 %d", processed, failed, total)

    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("인기 단지 선제적 크롤링 실패")
    finally:
        db.close()


def crawl_articles_batch(batch_size: int = 50, scheduler_job_id: str | None = None):
    """last_crawled_at이 가장 오래된 단지부터 batch_size만큼 매물 수집"""
    db = SessionLocal()
    try:
        complexes = (
            db.query(Complex)
            .order_by(Complex.last_crawled_at.asc().nullsfirst())
            .limit(batch_size)
            .all()
        )
        logger.info("매물 수집 배치 시작: %d개 단지", len(complexes))
        for cpx in complexes:
            crawl_complex_articles(cpx.complex_no, cpx.sido, cpx.sigungu, scheduler_job_id=scheduler_job_id)
            _throttle_articles.wait()
    finally:
        db.close()


# ── C. 상세 보강 ──

def crawl_article_details(batch_size: int = 100, scheduler_job_id: str | None = None):
    """detail_crawled=FALSE인 활성 매물의 상세 정보 크롤링"""
    db = SessionLocal()
    job = CrawlJob(job_type="article_detail", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        articles = (
            db.query(Article)
            .filter(Article.detail_crawled == False, Article.is_active == True)
            .limit(batch_size)
            .all()
        )

        job.total_items = len(articles)
        processed = 0

        for i, art in enumerate(articles):
            detail_data = NaverEstateAPI.get_article_detail(art.article_no)
            if detail_data and "error" not in detail_data:
                # 도메인 객체로 변환 후 상세 업데이트
                domain_article = RealEstateArticle(
                    article_no=art.article_no,
                    trade_type_name=art.trade_type_name or "",
                )
                domain_article.deal_or_warrant_prc = art.deal_or_warrant_prc
                domain_article.rent_prc = art.rent_prc
                domain_article.area2_m2 = art.area2_m2
                domain_article.update_from_detail(detail_data)

                # DB 업데이트 (commit은 배치로)
                update_data = build_detail_update_dict(domain_article, detail_data)
                db.query(Article).filter(Article.article_no == art.article_no).update(
                    update_data, synchronize_session=False
                )
                processed += 1

            # CV-49: 배치 commit (50건 단위) — 행별 commit 대신
            if (i + 1) % 50 == 0:
                db.commit()

            _throttle_details.wait()

        job.status = "completed"
        job.processed_items = processed
        job.completed_at = utcnow()
        db.commit()  # 나머지 flush
        logger.info("상세 보강 완료: %d/%d건", processed, len(articles))

    except Exception as e:
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("상세 보강 실패")
    finally:
        db.close()
