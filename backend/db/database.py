"""SQLAlchemy 엔진 및 세션 팩토리"""

import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL 환경변수가 설정되지 않았습니다")

# Sync 엔진 (크롤러 + 웹앱 공용)
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=3600,  # 1시간마다 커넥션 갱신 (DB 타임아웃 방지)
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
