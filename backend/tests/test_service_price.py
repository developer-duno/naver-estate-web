"""crawler/service_price.py 단위 테스트

collect_price_history_for_complex 검증 — 정상/에러/TTL.
"""

from unittest.mock import patch

from db.models import ComplexPriceHistory
from services.upsert import upsert_complex_from_search

# ── 팩토리 함수 ──


def _make_complex_data(complex_no="55555"):
    """테스트용 단지 데이터"""
    return {
        "complexNo": complex_no,
        "complexName": "시세테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _make_price_response(trade_type="A1", area_no=None):
    """네이버 시세 API 응답 (marketPrices 형식)"""
    return {
        "areaNo": area_no,
        "marketPrices": [
            {
                "baseYearMonthDay": "20260301",
                "upperPriceLimit": 160000,
                "lowPriceLimit": 140000,
                "averagePriceLimit": 150000,
            },
            {
                "baseYearMonthDay": "20260201",
                "upperPriceLimit": 155000,
                "lowPriceLimit": 135000,
                "averagePriceLimit": 145000,
            },
        ],
    }


def _make_real_price_response():
    """실거래가 API 응답"""
    return {
        "areaNo": 1001,
        "realPriceOnMonthList": [
            {
                "realPriceList": [
                    {"tradeYear": "2026", "tradeMonth": "3", "dealPrice": 155000},
                    {"tradeYear": "2026", "tradeMonth": "3", "dealPrice": 148000},
                ],
            },
        ],
    }


# ── 테스트 ──


class TestCollectPriceHistoryForComplex:
    """collect_price_history_for_complex 검증"""

    @patch("crawler.service_price._throttle_ondemand")
    @patch("crawler.service_price.NaverEstateAPI")
    def test_normal_collection(self, mock_api, mock_throttle, db):
        """정상: 시세 + 실거래가 수집 → DB 저장"""
        upsert_complex_from_search(db, _make_complex_data())

        # 시세 API: A1, B1 각각 2건씩 = 4건
        mock_api.get_complex_prices.return_value = _make_price_response()
        # 실거래가 API: A1, B1 각각 1건씩 = 2건
        mock_api.get_complex_real_prices.return_value = _make_real_price_response()

        from crawler.service_price import collect_price_history_for_complex
        result = collect_price_history_for_complex(db, "55555")

        assert result["collected"] > 0
        assert result["failed"] == 0

        # DB 저장 확인
        rows = db.query(ComplexPriceHistory).filter(
            ComplexPriceHistory.complex_no == "55555"
        ).all()
        assert len(rows) > 0

    @patch("crawler.service_price._throttle_ondemand")
    @patch("crawler.service_price.NaverEstateAPI")
    def test_api_failure_counted(self, mock_api, mock_throttle, db):
        """에러: API 예외 시 failed 카운트 증가, 크래시 없음"""
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_prices.side_effect = Exception("429 Too Many Requests")
        mock_api.get_complex_real_prices.side_effect = Exception("429")

        from crawler.service_price import collect_price_history_for_complex
        result = collect_price_history_for_complex(db, "55555")

        assert result["collected"] == 0
        assert result["failed"] > 0

    @patch("crawler.service_price._throttle_ondemand")
    @patch("crawler.service_price.NaverEstateAPI")
    def test_empty_response_handled(self, mock_api, mock_throttle, db):
        """에러: API가 빈 응답 반환 시 failed 카운트"""
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_prices.return_value = {}
        mock_api.get_complex_real_prices.return_value = {}

        from crawler.service_price import collect_price_history_for_complex
        result = collect_price_history_for_complex(db, "55555")

        assert result["collected"] == 0
        assert result["failed"] > 0

    @patch("crawler.service_price._throttle_ondemand")
    @patch("crawler.service_price.NaverEstateAPI")
    def test_progress_callback(self, mock_api, mock_throttle, db):
        """엣지: on_progress 콜백 호출 검증"""
        upsert_complex_from_search(db, _make_complex_data())

        mock_api.get_complex_prices.return_value = _make_price_response()
        mock_api.get_complex_real_prices.return_value = _make_real_price_response()

        progress_calls = []

        def on_progress(collected, failed, total):
            progress_calls.append((collected, failed, total))

        from crawler.service_price import collect_price_history_for_complex
        collect_price_history_for_complex(db, "55555", on_progress=on_progress)

        # 콜백이 여러 번 호출됨 (시세 2회 + 실거래 2회 = 최소 4회)
        assert len(progress_calls) >= 4
        # 마지막 호출의 total은 고정 (area_nos * 2 + 2)
        last = progress_calls[-1]
        assert last[2] == 4  # 1 area_no * 2 trade_types + 2 real

    @patch("crawler.service_price._throttle_ondemand")
    @patch("crawler.service_price.NaverEstateAPI")
    def test_with_multiple_area_nos(self, mock_api, mock_throttle, db):
        """엣지: 여러 area_no가 있을 때 모두 수집"""
        upsert_complex_from_search(db, _make_complex_data())

        # pyeong 데이터 추가
        from db.models import ComplexPyeongDetail
        for pyeong_no in [1001, 1002]:
            db.add(ComplexPyeongDetail(complex_no="55555", pyeong_no=pyeong_no))
        db.commit()

        mock_api.get_complex_prices.return_value = _make_price_response(area_no=1001)
        mock_api.get_complex_real_prices.return_value = _make_real_price_response()

        from crawler.service_price import collect_price_history_for_complex
        result = collect_price_history_for_complex(db, "55555")

        # 2 area_nos × 2 trade_types = 4 시세 호출 + 2 실거래 호출
        assert mock_api.get_complex_prices.call_count == 4
        assert result["collected"] > 0
        assert result["total"] == 6  # 2 area × 2 trades + 2 real
