"""테스트 공통 Fixture — file-based SQLite + FastAPI TestClient

NullPool 사용 — 스레드별 독립 커넥션 (SessionLocal() 호출 시 세션 격리).
WAL + busy_timeout으로 동시 쓰기 안전하게 처리.
live router는 dialect 분기로 SQLite에서 ThreadPoolExecutor 미사용.
"""

import os
import sys
import tempfile
import types

import pytest
import sqlalchemy
import sqlalchemy.dialects.postgresql as pg_dialect
from sqlalchemy import JSON, create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-key-for-testing-only"

# ARRAY → JSON 패치 (SQLite 호환)


class _FakeARRAY(JSON):
    def __init__(self, *args, **kwargs):
        super().__init__()

sqlalchemy.ARRAY = _FakeARRAY
pg_dialect.ARRAY = _FakeARRAY

# file-based SQLite — NullPool로 SessionLocal() 호출 시 독립 커넥션
_TEST_DB = os.path.join(tempfile.gettempdir(), "naver_estate_test.db")
for _ext in ("", "-wal", "-shm"):
    try:
        os.unlink(_TEST_DB + _ext)
    except FileNotFoundError:
        pass

test_engine = create_engine(
    f"sqlite:///{_TEST_DB}",
    connect_args={"check_same_thread": False},
    poolclass=NullPool,
)

@event.listens_for(test_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA busy_timeout = 5000")
    cursor.close()

TestSession = sessionmaker(bind=test_engine, autocommit=False, autoflush=False)

class Base(DeclarativeBase):
    pass

# db.database 모듈 교체
fake_db_mod = types.ModuleType("db.database")
fake_db_mod.engine = test_engine
fake_db_mod.SessionLocal = TestSession
fake_db_mod.Base = Base
fake_db_mod.get_db = None
sys.modules["db.database"] = fake_db_mod

# ORM 모델 임포트 (Base.metadata에 테이블 등록)
import db.mb_models  # noqa: F401, E402  — mibunyang 테이블
import db.models  # noqa: F401, E402
from deps import get_db  # noqa: E402


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    # 테스트 간 캐시 잔존 방지
    from deps import _user_cache
    _user_cache._store.clear()
    # Rate limiter in-memory 카운터도 리셋 (testclient 동일 IP 누적 방지)
    from auth.rate_limiter import _ip_counters
    _ip_counters.clear()
    # TTLCache 레지스트리 리셋 — 테스트 간 캐시 잔존 방지
    from services.cache import _registry, _registry_lock
    with _registry_lock:
        _registry.clear()


@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    from fastapi.testclient import TestClient

    from main import app

    def _override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
