"""live crawl force=true 재크롤 경로 테스트.
실행: python -m pytest tests/test_live_crawl_force.py -v
"""
from unittest.mock import patch

import pytest

from deps import get_approved_user
from main import app
from routers.live._shared import _cache, _crawl_status


def _admin_user():
    return {"user_id": "admin-uid", "email": "admin@example.com", "role": "admin", "status": "approved"}


def _expert_user():
    return {"user_id": "expert-uid", "email": "expert@example.com", "role": "expert", "status": "approved"}


@pytest.fixture
def auth_override():
    def _set(user_fn):
        app.dependency_overrides[get_approved_user] = user_fn
    yield _set
    app.dependency_overrides.pop(get_approved_user, None)


@pytest.fixture(autouse=True)
def _clean_cache_status():
    _cache._store.clear()
    _crawl_status.clear()
    yield
    _cache._store.clear()
    _crawl_status.clear()


@patch("routers.live.crawl.threading.Thread")
class TestForceRecrawl:
    """관리자 force=true는 TTL/running 가드를 우회한다"""

    def test_admin_force_bypasses_cache(self, _thread, client, auth_override):
        """admin + force=true → cached 반환하지 않고 started"""
        auth_override(_admin_user)
        _cache.set("crawl_done:C001", True)
        r = client.post("/api/live/C001/articles/start-crawl?force=true")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "started"
        assert body["forced"] is True
        assert _cache.get("crawl_done:C001") is None  # 캐시 삭제됨

    def test_non_admin_force_ignored(self, _thread, client, auth_override):
        """expert + force=true → force 무시, 캐시 경로로 cached 반환"""
        auth_override(_expert_user)
        _cache.set("crawl_done:C002", True)
        r = client.post("/api/live/C002/articles/start-crawl?force=true")
        assert r.status_code == 200
        assert r.json()["status"] == "cached"

    def test_default_path_unchanged(self, _thread, client, auth_override):
        """force 미지정 → 기존 동작 그대로 (cached 유지)"""
        auth_override(_admin_user)
        _cache.set("crawl_done:C003", True)
        r = client.post("/api/live/C003/articles/start-crawl")
        assert r.status_code == 200
        assert r.json()["status"] == "cached"

    def test_admin_force_overrides_running(self, _thread, client, auth_override):
        """admin + force=true → running 상태 덮어쓰고 started"""
        auth_override(_admin_user)
        _crawl_status["C004"] = {"status": "running", "current_page": 5, "article_count": 100}
        r = client.post("/api/live/C004/articles/start-crawl?force=true")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "started"
        assert body["forced"] is True
        assert _crawl_status["C004"]["status"] == "started"
        assert _crawl_status["C004"]["current_page"] == 0
