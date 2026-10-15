"""크롤링 서비스 — 시세 수집

D. 단지별 시세 이력 배치 수집
   + on-demand 실시간 수집 (단일 단지)
"""

import logging
import random
from datetime import timedelta
from typing import Callable

from sqlalchemy import exists
from sqlalchemy.orm import aliased

from crawler.service_common import (
    RESUME_LOOKBACK_LIMIT,
    RESUME_MAX_AGE_HOURS,
    _checkpoint,
    _extract_price_list,
    _upsert_price_history,
    fail_job_safely,
)
from crawler.utils import AdaptiveThrottle
from db.database import SessionLocal
from db.models import Complex, ComplexPriceHistory, ComplexPyeongDetail, CrawlJob
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR
from services.naver_call_counter import record_call
from shared.naver_api import NaverEstateAPI
from utils import safe_int, utcnow

logger = logging.getLogger(__name__)

# 적응형 쓰로틀: 배치용 / on-demand용 분리
_throttle = AdaptiveThrottle(min_interval=1.5, max_interval=10.0)
_throttle_ondemand = AdaptiveThrottle(min_interval=2.0, max_interval=10.0)


# 주간 배치(collect_price_history)가 429 로 못 받은 단지가 이만큼 이어지면 회차를 멈추고 failed (B21).
# error-propagation.md 5번 — 429 소진은 "자료 없음"이 아니라 실패다. 계속 두드리면 차단만 길어진다.
_RATE_LIMIT_ABORT_STREAK = 5


def _rate_limited_words(
    total: int, rate_limited: int, processed: int, aborted: bool, mixed: bool = False,
) -> str:
    """네이버가 막아 실패한 회차의 error_message — 쉬운 우리말 한 문장(관리자 화면·텔레그램 알림 공통).

    중단이면 "받은 단지 수"를, 끝까지 돌았으면 "못 받은 단지 수"를 말한다(중단 때는 멈춘 뒤 안 부른 단지가 있어 못 받은 수가 실제보다 적게 읽힌다).
    mixed=False — 못 받은 단지가 전부 429 소진(B21 문장 그대로). True — 403·5xx·네트워크 오류가 섞임(B24).

    ⚠ 머리 "네이버가 요청이 너무 많다며 거절해"·"네이버가 막거나 오류를 내서" 는 plain_words._ERROR_RULES 가
    원문 그대로 통과시키는 표지다 — 바꾸면 알림이 "처음 보는 문제" 로 뭉개진다. 영문 글자·`|`·문장 중간 마침표를 넣지 않는다.
    """
    head = "네이버가 막거나 오류를 내서" if mixed else "네이버가 요청이 너무 많다며 거절해"
    if aborted:
        got = f"{processed}개만 받고" if processed else "하나도 못 받고"
        return (
            f"{head} {total}개 단지 중 {got} 멈췄어요"
            f"(연속 {_RATE_LIMIT_ABORT_STREAK}개 단지 {'실패' if mixed else '거절'})."
        )
    return (
        f"{head} {total}개 단지 중 {rate_limited}개를 못 받았어요"
        f"(받은 단지 {processed}개보다 많아요)."
    )


def _is_rate_limit_exhausted(result) -> bool:
    """네이버가 429 를 재시도 끝까지 돌려준 응답인가(B20 덤 — enricher 와 같은 판정).

    이때만 간격을 늘린다. 다른 error 문구·빈 응답은 간격을 건드리지 않는다.
    """
    return isinstance(result, dict) and result.get("error") == RATE_LIMIT_EXHAUSTED_ERROR


# 네이버 클라이언트(shared/naver_api.py `_request_with_retry` — 수정 금지)가 실패 때 돌려주는 error 의 머리 (B24).
# 404 등 다른 4xx 는 그 자료가 없다는 답이라 어느 쪽에도 넣지 않는다.
# 막힘 = 401·403 재발급 뒤에도 실패 / 네트워크 예외 재시도 소진 — 429 소진과 함께 "연속 수"에도 센다.
_BLOCKED_ERROR_PREFIXES = ("API 인증 실패", "데이터 조회 중 오류 발생")
# 서버 오류(5xx) — 클라이언트가 재시도 없이 바로 돌려줘서 네이버가 20~30초만 흔들려도 연속 5개가 찬다.
# 그래서 "못 받은 단지 > 받은 단지" 비율 규칙에만 센다(B24 검사관 C).
_SERVER_ERROR_PREFIX = "API 요청 실패: 상태 코드 5"


