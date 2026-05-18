"""crawler/service_metrics.py 통합 테스트

collect_complex_metrics 검증 — 정상 단지 / 전세 데이터 결함 단지 / 빈 단지.
SessionLocal 은 conftest 가 TestSession 으로 교체하므로 별도 mock 불필요.
"""

from datetime import date

from db.models import Complex, ComplexPriceHistory
from services.upsert import upsert_complex_from_search


def _recent_month() -> str:
    return date.today().strftime("%Y%m")


def _make_complex(complex_no: str) -> dict:
    return {
        "complexNo": complex_no,
        "complexName": f"지표테스트{complex_no}",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _add_price(db, complex_no, trade_type, price_avg):
    db.add(
        ComplexPriceHistory(
            complex_no=complex_no,
            trade_type=trade_type,
            area_no=None,
            price_upper=price_avg + 10000,
            price_lower=price_avg - 10000,
            price_avg=price_avg,
            base_month=_recent_month(),
        )
    )


class TestCollectComplexMetrics:
    def test_normal_complex_filled(self, db):
        """정상: 전세 < 매매 단지 → 3필드 모두 채워짐."""
        upsert_complex_from_search(db, _make_complex("70001"))
        for p in (300000, 310000, 320000):
            _add_price(db, "70001", "A1", p)
        for p in (200000, 210000, 220000):  # 전세 < 매매
            _add_price(db, "70001", "B1", p)
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        c = db.query(Complex).filter(Complex.complex_no == "70001").first()
        assert c.nearby_median_price == 310000
        assert c.jeonse_rate == 67.7  # 210000/310000*100
        assert c.recent_trades_6m == 3

    def test_jeonse_defect_guard(self, db):
        """결함: 전세 median == 매매 median → jeonse_rate 는 NULL 유지."""
        upsert_complex_from_search(db, _make_complex("70002"))
        for p in (31000, 31000, 31000):
            _add_price(db, "70002", "A1", p)
        for p in (31000, 31000, 31000):  # 매매와 동일값 = 결함
            _add_price(db, "70002", "B1", p)
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        c = db.query(Complex).filter(Complex.complex_no == "70002").first()
        assert c.nearby_median_price == 31000  # 매매중앙값은 채워짐
        assert c.jeonse_rate is None  # 결함 데이터 → NULL

    def test_no_price_history_skipped(self, db):
        """빈 데이터: 시세 이력 없는 단지 → NULL 유지 (건너뜀)."""
        upsert_complex_from_search(db, _make_complex("70003"))
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        c = db.query(Complex).filter(Complex.complex_no == "70003").first()
        assert c.nearby_median_price is None
