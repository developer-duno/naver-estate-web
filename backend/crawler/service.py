"""크롤링 서비스 — 4단계 크롤링 로직

A. 단지 발견: 지역별 키워드 검색으로 단지 목록 수집
B. 매물 수집: 단지별 전체 매물 크롤링
C. 상세 보강: 매물 상세 정보 크롤링
D. 시세 수집: 단지별 시세 이력 수집 (Phase 1)
"""

import logging
import os
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import (
    Complex, Article, CrawlJob,
    ComplexPriceHistory,
)
from shared.constants import KOREA_REGIONS
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from crawler.utils import AdaptiveThrottle, CheckpointManager

from services.upsert import (
    upsert_complex_from_search, upsert_article, build_detail_update_dict,
    deactivate_missing_articles, _safe_int,
)
from services.enricher import enrich_complex_detail

load_dotenv()
logger = logging.getLogger(__name__)

# 크롤링 대상 부동산 유형 (기본: 아파트 관련 4종)
CRAWL_REAL_ESTATE_TYPES = set(
    os.getenv("CRAWL_REAL_ESTATE_TYPES", "APT:ABYG:JGC:PRE").split(":")
)

# Phase 1: 적응형 쓰로틀 + 체크포인트
_throttle = AdaptiveThrottle(min_interval=1.0, max_interval=5.0)
_checkpoint = CheckpointManager(checkpoint_interval=5)


def _utcnow():
    return datetime.now(timezone.utc)


# ── A. 단지 발견 ──

def discover_complexes_by_region(sido: str, sigungu: str, dong: str = None):
    """지역 키워드로 네이버 검색 → complexes 테이블 upsert"""
    keyword = f"{sido} {sigungu}"
    if dong:
        keyword += f" {dong}"

    db = SessionLocal()
    job = CrawlJob(job_type="complex_list", target_id=keyword, status="running", started_at=_utcnow())
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
            time.sleep(NaverEstateAPI.PAGE_DELAY)

        job.status = "completed"
        job.processed_items = total_found
        job.completed_at = _utcnow()
        db.commit()
        logger.info("단지 발견 완료: %s → %d건", keyword, total_found)

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("단지 발견 실패: %s", keyword)
    finally:
        db.close()


def discover_all_regions():
    """전국 모든 지역 순회하며 단지 발견"""
    for sido, sigungu_dict in KOREA_REGIONS.items():
        for sigungu, dong_list in sigungu_dict.items():
            logger.info("단지 발견 시작: %s %s", sido, sigungu)
            discover_complexes_by_region(sido, sigungu)
            time.sleep(2)  # 지역 간 딜레이


# ── B. 매물 수집 ──

def crawl_complex_articles(complex_no: str, sido: str = None, sigungu: str = None):
    """단지의 전체 매물 크롤링 → articles 테이블 upsert"""
    db = SessionLocal()
    job = CrawlJob(job_type="complex_articles", target_id=complex_no, status="running", started_at=_utcnow())
    db.add(job)
    db.commit()

    try:
        page = 1
        all_article_nos = set()
        total_articles = 0

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
                upsert_article(db, article, track_price=True)
                all_article_nos.add(article.article_no)
                total_articles += 1

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(NaverEstateAPI.PAGE_DELAY)

        # 이번 크롤링에서 안 보인 매물 → is_active = False
        deactivate_missing_articles(db, complex_no, all_article_nos)

        # 단지 last_crawled_at 업데이트
        db.query(Complex).filter(Complex.complex_no == complex_no).update(
            {"last_crawled_at": _utcnow()}
        )

        # 단지 상세 정보 보강 (1회성: detail_crawled_at이 없는 경우만)
        cpx = db.query(Complex).filter(Complex.complex_no == complex_no).first()
        if cpx and not cpx.detail_crawled_at:
            enrich_complex_detail(db, complex_no)

        job.status = "completed"
        job.total_items = total_articles
        job.processed_items = total_articles
        job.completed_at = _utcnow()
        db.commit()
        logger.info("매물 수집 완료: complex %s → %d건", complex_no, total_articles)

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("매물 수집 실패: complex %s", complex_no)
    finally:
        NaverEstateAPI.clear_cache()
        db.close()


def crawl_articles_batch(batch_size: int = 50):
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
            crawl_complex_articles(cpx.complex_no, cpx.sido, cpx.sigungu)
            time.sleep(1)
    finally:
        db.close()


# ── C. 상세 보강 ──

def crawl_article_details(batch_size: int = 100):
    """detail_crawled=FALSE인 활성 매물의 상세 정보 크롤링"""
    db = SessionLocal()
    job = CrawlJob(job_type="article_detail", status="running", started_at=_utcnow())
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

            time.sleep(NaverEstateAPI.MIN_REQUEST_INTERVAL)

        job.status = "completed"
        job.processed_items = processed
        job.completed_at = _utcnow()
        db.commit()  # 나머지 flush
        logger.info("상세 보강 완료: %d/%d건", processed, len(articles))

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("상세 보강 실패")
    finally:
        db.close()



# ── D. 시세 수집 (Phase 1) ──


