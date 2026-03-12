"""크롤링 서비스 — 4단계 크롤링 로직

A. 단지 발견: 지역별 키워드 검색으로 단지 목록 수집
B. 매물 수집: 단지별 전체 매물 크롤링
C. 상세 보강: 매물 상세 정보 크롤링
D. 시세 수집: 단지별 시세 이력 수집 (Phase 1)
"""

import logging
import os
import re
import time
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from db.database import SessionLocal
from db.models import (
    Complex, Article, CrawlJob, ComplexPyeongDetail,
    ComplexPriceHistory, ArticlePriceHistory,
)
from shared.constants import KOREA_REGIONS, M2_TO_PYEONG
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI
from crawler.utils import AdaptiveThrottle, CheckpointManager

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
                _upsert_complex(db, c_data, sido, sigungu, dong)
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
                _upsert_article(db, article)
                all_article_nos.add(article.article_no)
                total_articles += 1

            if not result.get("isMoreData", False):
                break
            page += 1
            time.sleep(NaverEstateAPI.PAGE_DELAY)

        # 이번 크롤링에서 안 보인 매물 → is_active = False
        _deactivate_missing_articles(db, complex_no, all_article_nos)

        # 단지 last_crawled_at 업데이트
        db.query(Complex).filter(Complex.complex_no == complex_no).update(
            {"last_crawled_at": _utcnow()}
        )

        # 단지 상세 정보 보강 (1회성: detail_crawled_at이 없는 경우만)
        cpx = db.query(Complex).filter(Complex.complex_no == complex_no).first()
        if cpx and not cpx.detail_crawled_at:
            _enrich_complex_detail(db, complex_no)

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
                _update_article_detail(db, art.article_no, domain_article)
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


# ── 내부 유틸리티 ──

def _upsert_complex(db: Session, data: dict, sido: str, sigungu: str, dong: str = None):
    """단지 정보 upsert (INSERT ON CONFLICT DO UPDATE)"""
    complex_no = str(data.get("complexNo", ""))
    if not complex_no:
        return

    lat = data.get("latitude")
    lng = data.get("longitude")
    try:
        latitude = float(lat) if lat else None
        longitude = float(lng) if lng else None
    except (ValueError, TypeError):
        latitude = None
        longitude = None

    values = {
        "complex_no": complex_no,
        "complex_name": data.get("complexName", ""),
        "cortar_no": data.get("cortarNo"),
        "real_estate_type_code": data.get("realEstateTypeCode"),
        "real_estate_type_name": data.get("realEstateTypeName"),
        "latitude": latitude,
        "longitude": longitude,
        "total_household_count": data.get("totalHouseholdCount"),
        "high_floor": data.get("highFloor"),
        "low_floor": data.get("lowFloor"),
        "use_approve_ymd": data.get("useApproveYmd"),
        "total_dong_count": data.get("totalDongCount"),
        "min_supply_area_m2": float(data["minSupplyArea"]) if data.get("minSupplyArea") else None,
        "max_supply_area_m2": float(data["maxSupplyArea"]) if data.get("maxSupplyArea") else None,
        "cortar_address": data.get("cortarAddress"),
        "sido": sido,
        "sigungu": sigungu,
        "dong": dong,
        "updated_at": _utcnow(),
    }

    stmt = pg_insert(Complex).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["complex_no"],
        set_={k: v for k, v in values.items() if k != "complex_no"},
    )
    db.execute(stmt)
    db.commit()


