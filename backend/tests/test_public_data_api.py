"""공공데이터 API 클래스 + 수집 함수 테스트

정상 케이스: API 응답 파싱 + 아파트명 정규화 매칭
에러 케이스: API 키 미설정 시 graceful skip
"""

from unittest.mock import MagicMock, patch

# ── 아파트명 정규화 테스트 ──

def test_normalize_apt_name():
    """아파트명 정규화 — 공백/괄호/특수문자 제거"""
    from crawler.public_data_api import _normalize_apt_name

    assert _normalize_apt_name("래미안 대치팰리스") == "래미안대치팰리스"
    assert _normalize_apt_name("현대아파트(1차)") == "현대아파트1차"
    assert _normalize_apt_name("e편한세상 센트럴") == "e편한세상센트럴"
    assert _normalize_apt_name("") == ""
    assert _normalize_apt_name(None) == ""


# ── API 응답 파싱 테스트 (정상 케이스) ──

MOCK_API_RESPONSE = {
    "response": {
        "header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
        "body": {
            "totalCount": 2,
            "items": {
                "item": [
                    {
                        "aptNm": "래미안대치팰리스",
                        "dealAmount": "   280,000",
                        "dealYear": "2026",
                        "dealMonth": "3",
                        "dealDay": "15",
                        "excluUseAr": "84.99",
                        "floor": "12",
                        "umdNm": "대치동",
                    },
                    {
                        "aptNm": "래미안대치팰리스",
                        "dealAmount": "   300,000",
                        "dealYear": "2026",
                        "dealMonth": "3",
                        "dealDay": "20",
                        "excluUseAr": "84.99",
                        "floor": "15",
                        "umdNm": "대치동",
                    },
                ]
            },
        },
    }
}


@patch("crawler.public_data_api.PublicDataAPI._get_service_key", return_value="test-key")
@patch("crawler.public_data_api.PublicDataAPI._check_daily_limit", return_value=True)
def test_get_apt_trades_success(mock_limit, mock_key):
    """정상 API 호출 — JSON 응답 파싱"""
    from crawler.public_data_api import PublicDataAPI

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = MOCK_API_RESPONSE

    with patch.object(PublicDataAPI, "_get_session") as mock_session:
        mock_session.return_value.get.return_value = mock_response
        result = PublicDataAPI.get_apt_trades("11680", "202603")

    assert result is not None
    body = result["response"]["body"]
    assert body["totalCount"] == 2
    items = body["items"]["item"]
    assert len(items) == 2
    assert items[0]["aptNm"] == "래미안대치팰리스"


# ── API 키 미설정 시 graceful skip (에러 케이스) ──

@patch("crawler.public_data_api.PublicDataAPI._get_service_key", return_value=None)
def test_get_apt_trades_no_api_key(mock_key):
    """API 키 미설정 시 None 반환 (에러 아닌 정상 스킵)"""
    from crawler.public_data_api import PublicDataAPI

    result = PublicDataAPI.get_apt_trades("11680", "202603")
    assert result is None


# ── 전체 페이지 조회 테스트 ──

@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
def test_get_all_apt_trades_pagination(mock_get):
    """페이징 처리 — totalCount 기반 전체 수집"""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()  # 세션 359: 거래 캐시 초기화 (다른 테스트와 격리)

    # 1페이지: 2건 중 1건 반환
    mock_get.side_effect = [
        {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 2,
                    "items": {"item": [{"aptNm": "A아파트", "dealAmount": "50000"}]},
                },
            }
        },
        {
            "response": {
                "header": {"resultCode": "00"},
                "body": {
                    "totalCount": 2,
                    "items": {"item": [{"aptNm": "B아파트", "dealAmount": "60000"}]},
                },
            }
        },
    ]

    result = PublicDataAPI.get_all_apt_trades("11680", "202603")
    assert len(result) == 2
    assert result[0]["aptNm"] == "A아파트"
    assert result[1]["aptNm"] == "B아파트"


# ── 거래 캐시 (세션 359) ──
#
# 배경: backfill_price_batch 가 같은 시군구의 단지 여러 개를 순회할 때, 각
# 단지가 정확히 같은 (lawd_cd, deal_ymd) 조합을 매번 새로 API 호출하는 낭비가
# 있었다 — data.go.kr 하루 10,000회 쿼터 중 4.8%만 쓰면서도 배치를 20개로
# 작게 잡아둔 원인 중 하나. 같은 조합은 프로세스 생존 동안 1회만 호출한다.

