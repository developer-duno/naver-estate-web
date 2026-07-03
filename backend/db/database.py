"""SQLAlchemy 엔진 및 세션 팩토리"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from services.slow_query_log import attach as _attach_slow_query_log

load_dotenv()

# 폭주 쿼리 안전망 임계값(ms) — env STATEMENT_TIMEOUT_MS, 기본 8000ms(8초).
# 0 이하면 비활성 (Supabase 기본 2min cap 으로 폴백).
STATEMENT_TIMEOUT_MS = int(os.getenv("STATEMENT_TIMEOUT_MS", "8000"))

# ── estate DB (기존) ──
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")

# Sync 엔진 (크롤러 + 웹앱 공용) — NullPool: 요청마다 연결/해제 (Supabase 커넥션 한도 방지).
# pool_pre_ping: 매 checkout 전에 SELECT 1로 유효성 검사. Supabase idle timeout으로 끊긴
# 연결을 붙잡아 재사용하다가 "server closed connection unexpectedly"로 터지던 문제 방지
# (popular 크롤링 4일 실패 원인, 2026-04-10~14).
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    pool_pre_ping=True,
    echo=False,
    # connect_timeout: TCP 연결 "수립" 단계만 5초로 bound (psycopg2/libpq 네이티브).
    # Supabase 가 unreachable(느림 아니라 먹통)이면 NullPool 이 매 요청 새 connect →
    # 기본 ~2min 무한 대기하며 /health/db 워커 스레드가 쌓이던 것 차단(세션 341).
    # ⚠ 연결 수립만 제한 — 이미 맺은 연결의 쿼리 지속엔 영향 0(그건 statement_timeout
    # 담당). pool_pre_ping 의 SELECT 1 도 이미 맺은 연결이라 무관 → 크롤 회귀 없음.
    connect_args={"connect_timeout": 5},
)


# statement_timeout 안전망: 폭주 쿼리를 8초에 죽여 NullPool 연결을 오래 점유하며
# micro 인스턴스를 굶기는 것 방지 (세션 255). 0.46초 region 경로보다 한참 위.
#
# ⚠ 적용 방식 주의(세션 255 실측+공식문서): Supabase Supavisor 풀러는 startup
# 파라미터 options="-c statement_timeout=..." 를 무시한다(SHOW 가 2min 그대로).
# role-level ALTER ROLE 도 transaction mode 에선 무효. 실측 결과 연결 직후 명시
# SET 쿼리만 세션에 적용됨(SHOW → 8s 확인). NullPool 이라 매 요청 새 연결 →
# connect 이벤트에서 매번 SET → 모든 세션 보장.
@event.listens_for(engine, "connect")
def _set_statement_timeout(dbapi_conn, _connection_record):
    if STATEMENT_TIMEOUT_MS <= 0:
        return
    try:
        cursor = dbapi_conn.cursor()
        cursor.execute(f"SET statement_timeout = {STATEMENT_TIMEOUT_MS}")
        cursor.close()
    except Exception:  # best-effort — 실패해도 연결은 정상 사용
        pass


# 슬로우 쿼리 로깅 부착 (1초 초과 SQL → logger.warning). best-effort, 실패해도 앱 정상.
# 테스트는 conftest 가 SQLite 엔진을 주입하므로 본 prod 엔진에는 미부착 → 영향 0.
_attach_slow_query_log(engine)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """DB 세션 제너레이터 (with 문 또는 의존성 주입용)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
