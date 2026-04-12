"""공유 쿼터 DB 카운터 테스트
실행: python -m pytest tests/test_quota_db.py -v
"""

from unittest.mock import MagicMock

from crawler.quota_db import (
    _quota_key,
    get_api_quota_status,
    increment_api_quota,
)

# ── 키 생성 ──


def test_quota_key_형식():
    """키 형식: quota:{api_name}:{YYYY-MM-DD}"""
    key = _quota_key("data_go_kr")
    assert key.startswith("quota:data_go_kr:")
    # 날짜 부분 검증 (YYYY-MM-DD)
    date_part = key.split(":")[-1]
    assert len(date_part) == 10
    assert date_part[4] == "-" and date_part[7] == "-"


def test_quota_key_커스텀_이름():
    key = _quota_key("naver_api")
    assert "naver_api" in key


# ── increment_api_quota ──


def test_increment_한도_내():
    """카운트가 한도 미만이면 True 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 5  # 현재 5회 (한도 9000 미만)
    mock_session().__enter__().execute.return_value = mock_result

    assert increment_api_quota(mock_session, max_calls=9000) is True


def test_increment_한도_초과():
    """카운트가 한도 초과 시 False 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one.return_value = 9001  # 한도 초과
    mock_session().__enter__().execute.return_value = mock_result

    assert increment_api_quota(mock_session, max_calls=9000) is False


def test_increment_DB_실패_시_True_폴백():
    """DB 접근 실패 시 True 반환 (호출 허용, in-memory 폴백이 2차 보호)"""
    mock_session = MagicMock()
    mock_session.side_effect = Exception("DB connection failed")

    assert increment_api_quota(mock_session) is True


# ── get_api_quota_status ──


def test_status_정상_조회():
    """정상 조회 시 count/limit/remaining/utilization_pct 반환"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = (3000,)
    mock_session().__enter__().execute.return_value = mock_result

    status = get_api_quota_status(mock_session, max_calls=9000)
    assert status["count"] == 3000
    assert status["limit"] == 9000
    assert status["remaining"] == 6000
    assert status["utilization_pct"] == 33.3


def test_status_레코드_없음():
    """오늘 데이터 없을 때 count=0"""
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.fetchone.return_value = None
    mock_session().__enter__().execute.return_value = mock_result

    status = get_api_quota_status(mock_session)
    assert status["count"] == 0
    assert status["remaining"] == 9000


def test_status_DB_실패():
    """DB 실패 시 count=-1"""
    mock_session = MagicMock()
    mock_session.side_effect = Exception("DB down")

    status = get_api_quota_status(mock_session)
    assert status["count"] == -1
    assert status["remaining"] == -1
