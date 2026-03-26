"""공공데이터 API 클래스 + 수집 함수 테스트

정상 케이스: API 응답 파싱 + 아파트명 정규화 매칭
에러 케이스: API 키 미설정 시 graceful skip
"""

from unittest.mock import patch, MagicMock
import pytest


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


# ── 일일 호출 한도 테스트 ──

@patch("crawler.public_data_api.PublicDataAPI._get_service_key", return_value="test-key")
@patch("crawler.public_data_api.PublicDataAPI._check_daily_limit", return_value=False)
def test_get_apt_trades_daily_limit_reached(mock_limit, mock_key):
    """일일 호출 한도 초과 시 None 반환"""
    from crawler.public_data_api import PublicDataAPI

    result = PublicDataAPI.get_apt_trades("11680", "202603")
    assert result is None
