"""크롤링 서비스 — 단지 가치지표 수집

면적별 정부 실거래(complex_area_trade_stats)로 매매 값을, 네이버 평형별 전세 시세(complex_price_history B1)로
전세 값을 전용면적 묶음(정수 ㎡)에 모아 단지별 가치지표 4칸을 complexes 테이블에 채운다.
네이버 API 호출 없이 DB 집계만 — IP 차단 위험 없음.

채우는 필드(세션 474 B27 — 전부 대표 면적 묶음 하나의 값, 사장님 결정 D3 「A. 대표 면적」):
- rep_area_m2: 대표 면적 묶음 — 평형표 세대수 최다 묶음(crawler/area_group.pick_representative)
- nearby_median_price: 대표 묶음 최근 6개월 정부 실거래 가격들의 중앙값(거래 1건 = 1표)
- jeonse_rate: 대표 묶음 네이버 전세 시세(B1 8자리 평형 줄) 중앙값 / 위 정부 중앙값 × 100
- recent_trades_6m: 대표 묶음 최근 6개월 정부 실거래 건수 — 단지 상세 area_prices 의 대표 항목과 같은 숫자

매매 재료는 정부 실거래만이다(보완 ① — 네이버 A1 줄은 호가 기반 시세라 출처가 섞인다). 옛 정부 달 평균 줄
(complex_price_history 의 area_no '' 줄)은 여러 면적이 섞인 값이라 어디에도 쓰지 않는다.
"""

import logging
from dataclasses import dataclass, field

from sqlalchemy import exists, func, or_

from crawler.area_group import load_pyeong_tables, pick_representative
from crawler.metrics_helpers import _cutoff_month
from crawler.service_common import _checkpoint, fail_job_safely
from crawler.stats import compute_jeonse_rate, compute_median_price
from db.area_price_queries import AREA_PRICE_MONTHS
from db.database import SessionLocal
from db.models import Complex, ComplexAreaTradeStat, ComplexPriceHistory, CrawlJob
from utils import utcnow

logger = logging.getLogger(__name__)

# 매매 중앙값 계산 기간(개월) — 후보 조건과 계산이 같은 값을 써야 헛바퀴가 안 생긴다(세션 428).
# 세션 474: 화면(db/area_price_queries)과 같은 한 곳(AREA_PRICE_MONTHS)에서 — 달력 기준 6개월.
_MEDIAN_MONTHS = AREA_PRICE_MONTHS

# commit 간격(확인한 단지 수). 운영 DB 왕복 약 9.5ms(10-03 실측) × 묶음 안 UPDATE 약 30건 ≈ 0.3초만 잠그게(세션 428).
_METRIC_COMMIT_EVERY = 50

# 체크포인트 저장·진행 로그 간격(확인한 단지 수). 전량(약 2.4만 단지)을 돌므로 공용 체크포인트 간격(5)을
# 그대로 쓰면 체크포인트 기록·로그가 수천 번 생긴다 — 이 잡만 넓게 잡는다(세션 428).
_METRIC_SAVE_EVERY = 500

# 잡 사유 문구 — 알림에도 원문 그대로 나가게 `plain_words._ERROR_RULES` 에 같은 머리말 규칙이 있다(세션 428 재검사관).
# 세션 474: 면적별 정부 실거래 표(V073)가 최근 6개월 0줄이면(운영 첫 수집 전·수집 장애) 대표 면적 값을 만들
# 재료가 없어 거의 모든 단지를 빈 값으로 바꾸게 된다 — 이때는 아무것도 쓰지 않고 failed 로 멈춘다.
_NO_RECENT_ROWS_WORDS = (
    "첫 수집 전이라 면적별 실거래 표가 비어 있어요 — 주간 수집(토요일 05:00)이나 수동 수집 뒤 채워져요"
)

