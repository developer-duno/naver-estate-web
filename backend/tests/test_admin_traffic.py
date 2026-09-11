"""관리자 트래픽 관측 API 테스트 (GET /api/admin/traffic)

실행: python -m pytest tests/test_admin_traffic.py -v

미들웨어 계측이 실제 요청으로 채워지는지까지 확인한다(단위 테스트는
test_traffic_metrics.py 소관 — 여기는 라우터 인증 + 미들웨어 배선).
"""

import jwt
import pytest

from db.models import UserProfile
from services import traffic_metrics

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_admin(db, uid="admin1"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved")
    db.add(p)
    db.commit()


@pytest.fixture(autouse=True)
def _reset():
    traffic_metrics.reset()
    yield
    traffic_metrics.reset()


# ── 인증 ──


def test_traffic_no_auth_401(client):
    """인증 없이 접근 → 401"""
    assert client.get("/api/admin/traffic").status_code == 401


def test_traffic_regular_user_403(client, db):
    """일반 사용자 → 403"""
    db.add(UserProfile(user_id="u1", email="u1@test.com", role="user", status="approved"))
    db.commit()
    res = client.get("/api/admin/traffic", headers=_auth(_token("u1")))
    assert res.status_code == 403


# ── 응답 구조 ──


def test_traffic_response_shape(client, db):
    """세 윈도우 + 각 윈도우 필수 필드가 모두 존재"""
    _make_admin(db)
    res = client.get("/api/admin/traffic", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    data = res.json()

    assert set(data["windows"].keys()) == {"10m", "1h", "24h"}
    for key in ("10m", "1h", "24h"):
        w = data["windows"][key]
        for field in (
            "total_requests",
            "unique_visitors",
            "p50_ms",
            "p95_ms",
            "rate_4xx",
            "rate_5xx",
            "top_paths",
            "top_identities",
        ):
            assert field in w, f"{key} 윈도우에 {field} 누락"
    assert data["process_uptime_seconds"] > 0
    assert data["window_truncated"] is False


def test_traffic_no_store_cache_header(client, db):
    """관리자 API 는 no-store (web-rules.md) — 성공 응답 기준"""
    _make_admin(db)
    res = client.get("/api/admin/traffic", headers=_auth(_token("admin1")))
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "no-store"


# ── 미들웨어 계측 배선 ──


def test_middleware_records_real_requests(client, db):
    """실제 요청이 미들웨어를 지나며 계측된다"""
    _make_admin(db)
    # 계측 대상 요청 몇 건 발생 (미들웨어는 /api/ 만 계측)
    for _ in range(3):
        client.get("/api/admin/traffic", headers=_auth(_token("admin1")))

    res = client.get("/api/admin/traffic", headers=_auth(_token("admin1")))
    w = res.json()["windows"]["1h"]
    # 앞선 3건은 확실히 잡혀 있어야 한다 (마지막 건은 자기 자신이라 응답 생성 후 기록됨)
    assert w["total_requests"] >= 3
    paths = {p["path"] for p in w["top_paths"]}
    assert "/api/admin" in paths


def test_middleware_records_error_status(client, db):
    """에러 응답(401)도 계측돼 에러율에 반영된다"""
    _make_admin(db)
    # 인증 없는 요청 = 401
    for _ in range(2):
        client.get("/api/admin/traffic")

    res = client.get("/api/admin/traffic", headers=_auth(_token("admin1")))
    w = res.json()["windows"]["1h"]
    assert w["rate_4xx"] > 0


def test_query_params_limit_top_n(client, db):
    """top_paths 파라미터로 상위 N 을 제한할 수 있다"""
    _make_admin(db)
    traffic_metrics.record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
    traffic_metrics.record_request("/api/mb/apartments", 200, 10.0, "ip:1.1.1.1")
    traffic_metrics.record_request("/api/complexes/1", 200, 10.0, "ip:1.1.1.1")

    res = client.get(
        "/api/admin/traffic?top_paths=1&top_identities=1",
        headers=_auth(_token("admin1")),
    )
    assert res.status_code == 200
    assert len(res.json()["windows"]["1h"]["top_paths"]) == 1


def test_query_param_out_of_range_422(client, db):
    """범위를 벗어난 파라미터는 422 (무제한 조회 방지)"""
    _make_admin(db)
    res = client.get("/api/admin/traffic?top_paths=999", headers=_auth(_token("admin1")))
    assert res.status_code == 422
