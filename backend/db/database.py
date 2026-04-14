"""SQLAlchemy 엔진 및 세션 팩토리"""

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

# Sync 엔진 (크롤러 + 웹앱 공용) — NullPool: 요청마다 연결/해제 (Supabase 커넥션 한도 방지).
# pool_pre_ping: 매 checkout 전에 SELECT 1로 유효성 검사. Supabase idle timeout으로 끊긴
# 연결을 붙잡아 재사용하다가 "server closed connection unexpectedly"로 터지던 문제 방지
# (popular 크롤링 4일 실패 원인, 2026-04-10~14).
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    pool_pre_ping=True,
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