# 덮개 비율 문턱(세션 474 검사관 C 🟠1) — 최근 6개월 면적별 표에 줄 있는 단지 ÷ 옛 정부 달 평균('' 줄) 있는 단지.
# 이보다 낮으면 표가 덜 채워진 날(첫 수동 수집이 도중에 멈춤 등)로 보고, 면적별 줄이 없는 단지는 옛 값을 그대로 둔다.
_COVERAGE_MIN = 0.9


def _partial_coverage_words(have: int, legacy: int, kept: int) -> str:
    """덮개 비율이 문턱 밑인 날의 잡 사유(completed) — plain_words 같은 머리말 규칙."""
    return f"면적별 실거래 표가 아직 덜 채워져(단지 {have:,}/{legacy:,}) {kept:,}곳은 옛 값을 그대로 두었어요"


@dataclass
class RecentMaterial:
    """최근 6개월 재료 — 단지 → 면적 묶음(정수 ㎡) → 가격 표(만원) (세션 474 B27)."""

    a1: dict[str, dict[int, list[int]]] = field(default_factory=dict)
    b1: dict[str, dict[int, list[int]]] = field(default_factory=dict)
    # 다시 계산 대상 = 최근 6개월 매매 평균가 줄(옛 정부 '' 줄 포함)이나 면적별 정부 줄이 있는 단지
    seen: set[str] = field(default_factory=set)
    gov_rows: int = 0   # 면적별 정부 실거래 표 최근 줄 수
    gov_complexes: set[str] = field(default_factory=set)     # 면적별 정부 표 최근 줄이 있는 단지
    legacy_complexes: set[str] = field(default_factory=set)  # 옛 정부 달 평균('' 줄) 최근 줄이 있는 단지(덮개 비율 분모)
    unmapped: int = 0   # 평형번호 줄인데 평형표에 없어 묶음을 못 정해 버린 줄 수
    # seen 단지들의 평형표 {단지: [(pyeong_no, 묶음 ㎡ | None, 세대수)]} — 대표 면적 판정에도 쓴다
    pyeong: dict[str, list[tuple[int, int | None, int]]] = field(default_factory=dict)


def _add_vote(bucket: dict[str, dict[int, list[int]]], complex_no: str, area: int, price: int) -> None:
    bucket.setdefault(complex_no, {}).setdefault(area, []).append(int(price))


def _load_recent_prices(db, cutoff: str) -> RecentMaterial:
    """기준 달(cutoff, YYYYMM) 이후 재료를 한 번에 읽어 단지·면적 묶음별로 모은다.

    - A1(매매) = 면적별 정부 실거래 표 줄의 prices **만**(거래 1건 = 1표). complex_price_history 의 A1 줄은
      재료가 아니다 — 네이버 평형번호 A1 줄(8자리·6자리)은 출처가 섞이고, area_no '' 줄은 면적이 섞인다(보완 ①).
      그 줄들은 "다시 계산 대상(seen)" 판정에만 쓴다.
    - B1(전세) = 네이버 주간(8자리) 평형번호 줄을 평형표로 같은 묶음에(price_avg 1개 = 1표). '' · NULL 은 버린다.
    평형표는 다시 계산 대상(seen) 단지만 500개씩 나눠 한 번에 읽는다.
    """
    m = RecentMaterial()

    for complex_no, area_m2, prices in (
        db.query(ComplexAreaTradeStat.complex_no, ComplexAreaTradeStat.area_m2, ComplexAreaTradeStat.prices)
        .filter(ComplexAreaTradeStat.base_month >= cutoff)
        .all()
    ):
        m.gov_rows += 1
        m.seen.add(complex_no)
        m.gov_complexes.add(complex_no)
        for price in prices or []:
            if price:
                _add_vote(m.a1, complex_no, int(area_m2), price)

    rows = (
        db.query(
            ComplexPriceHistory.complex_no,
            ComplexPriceHistory.trade_type,
            ComplexPriceHistory.area_no,
            ComplexPriceHistory.base_month,
            ComplexPriceHistory.price_avg,
        )
        .filter(
            ComplexPriceHistory.trade_type.in_(("A1", "B1")),
            func.substr(ComplexPriceHistory.base_month, 1, 6) >= cutoff,
            ComplexPriceHistory.price_avg.isnot(None),
        )
        .all()
    )
    naver_rows = []
    for complex_no, trade_type, area_no, base_month, price_avg in rows:
        if trade_type == "A1":
            m.seen.add(complex_no)
            if area_no == "" and len(base_month or "") == 6:
                m.legacy_complexes.add(complex_no)
            continue  # 매매 재료는 정부 실거래 표만 — 네이버 A1 · 옛 '' 줄은 섞지 않는다(세션 474 B27 보완 ①)
        if not area_no:
            continue  # '' · NULL = 면적 모름 — 전세 재료에서도 뺀다
        if len(base_month or "") != 8:
            continue  # 전세는 네이버 주간(8자리) 평형 시세만
        naver_rows.append((complex_no, area_no, price_avg))

    m.pyeong = load_pyeong_tables(db, sorted(m.seen))
    groups_cache: dict[str, dict[str, int]] = {}
    for complex_no, area_no, price_avg in naver_rows:
        groups = groups_cache.get(complex_no)
        if groups is None:
            groups = {str(pno): area for pno, area, _ in m.pyeong.get(complex_no, []) if area is not None}
            groups_cache[complex_no] = groups
        area = groups.get(str(area_no).strip())
        if area is None:
            m.unmapped += 1
            continue
        _add_vote(m.b1, complex_no, area, price_avg)
    return m


