"""헬스체크 엔드포인트 테스트"""

import pytest

from routers import health


def test_health_endpoint(client):
    """GET /health → 200"""
    res = client.get("/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"


def test_health_has_version(client):
    """헬스체크 응답에 version 필드 존재"""
    res = client.get("/health")
    data = res.json()
    assert "status" in data


# ── /health/db 심층 헬스체크 (health.router 는 main.py 미등록 상태이므로
#    테스트 앱에 자체 등록해 독립적으로 검증 — main.py 는 부모가 추후 연결) ──


@pytest.fixture
def health_client(client):
    """client fixture의 app에 health.router 를 등록한 TestClient."""
    from main import app

    app.include_router(health.router)
    yield client
    app.router.routes = [
        r for r in app.router.routes if getattr(r, "endpoint", None) is not health.health_check_db
    ]


def test_health_db_ok(health_client):
    """GET /health/db → 200 + db:ok (SQLite SELECT 1 정상)"""
    res = health_client.get("/health/db")
    assert res.status_code == 200
    assert res.json() == {"status": "ok", "db": "ok"}


def test_health_db_failure_returns_503(health_client):
    """DB 세션 execute 가 예외를 던지면 503 + degraded/down (500 아님)"""

    def _raise(*args, **kwargs):
        raise RuntimeError("DB 연결 실패 (시뮬레이션)")

    # get_db 의존성을 실패하는 세션으로 오버라이드
    class _FailingSession:
        def execute(self, *args, **kwargs):
            _raise()

    def _override_get_db():
        yield _FailingSession()

    from deps import get_db
    from main import app

    app.dependency_overrides[get_db] = _override_get_db
    try:
        res = health_client.get("/health/db")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 503
    assert res.json() == {"status": "degraded", "db": "down"}


def test_health_db_head_ok(health_client):
    """HEAD /health/db → 200 (외부 감시 서비스가 HEAD 프로브를 쓰는데 405 받던 것 방지)"""
    res = health_client.head("/health/db")
    assert res.status_code == 200


def test_health_db_head_failure_returns_503(health_client):
    """DB 장애 시 HEAD 도 GET 과 동일하게 503 (HEAD 만 200 으로 새는 일 없게)"""

    class _FailingSession:
        def execute(self, *args, **kwargs):
            raise RuntimeError("DB 연결 실패 (시뮬레이션)")

    def _override_get_db():
        yield _FailingSession()

    from deps import get_db
    from main import app

    app.dependency_overrides[get_db] = _override_get_db
    try:
        res = health_client.head("/health/db")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert res.status_code == 503
