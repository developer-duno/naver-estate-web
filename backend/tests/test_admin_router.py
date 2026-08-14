"""관리자 API 라우터 테스트 — 인증, 사용자 관리, 설정
실행: python -m pytest tests/test_admin_router.py -v
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import jwt

from db.models import CrawlJob, UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub, role="user"):
    return jwt.encode({"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"}, JWT_SECRET, algorithm="HS256")


def _make_profile(db, uid, role="user", status="approved"):
    p = UserProfile(user_id=uid, email=f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


# ── 인증 검증 ──

def test_admin_users_no_auth_401(client):
    """인증 없이 → 401"""
    assert client.get("/api/admin/users").status_code == 401


def test_admin_users_regular_user_403(client, db):
    """일반 사용자 → 403"""
    _make_profile(db, "u1")
    assert client.get("/api/admin/users", headers=_auth(_token("u1"))).status_code == 403


def test_admin_users_admin_200(client, db):
    """관리자 → 200"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/users", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 사용자 관리 ──

def test_update_user_role(client, db):
    """사용자 역할 변경"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1", role="user")
    res = client.patch(
        "/api/admin/users/u1",
        json={"role": "expert"},
        headers={**_auth(_token("a1")), "Content-Type": "application/json"},
    )
    assert res.status_code == 200


def test_suspend_user(client, db):
    """사용자 정지"""
    _make_profile(db, "a1", role="admin")
    _make_profile(db, "u1", role="user")
    res = client.delete("/api/admin/users/u1", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 통계 ──

def test_detailed_stats(client, db):
    """상세 통계 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/stats/detailed", headers=_auth(_token("a1")))
    assert res.status_code == 200


def test_detailed_stats_fill_rate_keys(client, db):
    """PR 6a — 채움률 3 필드 응답 키 검증"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/stats/detailed", headers=_auth(_token("a1")))
    assert res.status_code == 200
    body = res.json()
    assert "complex_detail_fill_rate" in body
    assert "article_detail_fill_rate" in body
    assert "complex_metric_fill_rate" in body


def test_today_crawl_count_uses_kst_midnight(client, db):
    """'오늘 크롤' 경계는 UTC 자정이 아니라 KST 자정 — 자정 직전 1건은 제외, 직후 1건만 카운트.

    UTC 자정 기준이면 KST 오전 9시에야 리셋돼 한국 사용자 화면의 '오늘'이 하루 어긋난다.
    고정 시각 하드코딩 금지(어느 시각에 실행해도 통과해야 함) → 실행 시점의 KST 자정을
    계산해 그 앞뒤 상대값으로 픽스처를 만든다. 저장은 UTC aware 로 통일(CI SQLite 문자열 비교).
    """
    _make_profile(db, "a1", role="admin")

    kst_midnight = datetime.now(ZoneInfo("Asia/Seoul")).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    before = (kst_midnight - timedelta(minutes=1)).astimezone(timezone.utc)  # 어제(제외 기대)
    after = (kst_midnight + timedelta(minutes=1)).astimezone(timezone.utc)  # 오늘(포함 기대)

    db.add(CrawlJob(job_type="complex_articles", status="completed", created_at=before))
    db.add(CrawlJob(job_type="complex_articles", status="completed", created_at=after))
    db.commit()

    res = client.get("/api/admin/stats/detailed", headers=_auth(_token("a1")))
    assert res.status_code == 200
    assert res.json()["today_crawl_count"] == 1


def test_safe_fill_rate_zero_total_returns_none():
    """PR 6a — _safe_fill_rate(0, 0) == None 회귀 가드 (0건 vs 0% 구별 F9 답습)"""
    from routers.admin.jobs import _safe_fill_rate

    assert _safe_fill_rate(0, 0) is None  # 모집단 0건 = None
    assert _safe_fill_rate(0, 100) == 0.0  # 실제 0% 채움률 = 0.0
    assert _safe_fill_rate(10, 100) == 0.1  # 정상 10% 채움률


# ── 감사 로그 ──

def test_audit_logs(client, db):
    """감사 로그 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/audit-logs", headers=_auth(_token("a1")))
    assert res.status_code == 200


# ── 설정 ──

def test_get_settings(client, db):
    """설정 조회"""
    _make_profile(db, "a1", role="admin")
    res = client.get("/api/admin/settings", headers=_auth(_token("a1")))
    assert res.status_code == 200


def test_update_setting(client, db):
    """설정 생성/수정"""
    _make_profile(db, "a1", role="admin")
    res = client.patch(
        "/api/admin/settings/test_key",
        json={"value": {"enabled": True}},
        headers={**_auth(_token("a1")), "Content-Type": "application/json"},
    )
    assert res.status_code == 200


def test_admin_crawl_jobs_200(client, db):
    _make_profile(db, 'a2', role='admin')
    res = client.get('/api/admin/crawl-jobs', headers=_auth(_token('a2')))
    assert res.status_code == 200

def test_admin_users_filter_status(client, db):
    _make_profile(db, 'a3', role='admin')
    res = client.get('/api/admin/users?status=approved', headers=_auth(_token('a3')))
    assert res.status_code == 200

def test_admin_users_filter_role(client, db):
    _make_profile(db, 'a4', role='admin')
    res = client.get('/api/admin/users?role=admin', headers=_auth(_token('a4')))
    assert res.status_code == 200

def test_admin_users_pagination(client, db):
    _make_profile(db, 'a5', role='admin')
    for i in range(5):
        _make_profile(db, f'pu{i}', role='user')
    res = client.get('/api/admin/users?page=1', headers=_auth(_token('a5')))
    assert res.status_code == 200

def test_admin_stats_no_auth_401(client):
    assert client.get('/api/admin/stats/detailed').status_code == 401

def test_admin_audit_no_auth_401(client):
    assert client.get('/api/admin/audit-logs').status_code == 401

def test_admin_settings_no_auth_401(client):
    assert client.get('/api/admin/settings').status_code == 401

def test_admin_crawl_no_auth_401(client):
    assert client.get('/api/admin/crawl-jobs').status_code == 401

def test_admin_stats_user_403(client, db):
    _make_profile(db, 'ru1')
    assert client.get('/api/admin/stats/detailed', headers=_auth(_token('ru1'))).status_code == 403

def test_admin_audit_user_403(client, db):
    _make_profile(db, 'ru2')
    assert client.get('/api/admin/audit-logs', headers=_auth(_token('ru2'))).status_code == 403

def test_admin_settings_user_403(client, db):
    _make_profile(db, 'ru3')
    assert client.get('/api/admin/settings', headers=_auth(_token('ru3'))).status_code == 403
