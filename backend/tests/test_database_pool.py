"""DB 연결 창고(QueuePool) 전환 회귀 가드 (세션 486).

배경: 옛 NullPool 은 요청마다 새 연결이라 스레드 50(창구 40 + 잡 10)이 몰리면 Supabase 세션 풀 30 을
넘겨 EMAXCONNSESSION 이 났다(2026-10-30 하루 18회). 창고(상시 10 + 넘침 10, 대기 5초)로 바꾸면서
① 엔진 설정 ② 세션 단위 SET 이 창고 연결에 새지 않음 ③ 창고 대기 초과가 500 이 아니라 503 인지를 지킨다.

엔진 설정은 AST 정적 검사다 — conftest 가 sys.modules["db.database"] 를 가짜 SQLite 모듈로 바꿔 끼워
운영 엔진이 시험에서 만들어지지 않는다(test_database_connect_timeout.py 와 같은 이유).
"""

import ast
import logging
import os
import re

from sqlalchemy.exc import TimeoutError as PoolTimeoutError

_BACKEND = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
_DATABASE_PY = os.path.join(_BACKEND, "db", "database.py")

# 창고 상한 — Supabase 세션 풀 30 중 우리 서버 몫(수동 스크립트·미분양 몫을 남긴다)
_MAX_POOL_TOTAL = 24
_MAX_POOL_TIMEOUT_S = 10


def _tree():
    with open(_DATABASE_PY, encoding="utf-8") as f:
        return ast.parse(f.read())


def _find_create_engine_call(tree: ast.AST) -> ast.Call | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if name == "create_engine":
                return node
    return None


def _env_int_defaults(tree: ast.AST) -> dict[str, int]:
    """`NAME = int(os.getenv("ENV", "기본"))` 꼴 모듈 상수의 기본값을 소스에서 읽는다."""
    out: dict[str, int] = {}
    for node in tree.body:
        if not (isinstance(node, ast.Assign) and len(node.targets) == 1):
            continue
        target, value = node.targets[0], node.value
        if not (isinstance(target, ast.Name) and isinstance(value, ast.Call)):
            continue
        if getattr(value.func, "id", None) != "int" or not value.args:
            continue
        inner = value.args[0]
        if isinstance(inner, ast.Call) and getattr(inner.func, "attr", None) == "getenv" and len(inner.args) == 2:
            default = inner.args[1]
            if isinstance(default, ast.Constant):
                out[target.id] = int(default.value)
    return out


def _resolve(node: ast.AST, consts: dict[str, int]):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return consts.get(node.id, node.id)
    return None


def test_engine_uses_queue_pool_with_bounded_size():
    """① create_engine: poolclass=QueuePool · pre_ping 유지 · 상시+넘침 ≤ 24 · 대기 ≤ 10초 · recycle 있음."""
    tree = _tree()
    call = _find_create_engine_call(tree)
    assert call is not None, "database.py 에 create_engine 호출이 없음"
    kw = {k.arg: k.value for k in call.keywords}
    consts = _env_int_defaults(tree)

    assert isinstance(kw.get("poolclass"), ast.Name) and kw["poolclass"].id == "QueuePool", (
        "poolclass 가 QueuePool 이 아님 — NullPool 로 돌아가면 요청마다 새 연결이라 세션 풀 30 을 넘긴다"
    )
    assert _resolve(kw.get("pool_pre_ping"), consts) is True, "pool_pre_ping=True 가 빠짐"

    size = _resolve(kw.get("pool_size"), consts)
    overflow = _resolve(kw.get("max_overflow"), consts)
    timeout = _resolve(kw.get("pool_timeout"), consts)
    for name, val in (("pool_size", size), ("max_overflow", overflow), ("pool_timeout", timeout)):
        assert isinstance(val, int) and val >= 0, f"{name} 기본값을 읽지 못함 ({val!r})"
    assert size > 0, "pool_size 는 1 이상"
    assert size + overflow <= _MAX_POOL_TOTAL, f"상시+넘침 {size + overflow} > {_MAX_POOL_TOTAL}"
    assert 0 < timeout <= _MAX_POOL_TIMEOUT_S, f"pool_timeout {timeout} 은 1~{_MAX_POOL_TIMEOUT_S}초여야 함"

    recycle = _resolve(kw.get("pool_recycle"), consts)
    assert isinstance(recycle, int) and recycle > 0, "pool_recycle 이 빠짐"


