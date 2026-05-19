"""mibunyang 아파트 단지 · 미분양 조회 쿼리"""

from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.mb_models import Apartment, UnsoldHistory
from db.mb_query_helpers import (
    _apply_keyword_filter,
    _build_mb_order_clause,
    _deduplicate_apartments,
    _is_sqlite,
    _sort_apartments,
)


def get_gu_list(db: Session, region: str) -> list[str]:
    """시/도 내 시/군/구 목록 (apartments 테이블에서 DISTINCT)"""
    stmt = (
        select(func.distinct(Apartment.gu))
        .where(and_(Apartment.region == region, Apartment.gu.isnot(None)))
        .order_by(Apartment.gu)
    )
    return [row for row in db.execute(stmt).scalars().all()]


# ── 아파트 단지 ──────────────────────────────────────────────


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
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Apartment], int]:
    """지역별 미분양 아파트 + 전체 수 (unsold > 0, 중복 제거 + 정렬 + 페이지네이션)

    PostgreSQL: SQL CTE + ROW_NUMBER + regexp_replace
    SQLite: Python fallback (CI 테스트 호환)
    반환: (페이지 행 목록, 중복 제거 후 전체 수)
    """
    conditions = [Apartment.region == region, Apartment.unsold > 0]
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    if _is_sqlite(db):
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

    # 전체 수 (중복 제거 후)
    count_stmt = select(func.count()).select_from(subq).where(subq.c.rn == 1)
    total = db.execute(count_stmt).scalar() or 0

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
