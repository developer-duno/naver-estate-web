"""관리자 수집 트리거 API 테스트
실행: python -m pytest tests/test_admin_collect.py -v

세션 420: 수집 트리거는 백그라운드로 시작하고 곧바로 {"status":"started"} 를 준다.
중복 차단·스레드 마무리 시험은 tests/test_admin_collect_background.py.
"""

import threading
from unittest.mock import patch

import jwt
import pytest

from db.models import UserProfile
from routers.admin import collect as collect_mod

JWT_SECRET = "test-secret-key-for-testing-only"


@pytest.fixture(autouse=True)
def _clear_running_flags():
    with collect_mod._collect_lock:
        collect_mod._collect_running.clear()
    yield
    with collect_mod._collect_lock:
        collect_mod._collect_running.clear()


def _join_collector(name):
    """백그라운드 수집 스레드가 끝날 때까지 기다린다(흐른 시간이 아니라 스레드 종료로 판정)."""
    for t in threading.enumerate():
        if t.name == f"admin-collect-{name}":
            t.join(timeout=10)
            assert not t.is_alive(), f"{name} 수집 스레드가 끝나지 않았다"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_profile(db, uid, role="user", status="approved"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증 검증 ──


def test_collect_no_auth_401(client):
    """인증 없이 수집 트리거 → 401"""
    assert client.post("/api/admin/collect/crime-stats").status_code == 401


def test_collect_regular_user_403(client, db):
    """일반 사용자 수집 트리거 → 403"""
    _make_profile(db, "u1")
    res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("u1")))
    assert res.status_code == 403


# ── 수집 트리거 ──


def test_collect_crime_stats_success(client, db):
    """범죄통계 수집 트리거 — 관리자 성공, 곧바로 started"""
    _make_profile(db, "a1", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_fn = mock_get.return_value
        mock_fn.return_value = None
        res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("a1")))
        _join_collector("crime-stats")
        assert res.status_code == 200
        assert res.json() == {"status": "started", "collector": "crime-stats"}
        mock_fn.assert_called_once_with()