def _extract_price_list(result: dict) -> list[dict]:
    """네이버 API 시세 응답에서 가격 리스트 추출 (응답 형식 호환)

    marketPrices는 주간 데이터를 반환하므로 월 단위로 중복 제거 (최신 우선).
    """
    # 형식 1: marketPrices (현재 API)
    if "marketPrices" in result:
        seen_months: set[str] = set()
        deduped = []
        # baseYearMonthDay 내림차순 정렬 → 같은 월은 최신만 사용
        sorted_prices = sorted(
            result["marketPrices"],
            key=lambda p: p.get("baseYearMonthDay", ""),
            reverse=True,
        )
        for p in sorted_prices:
            base_day = p.get("baseYearMonthDay", "")
            if not base_day:
                continue
            month = base_day[:6]
            if month in seen_months:
                continue
            seen_months.add(month)
            deduped.append({
                "baseMonth": month,
                "upperPrice": p.get("dealUpperPriceLimit") or p.get("upperPriceLimit"),
                "lowerPrice": p.get("dealLowPriceLimit") or p.get("lowPriceLimit"),
                "averagePrice": p.get("dealAveragePrice") or p.get("averagePriceLimit"),
                "areaNo": result.get("areaNo"),
            })
        return deduped
    # 형식 2: realEstatePrice (레거시)
    return result.get("realEstatePrice") or result.get("prices") or []


def collect_price_history_for_complex(db: Session, complex_no: str) -> int:
    """단일 단지의 시세 이력 실시간 수집 (on-demand).

    Returns: 수집된 레코드 수
    """
    collected = 0
    for trade_type in ("A1", "B1"):
        try:
            result = NaverEstateAPI.get_complex_prices(
                complex_no, trade_type=trade_type
            )
        except Exception as e:
            logger.warning("시세 조회 실패: %s %s -> %s", complex_no, trade_type, e)
            continue

        if not result or "error" in result:
            continue

        price_list = _extract_price_list(result)
        for p in price_list:
            base_month = p.get("baseMonth") or p.get("yearMonth")
            if not base_month:
                continue
            _upsert_price_history(
                db, complex_no, trade_type,
                area_no=str(p.get("areaNo")) if p.get("areaNo") is not None else None,
                price_upper=_safe_int(p.get("upperPrice") or p.get("dealUpperPrice")),
                price_lower=_safe_int(p.get("lowerPrice") or p.get("dealLowerPrice")),
                price_avg=_safe_int(p.get("averagePrice")),
                base_month=base_month,
            )
            collected += 1

    if collected > 0:
        db.commit()
        logger.info("시세 실시간 수집 완료: complex=%s, %d건", complex_no, collected)
    return collected


def collect_price_history(batch_size: int = 50):
    """단지별 시세 이력 수집 → complex_price_history 테이블 저장.

    네이버 API에서 매매(A1)/전세(B1) 시세를 가져와 월별 이력 기록.
    """
    db = SessionLocal()
    job = CrawlJob(
        job_type="price_history", status="running", started_at=_utcnow()
    )
    db.add(job)
    db.commit()

    try:
        complexes = (
            db.query(Complex.complex_no)
            .order_by(Complex.last_crawled_at.desc().nullslast())
            .limit(batch_size)
            .all()
        )

        processed = 0
        for i, (complex_no,) in enumerate(complexes):
            for trade_type in ("A1", "B1"):  # 매매, 전세
                _throttle.wait()
                try:
                    result = NaverEstateAPI.get_complex_prices(
                        complex_no, trade_type=trade_type
                    )
                except Exception as e:
                    logger.warning("시세 조회 실패: %s %s → %s", complex_no, trade_type, e)
                    continue

                if not result or "error" in result:
                    continue

                _throttle.on_success()
                price_list = _extract_price_list(result)
                for p in price_list:
                    base_month = p.get("baseMonth") or p.get("yearMonth")
                    if not base_month:
                        continue
                    _upsert_price_history(
                        db, complex_no, trade_type,
                        area_no=str(p.get("areaNo")) if p.get("areaNo") is not None else None,
                        price_upper=_safe_int(p.get("upperPrice") or p.get("dealUpperPrice")),
                        price_lower=_safe_int(p.get("lowerPrice") or p.get("dealLowerPrice")),
                        price_avg=_safe_int(p.get("averagePrice")),
                        base_month=base_month,
                    )
                processed += 1

            # 체크포인트
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(db, job.id, {"processed": i + 1, "total": len(complexes)})
                logger.info("시세 수집 중간 저장: %d/%d", i + 1, len(complexes))

        job.status = "completed"
        job.total_items = len(complexes)
        job.processed_items = processed
        job.completed_at = _utcnow()
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info("시세 수집 완료: %d건", processed)

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("시세 수집 실패")
    finally:
        db.close()


def _upsert_price_history(
    db: Session,
    complex_no: str,
    trade_type: str,
    area_no: str | None,
    price_upper: int | None,
    price_lower: int | None,
    price_avg: int | None,
    base_month: str,
):
    """시세 이력 upsert (제약조건 없으면 중복 체크 후 insert/update)"""
    area_key = area_no or ""
    existing = (
        db.query(ComplexPriceHistory)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.trade_type == trade_type,
            ComplexPriceHistory.base_month == base_month,
            ComplexPriceHistory.area_no == area_key,
        )
        .first()
    )
    if existing:
        existing.price_upper = price_upper
        existing.price_lower = price_lower
        existing.price_avg = price_avg
        existing.recorded_at = _utcnow()
    else:
        db.add(ComplexPriceHistory(
            complex_no=complex_no,
            trade_type=trade_type,
            area_no=area_key,
            price_upper=price_upper,
            price_lower=price_lower,
            price_avg=price_avg,
            base_month=base_month,
            recorded_at=_utcnow(),
        ))
