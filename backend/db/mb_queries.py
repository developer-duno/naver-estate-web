"""mibunyang 읽기 쿼리 — 기존 get_db() 세션 사용, SQL WHERE 필터링"""

import re
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.mb_models import (
    AirQualityStation,
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

# ── 중복 제거 헬퍼 ──────────────────────────────────────────

_TRAILING_PAREN_RE = re.compile(r"\s*\([^)]*\)\s*$")


def extract_base_name(name: str) -> str:
    """단지명에서 차수 접미사 제거: '푸르지오(임의공급 3차)' → '푸르지오'"""
    if not name:
        return ""
    return _TRAILING_PAREN_RE.sub("", name)


def _deduplicate_apartments(apartments: list["Apartment"]) -> list["Apartment"]:
    """(base_name, region, gu) 그룹에서 마지막 차수만 유지 (created_at DESC, id DESC)"""
    best: dict[tuple[str, str, Optional[str]], "Apartment"] = {}
    _min_dt = datetime.min
    for apt in apartments:
        key = (extract_base_name(apt.name), apt.region, apt.gu)
        existing = best.get(key)
        if existing is None:
            best[key] = apt
        else:
            if (apt.created_at or _min_dt, apt.id) > (
                existing.created_at or _min_dt,
                existing.id,
            ):
                best[key] = apt
    return list(best.values())


def _sort_apartments(apartments: list["Apartment"], sort_by: str) -> list["Apartment"]:
    """Python 레벨 정렬 (중복 제거 후 순서 복원용)"""
    sort_config: dict[str, tuple] = {
        "name_asc": (lambda a: (a.name or ""), False),
        "unsold_desc": (lambda a: (a.unsold or 0), True),
        "unsold_asc": (lambda a: (a.unsold or 0), False),
        "unsold_rate_desc": (lambda a: (a.unsold_rate or 0.0), True),
        "units_desc": (lambda a: (a.units or 0), True),
        "price_asc": (lambda a: (a.presale_min_price or float("inf")), False),
        "price_desc": (lambda a: (a.presale_min_price or 0), True),
    }
    key_fn, reverse = sort_config.get(sort_by, (lambda a: (a.name or ""), False))
    return sorted(apartments, key=key_fn, reverse=reverse)


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


def _is_sqlite(db: Session) -> bool:
    """CI(SQLite) vs Production(PostgreSQL) dialect 판별"""
    return (db.bind.dialect.name if db.bind else "postgresql") == "sqlite"


def get_apartments_page(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "name_asc",
    keyword: Optional[str] = None,
) -> tuple[list[Apartment], int]:
    """아파트 목록 + 전체 수 (중복 제거 + 정렬 + 페이지네이션)

    PostgreSQL: SQL CTE + ROW_NUMBER + regexp_replace (인덱스 활용)
    SQLite: Python fallback (CI 테스트 호환)
    """
    conditions = [Apartment.region == region]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    if _is_sqlite(db):
        # SQLite: regexp_replace 미지원 → Python fallback
        stmt = select(Apartment).where(and_(*conditions))
        all_rows = list(db.execute(stmt).scalars().all())
        deduped = _deduplicate_apartments(all_rows)
        sorted_rows = _sort_apartments(deduped, sort_by)
        start = (page - 1) * page_size
        return sorted_rows[start : start + page_size], len(deduped)

    # PostgreSQL: SQL 레벨 중복 제거
    base_name_expr = func.regexp_replace(Apartment.name, r"\s*\([^)]*\)\s*$", "")
    rn = func.row_number().over(
        partition_by=[base_name_expr, Apartment.region, Apartment.gu],
        order_by=[Apartment.created_at.desc().nullslast(), Apartment.id.desc()],
    ).label("rn")

    subq = (
        select(Apartment.id, rn)
        .where(and_(*conditions))
        .subquery()
    )

    # 전체 수
    count_stmt = select(func.count()).select_from(subq).where(subq.c.rn == 1)
    total = db.execute(count_stmt).scalar() or 0

    # 페이지 데이터
    order = _build_mb_order_clause(sort_by)
    stmt = (
        select(Apartment)
        .join(subq, Apartment.id == subq.c.id)
        .where(subq.c.rn == 1)
        .order_by(order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(db.execute(stmt).scalars().all())
    return rows, total


def get_apartments(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "name_asc",
    keyword: Optional[str] = None,
) -> list[Apartment]:
    """지역별 아파트 목록 (래퍼 — get_apartments_page 사용)"""
    items, _ = get_apartments_page(db, region, gu, page, page_size, sort_by, keyword)
    return items


def count_apartments(
    db: Session,
    region: str,
    gu: Optional[str] = None,
    keyword: Optional[str] = None,
) -> int:
    """지역별 아파트 수 (래퍼 — get_apartments_page 사용)"""
    _, total = get_apartments_page(db, region, gu, 1, 1, keyword=keyword)
    return total


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
    """지역별 미분양 아파트 (unsold > 0, 중복 제거 + 정렬 + 검색)

    PostgreSQL: SQL CTE + ROW_NUMBER + regexp_replace
    SQLite: Python fallback (CI 테스트 호환)
    """
    conditions = [Apartment.region == region, Apartment.unsold > 0]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    if _is_sqlite(db):
        stmt = select(Apartment).where(and_(*conditions))
        all_rows = list(db.execute(stmt).scalars().all())
        deduped = _deduplicate_apartments(all_rows)
        return _sort_apartments(deduped, sort_by)

    # PostgreSQL: SQL 레벨 중복 제거
    base_name_expr = func.regexp_replace(Apartment.name, r"\s*\([^)]*\)\s*$", "")
    rn = func.row_number().over(
        partition_by=[base_name_expr, Apartment.region, Apartment.gu],
        order_by=[Apartment.created_at.desc().nullslast(), Apartment.id.desc()],
    ).label("rn")

    subq = (
        select(Apartment.id, rn)
        .where(and_(*conditions))
        .subquery()
    )

    order = _build_mb_order_clause(sort_by)
    stmt = (
        select(Apartment)
        .join(subq, Apartment.id == subq.c.id)
        .where(subq.c.rn == 1)
        .order_by(order)
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


def get_air_station(db: Session, station_name: str) -> Optional[AirQualityStation]:
    """에어코리아 측정소 캐시 조회"""
    return db.get(AirQualityStation, station_name)
