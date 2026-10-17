"""crawler/service_public.py backfill_price_history N단지 매칭 안전장치 테스트 (세션 359)

배경: 국토교통부 실거래가 API는 "올림픽선수기자촌1단지"처럼 단지를 세분화해
이름을 붙이는 경우가 있는데, 우리 DB는 통합 등록("올림픽선수기자촌", 5,540세대
122개동)만 있어 완전일치 매칭이 24개월 동안 0/24 로 실패했다(실측 확인).
N단지 접미사를 떼고 매칭하는 보조 규칙을 추가하되, "경희궁의아침2단지"·
"3단지"처럼 실제로 별도 단지가 DB에 존재하는 경우(전국 2,353건 실측)는
오매칭(다른 단지 가격이 섞임)을 막기 위해 흡수하지 않는다.
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from db.models import Complex, ComplexPriceHistory
from services.upsert import upsert_complex_from_search
from utils import utcnow


def _make_complex_data(complex_no, name, cortar_no="1171011100", address="서울시 송파구 잠실동"):
    return {
        "complexNo": complex_no,
        "complexName": name,
        "cortarNo": cortar_no,
        "cortarAddress": address,
        "realEstateTypeCode": "APT",
    }


def _make_trade(apt_name, deal_amount="150,000", umd="잠실동", cancelled=False):
    return {
        "aptNm": apt_name, "dealAmount": deal_amount, "umdNm": umd,
        "cdealType": "O" if cancelled else " ",
    }


class TestStripNDanji:
    def test_strips_trailing_number_danji(self):
        from crawler.service_public import _strip_n_danji

        assert _strip_n_danji("올림픽선수기자촌1단지") == "올림픽선수기자촌"
        assert _strip_n_danji("경희궁의아침2단지") == "경희궁의아침"

    def test_no_suffix_unchanged(self):
        from crawler.service_public import _strip_n_danji

        assert _strip_n_danji("올림픽선수기자촌") == "올림픽선수기자촌"


def _add_geosan_pair(db):
    """수원 권선구의 같은 이름 '거산' 두 단지 — 금곡동 1775 · 고색동 2666."""
    db.add_all([
        Complex(complex_no="1775", complex_name="거산", cortar_no="4111313400",
                cortar_address="경기도 수원시 권선구 금곡동", real_estate_type_code="APT"),
        Complex(complex_no="2666", complex_name="거산", cortar_no="4111312800",
                cortar_address="경기도 수원시 권선구 고색동", real_estate_type_code="APT"),
    ])
    db.commit()


def _gov_rows(db, complex_no):
    return (
        db.query(ComplexPriceHistory)
        .filter(ComplexPriceHistory.complex_no == complex_no, ComplexPriceHistory.trade_type == "A1")
        .all()
    )


def _run_backfill(complex_no, trades, months_back=1):
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()
    from crawler.service_public import backfill_price_history
    with patch("crawler.public_data_api.PublicDataAPI.get_all_apt_trades", return_value=trades):
        return backfill_price_history(complex_no, months_back=months_back)


class TestBackfillDongAndCleanup:
    """세션 469: 소급도 법정동으로 가르고, 해제 거래를 빼고, 이번에 안 쓰인 옛 정부 줄을 지운다."""

    def test_소급은_다른_법정동_같은_이름_거래를_안_가져온다(self, db):
        _add_geosan_pair(db)
        trades = [
            _make_trade("거산", "50,000", umd="금곡동"),
            _make_trade("거산", "52,000", umd="금곡동"),
            _make_trade("거산", "54,000", umd="금곡동"),
        ]
        assert _run_backfill("2666", trades)["collected"] == 0
        db.expire_all()
        assert _gov_rows(db, "2666") == []

        assert _run_backfill("1775", trades)["collected"] == 1
        db.expire_all()
        rows = _gov_rows(db, "1775")
        assert len(rows) == 1
        assert (rows[0].price_upper, rows[0].price_lower, rows[0].price_avg) == (54000, 50000, 52000)

    def test_소급은_해제_거래를_뺀다(self, db):
        _add_geosan_pair(db)
        trades = [
            _make_trade("거산", "50,000", umd="금곡동"),
            _make_trade("거산", "90,000", umd="금곡동", cancelled=True),
        ]
        _run_backfill("1775", trades)
        db.expire_all()
        rows = _gov_rows(db, "1775")
        assert len(rows) == 1
        assert rows[0].price_avg == 50000
        assert rows[0].price_upper == 50000

    def test_소급은_이번에_안_쓰인_옛_줄을_지운다(self, db):
        from crawler.service_public import _recent_months

        _add_geosan_pair(db)
        month = _recent_months(date.today(), 1)[0]
        old = utcnow() - timedelta(days=10)
        db.add_all([
            ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no="", base_month=month,
                                price_avg=1, recorded_at=old),           # 창 안 정부 줄 → 삭제
            ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no=None, base_month=month,
                                price_avg=2, recorded_at=old),           # 창 안 정부 줄(NULL) → 삭제
            ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no="84A", base_month=month,
                                price_avg=3, recorded_at=old),           # 네이버 줄 → 유지
            ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no="", base_month="201001",
                                price_avg=4, recorded_at=old),           # 달 목록 밖 → 유지
        ])
        db.commit()

        # 거래는 왔지만(금곡동) 2666(고색동)에는 하나도 짝이 안 되는 달
        _run_backfill("2666", [_make_trade("거산", "50,000", umd="금곡동")])
        db.expire_all()
        assert sorted(r.price_avg for r in _gov_rows(db, "2666")) == [3, 4]

    def test_소급은_거래가_없는_달의_옛_줄은_남긴다(self, db):
        """정상 응답인데 거래 0건인 달은 '짝이 안 됐다'는 증거가 아니다 — 옛 줄 보존 (보완 1)."""
        from crawler.service_public import _recent_months

        _add_geosan_pair(db)
        month = _recent_months(date.today(), 1)[0]
        db.add(ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no="", base_month=month,
                                   price_avg=1, recorded_at=utcnow() - timedelta(days=10)))
        db.commit()

        _run_backfill("2666", [])
        db.expire_all()
        assert [r.price_avg for r in _gov_rows(db, "2666")] == [1]

    def test_소급_호출이_실패하면_옛_줄을_지우지_않는다(self, db):
        from crawler.service_public import PublicTradeFetchError, _recent_months

        _add_geosan_pair(db)
        month = _recent_months(date.today(), 1)[0]
        db.add(ComplexPriceHistory(complex_no="2666", trade_type="A1", area_no="", base_month=month,
                                   price_avg=1, recorded_at=utcnow() - timedelta(days=10)))
        db.commit()

        with pytest.raises(PublicTradeFetchError):
            _run_backfill("2666", None)
        db.expire_all()
        assert [r.price_avg for r in _gov_rows(db, "2666")] == [1]


class TestBackfillPriceHistoryNDanjiMatching:
    """backfill_price_history() 의 실제 매칭 동작 — N단지 흡수 여부."""

    @patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
    def test_absorbs_n_danji_when_no_sibling(self, mock_get, db):
        """핵심 회귀 가드: 통합 등록 단지(형제 없음)는 국토부의 N단지 거래를
        흡수해 매칭한다 — 올림픽선수기자촌 실사고 재현."""
        upsert_complex_from_search(db, _make_complex_data("70201", "올림픽선수기자촌"))
        db.commit()

        mock_get.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 1,
                    "items": {"item": [_make_trade("올림픽선수기자촌1단지")]},
                },
            }
        }

        from crawler.public_data_api import PublicDataAPI
        PublicDataAPI.reset()
        from crawler.service_public import backfill_price_history
        result = backfill_price_history("70201", months_back=1)

        assert result["collected"] == 1, "형제 단지가 없으면 N단지 거래를 흡수해야 함"
        rows = db.query(ComplexPriceHistory).filter(ComplexPriceHistory.complex_no == "70201").all()
        assert len(rows) == 1

    @patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
    def test_does_not_absorb_when_sibling_exists(self, mock_get, db):
        """핵심 회귀 가드(오매칭 방지): 형제 N단지가 DB에 실재하면 흡수 매칭을
        하지 않는다 — 경희궁의아침 실사고(2,353건) 재현. 국토부에 "경희궁의아침2단지"
        거래만 있어도 우리 "경희궁의아침3단지"에는 절대 매칭되면 안 됨."""
        upsert_complex_from_search(db, _make_complex_data("70301", "경희궁의아침2단지"))
        upsert_complex_from_search(db, _make_complex_data("70302", "경희궁의아침3단지"))
        db.commit()

        mock_get.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 1,
                    "items": {"item": [_make_trade("경희궁의아침2단지")]},
                },
            }
        }

        from crawler.public_data_api import PublicDataAPI
        PublicDataAPI.reset()
        from crawler.service_public import backfill_price_history
        # 70302("3단지")를 소급 수집 — 국토부엔 "2단지" 거래만 있는 상황.
        result = backfill_price_history("70302", months_back=1)

        assert result["collected"] == 0, "형제 단지 이름의 거래는 오매칭되면 안 됨"
        rows = db.query(ComplexPriceHistory).filter(ComplexPriceHistory.complex_no == "70302").all()
        assert len(rows) == 0

    @patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
    def test_exact_n_danji_match_still_works(self, mock_get, db):
        """형제 단지가 있어도, 정확히 같은 N단지 표기끼리는 여전히 매칭된다
        (완전일치 경로는 흡수 로직과 무관하게 항상 동작)."""
        upsert_complex_from_search(db, _make_complex_data("70401", "경희궁의아침2단지"))
        upsert_complex_from_search(db, _make_complex_data("70402", "경희궁의아침3단지"))
        db.commit()

        mock_get.return_value = {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 1,
                    "items": {"item": [_make_trade("경희궁의아침2단지")]},
                },
            }
        }

        from crawler.public_data_api import PublicDataAPI
        PublicDataAPI.reset()
        from crawler.service_public import backfill_price_history
        result = backfill_price_history("70401", months_back=1)  # 정확히 "2단지" 조회

        assert result["collected"] == 1, "완전일치는 형제 단지 존재 여부와 무관하게 매칭돼야 함"


class TestBackfillPriceBatchQuotaExhausted:
    """세션 361 회귀 가드: 쿼터 소진 시 배치가 남은 단지를 헛돌지 않고 조기 종료한다.

    사고 재현: 국토부 API 일일 쿼터(9000회)를 다 쓴 뒤에도 backfill_price_batch()가
    남은 단지 수만큼 backfill_price_history()를 계속 호출 — 그 안에서 단지당
    24개월씩 "쿼터 초과" 경고만 반복하며 헛돌았다(4500회+ 반복, 로그 5MB).
    실제 API 요청은 안 나가 데이터 훼손은 없었지만, 쿼터 소진이 확인되면
    남은 단지는 시도조차 하지 않고 배치를 즉시 끝내야 한다.
    """

    @patch("crawler.quota_db.get_api_quota_status")
    def test_stops_before_processing_when_quota_already_exhausted(self, mock_quota, db):
        from db.models import Complex

        upsert_complex_from_search(db, _make_complex_data("70501", "테스트단지"))
        db.query(Complex).filter(Complex.complex_no == "70501").update(
            {"total_household_count": 500}
        )
        db.commit()

        mock_quota.return_value = {"remaining": 0, "count": 9000, "limit": 9000}

        with patch("crawler.service_public.backfill_price_history") as mock_backfill:
            from crawler.service_public import backfill_price_batch
            result = backfill_price_batch(batch_size=20)

        mock_backfill.assert_not_called()
        assert result["quota_exhausted"] is True
        assert result["success"] == 0
