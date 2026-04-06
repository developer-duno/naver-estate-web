"""크롤링 서비스 — 시세 수집

D. 단지별 시세 이력 배치 수집
   + on-demand 실시간 수집 (단일 단지)
"""

import logging
from typing import Callable

from crawler.service_common import _checkpoint, _extract_price_list, _upsert_price_history
from crawler.utils import AdaptiveThrottle
from db.database import SessionLocal
from db.models import Complex, CrawlJob
from shared.naver_api import NaverEstateAPI
from utils import safe_int, utcnow

logger = logging.getLogger(__name__)

# 적응형 쓰로틀: 배치용 / on-demand용 분리
_throttle = AdaptiveThrottle(min_interval=1.0, max_interval=5.0)
_throttle_ondemand = AdaptiveThrottle(min_interval=2.0, max_interval=5.0)


def collect_price_history_for_complex(
    db,
    complex_no: str,
    on_progress: "Callable[[int, int, int], None] | None" = None,
) -> dict:
    """단일 단지의 시세 이력 실시간 수집 (on-demand).

    pyeong_details에 등록된 모든 area_no에 대해 수집.
    on_progress: 진행률 콜백 (collected, failed, total)
    Returns: {"collected": N, "failed": N, "total": N}
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
    failed = 0
    total = len(area_nos) * 2 + 2  # (area_nos × 2 trade_types) + 2 실거래가

    def _report():
        if on_progress:
            on_progress(collected, failed, total)

    logger.info("시세 수집 시작: complex=%s, area_nos=%d개", complex_no, len(area_nos))

    for trade_type in ("A1", "B1"):
        for area_no in area_nos:
            _throttle_ondemand.wait()
            try:
                result = NaverEstateAPI.get_complex_prices(
                    complex_no, trade_type=trade_type, area_no=area_no
                )
                _throttle_ondemand.on_success()
            except Exception as e:
                logger.warning("시세 조회 실패: %s %s area=%s -> %s", complex_no, trade_type, area_no, e)
                _throttle_ondemand.on_rate_limit()
                failed += 1
                _report()
                continue

            if not result or "error" in result:
                failed += 1
                _report()
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
            _report()

    # 실거래가(/prices/real): 기본 area_no만 수집 (장기 이력, YYYYMM 월별 저장)
    for trade_type in ("A1", "B1"):
        _throttle_ondemand.wait()
        try:
            real_result = NaverEstateAPI.get_complex_real_prices(complex_no, trade_type=trade_type)
            _throttle_ondemand.on_success()
        except Exception as e:
            logger.debug("실거래가 조회 실패: %s %s -> %s", complex_no, trade_type, e)
            _throttle_ondemand.on_rate_limit()
            failed += 1
            _report()
            continue
        if not real_result or "error" in real_result:
            failed += 1
            _report()
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
        _report()

    if collected > 0:
        db.commit()
    logger.info("시세 수집 완료: complex=%s, collected=%d, failed=%d", complex_no, collected, failed)
    return {"collected": collected, "failed": failed, "total": total}


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
        db.rollback()
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        logger.exception("시세 수집 실패")
    finally:
        db.close()
