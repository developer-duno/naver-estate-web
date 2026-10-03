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


def _add_old_price(db, complex_no, price_avg):
    """6개월 계산 창 밖(2년 전) 매매 이력 — 중앙값 계산에는 안 쓰인다."""
    db.add(
        ComplexPriceHistory(
            complex_no=complex_no,
            trade_type="A1",
            area_no=None,
            price_upper=price_avg,
            price_lower=price_avg,
            price_avg=price_avg,
            base_month=f"{date.today().year - 2}01",
        )
    )


def _set_households(db, complex_no, hh):
    db.query(Complex).filter(Complex.complex_no == complex_no).update(
        {Complex.total_household_count: hh}, synchronize_session=False
    )


def _last_metric_job(db):
    from db.models import CrawlJob

    return (
        db.query(CrawlJob)
        .filter(CrawlJob.job_type == "complex_metric")
        .order_by(CrawlJob.id.desc())
        .first()
    )


class TestMetricCandidateSelection:
    """세션 428: 옛 매매 이력만 있는 큰 단지가 배치 자리를 차지해 계산 가능한 작은 단지가 굶던 결함."""

    def test_old_only_big_complexes_do_not_starve_small_fillable(self, db):
        # 큰 단지 3곳 = 2년 전 매매만 있음(계산 불가) · 작은 단지 1곳 = 최근 매매 있음(계산 가능)
        for no, hh in (("71001", 3000), ("71002", 2000), ("71003", 1000)):
            upsert_complex_from_search(db, _make_complex(no))
            _set_households(db, no, hh)
            _add_old_price(db, no, 500000)
        upsert_complex_from_search(db, _make_complex("71009"))
        _set_households(db, "71009", 30)
        _add_price(db, "71009", "A1", 200000)
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=2)  # 큰 단지 수(3)보다 작은 배치

        small = db.query(Complex).filter(Complex.complex_no == "71009").first()
        assert small.nearby_median_price == 200000
        job = _last_metric_job(db)
        assert job.status == "completed"
        assert job.total_items == 1  # 옛 이력 단지는 후보에서 빠진다
        assert job.processed_items == 1

    def test_only_old_history_gives_empty_batch_not_spinning(self, db):
        # 계산할 수 있는 단지가 없으면 대상 0 — 처리 0/대상 N 헛바퀴 기록을 남기지 않는다
        upsert_complex_from_search(db, _make_complex("71011"))
        _set_households(db, "71011", 500)
        _add_old_price(db, "71011", 400000)
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        c = db.query(Complex).filter(Complex.complex_no == "71011").first()
        assert c.nearby_median_price is None
        job = _last_metric_job(db)
        assert job.total_items == 0
        assert job.processed_items == 0

    def test_seven_months_old_only_is_not_candidate(self, db):
        # 6개월 창 바로 밖(7개월 전) 줄만 있는 단지 — 기간을 6→12 로 넓히는 변이를 잡는다
        from datetime import timedelta

        upsert_complex_from_search(db, _make_complex("71031"))
        _set_households(db, "71031", 900)
        seven_months_ago = (date.today() - timedelta(days=7 * 31)).strftime("%Y%m")
        db.add(
            ComplexPriceHistory(
                complex_no="71031", trade_type="A1", area_no=None,
                price_upper=300000, price_lower=300000, price_avg=300000, base_month=seven_months_ago,
            )
        )
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        job = _last_metric_job(db)
        assert job.total_items == 0
        assert job.processed_items == 0

    def test_cutoff_month_row_is_candidate_and_filled(self, db):
        # 경계: 기준 달과 같은 달 줄은 계산에 쓰이므로 후보로도 뽑혀야 한다(>= 를 > 로 바꾸는 변이를 잡는다)
        from crawler.metrics_helpers import _cutoff_month

        upsert_complex_from_search(db, _make_complex("71041"))
        _set_households(db, "71041", 700)
        db.add(
            ComplexPriceHistory(
                complex_no="71041", trade_type="A1", area_no=None,
                price_upper=250000, price_lower=250000, price_avg=250000, base_month=_cutoff_month(6),
            )
        )
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        c = db.query(Complex).filter(Complex.complex_no == "71041").first()
        assert c.nearby_median_price == 250000
        job = _last_metric_job(db)
        assert job.total_items == 1
        assert job.processed_items == 1

    def test_recent_rows_without_price_avg_are_not_candidates(self, db):
        # 최근 매매 줄이 있어도 평균가가 비어 있으면 중앙값을 못 낸다 — 후보에서도 빠져야 헛바퀴가 없다
        upsert_complex_from_search(db, _make_complex("71021"))
        _set_households(db, "71021", 800)
        db.add(
            ComplexPriceHistory(
                complex_no="71021", trade_type="A1", area_no=None,
                price_upper=None, price_lower=None, price_avg=None, base_month=_recent_month(),
            )
        )
        db.commit()

        from crawler.service_metrics import collect_complex_metrics
        collect_complex_metrics(batch_size=100)

        job = _last_metric_job(db)
        assert job.total_items == 0
        assert job.processed_items == 0
