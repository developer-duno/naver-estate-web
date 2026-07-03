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
# ⚠ 테스트가 실서비스 텔레그램 봇으로 알림을 쏘지 못하게 강제 비활성 (import 시점 고정).
# send_telegram 은 TELEGRAM_ENABLED!='true' 면 즉시 False 반환 → 실제 API 호출 0.
# 로컬 .env 에 TELEGRAM_ENABLED=true 가 로드돼 있어도 본 라인이 덮어써 사고 차단
# (세션 325 사고: 결제 알림 테스트가 운영자 휴대폰으로 실알림 발사).
os.environ["TELEGRAM_ENABLED"] = "false"
# ⚠ 같은 사고(세션 325)의 자매 채널 — SMTP 도 차단. 공인중개사 승인/반려 테스트
# (test_admin_verify_router)가 send_email 을 타는데, 로컬 .env SMTP 자격증명이 로드되면
# 실메일이 발송된다. email.py 가드(SMTP_USER/PASS 미설정 시 즉시 False)를 강제 발동시켜
# 실발송 0 (텔레그램 선례 답습 — 알림 채널은 conftest 에서 전역 봉쇄).
os.environ["SMTP_USER"] = ""
os.environ["SMTP_PASS"] = ""
# ⚠ 스케줄러 단일 인스턴스 파일락 비활성 (세션 341). client fixture 가
# `with TestClient(app)` 로 lifespan 을 발동하는데, 여러 테스트가 같은
# scripts/scheduler.lock 을 두고 경합하면 CI 병렬 실행이 flaky 해진다. false 면
# acquire_scheduler_lock 이 nullcontext sentinel 반환 → 락 없이 진행(경합 0).
os.environ["SCHEDULER_FILELOCK_ENABLED"] = "false"

# ARRAY → JSON 패치 (SQLite 호환)


class _FakeARRAY(JSON):
    def __init__(self, *args, **kwargs):
        super().__init__()

sqlalchemy.ARRAY = _FakeARRAY
pg_dialect.ARRAY = _FakeARRAY

# file-based SQLite — NullPool로 SessionLocal() 호출 시 독립 커넥션
# pytest-xdist 워커별 독립 DB 파일 (PYTEST_XDIST_WORKER: gw0.. / 미사용 시 미설정)
_WORKER_ID = os.environ.get("PYTEST_XDIST_WORKER", "master")
_TEST_DB = os.path.join(
    tempfile.gettempdir(), f"naver_estate_test_{_WORKER_ID}.db"
)
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
    # setup 에서도 TTLCache 리셋 — 이전 테스트 teardown 이 예외로 스킵된 경우 대비 (방어적)
    from services.cache import _registry, _registry_lock
    with _registry_lock:
        _registry.clear()
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


# ── B2 게이트 인증 헬퍼 (test_api_auth.py 패턴 답습, JWT_SECRET = conftest 상단 env) ──

def make_auth_headers(db, user_id="approved-user", role="user", status="approved", email=None):
    """승인(또는 지정 status) 사용자의 UserProfile 생성 + JWT Bearer 헤더 반환.

    B2 게이트(get_approved_user) 전용 엔드포인트 테스트용. status="approved" 면 통과,
    "pending" 이면 403. 비로그인은 헤더 없이 호출(401).
    """
    import jwt

    from db.models import UserProfile

    if db.query(UserProfile).filter(UserProfile.user_id == user_id).first() is None:
        db.add(UserProfile(user_id=user_id, email=email or f"{user_id}@test.com",
                           role=role, status=status))
        db.commit()
    token = jwt.encode(
        {"sub": user_id, "aud": "authenticated", "email": email or f"{user_id}@test.com"},
        os.environ["SUPABASE_JWT_SECRET"], algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def approved_headers(db):
    """승인 중개사(status=approved) Bearer 헤더 — 전용 엔드포인트 200 통과용."""
    return make_auth_headers(db, user_id="approved-user", status="approved")