def _area_metrics(a1_by_area: dict[int, list[int]], b1_by_area: dict[int, list[int]], table):
    """네 값 (대표 면적 묶음, 중앙값, 전세가율, 최근 표 수) — 대표 묶음 하나로만 계산한다(세션 474 B27).

    A1 표가 하나도 없으면 네 칸 모두 None(옛 섞인 값으로 되돌아가지 않는다). 대표 묶음에 매매 표가 없으면
    묶음은 정하되 중앙값·전세가율 None, 표 수 0.
    """
    if not any(a1_by_area.values()):
        return None, None, None, None
    counts = {area: len(prices) for area, prices in a1_by_area.items()}
    rep = pick_representative(table, counts)
    if rep is None:
        return None, None, None, None
    a1 = a1_by_area.get(rep, [])
    median, rate, recent = _compute_metrics(a1, b1_by_area.get(rep, []), len(a1))
    return rep, median, rate, recent


def _compute_metrics(a1: list[int], b1: list[int], recent_count: int):
    """세 값 (중앙값, 전세가율, 최근 거래 수) — 계산 규칙은 옛 단지별 쿼리 경로와 같다."""
    median = compute_median_price(a1)
    jeonse_median = compute_median_price(b1) if b1 else None
    # 전세가율은 정의상 전세 < 매매 (100% 미만) 여야 한다.
    # complex_price_history 의 B1 데이터 84% 가 A1 과 동일값인 결함이
    # 있어, 전세중앙값 >= 매매중앙값이면 신뢰 불가로 보고 NULL 유지.
    if jeonse_median is not None and median is not None and jeonse_median >= median:
        jeonse_median = None
    return median, compute_jeonse_rate(median, jeonse_median), recent_count


