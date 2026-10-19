"""단지 가치지표 집계 헬퍼

complex_price_history 테이블에서 단지별 중앙값/레코드 수를 집계한다.
네이버 API 호출 없이 DB 집계만 수행 — service_metrics.py 에서 사용.
"""

from datetime import date

from sqlalchemy import func

from crawler.stats import compute_median_price
from db.models import ComplexPriceHistory


def _cutoff_month(months: int, today: date | None = None) -> str:
    """달력 기준 최근 N개월의 첫 달 YYYYMM (base_month 앞 6자리 비교용) — 이번 달 포함 N달.

    세션 474(검사관 C 🟡2): 옛 계산(오늘 − 31×N일)은 날짜에 따라 7개 달력월을 걸쳤다(10-19 → 202604).
    이제 2026-10-19, N=6 → 202605(5~10월 6달). today 는 시험용.
    """
    today = today or date.today()
    total = today.year * 12 + (today.month - 1) - (months - 1)
    y, m0 = divmod(total, 12)
    return f"{y:04d}{m0 + 1:02d}"


def calc_median_price(db, complex_no: str, trade_type: str, months: int = 6) -> int | None:
    """최근 N개월 시세 이력의 price_avg 중앙값.

    base_month 는 YYYYMM(6자리)/YYYYMMDD(8자리) 형식이 혼재하므로
    LEFT(base_month, 6) 으로 앞 6자리만 잘라 비교한다 (두 형식 모두 안전).
    데이터 없으면 None.
    """
    cutoff = _cutoff_month(months)
    rows = (
        db.query(ComplexPriceHistory.price_avg)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.trade_type == trade_type,
            func.substr(ComplexPriceHistory.base_month, 1, 6) >= cutoff,
            ComplexPriceHistory.price_avg.isnot(None),
        )
        .all()
    )
    prices = [r[0] for r in rows]
    return compute_median_price(prices) if prices else None


def count_recent_price_records(db, complex_no: str, months: int = 6) -> int:
    """최근 N개월 매매(A1) 시세 이력 레코드 수.

    trades 테이블 대신 complex_price_history 를 쓰는 이유: trades 는
    complex_no 키가 없어 단지명 매칭 시 동명 단지 과집계가 발생한다.
    complex_no 는 정확 키 — 오매칭 0. 단지 활성도 지표로 사용.
    """
    cutoff = _cutoff_month(months)
    count = (
        db.query(func.count(ComplexPriceHistory.id))
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.trade_type == "A1",
            func.substr(ComplexPriceHistory.base_month, 1, 6) >= cutoff,
        )
        .scalar()
    )
    return count or 0