def _error_text(result) -> str | None:
    error = result.get("error") if isinstance(result, dict) else None
    return error if isinstance(error, str) else None


def _is_blocked_error(result) -> bool:
    """네이버가 막아 못 받은 응답인가(B24) — 429 소진 + 401·403 + 네트워크 오류. 주간 배치에서 연속 수에도 센다.

    간격 늘리기(on_rate_limit)는 여전히 429 일 때만 한다.
    """
    if _is_rate_limit_exhausted(result):
        return True
    error = _error_text(result)
    return error is not None and error.startswith(_BLOCKED_ERROR_PREFIXES)


def is_naver_server_error(result) -> bool:
    """네이버 서버 오류(5xx) 응답인가(B24) — 비율 규칙에만 센다. 새 단지 찾기(service_discover)도 같은 판정을 쓴다."""
    error = _error_text(result)
    return error is not None and error.startswith(_SERVER_ERROR_PREFIX)


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
            except Exception as e:
                logger.warning("시세 조회 실패: %s %s area=%s -> %s", complex_no, trade_type, area_no, e)
                _throttle_ondemand.on_rate_limit()
                failed += 1
                _report()
                continue

            if not result or "error" in result:
                if _is_rate_limit_exhausted(result):
                    _throttle_ondemand.on_rate_limit()
                failed += 1
                _report()
                continue

            _throttle_ondemand.on_success()
            collected_before = collected
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
            # 호출 한 번의 결과를 바로 커밋 — 다음 네이버 대기 동안 행 잠금·열린 트랜잭션을 남기지 않는다(B18)
            if collected > collected_before:
                db.commit()
            _report()

    # 실거래가(/prices/real): 기본 area_no만 수집 (장기 이력, YYYYMM 월별 저장)
    for trade_type in ("A1", "B1"):
        _throttle_ondemand.wait()
        record_call("complex_real_prices_ondemand")
        try:
            real_result = NaverEstateAPI.get_complex_real_prices(complex_no, trade_type=trade_type)
        except Exception as e:
            logger.debug("실거래가 조회 실패: %s %s -> %s", complex_no, trade_type, e)
            _throttle_ondemand.on_rate_limit()
            failed += 1
            _report()
            continue
        if not real_result or "error" in real_result:
            if _is_rate_limit_exhausted(real_result):
                _throttle_ondemand.on_rate_limit()
            failed += 1
            _report()
            continue
        _throttle_ondemand.on_success()
        collected_before = collected
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
        if collected > collected_before:
            db.commit()
        _report()

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
    #
    # ⚠ 건수 상한(RESUME_LOOKBACK_LIMIT)만으론 부족하다(세션 370 발견) — 실패 잡의
    # 체크포인트는 영구 잔존하므로 어느 수요일 실행이 중간 실패하면 그 체크포인트가
    # **이후 매주** 스캔에 걸려 같은 단지들을 계속 제외한다(public_trade_data 와
    # 동일한 주간 피해 구조 — 이 잡도 주 1회 수 04:00).
    # 재개는 "중단 직후 곧 재실행" 의도이므로 신선도(RESUME_MAX_AGE_HOURS)로도 함께 막는다.
    done_complex_nos: set[str] = set()
    resume_cutoff = utcnow() - timedelta(hours=RESUME_MAX_AGE_HOURS)
    recent_stopped_jobs = (
        db.query(CrawlJob)
        .filter(
            CrawlJob.job_type == "price_history",
            CrawlJob.status.in_(["failed", "cancelled"]),
            CrawlJob.started_at >= resume_cutoff,
        )
        .order_by(CrawlJob.id.desc())
        .limit(RESUME_LOOKBACK_LIMIT)
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
    job_id = job.id  # except 에서 깨진 세션의 ORM 속성 접근 피하기 위해 미리 확보

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
        # B21·B24 — 두 호출 모두 성공 못 했고 그중 하나라도 막힘·서버 오류(429 소진·401/403·5xx·네트워크)인
        # 단지 수(전체). 연속 수는 막힘(429·401/403·네트워크)만 — 5xx 로만 못 받은 단지는 비율에만 세고
        # 연속 수를 올리지도 0 으로 되돌리지도 않는다. 다른 error(자료 없음 등)·예외는 세지 않는다.
        # 연속 수는 성공 단지가 나올 때만 0 으로.
        rate_limited = 0
        rate_limited_streak = 0
        aborted = False
        mixed = False  # 못 받은 단지 중 429 아닌 막힘·오류가 하나라도 있었나 — 실패 문장을 가른다(B24)
        for i, (complex_no,) in enumerate(complexes):
            complex_had_success = False
            complex_rate_limited = False
            complex_other_blocked = False
            complex_server_error = False
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
                    if _is_rate_limit_exhausted(result):
                        _throttle.on_rate_limit()
                        complex_rate_limited = True
                    elif _is_blocked_error(result):
                        complex_other_blocked = True
                    elif is_naver_server_error(result):
                        complex_server_error = True
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
                # 호출 한 번의 결과를 바로 커밋 — 다음 네이버 대기 동안 행 잠금·열린 트랜잭션을
                # 남기지 않는다(B18). 완료 집합은 아래 체크포인트 때만 저장.
                db.commit()
                complex_had_success = True
            # 단지당 한 번만 카운트 (A1, B1 중 하나라도 성공하면)
            # 실패한 단지는 done 에 안 넣음 — 일시적 API 실패일 수 있어 다음 재개 때 재시도.
            if complex_had_success:
                processed += 1
                newly_done.add(complex_no)
                rate_limited_streak = 0
            elif complex_rate_limited or complex_other_blocked:
                rate_limited += 1
                rate_limited_streak += 1
                mixed = mixed or complex_other_blocked or complex_server_error
            elif complex_server_error:
                rate_limited += 1
                mixed = True

            # 체크포인트 — 완료된 단지 번호 집합을 저장 (재개 시 이 집합을 쿼리에서 제외)
            if _checkpoint.should_save(i + 1):
                db.commit()
                _checkpoint.save(
                    db, job.id,
                    {"done_complex_nos": sorted(done_complex_nos | newly_done), "total": len(complexes)},
                )
                logger.info("시세 수집 중간 저장: %d/%d 완료", len(done_complex_nos | newly_done), len(complexes))

            if rate_limited_streak >= _RATE_LIMIT_ABORT_STREAK:
                aborted = True
                logger.warning(
                    "시세 수집 중단: 네이버 거절·오류로 %d개 단지 연속 실패 (%d/%d 단지에서)",
                    rate_limited_streak, i + 1, len(complexes),
                )
                break

        job.total_items = len(complexes)
        job.processed_items = processed
        job.completed_at = utcnow()
        if aborted or rate_limited > processed:
            # 실패로 끝내고 완료분은 체크포인트로 남긴다 — 곧 다시 돌리면 받은 단지를 건너뛴다.
            # 체크포인트 저장을 먼저 — 저장이 예외를 내도 아래 except 가 429 사유를 예외 원문으로 덮지 않게.
            try:
                _checkpoint.save(
                    db, job.id,
                    {"done_complex_nos": sorted(done_complex_nos | newly_done), "total": len(complexes)},
                )
            except Exception as e:
                db.rollback()
                logger.warning("시세 수집 체크포인트 저장 실패: %s", e)
            job.status = "failed"
            job.error_message = _rate_limited_words(len(complexes), rate_limited, processed, aborted, mixed)
            job.completed_at = utcnow()
            job.total_items = len(complexes)
            job.processed_items = processed
            db.commit()
            logger.warning("시세 수집 실패(네이버 거절·오류): %s", job.error_message)
            return

        job.status = "completed"
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
            fail_job_safely(job_id, str(e))
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
        except Exception as e:
            logger.warning("B1 시세 재수집 실패: %s area=%s -> %s", complex_no, area_no, e)
            _throttle.on_rate_limit()
            failed += 1
            continue

        if not result or "error" in result:
            if _is_rate_limit_exhausted(result):
                _throttle.on_rate_limit()
            failed += 1
            continue

        _throttle.on_success()
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
