"""mibunyang 읽기 쿼리 — 기존 get_db() 세션 사용, SQL WHERE 필터링"""

from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.mb_models import (
    Apartment,
    Builder,
    Infra,
    MBPrice,
    MBRegion,
    MBTrade,
    School,
    TradeStats,
    Transport,
    UnsoldHistory,
)

# ── 아파트 단지 ──────────────────────────────────────────────


def get_apartments(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> list[Apartment]:
    """지역별 아파트 목록 (페이지네이션)"""
    conditions = [Apartment.region == region]
    if gu:
        conditions.append(Apartment.gu == gu)

    stmt = (
        select(Apartment)
        .where(and_(*conditions))
        .order_by(Apartment.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(db.execute(stmt).scalars().all())


def count_apartments(
    db: Session, region: str, gu: Optional[str] = None
) -> int:
    """지역별 아파트 수"""
    conditions = [Apartment.region == region]
    if gu:
        conditions.append(Apartment.gu == gu)

    stmt = select(func.count(Apartment.id)).where(and_(*conditions))
    return db.execute(stmt).scalar() or 0


def get_apartment_by_id(db: Session, apartment_id: str) -> Optional[Apartment]:
    """아파트 상세 조회"""
    return db.get(Apartment, apartment_id)


# ── 미분양 이력 ──────────────────────────────────────────────


def get_unsold_history(
    db: Session,
    apartment_id: str,
    limit: int = 24,
) -> list[UnsoldHistory]:
    """단지별 미분양 추이 (최근 N개월)"""
    stmt = (
        select(UnsoldHistory)
        .where(UnsoldHistory.apartment_id == apartment_id)
        .order_by(UnsoldHistory.base_month.desc())
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


def get_unsold_by_region(
    db: Session,
    region: str,
    gu: Optional[str] = None,
) -> list[Apartment]:
    """지역별 미분양 아파트 (unsold > 0)"""
    conditions = [Apartment.region == region, Apartment.unsold > 0]
    if gu:
        conditions.append(Apartment.gu == gu)

    stmt = (
        select(Apartment)
        .where(and_(*conditions))
        .order_by(Apartment.unsold.desc())
    )
    return list(db.execute(stmt).scalars().all())


# ── 지역 통계 ────────────────────────────────────────────────


def get_region_stats(
    db: Session,
    region: str,
    gu: Optional[str] = None,
) -> list[MBRegion]:
    """지역별 통계 (최신 데이터)"""
    conditions = [MBRegion.region == region]
    if gu:
        conditions.append(MBRegion.gu == gu)

    stmt = (
        select(MBRegion)
        .where(and_(*conditions))
        .order_by(MBRegion.recorded_at.desc())
    )
    return list(db.execute(stmt).scalars().all())


# ── 실거래 ───────────────────────────────────────────────────


def get_trades(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    dong: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
) -> list[MBTrade]:
    """지역별 실거래 내역 (페이지네이션)"""
    conditions = [MBTrade.region == region]
    if gu:
        conditions.append(MBTrade.gu == gu)
    if dong:
        conditions.append(MBTrade.dong == dong)

    stmt = (
        select(MBTrade)
        .where(and_(*conditions))
        .order_by(MBTrade.deal_month.desc(), MBTrade.price.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(db.execute(stmt).scalars().all())


def count_trades(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    dong: Optional[str] = None,
) -> int:
    """지역별 실거래 수"""
    conditions = [MBTrade.region == region]
    if gu:
        conditions.append(MBTrade.gu == gu)
    if dong:
        conditions.append(MBTrade.dong == dong)

    stmt = select(func.count(MBTrade.id)).where(and_(*conditions))
    return db.execute(stmt).scalar() or 0


# ── 단지 부속 정보 (apartment_id FK) ─────────────────────────


def get_apartment_prices(db: Session, apartment_id: str) -> list[MBPrice]:
    """단지별 분양가 목록"""
    stmt = select(MBPrice).where(MBPrice.apartment_id == apartment_id)
    return list(db.execute(stmt).scalars().all())


def get_trade_stats(db: Session, apartment_id: str) -> Optional[TradeStats]:
    """단지 거래 통계"""
    return db.get(TradeStats, apartment_id)


def get_infra(db: Session, apartment_id: str) -> Optional[Infra]:
    """단지 주변 인프라"""
    return db.get(Infra, apartment_id)


def get_school(db: Session, apartment_id: str) -> Optional[School]:
    """단지 학군 정보"""
    return db.get(School, apartment_id)


def get_transport(db: Session, apartment_id: str) -> Optional[Transport]:
    """단지 교통 정보"""
    return db.get(Transport, apartment_id)


def get_builder(db: Session, builder_name: str) -> Optional[Builder]:
    """시공사 정보"""
    return db.get(Builder, builder_name)
