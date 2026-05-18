"""crawler/metrics_helpers.py 단위 테스트

calc_median_price / count_recent_price_records 검증 — 정상/빈데이터.
"""

from datetime import date, timedelta

from crawler.metrics_helpers import calc_median_price, count_recent_price_records
from db.models import ComplexPriceHistory


def _recent_month() -> str:
    """최근(이번 달) YYYYMM — 6개월 윈도 안에 확실히 드는 값."""
    return date.today().strftime("%Y%m")


def _old_month() -> str:
    """1년 전 YYYYMM — 6개월 윈도 밖."""
    return (date.today() - timedelta(days=365)).strftime("%Y%m")


def _add_price(db, complex_no, trade_type, base_month, price_avg):
    """테스트용 시세 이력 1건 삽입 (팩토리)."""
    db.add(
        ComplexPriceHistory(
            complex_no=complex_no,
            trade_type=trade_type,
            area_no=None,
            price_upper=price_avg + 10000,
            price_lower=price_avg - 10000,
            price_avg=price_avg,
            base_month=base_month,
        )
    )
    db.commit()


class TestCalcMedianPrice:
    def test_median_of_recent_records(self, db):
        """최근 6개월 매매 시세 3건 → 중앙값 반환."""
        ym = _recent_month()
        for price in (140000, 150000, 160000):
            _add_price(db, "10001", "A1", ym, price)

        result = calc_median_price(db, "10001", "A1", months=6)
        assert result == 150000

    def test_empty_returns_none(self, db):
        """시세 이력 없는 단지 → None."""
        result = calc_median_price(db, "99999", "A1", months=6)
        assert result is None

    def test_old_records_excluded(self, db):
        """6개월 밖 데이터만 있으면 → None (윈도 필터 동작)."""
        _add_price(db, "10002", "A1", _old_month(), 150000)
        result = calc_median_price(db, "10002", "A1", months=6)
        assert result is None


class TestCountRecentPriceRecords:
    def test_counts_recent_a1_records(self, db):
        """최근 6개월 A1 레코드 수 COUNT."""
        ym = _recent_month()
        for price in (140000, 150000):
            _add_price(db, "10003", "A1", ym, price)
        _add_price(db, "10003", "B1", ym, 90000)  # B1 은 제외 대상

        assert count_recent_price_records(db, "10003", months=6) == 2

    def test_empty_returns_zero(self, db):
        """이력 없는 단지 → 0."""
        assert count_recent_price_records(db, "99999", months=6) == 0