def test_collect_air_quality_success(client, db):
    """대기질 수집 트리거 — 관리자 성공"""
    _make_profile(db, "a2", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_fn = mock_get.return_value
        mock_fn.return_value = None
        res = client.post("/api/admin/collect/air-quality", headers=_auth(_token("a2")))
        _join_collector("air-quality")
        assert res.status_code == 200
        assert res.json()["collector"] == "air-quality"


def test_collect_response_no_longer_carries_collector_result(client, db):
    """세션 420: 응답은 시작 알림뿐 — 수집기 반환 dict(quota_exhausted 등)는 싣지 않는다.

    옛 세션 362 가드(dict 펼침)를 대체한다. 한도로 멈춘 사실은 이제 그 잡의
    crawl_jobs.error_message 로 화면에 보인다(test_admin_collect_background B5 시험)."""
    _make_profile(db, "a6", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.return_value = {
            "success": 0, "failed": 0, "total": 5, "quota_exhausted": True,
        }
        res = client.post("/api/admin/collect/backfill-price", headers=_auth(_token("a6")))
        _join_collector("backfill-price")
    assert res.status_code == 200
    assert res.json() == {"status": "started", "collector": "backfill-price"}


def test_collect_invalid_name_422(client, db):
    """잘못된 수집기 이름 → 422 (Literal 검증)"""
    _make_profile(db, "a3", role="admin")
    res = client.post("/api/admin/collect/invalid-name", headers=_auth(_token("a3")))
    assert res.status_code == 422


def test_collect_success_invalidates_freshness_cache(client, db):
    """정상: 수집 성공 시 freshness 캐시 무효화 → 화면 즉시 반영 (세션 260)"""
    from services.cache import get_cache

    _make_profile(db, "a4", role="admin")
    get_cache("freshness").set("data_freshness", {"stale": True})
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.return_value = None
        res = client.post("/api/admin/collect/air-quality", headers=_auth(_token("a4")))
        _join_collector("air-quality")
    assert res.status_code == 200
    assert get_cache("freshness").get("data_freshness") is None  # 무효화됨


def test_collect_failure_keeps_freshness_cache(client, db):
    """에러: 수집 실패 시 무효화 안 함 (성공 시에만 무효화)"""
    from services.cache import get_cache

    _make_profile(db, "a5", role="admin")
    get_cache("freshness").set("data_freshness", {"keep": True})
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.side_effect = RuntimeError("수집 실패")
        res = client.post("/api/admin/collect/air-quality", headers=_auth(_token("a5")))
        _join_collector("air-quality")
    # 시작은 됐다 — 실패는 백그라운드에서 난다
    assert res.status_code == 200
    assert get_cache("freshness").get("data_freshness") == {"keep": True}  # 유지됨


# ── 범죄통계 상태 조회 ──


def test_crime_stats_status_no_auth_401(client):
    """인증 없이 상태 조회 → 401"""
    assert client.get("/api/admin/collect/crime-stats/status").status_code == 401


def test_crime_stats_status_empty(client, db):
    """데이터 없는 상태에서 상태 조회"""
    _make_profile(db, "a5", role="admin")
    res = client.get(
        "/api/admin/collect/crime-stats/status",
        headers=_auth(_token("a5")),
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total_scored"] == 0
    assert data["last_updated"] is None
    assert data["grade_dist"] == {}


# ── K-apt 관리비 연동 (V051) ──


def test_collect_kapt_match_success(client, db):
    """K-apt 단지 매칭 트리거 — 관리자 성공, 곧바로 started"""
    _make_profile(db, "a7", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.return_value = {"matched": 12, "skipped": 3}
        res = client.post("/api/admin/collect/kapt-match", headers=_auth(_token("a7")))
        _join_collector("kapt-match")
    assert res.status_code == 200
    assert res.json() == {"status": "started", "collector": "kapt-match"}


def test_collect_kapt_costs_success(client, db):
    """K-apt 관리비 트리거 — 곧바로 started (미공개·수집 건수는 그 잡의 crawl_jobs 행이 보여 준다)"""
    _make_profile(db, "a8", role="admin")
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.return_value = {
            "collected": 0, "failed": 0, "empty": 40, "cost_month": "202605",
        }
        res = client.post("/api/admin/collect/kapt-costs", headers=_auth(_token("a8")))
        _join_collector("kapt-costs")
    assert res.status_code == 200
    assert res.json() == {"status": "started", "collector": "kapt-costs"}


def test_collect_kapt_names_resolve_to_real_functions(db):
    """_get_collector 가 실제 수집 함수를 돌려주는지 (Literal 등록 누락 방지)."""
    from routers.admin.collect import _get_collector

    assert _get_collector("kapt-match").__name__ == "match_kapt_complexes"
    assert _get_collector("kapt-costs").__name__ == "collect_kapt_costs"


# ── 실패 응답 문구 (세션 411 C-A1) ──
#
# 이 detail 은 FE `CollectorTrigger.tsx` 카드에 그대로 뜬다(lib/api/core.ts
# normalizeDetail). 개발자용 예외 원문이 새면 관리자 화면 세 번째 노출 창구가 된다.


def test_collect_failure_raw_error_never_reaches_response(client, db):
    """수동 수집 실패 — 세션 420 부터 실패는 백그라운드에서 나므로 예외 원문이 응답에 실릴 길이 없다"""
    _make_profile(db, "a9", role="admin")
    raw = "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout"
    with patch("routers.admin.collect._get_collector") as mock_get:
        mock_get.return_value.side_effect = RuntimeError(raw)
        res = client.post("/api/admin/collect/crime-stats", headers=_auth(_token("a9")))
        _join_collector("crime-stats")
    assert res.status_code == 200
    assert "psycopg2" not in res.text


def test_backfill_price_failure_detail_is_plain_korean(client, db):
    """소급 수집 실패 — 같은 기준 (라우트가 달라 따로 지킨다)"""
    _make_profile(db, "a10", role="admin")
    raw = "(psycopg2.errors.QueryCanceled) canceling statement due to statement timeout"
    with patch("crawler.service_public.backfill_price_history", side_effect=RuntimeError(raw)):
        res = client.post("/api/admin/backfill-price/12345", headers=_auth(_token("a10")))
    assert res.status_code == 500
    detail = res.json()["detail"]
    assert detail == "소급 수집 실패: 데이터베이스가 너무 오래 걸려 스스로 멈췄어요."
    assert "psycopg2" not in detail
