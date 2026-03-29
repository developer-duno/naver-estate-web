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

# ── 정렬 헬퍼 ───────────────────────────────────────────────


def _build_mb_order_clause(sort_by: str):
    """아파트 정렬 키 → SQLAlchemy ORDER BY 절"""
    sort_map = {
        "name_asc": Apartment.name.asc(),
        "unsold_desc": Apartment.unsold.desc(),
        "unsold_asc": Apartment.unsold.asc(),
        "unsold_rate_desc": Apartment.unsold_rate.desc(),
        "units_desc": Apartment.units.desc(),
        "price_asc": Apartment.presale_min_price.asc(),
        "price_desc": Apartment.presale_min_price.desc(),
    }
    return sort_map.get(sort_by, Apartment.name.asc())


def _build_mb_trade_order_clause(sort_by: str):
    """실거래 정렬 키 → SQLAlchemy ORDER BY 절"""
    sort_map = {
        "deal_month_desc": MBTrade.deal_month.desc(),
        "deal_month_asc": MBTrade.deal_month.asc(),
        "price_desc": MBTrade.price.desc(),
        "price_asc": MBTrade.price.asc(),
        "area_desc": MBTrade.area.desc(),
    }
    return sort_map.get(sort_by, MBTrade.deal_month.desc())


def _apply_keyword_filter(conditions: list, keyword: Optional[str]):
    """키워드 ILIKE 필터 (% _ 이스케이프)"""
    if keyword:
        kw = keyword.strip()
        if kw:
            escaped = kw.replace("%", "\\%").replace("_", "\\_")
            conditions.append(Apartment.name.ilike(f"%{escaped}%"))


def get_gu_list(db: Session, region: str) -> list[str]:
    """시/도 내 시/군/구 목록 (apartments 테이블에서 DISTINCT)"""
    stmt = (
        select(func.distinct(Apartment.gu))
        .where(and_(Apartment.region == region, Apartment.gu.isnot(None)))
        .order_by(Apartment.gu)
    )
    return [row for row in db.execute(stmt).scalars().all()]


# ── 아파트 단지 ──────────────────────────────────────────────


def get_apartments(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "name_asc",
    keyword: Optional[str] = None,
) -> list[Apartment]:
    """지역별 아파트 목록 (페이지네이션 + 정렬 + 검색)"""
    conditions = [Apartment.region == region]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    stmt = (
        select(Apartment)
        .where(and_(*conditions))
        .order_by(_build_mb_order_clause(sort_by))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list(db.execute(stmt).scalars().all())


def count_apartments(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    """지역별 아파트 수 (검색 반영)"""
    conditions = [Apartment.region == region]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

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
    sort_by: str = "unsold_desc",
    keyword: Optional[str] = None,
) -> list[Apartment]:
    """지역별 미분양 아파트 (unsold > 0, 정렬 + 검색)"""
    conditions = [Apartment.region == region, Apartment.unsold > 0]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    stmt = (
        select(Apartment)
        .where(and_(*conditions))
        .order_by(_build_mb_order_clause(sort_by))
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
    sort_by: str = "deal_month_desc",
) -> list[MBTrade]:
    """지역별 실거래 내역 (페이지네이션 + 정렬)"""
    conditions = [MBTrade.region == region]
    if gu:
        conditions.append(MBTrade.gu == gu)
    if dong:
        conditions.append(MBTrade.dong == dong)

    stmt = (
        select(MBTrade)
        .where(and_(*conditions))
        .order_by(_build_mb_trade_order_clause(sort_by))
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
