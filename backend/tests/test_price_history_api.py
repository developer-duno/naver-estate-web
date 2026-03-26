"""단지 가격 추이 API 테스트"""

from unittest.mock import patch, MagicMock

import pytest


# 테스트용 가격 이력 데이터
MOCK_HISTORY_ROWS = [
    {"trade_type": "A1", "month": "202502", "price_upper": 95000, "price_lower": 85000, "price_avg": 90000},
    {"trade_type": "A1", "month": "202503", "price_upper": 96000, "price_lower": 86000, "price_avg": 91000},
    {"trade_type": "B1", "month": "202502", "price_upper": 50000, "price_lower": 45000, "price_avg": 47500},
    {"trade_type": "B1", "month": "202503", "price_upper": 51000, "price_lower": 46000, "price_avg": 48500},
]


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_normal(mock_query, mock_cache):
    """정상 조회: 매매+전세 데이터 반환"""
    mock_cache.get.return_value = None
    mock_query.return_value = MOCK_HISTORY_ROWS

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type=None, db=mock_db)

    assert result["complex_no"] == "12345"
    assert len(result["items"]) == 4
    assert result["items"][0]["trade_type"] == "A1"
    assert result["items"][0]["trade_type_label"] == "매매"
    assert result["items"][0]["base_month"] == "202502"
    assert result["items"][2]["trade_type_label"] == "전세"
    mock_query.assert_called_once_with(mock_db, "12345", None)


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_with_trade_type_filter(mock_query, mock_cache):
    """거래유형 필터: A1만 조회"""
    mock_cache.get.return_value = None
    mock_query.return_value = [MOCK_HISTORY_ROWS[0], MOCK_HISTORY_ROWS[1]]

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type="A1", db=mock_db)

    assert len(result["items"]) == 2
    assert all(item["trade_type"] == "A1" for item in result["items"])
    mock_query.assert_called_once_with(mock_db, "12345", "A1")


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_empty(mock_query, mock_cache):
    """빈 데이터: 아직 수집 안 된 단지"""
    mock_cache.get.return_value = None
    mock_query.return_value = []

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="99999", trade_type=None, db=mock_db)

    assert result["complex_no"] == "99999"
    assert result["items"] == []


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_base_month_normalized(mock_query, mock_cache):
    """base_month가 YYYYMMDD 형식이어도 엔드포인트에서 YYYYMM으로 정규화"""
    mock_cache.get.return_value = None
    mock_query.return_value = [
        {"trade_type": "A1", "month": "20250315", "price_upper": 90000, "price_lower": 85000, "price_avg": 87500},
    ]

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type=None, db=mock_db)

    # month[:6] → "202503"
    assert result["items"][0]["base_month"] == "202503"


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_null_price_avg(mock_query, mock_cache):
    """price_avg가 None인 경우 처리"""
    mock_cache.get.return_value = None
    mock_query.return_value = [
        {"trade_type": "A1", "month": "202503", "price_upper": 90000, "price_lower": 85000, "price_avg": None},
    ]

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type=None, db=mock_db)

    assert result["items"][0]["price_avg"] is None
