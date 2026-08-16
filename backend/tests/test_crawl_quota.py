"""start_live_crawl 의 일일 crawl 쿼터 enforce 검증 (세션 312 가드 1).

이전엔 daily_crawl_quota(=5) 가 start_live_crawl 에서 미적용(dead) → expert 1명이
전국 단지 무제한 스크래핑 가능 (네이버 IP 차단 위험). check_quota 적용 후:
- 쿼터 내 신규 크롤 시작 200
- 쿼터 초과 429 (started 상태 롤백)
- admin 무제한
- cached·already_running 은 쿼터 차감 안 함

실행: python -m pytest tests/test_crawl_quota.py -v
"""
from unittest.mock import patch

import jwt

from db.models import Complex, RateLimitCounter, UserProfile
from routers.live._shared import _cache, _crawl_status

JWT_SECRET = "test-secret-key-for-testing-only"


def _token(sub):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _make_user(db, uid, role="expert", quota=5):
    p = UserProfile(
        user_id=uid, email=f"{uid}@test.com", role=role,
        status="approved", daily_crawl_quota=quota,
    )
    db.add(p)
    db.commit()


def _make_complex(db, complex_no):
    db.add(Complex(complex_no=complex_no, complex_name="테스트단지", real_estate_type_code="APT"))
    db.commit()


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _reset(complex_no):
    _cache.delete(f"crawl_done:{complex_no}")
    _crawl_status.pop(complex_no, None)


class _FakeThread:
    """실제 크롤 스레드 미발사 (test_live_crawl_force.py 패턴)."""

    def __init__(self, *, target=None, args=(), daemon=True):
        pass

    def start(self):
        pass


def _crawl_count(db, uid):
    """오늘 user 의 crawl 쿼터 카운터 값 (없으면 0).

    check_quota(auth/permissions.py) 가 KST 자정 기준 "오늘" 키를 쓰므로
    (세션 369 PR #385) 여기도 같은 축을 써야 한다. UTC 로 "오늘"을 구하면
    KST 자정~오전 9시 구간(=UTC 전날 15~24시)에 두 축이 어긋나 카운터를
    못 찾는 flaky 가 난다 — 세션 371 8/17 00:33 KST 실측으로 재현·확정.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo
    today = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%Y-%m-%d")
    c = db.get(RateLimitCounter, f"user:{uid}:crawl:{today}")
    return c.count if c else 0


# ── 정상: 쿼터 내 신규 크롤 ──


def test_crawl_within_quota_starts_and_charges(client, db):
    """쿼터 내 → 200 started + 카운터 1 증가."""
    _reset("Q001")
    _make_user(db, "exp1", quota=5)
    _make_complex(db, "Q001")
    try:
        with patch("routers.live.crawl.threading.Thread", _FakeThread):
            res = client.post("/api/live/Q001/articles/start-crawl", headers=_auth(_token("exp1")))
        assert res.status_code == 200
        assert res.json()["status"] == "started"
        assert _crawl_count(db, "exp1") == 1
    finally:
        _reset("Q001")


# ── 에러: 쿼터 초과 429 + started 롤백 ──


def test_crawl_quota_exceeded_429(client, db):
    """쿼터 소진 후 1회 더 → 429, started 상태 롤백."""
    _make_user(db, "exp2", quota=2)
    try:
        for i in range(2):
            cno = f"QX{i}"
            _reset(cno)
            _make_complex(db, cno)
            with patch("routers.live.crawl.threading.Thread", _FakeThread):
                r = client.post(f"/api/live/{cno}/articles/start-crawl", headers=_auth(_token("exp2")))
            assert r.status_code == 200
        # 3번째 = 쿼터 초과
        _reset("QX2")
        _make_complex(db, "QX2")
        with patch("routers.live.crawl.threading.Thread", _FakeThread):
            r = client.post("/api/live/QX2/articles/start-crawl", headers=_auth(_token("exp2")))
        assert r.status_code == 429
        assert "한도" in r.json()["detail"]
        # started 상태가 롤백돼 유령 status 안 남음
        assert "QX2" not in _crawl_status
        assert _crawl_count(db, "exp2") == 2  # 초과분은 차감 안 됨
    finally:
        for i in range(3):
            _reset(f"QX{i}")


# ── admin 무제한 ──


def test_crawl_admin_unlimited(client, db):
    """admin 은 쿼터 차감 안 함 (quota=1 이어도 여러 번 가능)."""
    _make_user(db, "adm1", role="admin", quota=1)
    try:
        for i in range(3):
            cno = f"QA{i}"
            _reset(cno)
            _make_complex(db, cno)
            with patch("routers.live.crawl.threading.Thread", _FakeThread):
                r = client.post(f"/api/live/{cno}/articles/start-crawl", headers=_auth(_token("adm1")))
            assert r.status_code == 200
        assert _crawl_count(db, "adm1") == 0  # admin 은 카운터 미생성
    finally:
        for i in range(3):
            _reset(f"QA{i}")


# ── cached 는 차감 안 함 ──


def test_crawl_cached_no_charge(client, db):
    """캐시 마커 있음 + force 없음 → cached, 쿼터 차감 안 함."""
    _reset("QC1")
    _make_user(db, "exp3", quota=1)
    _make_complex(db, "QC1")
    _cache.set("crawl_done:QC1", True)
    try:
        res = client.post("/api/live/QC1/articles/start-crawl", headers=_auth(_token("exp3")))
        assert res.status_code == 200
        assert res.json()["status"] == "cached"
        assert _crawl_count(db, "exp3") == 0  # 차감 0
    finally:
        _reset("QC1")


# ── already_running 은 차감 안 함 ──


def test_crawl_already_running_no_charge(client, db):
    """이미 running 상태 → already_running, 쿼터 차감 안 함."""
    _reset("QR1")
    _make_user(db, "exp4", quota=1)
    _make_complex(db, "QR1")
    _crawl_status["QR1"] = {"status": "running", "current_page": 2, "article_count": 10}
    try:
        res = client.post("/api/live/QR1/articles/start-crawl", headers=_auth(_token("exp4")))
        assert res.status_code == 200
        assert res.json()["status"] == "already_running"
        assert _crawl_count(db, "exp4") == 0
    finally:
        _reset("QR1")
