"""단지 가격 추이 API 테스트"""

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _clear_price_collect_status():
    """각 테스트 전후로 수집 상태 초기화"""
    yield
    try:
        from routers.live import _price_collect_lock, _price_collect_status
        with _price_collect_lock:
            _price_collect_status.clear()
    except ImportError:
        pass


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
    result = get_price_history(complex_no="12345", trade_type=None, area_no=None, db=mock_db)

    assert result["complex_no"] == "12345"
    assert len(result["items"]) == 4
    assert result["items"][0]["trade_type"] == "A1"
    assert result["items"][0]["trade_type_label"] == "매매"
    assert result["items"][0]["base_month"] == "202502"
    assert result["items"][2]["trade_type_label"] == "전세"
    mock_query.assert_called_once_with(mock_db, "12345", None, area_no=None)


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_with_trade_type_filter(mock_query, mock_cache):
    """거래유형 필터: A1만 조회"""
    mock_cache.get.return_value = None
    mock_query.return_value = [MOCK_HISTORY_ROWS[0], MOCK_HISTORY_ROWS[1]]

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type="A1", area_no=None, db=mock_db)

    assert len(result["items"]) == 2
    assert all(item["trade_type"] == "A1" for item in result["items"])
    mock_query.assert_called_once_with(mock_db, "12345", "A1", area_no=None)


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_empty(mock_query, mock_cache):
    """빈 데이터: 아직 수집 안 된 단지"""
    mock_cache.get.return_value = None
    mock_query.return_value = []

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="99999", trade_type=None, area_no=None, db=mock_db)

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
    result = get_price_history(complex_no="12345", trade_type=None, area_no=None, db=mock_db)

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
    result = get_price_history(complex_no="12345", trade_type=None, area_no=None, db=mock_db)

    assert result["items"][0]["price_avg"] is None


@patch("routers.complexes._price_history_cache")
@patch("db.queries.get_complex_price_history")
def test_price_history_with_area_no_filter(mock_query, mock_cache):
    """면적 필터: area_no 지정 시 쿼리에 전달"""
    mock_cache.get.return_value = None
    mock_query.return_value = [MOCK_HISTORY_ROWS[0]]

    from routers.complexes import get_price_history
    mock_db = MagicMock()
    result = get_price_history(complex_no="12345", trade_type=None, area_no="3", db=mock_db)

    assert len(result["items"]) == 1
    mock_query.assert_called_once_with(mock_db, "12345", None, area_no="3")


# ── 실거래가 on-demand 수집 엔드포인트 테스트 ──

def _make_jwt(sub="user-001", email="test@test.com"):
    """테스트용 JWT 토큰 생성"""
    import jwt as pyjwt
    return pyjwt.encode(
        {"sub": sub, "aud": "authenticated", "email": email, "exp": 9999999999},
        "test-secret-key-for-testing-only",
        algorithm="HS256",
    )


def _add_user_profile(db, user_id="user-001", role="admin", status="approved", price_quota=5):
    """테스트 사용자 프로필 팩토리"""
    from db.models import UserProfile
    p = UserProfile(
        user_id=user_id, email=f"{user_id}@test.com",
        role=role, status=status,
        daily_price_collect_quota=price_quota,
    )
    db.add(p)
    db.commit()
    return p


def _add_complex(db, no="C001"):
    """테스트 단지 팩토리"""
    from db.models import Complex
    c = Complex(complex_no=no, complex_name="테스트단지")
    db.add(c)
    db.commit()
    return c


@patch("routers.live.threading.Thread")
def test_price_collect_200_started(mock_thread, client, db):
    """정상 수집 시작 → 200"""
    _add_user_profile(db, role="admin")
    _add_complex(db)
    mock_thread.return_value.start = MagicMock()

    token = _make_jwt()
    res = client.post("/api/live/C001/price-history/start-collect",
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "started"
    assert data["complex_no"] == "C001"


def test_price_collect_401_no_auth(client):
    """미인증 → 401"""
    res = client.post("/api/live/C001/price-history/start-collect")
    assert res.status_code == 401


def test_price_collect_403_wrong_role(client, db):
    """일반 사용자 → 403"""
    _add_user_profile(db, role="user")
    _add_complex(db)

    token = _make_jwt()
    res = client.post("/api/live/C001/price-history/start-collect",
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


@patch("routers.live.threading.Thread")
def test_price_collect_404_no_complex(mock_thread, client, db):
    """존재하지 않는 단지 → 404"""
    _add_user_profile(db, role="admin")

    token = _make_jwt()
    res = client.post("/api/live/NONEXIST/price-history/start-collect",
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404


@patch("routers.live.threading.Thread")
def test_price_collect_409_already_running(mock_thread, client, db):
    """이미 수집 중 → 409"""
    _add_user_profile(db, role="admin")
    _add_complex(db)
    mock_thread.return_value.start = MagicMock()

    token = _make_jwt()
    # 첫 번째 요청
    client.post("/api/live/C001/price-history/start-collect",
                headers={"Authorization": f"Bearer {token}"})
    # 두 번째 요청 → 409
    res = client.post("/api/live/C001/price-history/start-collect",
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 409


@patch("routers.live.threading.Thread")
def test_price_collect_429_quota_exceeded(mock_thread, client, db):
    """쿼터 초과 → 429"""
    from datetime import datetime, timedelta, timezone

    from db.models import RateLimitCounter
    _add_user_profile(db, role="admin", price_quota=1)
    _add_complex(db)
    # 쿼터 카운터를 사전에 1로 설정 (limit=1이므로 다음 요청은 429)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    counter = RateLimitCounter(
        key=f"user:user-001:price_collect:{today}",
        count=1,
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
    )
    db.add(counter)
    db.commit()
    mock_thread.return_value.start = MagicMock()

    token = _make_jwt()
    res = client.post("/api/live/C001/price-history/start-collect",
                      headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 429


def test_price_collect_status_idle(client):
    """수집 안 한 상태 → idle"""
    res = client.get("/api/live/C001/price-history/collect-status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "idle"
    assert data["complex_no"] == "C001"


def test_price_collect_status_done(client):
    """수집 완료 상태 확인"""
    # 수동으로 상태 설정
    import time

    from routers.live import _price_collect_lock, _price_collect_status
    with _price_collect_lock:
        _price_collect_status["C002"] = {
            "status": "done", "collected": 15, "failed": 2, "total": 17,
            "started_at": time.time(),
        }

    res = client.get("/api/live/C002/price-history/collect-status")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "done"
    assert data["collected"] == 15
    assert data["failed"] == 2