def test_connect_event_sets_timeout_outside_transaction():
    """①-2 connect 이벤트의 8초 SET 은 autocommit=True 로 트랜잭션 밖에서 — 반납 rollback 이 SET 을 되돌리지 않게.

    psycopg2 는 첫 문장에 트랜잭션을 연다. 그 연결의 첫 요청이 읽기만 하고 닫히면 창고 반납 때 rollback →
    PostgreSQL 이 트랜잭션 안의 SET 을 되돌려 그 연결이 8초 없이 재사용된다(세션 486 설계 빈틈 보완).
    """
    tree = _tree()
    funcs = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "_set_statement_timeout"]
    assert len(funcs) == 1, "connect 이벤트 함수 _set_statement_timeout 을 못 찾음"
    toggles = [
        n for n in ast.walk(funcs[0])
        if isinstance(n, ast.Assign)
        and any(isinstance(t, ast.Attribute) and t.attr == "autocommit" for t in n.targets)
        and isinstance(n.value, ast.Constant) and n.value.value is True
    ]
    assert toggles, "connect 이벤트에 `dbapi_conn.autocommit = True` 가 없음 — 반납 rollback 이 8초 SET 을 되돌린다"


_SESSION_SET_RE = re.compile(r"SET\s+(SESSION\s+)?statement_timeout", re.IGNORECASE)
_SKIP_DIRS = {"tests", "__pycache__", ".pytest_cache", ".claude", "node_modules", "venv", ".venv"}


def test_no_session_level_statement_timeout_set_outside_connect_event():
    """② 세션 단위 SET statement_timeout 금지 — 창고로 반납된 연결이 다음 요청에 그 값을 들고 간다.

    늘릴 땐 SET LOCAL(그 트랜잭션만). db/database.py 의 connect 이벤트(8초 안전망 원본)만 예외.
    """
    hits = []
    for root, dirs, files in os.walk(_BACKEND):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(root, name)
            if os.path.normpath(path) == os.path.normpath(_DATABASE_PY):
                continue
            with open(path, encoding="utf-8") as f:
                for lineno, line in enumerate(f, 1):
                    if _SESSION_SET_RE.search(line):
                        hits.append(f"{os.path.relpath(path, _BACKEND)}:{lineno}")
    assert hits == [], f"세션 단위 SET statement_timeout 발견(SET LOCAL 로 바꿀 것): {hits}"


def test_pool_timeout_becomes_503_with_retry_after():
    """③ 창고 대기 초과(sqlalchemy.exc.TimeoutError) → 500 이 아니라 503 + Retry-After: 5 + 우리말 안내."""
    from fastapi.testclient import TestClient

    from main import app

    path = "/api/__test_pool_timeout_486"  # /api/ 로 시작해야 속도 제한·캐시 머리 미들웨어를 지난다

    def _boom():
        raise PoolTimeoutError("pool", None, None)

    app.add_api_route(path, _boom, methods=["GET"])
    try:
        res = TestClient(app, raise_server_exceptions=False).get(path)
    finally:
        app.router.routes[:] = [r for r in app.router.routes if getattr(r, "path", None) != path]

    assert res.status_code == 503
    assert res.json() == {"detail": "서버가 바빠 잠시 자료를 읽지 못했습니다. 조금 뒤 다시 시도해 주세요"}
    assert res.headers.get("retry-after") == "5"
    assert "cache-control" not in res.headers, "오류 응답에는 캐시 머리를 붙이지 않는다(web-rules)"


def test_pool_timeout_log_is_one_line_per_minute(caplog, monkeypatch):
    """④ 로그 묶기 — 첫 건은 바로 1줄, 1분 안의 다음 건들은 줄을 더 찍지 않는다(경로 값은 안 찍음)."""
    import main

    monkeypatch.setattr(main, "_pool_timeout_tally", {"count": 0, "kinds": set(), "since": float("-inf")})
    with caplog.at_level(logging.WARNING, logger="main"):
        main._count_pool_timeout("/api/complexes/111/public-summary")
        main._count_pool_timeout("/api/complexes/222/public-summary")
        main._count_pool_timeout("/api/region/abc")
    lines = [r for r in caplog.records if "DB 연결 창고" in r.getMessage()]
    assert len(lines) == 1
    assert "1건" in lines[0].getMessage()
    assert "111" not in lines[0].getMessage()
    assert main._pool_timeout_tally["count"] == 2
    assert len(main._pool_timeout_tally["kinds"]) == 2  # 숫자는 # 로 묶여 같은 종류