@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
def test_get_all_apt_trades_caches_same_key(mock_get):
    """핵심 회귀 가드: 같은 (lawd_cd, deal_ymd) 를 두 번 호출하면 API 는
    1회만 나가고, 두 번째 호출은 캐시에서 즉시 반환된다."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    mock_get.return_value = {
        "response": {
            "header": {"resultCode": "00"},
            "body": {
                "totalCount": 1,
                "items": {"item": [{"aptNm": "캐시아파트", "dealAmount": "50000"}]},
            },
        }
    }

    first = PublicDataAPI.get_all_apt_trades("11680", "202603")
    second = PublicDataAPI.get_all_apt_trades("11680", "202603")

    assert first == second
    assert mock_get.call_count == 1, "같은 (lawd_cd, deal_ymd) 재호출 시 API 를 다시 부르면 안 됨"


@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
def test_get_all_apt_trades_different_key_not_cached(mock_get):
    """다른 (lawd_cd, deal_ymd) 조합은 캐시를 공유하지 않고 각각 API 호출된다."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    mock_get.side_effect = [
        {
            "response": {
                "header": {"resultCode": "00"},
                "body": {"totalCount": 1, "items": {"item": [{"aptNm": "A", "dealAmount": "10000"}]}},
            }
        },
        {
            "response": {
                "header": {"resultCode": "00"},
                "body": {"totalCount": 1, "items": {"item": [{"aptNm": "B", "dealAmount": "20000"}]}},
            }
        },
    ]

    result_a = PublicDataAPI.get_all_apt_trades("11680", "202603")
    result_b = PublicDataAPI.get_all_apt_trades("11680", "202604")  # 다른 월

    assert result_a[0]["aptNm"] == "A"
    assert result_b[0]["aptNm"] == "B"
    assert mock_get.call_count == 2


@patch("crawler.public_data_api.PublicDataAPI.get_apt_trades")
def test_reset_clears_trade_cache(mock_get):
    """reset() 은 세션뿐 아니라 거래 캐시도 비운다 — 재초기화 후 재호출된다."""
    from crawler.public_data_api import PublicDataAPI
    PublicDataAPI.reset()

    mock_get.return_value = {
        "response": {
            "header": {"resultCode": "00"},
            "body": {"totalCount": 1, "items": {"item": [{"aptNm": "X", "dealAmount": "10000"}]}},
        }
    }

    PublicDataAPI.get_all_apt_trades("11680", "202603")
    PublicDataAPI.reset()
    PublicDataAPI.get_all_apt_trades("11680", "202603")

    assert mock_get.call_count == 2, "reset() 이후엔 캐시가 비어 다시 API 를 호출해야 함"


# ── 일일 호출 한도 테스트 ──

@patch("crawler.public_data_api.PublicDataAPI._get_service_key", return_value="test-key")
@patch("crawler.public_data_api.PublicDataAPI._check_daily_limit", return_value=False)
def test_get_apt_trades_daily_limit_reached(mock_limit, mock_key):
    """일일 호출 한도 초과 시 None 반환"""
    from crawler.public_data_api import PublicDataAPI

    result = PublicDataAPI.get_apt_trades("11680", "202603")
    assert result is None


# ── 매월 10일 토요일 skip 테스트 ──
# date는 함수 내부에서 `from datetime import date`로 import되므로
# datetime.date를 서브클래스로 패치해야 함

from datetime import date as _real_date


class _FakeDate(_real_date):
    """date.today()를 오버라이드하는 테스트 헬퍼"""

    _today = None

    @classmethod
    def today(cls):
        return cls._today


@patch("crawler.service_public.SessionLocal")
def test_collect_public_trade_normal_saturday(mock_db_cls):
    """정상 토요일 (10일 아님) — 수집 실행"""
    _FakeDate._today = _real_date(2026, 3, 14)  # 토요일, 14일

    mock_db = MagicMock()
    mock_db_cls.return_value = mock_db

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}):
        with patch("datetime.date", _FakeDate):
            from crawler.service import collect_public_trade_data

            try:
                collect_public_trade_data(batch_size=1)
            except Exception:
                pass  # DB mock 한계로 이후 단계 에러는 무관

    # SessionLocal()이 호출됨 = skip하지 않고 진행
    mock_db_cls.assert_called()


@patch("crawler.service_public.SessionLocal")
def test_collect_public_trade_10th_not_saturday(mock_db_cls):
    """10일이지만 토요일 아님 — 수집 실행"""
    _FakeDate._today = _real_date(2026, 3, 10)  # 화요일

    mock_db = MagicMock()
    mock_db_cls.return_value = mock_db

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}):
        with patch("datetime.date", _FakeDate):
            from crawler.service import collect_public_trade_data

            try:
                collect_public_trade_data(batch_size=1)
            except Exception:
                pass

    mock_db_cls.assert_called()


@patch("crawler.service_public.SessionLocal")
def test_collect_public_trade_10th_saturday_skip(mock_db_cls):
    """10일이고 토요일 — mibunyang building-info 쿼터 충돌로 skip"""
    _FakeDate._today = _real_date(2026, 1, 10)  # 토요일

    with patch.dict("os.environ", {"PUBLIC_DATA_API_KEY": "test-key"}):
        with patch("datetime.date", _FakeDate):
            from crawler.service import collect_public_trade_data

            collect_public_trade_data(batch_size=1)

    # SessionLocal()이 호출되지 않음 = skip
    mock_db_cls.assert_not_called()