def _upsert_article(db: Session, article: RealEstateArticle):
    """매물 정보 upsert + 가격 변동 감지 (Phase 1)"""
    new_price = article.numeric_price
    new_rent = article.numeric_rent_price

    # Phase 1: 가격 변동 감지 — 기존 매물의 가격과 비교
    existing = db.query(Article.numeric_price, Article.numeric_rent_price).filter(
        Article.article_no == article.article_no
    ).first()

    price_changed = False
    if existing and new_price is not None:
        old_price = existing[0]
        old_rent = existing[1]
        if old_price is not None and old_price != new_price:
            price_changed = True
        elif old_rent is not None and new_rent is not None and old_rent != new_rent:
            price_changed = True

    values = {
        "article_no": article.article_no,
        "complex_no": article.complex_no or "",
        "trade_type_name": article.trade_type_name,
        "building_name": article.building_name,
        "floor_info": article.floor_info,
        "deal_or_warrant_prc": article.deal_or_warrant_prc,
        "rent_prc": article.rent_prc,
        "area1_m2": article.area1_m2,
        "area2_m2": article.area2_m2,
        "direction": article.direction,
        "article_feature_desc": article.article_feature_desc,
        "tags": article.tags or [],
        "realtor_name": article.realtor_name,
        "article_confirm_ymd": article.article_confirm_ymd,
        "latitude": article.latitude,
        "longitude": article.longitude,
        "complex_name": article.complex_name,
        "article_name": article.article_name,
        "realtor_id": article.realtor_id,
        "realtor_phone": article.realtor_phone,
        "is_verified": article.is_verified,
        "article_real_estate_type_name": article.article_real_estate_type_name,
        "is_presale": article.is_presale,
        # 사전 계산 컬럼
        "numeric_price": new_price,
        "numeric_rent_price": new_rent,
        "price_per_pyeong": article.price_per_pyeong,
        # 메타
        "last_seen_at": _utcnow(),
        "is_active": True,
        "updated_at": _utcnow(),
    }

    # Phase 1: 가격 변동 시 이전 가격 기록
    if price_changed and existing:
        values["previous_price"] = existing[0]
        values["price_changed_at"] = _utcnow()
        # article_price_history에 변동 이력 저장
        db.add(ArticlePriceHistory(
            article_no=article.article_no,
            price=new_price,
            rent_price=new_rent,
        ))

    stmt = pg_insert(Article).values(**values)
    # 기존 매물이면 가격/상태 등 업데이트 (first_seen_at, detail 필드는 건드리지 않음)
    update_cols = {k: v for k, v in values.items() if k not in ("article_no", "first_seen_at")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["article_no"],
        set_=update_cols,
    )
    db.execute(stmt)
    db.commit()


def _deactivate_missing_articles(db: Session, complex_no: str, seen_article_nos: set):
    """이번 크롤링에서 보이지 않은 매물 비활성화"""
    db.query(Article).filter(
        Article.complex_no == complex_no,
        Article.is_active == True,
        ~Article.article_no.in_(seen_article_nos),
    ).update(
        {"is_active": False, "updated_at": _utcnow()},
        synchronize_session=False,
    )
    db.commit()


def _parse_maintenance_cost(cost_str: str | None) -> int | None:
    """관리비 문자열에서 숫자만 추출 (예: '7만원' → 7, '12' → 12)"""
    if not cost_str:
        return None
    match = re.search(r"(\d+)", cost_str)
    return int(match.group(1)) if match else None


def _update_article_detail(db: Session, article_no: str, domain_article: RealEstateArticle):
    """상세 크롤링 결과를 DB에 반영 + 사전 계산 컬럼 재계산 (CV-52 수정)"""
    update_data = {
        "detail_description": domain_article.detail_description,
        "room_count": domain_article.room_count,
        "bathroom_count": domain_article.bathroom_count,
        "move_in_date": domain_article.move_in_date,
        "maintenance_cost": domain_article.maintenance_cost,
        "numeric_maintenance_cost": _parse_maintenance_cost(domain_article.maintenance_cost),
        "parking_count": domain_article.parking_count,
        "photo_urls": domain_article.photo_urls or [],
        "representative_img_url": domain_article.representative_img_url,
        "realtor_phone_display": domain_article.realtor_phone_display,
        "realtor_address": domain_article.realtor_address,
        "heating_type": domain_article.heating_type,
        "total_floor_count": domain_article.total_floor_count,
        "jibun_address": domain_article.jibun_address,
        "use_approve_ymd": domain_article.use_approve_ymd,
        "acquisition_tax": domain_article.acquisition_tax,
        "broker_fee": domain_article.broker_fee,
        "detail_crawled": True,
        "updated_at": _utcnow(),
    }

    # CV-52: 사전 계산 컬럼 재계산 (상세 크롤링 후 가격/면적 갱신 반영)
    if domain_article.numeric_price is not None:
        update_data["numeric_price"] = domain_article.numeric_price
    if domain_article.numeric_rent_price is not None:
        update_data["numeric_rent_price"] = domain_article.numeric_rent_price
    if domain_article.price_per_pyeong is not None:
        update_data["price_per_pyeong"] = domain_article.price_per_pyeong

    db.query(Article).filter(Article.article_no == article_no).update(
        update_data, synchronize_session=False
    )


