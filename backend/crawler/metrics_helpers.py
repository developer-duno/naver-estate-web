"""단지 가치지표 집계 헬퍼

complex_price_history 테이블에서 단지별 중앙값/레코드 수를 집계한다.
네이버 API 호출 없이 DB 집계만 수행 — service_metrics.py 에서 사용.
"""

from datetime import date, timedelta

from sqlalchemy import func

from crawler.stats import compute_median_price
from db.models import ComplexPriceHistory


def _cutoff_month(months: int) -> str:
    """오늘로부터 N개월 전의 YYYYMM 문자열 (base_month 앞 6자리 비교용)."""
    cutoff = date.today() - timedelta(days=months * 31)
    return cutoff.strftime("%Y%m")


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
