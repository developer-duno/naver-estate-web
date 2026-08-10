"""crawler/service_public.py backfill_price_history N단지 매칭 안전장치 테스트 (세션 359)

배경: 국토교통부 실거래가 API는 "올림픽선수기자촌1단지"처럼 단지를 세분화해
이름을 붙이는 경우가 있는데, 우리 DB는 통합 등록("올림픽선수기자촌", 5,540세대
122개동)만 있어 완전일치 매칭이 24개월 동안 0/24 로 실패했다(실측 확인).
N단지 접미사를 떼고 매칭하는 보조 규칙을 추가하되, "경희궁의아침2단지"·
"3단지"처럼 실제로 별도 단지가 DB에 존재하는 경우(전국 2,353건 실측)는
오매칭(다른 단지 가격이 섞임)을 막기 위해 흡수하지 않는다.
"""

from unittest.mock import patch

from db.models import ComplexPriceHistory
from services.upsert import upsert_complex_from_search


def _make_complex_data(complex_no, name, cortar_no="1171011100"):
    return {
        "complexNo": complex_no,
        "complexName": name,
        "cortarNo": cortar_no,
        "realEstateTypeCode": "APT",
    }


def _make_trade(apt_name, deal_amount="150,000"):
    return {"aptNm": apt_name, "dealAmount": deal_amount}


class TestStripNDanji:
    def test_strips_trailing_number_danji(self):
        from crawler.service_public import _strip_n_danji

        assert _strip_n_danji("올림픽선수기자촌1단지") == "올림픽선수기자촌"
        assert _strip_n_danji("경희궁의아침2단지") == "경희궁의아침"

    def test_no_suffix_unchanged(self):
        from crawler.service_public import _strip_n_danji

        assert _strip_n_danji("올림픽선수기자촌") == "올림픽선수기자촌"


class TestHasSiblingNDanji:
    def test_detects_sibling_when_present(self, db):
        """같은 지역에 'base+N단지' 형태 단지가 있으면 True."""
        upsert_complex_from_search(db, _make_complex_data("70101", "경희궁의아침2단지"))
        upsert_complex_from_search(db, _make_complex_data("70102", "경희궁의아침3단지"))
        db.commit()

        from crawler.service_public import _has_sibling_n_danji

        assert _has_sibling_n_danji(db, "경희궁의아침", "11710") is True

    def test_no_sibling_when_absent(self, db):
        """형제 단지가 DB에 없으면 False."""
        upsert_complex_from_search(db, _make_complex_data("70103", "올림픽선수기자촌"))
        db.commit()

        from crawler.service_public import _has_sibling_n_danji

        assert _has_sibling_n_danji(db, "올림픽선수기자촌", "11710") is False


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
