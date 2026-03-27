"""테스트 공통 Fixture — in-memory SQLite + FastAPI TestClient"""

import os
import sys
import types

import pytest
import sqlalchemy
import sqlalchemy.dialects.postgresql as pg_dialect
from sqlalchemy import JSON, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SUPABASE_JWT_SECRET"] = "test-secret-key-for-testing-only"

# ARRAY → JSON 패치 (SQLite 호환)


class _FakeARRAY(JSON):
    def __init__(self, *args, **kwargs):
        super().__init__()

sqlalchemy.ARRAY = _FakeARRAY
pg_dialect.ARRAY = _FakeARRAY

# 테스트 엔진
test_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
import db.models  # noqa: F401, E402
from deps import get_db  # noqa: E402


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


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
