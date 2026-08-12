"""크롤링 서비스 — 시세 수집

D. 단지별 시세 이력 배치 수집
   + on-demand 실시간 수집 (단일 단지)
"""

import logging
import random
from typing import Callable

from sqlalchemy import exists
from sqlalchemy.orm import aliased

from crawler.service_common import (
    _checkpoint,
    _extract_price_list,
    _upsert_price_history,
    fail_job_safely,
)
from crawler.utils import AdaptiveThrottle
from db.database import SessionLocal
from db.models import Complex, ComplexPriceHistory, ComplexPyeongDetail, CrawlJob
from services.naver_call_counter import record_call
from shared.naver_api import NaverEstateAPI
from utils import safe_int, utcnow

logger = logging.getLogger(__name__)

# 적응형 쓰로틀: 배치용 / on-demand용 분리
_throttle = AdaptiveThrottle(min_interval=1.5, max_interval=10.0)
_throttle_ondemand = AdaptiveThrottle(min_interval=2.0, max_interval=10.0)


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
            record_call("complex_prices_ondemand")
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
        record_call("complex_real_prices_ondemand")
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


def collect_price_history(
    batch_size: int = 50, scheduler_job_id: str | None = None, only_missing: bool = False,
):
    """단지별 시세 이력 수집 → complex_price_history 테이블 저장.

    네이버 API에서 매매(A1)/전세(B1) 시세를 가져와 월별 이력 기록.

    only_missing=True: A1(매매) 시세 이력이 단 1건도 없는 단지만 대상으로 좁힌다
    (세션 359 — 사장님 지시로 이미 시세가 있는 단지는 건드리지 않고 "안 되는 것만"
    일괄 처리하는 일회성 대량 수집용. 정기 스케줄 기본값은 False로 기존 동작 유지).
    """
    db = SessionLocal()

    # 재개(resume) — 이 함수는 last_crawled_at 을 직접 갱신하지 않아(다른 크롤러가 갱신)
    # 재시작 시 정렬 기준이 안 바뀌어 매번 같은 top-N 을 다시 뽑는다(public_trade_data 와
    # 동일 위험, 세션 346 조사). 직전 실행이 중단(failed/cancelled)됐다면 이미 처리한
    # complex_no 를 쿼리 단계에서 제외 — 이 함수는 목록 전체가 아니라 top-N 만 뽑으므로
    # public_trade_data 처럼 "이어서 처리"가 아니라 "제외 후 다시 top-N" 방식이 맞다.
    # 최근 job 1건만 보면 연속 실패 시 진행분이 유실될 수 있어(세션 346 리뷰 발견,
    # service_public.py 와 동일 처방) 최근 N건을 순회해 체크포인트가 있는 첫 건을 쓴다.
    done_complex_nos: set[str] = set()
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "price_history", CrawlJob.status.in_(["failed", "cancelled"]))
        .order_by(CrawlJob.id.desc())
        .limit(10)
        .all()
    )
    for prev_job in recent_stopped_jobs:
        prev_state = _checkpoint.load(db, prev_job.id)
        if prev_state and prev_state.get("done_complex_nos"):
            done_complex_nos = set(prev_state["done_complex_nos"])
            logger.info("시세 수집 재개: 이전 job %d 에서 %d개 단지 완료분 이어받음", prev_job.id, len(done_complex_nos))
            break

    job = CrawlJob(
        job_type="price_history", scheduler_job_id=scheduler_job_id, status="running", started_at=utcnow()
    )
    db.add(job)
    db.commit()

    try:
        complexes_query = db.query(Complex.complex_no)
        if done_complex_nos:
            complexes_query = complexes_query.filter(Complex.complex_no.notin_(done_complex_nos))
        if only_missing:
            has_price_history = exists().where(
                ComplexPriceHistory.complex_no == Complex.complex_no,
                ComplexPriceHistory.trade_type == "A1",
            )
            complexes_query = complexes_query.filter(~has_price_history)
        complexes = (
            complexes_query
            .order_by(Complex.last_crawled_at.desc().nullslast())
            .limit(batch_size)
            .all()
        )

        processed = 0
        newly_done: set[str] = set()
        for i, (complex_no,) in enumerate(complexes):
            complex_had_success = False
            for trade_type in ("A1", "B1"):  # 매매, 전세
                # 세션 359: 사장님 지시 — 매 요청 간격이 규칙적이면(항상 정확히
                # min_interval) 자동화 패턴으로 더 쉽게 식별될 수 있다는 지적.
                # 0~1.5초 무작위 지터를 더해 간격을 흔든다 — AdaptiveThrottle 자체
                # (429 감지·백오프)는 그대로 유지, 최소 대기시간만 자연스럽게 변주.
                _throttle.wait(extra_delay=random.uniform(0, 1.5))
                record_call("complex_prices_batch")
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
                complex_had_success = True
            # 단지당 한 번만 카운트 (A1, B1 중 하나라도 성공하면)
            # 실패한 단지는 done 에 안 넣음 — 일시적 API 실패일 수 있어 다음 재개 때 재시도.
            if complex_had_success:
                processed += 1
                newly_done.add(complex_no)

            # 체크포인트 — 완료된 단지 번호 집합을 저장 (재개 시 이 집합을 쿼리에서 제외)
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(
                    db, job.id,
                    {"done_complex_nos": sorted(done_complex_nos | newly_done), "total": len(complexes)},
                )
                logger.info("시세 수집 중간 저장: %d/%d 완료", len(done_complex_nos | newly_done), len(complexes))

        job.status = "completed"
        job.total_items = len(complexes)
        job.processed_items = processed
        job.completed_at = utcnow()
        db.commit()
        _checkpoint.delete(db, job.id)
        logger.info("시세 수집 완료: %d건", processed)

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            # 연결 끊김 등으로 같은 세션 마킹 실패 → 새 세션으로 보장 (세션 266)
            fail_job_safely(job.id, str(e))
        logger.exception("시세 수집 실패")
    finally:
        db.close()