def collect_complex_metrics(batch_size: int = 0, scheduler_job_id: str | None = None):
    """단지 가치지표 3필드를 매일 다시 계산 → 값이 바뀐 단지만 complexes UPDATE.

    세션 428 (사장님 결정 2026-10-03):
    - 다시 계산: 최근 6개월 A1(price_avg 있는 줄)이 있는 **모든 단지**의 세 값을 매 회차 다시 계산한다.
      옛 코드는 nearby_median_price 가 NULL 인 단지만 채워, 한 번 채운 값이 몇 달씩 낡았다
      (10-03 실측: 다시 계산하면 5% 이상 달라지는 단지 2,581곳·거래 수가 달라진 곳 14,570곳).
    - 최근 6개월 A1(price_avg 있는 줄)이 없는 단지는 읽지도 쓰지도 않는다 — 마지막 값 유지.
      (10-03 사장님 결정: 3월 일괄 수집분만 있는 단지 약 8천 곳이 기준 달이 넘어가는 날 한꺼번에 비지 않게)
    - 최근 6개월 면적별 정부 실거래 줄을 하나도 못 읽었으면 아무것도 쓰지 않고 잡 failed(시세 기록 장애 신호 —
      세션 474: 이 표가 비면 대표 면적 재료가 없어 거의 모든 단지를 비우게 된다).
    - 세션 474 B27: 네 값(rep_area_m2 포함)은 대표 면적 묶음 하나의 값. 재료(면적 묶음 매매 표)가 하나도 없는
      후보는 네 칸을 비운다(옛 섞인 값으로 되돌아가지 않는다).
    - batch_size <= 0 이면 전량, 양수면 세대수 큰 순으로 그만큼만 다시 계산한다(스케줄러 기본 0).
      양수면 매일 같은 상위 N곳만 계산된다(순환 없음 — 나머지는 옛 값 유지).
    - 쓰기: 세 값이 저장값과 같으면 UPDATE 하지 않는다(updated_at 그대로) — 쓰기량을 줄이려고
      (complexes 는 미분양도 읽는 공용 표).
    - 잡 기록: total = 다시 계산 대상 수, processed = 그중 확인을 마친 수(값이 그대로인 단지 포함).
      처리 수를 "바뀐 수"로 적으면 값이 그대로인 날 신선도 화면이 헛바퀴(처리 0/대상 N)로 빨갛게 된다.

    읽기: 최근 6개월 면적별 정부 줄 + A1·B1 줄을 한 번에 읽어(10-03 실측 운영 약 20만 줄·0.5초) 파이썬에서
    단지·면적 묶음별로 묶는다(_load_recent_prices). 평형표는 대상 단지만 500개씩 나눠 읽는다.
    """
    db = SessionLocal()
    job = CrawlJob(
        job_type="complex_metric",
        scheduler_job_id=scheduler_job_id,
        status="running",
        started_at=utcnow(),
    )
    db.add(job)
    db.commit()
    job_id = job.id  # except 에서 깨진 세션의 ORM 속성 접근 피하기 위해 미리 확보

    try:
        if batch_size > 0:
            logger.warning(
                "가치지표 수집 배치 %d — 세대수 상위 %d곳만 다시 계산합니다(나머지는 옛 값 유지). 전량은 0",
                batch_size,
                batch_size,
            )

        cutoff = _cutoff_month(_MEDIAN_MONTHS)  # 읽기·후보 조건이 같은 기준 달을 쓰게 한 번만 계산
        material = _load_recent_prices(db, cutoff)

        if material.gov_rows == 0:
            job.status = "failed"
            job.total_items = 0
            job.processed_items = 0
            job.error_message = _NO_RECENT_ROWS_WORDS
            job.completed_at = utcnow()
            db.commit()
            logger.error("가치지표 수집 중단: 최근 6개월 면적별 정부 실거래 0줄 — 아무것도 쓰지 않음")
            return

        # 후보 = 최근 A1(평균가 있음 — 옛 정부 '' 줄 포함) 단지 또는 면적별 정부 줄이 있는 단지. 계산은 위에서 읽은
        # 재료(material)로만 한다 — 두 번 읽은 결과가 엇갈리면(그 사이 새 줄이 들어온 단지) 재료를 읽을 때 못 본
        # 단지는 이번 회차에서 건너뛴다. 재료(면적 묶음 표)가 하나도 없는 후보는 네 칸을 비운다(세션 474 B27).
        has_recent_a1 = exists().where(
            ComplexPriceHistory.complex_no == Complex.complex_no,
            ComplexPriceHistory.trade_type == "A1",
            func.substr(ComplexPriceHistory.base_month, 1, 6) >= cutoff,
            ComplexPriceHistory.price_avg.isnot(None),
        )
        has_recent_gov_area = exists().where(
            ComplexAreaTradeStat.complex_no == Complex.complex_no,
            ComplexAreaTradeStat.base_month >= cutoff,
        )
        candidates = (
            db.query(
                Complex.complex_no,
                Complex.nearby_median_price,
                Complex.jeonse_rate,
                Complex.recent_trades_6m,
                Complex.rep_area_m2,
            )
            .filter(or_(has_recent_a1, has_recent_gov_area))
            .order_by(Complex.total_household_count.desc().nullslast())
            .all()
        )
        recompute = [c for c in candidates if c.complex_no in material.seen]
        # 덮개 비율(세션 474 검사관 C 🟠1): 표가 덜 채워진 날엔 면적별 줄 없는 단지를 이번 회차에서 건너뛴다(옛 값 유지)
        legacy_n = len(material.legacy_complexes)
        have_n = len(material.gov_complexes)
        coverage = have_n / legacy_n if legacy_n else 1.0
        partial_reason = None
        if coverage < _COVERAGE_MIN:
            kept = [c for c in recompute if c.complex_no not in material.gov_complexes]
            recompute = [c for c in recompute if c.complex_no in material.gov_complexes]
            partial_reason = _partial_coverage_words(have_n, legacy_n, len(kept))
            logger.warning("가치지표 수집: %s (덮개 %.2f)", partial_reason, coverage)
        if batch_size > 0:
            recompute = recompute[:batch_size]
        total = len(recompute)

        if material.unmapped:
            logger.info("가치지표 수집: 평형표에 없는 평형번호 시세 %d줄은 면적 묶음을 몰라 뺐어요", material.unmapped)

        checked = changed = 0
        for c in recompute:
            new_values = _area_metrics(
                material.a1.get(c.complex_no, {}),
                material.b1.get(c.complex_no, {}),
                material.pyeong.get(c.complex_no, []),
            )
            stored = (c.rep_area_m2, c.nearby_median_price, c.jeonse_rate, c.recent_trades_6m)
            if new_values != stored:
                rep_area, median, jeonse_rate, recent = new_values
                db.query(Complex).filter(Complex.complex_no == c.complex_no).update(
                    {
                        Complex.rep_area_m2: rep_area,
                        Complex.nearby_median_price: median,
                        Complex.jeonse_rate: jeonse_rate,
                        Complex.recent_trades_6m: recent,
                        Complex.updated_at: utcnow(),
                    },
                    synchronize_session=False,
                )
                changed += 1
            checked += 1

            if checked % _METRIC_COMMIT_EVERY == 0:
                db.commit()
            if checked % _METRIC_SAVE_EVERY == 0:
                _checkpoint.save(db, job_id, {"processed": checked, "total": total})
                logger.info("가치지표 수집 중간 저장: %d/%d", checked, total)

        job.status = "completed"
        job.total_items = total
        job.processed_items = checked
        if partial_reason:
            job.error_message = partial_reason
        job.completed_at = utcnow()
        db.commit()
        _checkpoint.delete(db, job_id)
        logger.info(
            "가치지표 수집 완료: 확인 %d · 바뀜 %d · 그대로 %d",
            checked,
            changed,
            checked - changed,
        )

    except Exception as e:
        try:
            db.rollback()
            job.status = "failed"
            job.error_message = str(e)[:500]
            db.commit()
        except Exception:
            # 연결 끊김 등으로 같은 세션 마킹 실패 → 새 세션으로 보장 (세션 266)
            fail_job_safely(job_id, str(e))
        logger.exception("가치지표 수집 실패")
    finally:
        db.close()
