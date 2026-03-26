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
    delete_missing_articles,
)
from services.enricher import enrich_complex_detail
from utils import utcnow, safe_int

load_dotenv()
logger = logging.getLogger(__name__)

# 크롤링 대상 부동산 유형 (기본: 아파트 관련 4종)
CRAWL_REAL_ESTATE_TYPES = set(
    os.getenv("CRAWL_REAL_ESTATE_TYPES", "APT:ABYG:JGC:PRE:OPST:OBYG:RDV").split(":")
)

# Phase 1: 적응형 쓰로틀 + 체크포인트
_throttle = AdaptiveThrottle(min_interval=1.0, max_interval=5.0)
_checkpoint = CheckpointManager(checkpoint_interval=5)



# ── A. 단지 발견 ──

def discover_complexes_by_region(sido: str, sigungu: str, dong: str = None):
    """지역 키워드로 네이버 검색 → complexes 테이블 upsert"""
    keyword = f"{sido} {sigungu}"
    if dong:
        keyword += f" {dong}"

    db = SessionLocal()
    job = CrawlJob(job_type="complex_list", target_id=keyword, status="running", started_at=utcnow())
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
        job.completed_at = utcnow()
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
    job = CrawlJob(job_type="complex_articles", target_id=complex_no, status="running", started_at=utcnow())
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
            time.sleep(NaverEstateAPI.PAGE_DELAY)

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
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("매물 수집 실패: complex %s", complex_no)
    finally:
        NaverEstateAPI.clear_cache()
        db.close()


def crawl_popular_complexes(batch_size: int = 100):
    """인기 단지 선제적 크롤링 — 최근 사용자가 조회한 단지 우선.

    선정 기준: last_crawled_at 최근순 (= 사용자가 실제 검색/조회한 단지)
    IP 차단 방지를 위해 단지 간 2초 대기.
    """
    db = SessionLocal()
    job = CrawlJob(job_type="popular_crawl", status="running", started_at=utcnow())
    db.add(job)
    db.commit()

    try:
        complexes = (
            db.query(Complex)
            .filter(Complex.last_crawled_at.isnot(None))
            .order_by(Complex.last_crawled_at.desc())
            .limit(batch_size)
            .all()
        )

        logger.info("인기 단지 선제적 크롤링 시작: %d개 단지", len(complexes))
        processed = 0
        for cpx in complexes:
            crawl_complex_articles(cpx.complex_no, cpx.sido, cpx.sigungu)
            processed += 1
            time.sleep(2)

        job.status = "completed"
        job.total_items = len(complexes)
        job.processed_items = processed
        job.completed_at = utcnow()
        db.commit()
        logger.info("인기 단지 선제적 크롤링 완료: %d개 단지", processed)

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)
        db.commit()
        logger.exception("인기 단지 선제적 크롤링 실패")
    finally:
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
    job = CrawlJob(job_type="article_detail", status="running", started_at=utcnow())
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
        job.completed_at = utcnow()
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

    marketPrices는 주간(YYYYMMDD) 데이터를 반환. 전체를 그대로 반환하여 누적 저장.
    """
    # 형식 1: marketPrices (현재 API) — 주간 데이터 그대로 유지
    if "marketPrices" in result:
        prices = []
        for p in result["marketPrices"]:
            base_day = p.get("baseYearMonthDay", "")
            if not base_day:
                continue
            # upperPriceLimit 등은 API가 tradeType에 맞게 세팅한 값 (A1=매매, B1=전세)
            # deal* 필드는 항상 매매값이므로 사용 금지
            prices.append({
                "baseMonth": base_day,  # YYYYMMDD 주간 단위
                "upperPrice": p.get("upperPriceLimit"),
                "lowerPrice": p.get("lowPriceLimit"),
                "averagePrice": p.get("averagePriceLimit"),
                "areaNo": result.get("areaNo"),
            })
        return prices
    # 형식 2: realEstatePrice (레거시)
    return result.get("realEstatePrice") or result.get("prices") or []


def collect_price_history_for_complex(db: Session, complex_no: str) -> int:
    """단일 단지의 시세 이력 실시간 수집 (on-demand).

    pyeong_details에 등록된 모든 area_no에 대해 수집.
    Returns: 수집된 레코드 수
    """
    from db.models import ComplexPyeongDetail
    # 수집할 area_no 목록: DB에 등록된 pyeong 기준, 없으면 기본값(None) 1회만
    area_nos: list[int | None] = [
        p.pyeong_no
        for p in db.query(ComplexPyeongDetail.pyeong_no)
            .filter(ComplexPyeongDetail.complex_no == complex_no)
            .all()
    ]
    if not area_nos:
        area_nos = [None]

    collected = 0
    for trade_type in ("A1", "B1"):
        for area_no in area_nos:
            try:
                result = NaverEstateAPI.get_complex_prices(
                    complex_no, trade_type=trade_type, area_no=area_no
                )
            except Exception as e:
                logger.warning("시세 조회 실패: %s %s area=%s -> %s", complex_no, trade_type, area_no, e)
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
                    price_upper=safe_int(p.get("upperPrice") or p.get("dealUpperPrice")),
                    price_lower=safe_int(p.get("lowerPrice") or p.get("dealLowerPrice")),
                    price_avg=safe_int(p.get("averagePrice")),
                    base_month=base_month,
                )
                collected += 1

    # 실거래가(/prices/real): 기본 area_no만 수집 (장기 이력, YYYYMM 월별 저장)
    for trade_type in ("A1", "B1"):
        try:
            real_result = NaverEstateAPI.get_complex_real_prices(complex_no, trade_type=trade_type)
        except Exception as e:
            logger.debug("실거래가 조회 실패: %s %s -> %s", complex_no, trade_type, e)
            continue
        if not real_result or "error" in real_result:
            continue
        month_list = real_result.get("realPriceOnMonthList") or []
        for month_data in month_list:
            if not isinstance(month_data, dict):
                continue
            trades = month_data.get("realPriceList") or []
            if not trades:
                continue
            # 월 기준: tradeYear + tradeMonth (YYYYMM)
            first = trades[0]
            base_month = f"{first.get('tradeYear', '')}{str(first.get('tradeMonth', '')).zfill(2)}"
            if len(base_month) != 6:
                continue
            prices = [t.get("dealPrice") or 0 for t in trades if t.get("dealPrice")]
            if not prices:
                continue
            area_no_val = str(real_result.get("areaNo")) if real_result.get("areaNo") is not None else None
            _upsert_price_history(
                db, complex_no, trade_type,
                area_no=area_no_val,
                price_upper=max(prices),
                price_lower=min(prices),
                price_avg=round(sum(prices) / len(prices)),
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
        job_type="price_history", status="running", started_at=utcnow()
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
                        price_upper=safe_int(p.get("upperPrice") or p.get("dealUpperPrice")),
                        price_lower=safe_int(p.get("lowerPrice") or p.get("dealLowerPrice")),
                        price_avg=safe_int(p.get("averagePrice")),
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
        job.completed_at = utcnow()
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
        existing.recorded_at = utcnow()
    else:
        db.add(ComplexPriceHistory(
            complex_no=complex_no,
            trade_type=trade_type,
            area_no=area_key,
            price_upper=price_upper,
            price_lower=price_lower,
            price_avg=price_avg,
            base_month=base_month,
            recorded_at=utcnow(),
        ))