# ── B1(전세) 시세 오염 데이터 정리 헬퍼 ──────────────────────────────
# 옛 크롤러가 tradeType 무시하던 시절 매매(A1) 값을 B1로 잘못 저장한 행을
# 식별·재수집한다. 상세 배경: ~/.claude/plans/claude-cosmic-minsky.md

# 정상 B1 데이터는 실측상 전부 2026-04-12 이후 기록 — 그 이전 B1은 오염 의심
_B1_CONTAMINATION_CUTOFF = "2026-04-12"


def find_contaminated_b1_ids(db, before: str | None = _B1_CONTAMINATION_CUTOFF) -> list[int]:
    """오염된 B1 시세 행의 id 목록.

    오염 B1 = 다음 둘 중 하나:
      기준1 (A1 동일형): A1 행과 (complex_no, area_no, base_month)가 같으면서
        price_avg가 동일한 B1 행.
      기준2 (A1 짝 없음형): recorded_at < before 이면서 동일 키의 A1 행이 없는 B1 행.
        before=None이면 기준2를 건너뛴다 (dry-run 교차검증용).
    """
    a1 = aliased(ComplexPriceHistory)
    b1 = aliased(ComplexPriceHistory)

    # 기준1: A1과 price_avg가 동일한 B1
    same_q = (
        db.query(b1.id)
        .join(
            a1,
            (a1.complex_no == b1.complex_no)
            & (a1.area_no == b1.area_no)
            & (a1.base_month == b1.base_month)
            & (a1.trade_type == "A1")
            & (a1.price_avg == b1.price_avg),
        )
        .filter(b1.trade_type == "B1", b1.price_avg.isnot(None))
    )
    ids = {row[0] for row in same_q.all()}

    # 기준2: before 이전 기록 + 동일 키 A1 부재
    if before is not None:
        orphan_exists = (
            db.query(a1.id)
            .filter(
                a1.trade_type == "A1",
                a1.complex_no == b1.complex_no,
                a1.area_no == b1.area_no,
                a1.base_month == b1.base_month,
            )
            .exists()
        )
        orphan_q = db.query(b1.id).filter(
            b1.trade_type == "B1",
            b1.recorded_at < before,
            ~orphan_exists,
        )
        ids.update(row[0] for row in orphan_q.all())

    return sorted(ids)


def contaminated_complex_nos(db, before: str | None = _B1_CONTAMINATION_CUTOFF) -> list[str]:
    """오염 B1이 있는 단지 번호 목록 (재수집 대상). 삭제 전에 호출해야 한다."""
    ids = find_contaminated_b1_ids(db, before=before)
    if not ids:
        return []
    rows = (
        db.query(ComplexPriceHistory.complex_no)
        .filter(ComplexPriceHistory.id.in_(ids))
        .distinct()
        .all()
    )
    return sorted(row[0] for row in rows)


def recollect_b1_price_for_complex(db, complex_no: str) -> dict:
    """단일 단지의 B1(전세) 시세만 재수집 → complex_price_history upsert.

    collect_price_history_for_complex와 달리 A1·실거래가는 건드리지 않는다.
    멀쩡한 매매 데이터를 불필요하게 재취득하다 손상시키는 위험을 차단.
    Returns: {"collected": N, "failed": N}
    """
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
    for area_no in area_nos:
        _throttle.wait()
        record_call("complex_prices_b1_recollect")
        try:
            result = NaverEstateAPI.get_complex_prices(
                complex_no, trade_type="B1", area_no=area_no
            )
            _throttle.on_success()
        except Exception as e:
            logger.warning("B1 시세 재수집 실패: %s area=%s -> %s", complex_no, area_no, e)
            _throttle.on_rate_limit()
            failed += 1
            continue

        if not result or "error" in result:
            failed += 1
            continue

        for p in _extract_price_list(result):
            base_month = p.get("baseMonth") or p.get("yearMonth")
            if not base_month:
                continue
            _upsert_price_history(
                db, complex_no, "B1",
                area_no=str(p.get("areaNo")) if p.get("areaNo") is not None else None,
                price_upper=safe_int(p.get("upperPrice") or p.get("dealUpperPrice")),
                price_lower=safe_int(p.get("lowerPrice") or p.get("dealLowerPrice")),
                price_avg=safe_int(p.get("averagePrice")),
                base_month=base_month,
            )
            collected += 1

    if collected > 0:
        db.commit()
    logger.info("B1 시세 재수집: complex=%s, collected=%d, failed=%d", complex_no, collected, failed)
    return {"collected": collected, "failed": failed}
