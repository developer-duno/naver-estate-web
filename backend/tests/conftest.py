"""테스트 공통 Fixture — file-based SQLite + FastAPI TestClient

NullPool 사용 — 스레드별 독립 커넥션 (SessionLocal() 호출 시 세션 격리).
WAL + busy_timeout으로 동시 쓰기 안전하게 처리.
live router는 dialect 분기로 SQLite에서 ThreadPoolExecutor 미사용.
"""

import atexit
import os
import sys
import tempfile
import time
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
# ⚠ 같은 결(세션 375) — V-WORLD 외부 API 도 전역 봉쇄. 신코드 이관 감시 프로브
# (_probe_reform_migration)가 collect_official_prices 시작 시 _fetch_page 를 직접 타는데,
# 로컬 .env 의 실키가 로드되면 수집기 테스트들이 실제 V-WORLD 를 호출하게 돼 전체 실행에서만
# 갈리는 flaky 를 만든다(세션 375 실측 — CI 는 키가 없어 원래 무해). 실키 로더는
# db/database.py 가 **아니다**(아래에서 sys.modules 로 교체돼 테스트에선 import 자체가 안 됨) —
# crawler/scheduler.py·crawler/service_discover.py·main.py 의 load_dotenv() 를, 이들을 top-level
# import 하는 test_scheduler_*·test_crawl_detail_order·test_service_discover_race 등 5개 모듈이
# 전체 회귀 collection 시점에 세션 전역으로 실행한다(적대검증 직독). 그래서 단독·파일 단위
# 실행은 무해하고 전체 실행에서만 실호출이 생겼다. 빈 값 강제 → _fetch_page 가 키 가드에서
# 즉시 None 반환(실호출 0·결정론).
# 프로브 단위 테스트는 _fetch_page/probe 자체를 목킹하므로 영향 없다.
os.environ["VWORLD_API_KEY"] = ""
os.environ["VWORLD_DOMAIN"] = ""
# ⚠ 결제 기능 토글을 테스트에서만 강제 활성 (세션 400). 코드 기본값은 꺼짐(false)이므로
# 명시하지 않으면 CI 에서 결제 API 7종이 전부 403 이 되어 기존 결제 테스트 4파일
# (test_payment_router·test_billing_router·test_billing_charge·test_billing_key_model)이
# 통째로 깨진다. 로컬은 .env 가 로드돼 우연히 통과할 수 있어 CI 에서만 갈리는 함정이므로
# 여기서 못박는다(~/.claude/rules feedback_local_env_false_ci_pass 답습).
# "꺼진 상태" 자체를 검증하는 tests/test_payment_disabled.py 는 patch.object 로 끈다.
os.environ["PAYMENT_ENABLED"] = "true"
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
# ⚠ 파일명에 PID 를 붙인다 (세션 415). 워커 id 만으로는 **같은 PC 의 두 pytest 실행**
# (구현자 + 검사관이 동시에 돌리는 경우, 둘 다 xdist 미사용이면 워커 id 가 똑같이
# "master")이 같은 파일을 잡아 서로의 DB 를 drop_all 하거나 파일을 지워 버린다
# → `no such table` · `WinError 32` 같은 거짓 실패. PID 는 프로세스마다 다르므로 충돌 0.
_WORKER_ID = os.environ.get("PYTEST_XDIST_WORKER", "master")
_TEST_DB = os.path.join(
    tempfile.gettempdir(), f"naver_estate_test_{_WORKER_ID}_{os.getpid()}.db"
)


def _sweep_stale_test_dbs(directory: str, max_age_sec: float, now: float | None = None) -> int:
    """오래된 테스트 DB 찌꺼기를 지우고 지운 개수를 돌려준다.

    PID 를 붙이면 파일명이 매번 달라져 예전처럼 "다음 실행이 덮어써서" 정리되지 않는다.
    그래서 import 시점에 한 번 쓸어 낸다. 옛 고정 이름 파일도 같은 패턴이라 함께 지워진다.
    지금 돌고 있는 다른 실행의 파일을 건드리지 않도록 **오래된 것만**(mtime 기준) 대상이고,
    삭제는 전부 best-effort — 윈도우에서는 다른 프로세스가 쥔 파일이 삭제되지 않는다.
    """
    deleted = 0
    cutoff = (time.time() if now is None else now) - max_age_sec
    try:
        names = os.listdir(directory)
    except OSError:
        return 0
    for name in names:
        if not name.startswith("naver_estate_test_"):
            continue
        if not (name.endswith(".db") or name.endswith(".db-wal") or name.endswith(".db-shm")):
            continue
        path = os.path.join(directory, name)
        try:
            if os.path.getmtime(path) >= cutoff:
                continue
            os.unlink(path)
        except OSError:
            continue
        deleted += 1
    return deleted


def _unlink_db_files(path: str) -> int:
    """SQLite DB 한 벌(본체 + -wal + -shm)을 지우고 지운 개수를 돌려준다.

    삭제는 전부 best-effort — 없는 파일도, 다른 프로세스가 쥔 파일도 예외를 올리지 않는다
    (윈도우에서는 사용 중인 파일 삭제가 거부된다). 종료 훅에서도 쓰이므로 절대 안 터진다.
    """
    deleted = 0
    for ext in ("", "-wal", "-shm"):
        try:
            os.unlink(path + ext)
        except OSError:
            continue
        deleted += 1
    return deleted


# 6시간 = 가장 긴 전체 실행(약 15분)보다 충분히 길다 → 살아 있는 실행의 파일은 안 건드린다.
_sweep_stale_test_dbs(tempfile.gettempdir(), 6 * 3600)

# PID 는 재사용될 수 있으므로 내 파일은 시작 전에 한 번 더 지운다.
_unlink_db_files(_TEST_DB)

test_engine = create_engine(
    f"sqlite:///{_TEST_DB}",
    connect_args={"check_same_thread": False},
    poolclass=NullPool,
)


@atexit.register
def _cleanup_test_db() -> None:
    """실행이 끝나면 내 DB 파일을 지운다 — PID 가 붙어 파일명이 매번 달라지므로 쌓인다.

    종료 훅이라 무슨 일이 있어도 예외를 올리지 않는다(올리면 종료 코드가 더럽혀진다).
    """
    try:
        test_engine.dispose()
    except Exception:  # noqa: BLE001 — 종료 경로, 실패해도 삭제는 시도한다
        pass
    _unlink_db_files(_TEST_DB)

def _pg_left(text, n):
    """PostgreSQL LEFT(text, n) 흉내 — SQLite 는 이 함수가 없어 직접 등록.

    service_public.py 의 func.left(Complex.cortar_no, 5) 가 이 함수를 쓴다
    (domain-mapping-ssot.md 룰 3 dialect 의존성과 동일 결 — raw SQL 이 아니라
    ORM func 호출이라 못 잡던 케이스, 세션 346 에서 재개 로직 테스트 작성 중 발견).
    """
    if text is None or n is None:
        return None
    return str(text)[: int(n)]


@event.listens_for(test_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.execute("PRAGMA busy_timeout = 5000")
    cursor.close()
    dbapi_conn.create_function("left", 2, _pg_left)

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
    # 관리자 상세 통계 5분 캐시도 비운다 — 테스트마다 데이터가 다르다
    from routers.admin.jobs import _reset_stats_cache
    _reset_stats_cache()
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
