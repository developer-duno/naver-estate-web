"""PYSEC-2026-161 회귀 가드 — Host 헤더 인증 우회 차단.

starlette 1.0.0 은 Host 헤더 검증 0 으로 `request.url.path` 가 오염 가능.
1.0.1 fix 후 malformed Host 무시. rate_limiter.py:95 의 login rate limit
분기가 우회되지 않음을 검증.

OSV: https://osv.dev/vulnerability/PYSEC-2026-161
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request


def _make_app() -> FastAPI:
    app = FastAPI()

    @app.get("/api/check-path")
    async def check(request: Request) -> dict:
        return {"path": request.url.path}

    return app


def test_normal_request_returns_actual_path() -> None:
    """정상 요청은 actual request path 반환."""
    client = TestClient(_make_app())
    resp = client.get("/api/check-path")
    assert resp.status_code == 200
    assert resp.json()["path"] == "/api/check-path"


def test_malformed_host_header_does_not_poison_url_path() -> None:
    """PYSEC-2026-161: Host 헤더 주입 시 request.url.path 오염 안 됨.

    rate_limiter.py:95 가 path = request.url.path 로 login rate limit
    분기 (5/5분) 를 결정한다. starlette 1.0.0 은 Host 헤더 검증 0 →
    `evil.com/api/auth/login` 같은 malformed Host 가 request.url 재구성에
    혼입되어 login rate limit 우회 가능했다. 1.0.1 fix 가 이를 차단한다.
    """
    client = TestClient(_make_app())
    resp = client.get(
        "/api/check-path",
        headers={"Host": "evil.com/api/auth/login"},
    )
    assert resp.status_code == 200
    path = resp.json()["path"]
    assert path == "/api/check-path"
    assert "/api/auth/login" not in path