def _safe_int(val) -> int | None:
    """안전한 정수 변환"""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    """안전한 실수 변환"""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _enrich_complex_detail(db: Session, complex_no: str):
    """단지 상세 정보 보강 (면적별 정보, 난방, 건설사 등) — 1회성 호출"""
    try:
        detail = NaverEstateAPI.get_complex_detail(complex_no)
    except Exception as e:
        logger.warning("단지 상세 조회 실패: %s → %s", complex_no, e)
        return

    if not detail or not isinstance(detail, dict) or "error" in detail:
        return

    cd = detail.get("complexDetail", {})
    if not cd:
        cd = {}

    # complexes 테이블에 상세 필드 업데이트
    db.query(Complex).filter(Complex.complex_no == complex_no).update({
        "heat_method_type": cd.get("heatMethodTypeName"),
        "total_parking_count": _safe_int(cd.get("totalParkingCount")),
        "construction_company": cd.get("constructionCompanyName"),
        "floor_area_ratio": cd.get("floorAreaRatio"),
        "building_coverage_ratio": cd.get("buildingCoverageRatio"),
        "detail_crawled_at": _utcnow(),
    }, synchronize_session=False)

    # 면적별 상세 upsert
    pyeong_list = detail.get("complexPyeongDetailList", [])
    for p in pyeong_list:
        pyeong_no = _safe_int(p.get("pyeongNo"))
        if pyeong_no is None:
            continue

        avg_maint = p.get("averageMaintenanceCost") or {}
        values = {
            "complex_no": complex_no,
            "pyeong_no": pyeong_no,
            "pyeong_name": p.get("pyeongName"),
            "supply_area": p.get("supplyArea"),
            "supply_area_double": _safe_float(p.get("supplyAreaDouble")),
            "exclusive_area": p.get("exclusiveArea"),
            "exclusive_rate": p.get("exclusiveRate"),
            "household_count_by_pyeong": p.get("householdCountByPyeong"),
            "entrance_type": p.get("entranceType"),
            "room_count": _safe_int(p.get("roomCnt")),
            "bathroom_count": _safe_int(p.get("bathroomCnt")),
            "avg_maintenance_cost": _safe_int(avg_maint.get("averageTotalPrice")),
            "summer_maintenance_cost": _safe_int(avg_maint.get("summerTotalPrice")),
            "winter_maintenance_cost": _safe_int(avg_maint.get("winterTotalPrice")),
            "updated_at": _utcnow(),
        }

        stmt = pg_insert(ComplexPyeongDetail).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="complex_pyeong_details_complex_no_pyeong_no_key",
            set_={k: v for k, v in values.items() if k not in ("complex_no", "pyeong_no")},
        )
        db.execute(stmt)

    db.commit()
    logger.info("단지 상세 보강 완료: %s → %d개 면적", complex_no, len(pyeong_list))


# ── D. 시세 수집 (Phase 1) ──

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
                price_list = result.get("realEstatePrice") or result.get("prices") or []
                for p in price_list:
                    base_month = p.get("baseMonth") or p.get("yearMonth")
                    if not base_month:
                        continue
                    _upsert_price_history(
                        db, complex_no, trade_type,
                        area_no=p.get("areaNo"),
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
    """시세 이력 upsert"""
    values = {
        "complex_no": complex_no,
        "trade_type": trade_type,
        "area_no": area_no or "",
        "price_upper": price_upper,
        "price_lower": price_lower,
        "price_avg": price_avg,
        "base_month": base_month,
        "recorded_at": _utcnow(),
    }
    stmt = pg_insert(ComplexPriceHistory).values(**values)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_cph_composite",
        set_={k: v for k, v in values.items()
              if k not in ("complex_no", "trade_type", "area_no", "base_month")},
    )
    db.execute(stmt)
