"""SQLAlchemy 엔진 및 세션 팩토리

듀얼 DB 지원: estate (naver-estate-web) + mb (mibunyang)
"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

# ── estate DB (기존) ──
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")

# Sync 엔진 (크롤러 + 웹앱 공용) — NullPool: 요청마다 연결/해제 (Supabase 커넥션 한도 방지)
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    echo=False,
)

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


# ── mibunyang DB (신규) ──
MB_DATABASE_URL = os.getenv("MB_DATABASE_URL")

if MB_DATABASE_URL:
    mb_engine = create_engine(MB_DATABASE_URL, poolclass=NullPool, echo=False)
    MBSessionLocal = sessionmaker(bind=mb_engine, autocommit=False, autoflush=False)
else:
    mb_engine = None
    MBSessionLocal = None


class MBBase(DeclarativeBase):
    pass


def get_mb_db():
    """mibunyang DB 세션 제너레이터"""
    if MBSessionLocal is None:
        raise RuntimeError("MB_DATABASE_URL 환경변수가 설정되지 않았습니다")
    db = MBSessionLocal()
    try:
        yield db
    finally:
        db.close()
