"""SQLAlchemy 엔진 및 세션 팩토리"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

load_dotenv()

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
