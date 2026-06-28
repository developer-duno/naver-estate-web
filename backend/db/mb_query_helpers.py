"""mibunyang 쿼리 공통 헬퍼 — 중복 제거 · 정렬 · 필터"""

import re
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.mb_models import Apartment, MBTrade

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
    """Python 레벨 정렬 (중복 제거 후 순서 복원용)

    NULL 마스킹은 SQL 경로의 NULLS LAST 와 parity — asc 는 inf, desc 는 0 으로
    빈 값 행이 항상 맨 뒤. (_build_mb_order_clause 짝꿍)
    """
    sort_config: dict[str, tuple] = {
        "name_asc": (lambda a: (a.name or ""), False),
        "unsold_desc": (lambda a: (a.unsold or 0), True),
        "unsold_asc": (lambda a: (a.unsold if a.unsold is not None else float("inf")), False),
        "unsold_rate_desc": (lambda a: (a.unsold_rate or 0.0), True),
        "units_desc": (lambda a: (a.units or 0), True),
        "price_asc": (lambda a: (a.presale_min_price or float("inf")), False),
        "price_desc": (lambda a: (a.presale_min_price or 0), True),
        # pp = 평당가. 0(분양가 양수인데 평당가만 0 적재되는 collector 결함 + 둘다 미공개)도
        # NULL 과 동급으로 맨 뒤 — `or` 가 falsy 0 을 NULL 과 같게 처리 (SQL 경로
        # _build_mb_order_clause 의 func.nullif(pp,0) 와 parity, 세션 300).
        "pp_asc": (lambda a: (a.presale_pp or float("inf")), False),
        "pp_desc": (lambda a: (a.presale_pp or 0), True),
    }
    key_fn, reverse = sort_config.get(sort_by, (lambda a: (a.name or ""), False))
    return sorted(apartments, key=key_fn, reverse=reverse)


# ── 정렬 헬퍼 ───────────────────────────────────────────────


def _build_mb_order_clause(sort_by: str):
    """아파트 정렬 키 → SQLAlchemy ORDER BY 절

    nullable 정렬 컬럼은 전부 NULLS LAST 고정 — PG 기본은 DESC 시 NULLS FIRST 라
    빈 값 행이 맨 위 노출 (name 은 NOT NULL 이라 제외). 새 키 추가 시
    routers/mb.py MbAptSortBy Literal + frontend/src/lib/mb-sort-options.ts 양쪽 답습.
    """
    sort_map = {
        "name_asc": Apartment.name.asc(),
        "unsold_desc": Apartment.unsold.desc().nullslast(),
        "unsold_asc": Apartment.unsold.asc().nullslast(),
        "unsold_rate_desc": Apartment.unsold_rate.desc().nullslast(),
        "units_desc": Apartment.units.desc().nullslast(),
        "price_asc": Apartment.presale_min_price.asc().nullslast(),
        "price_desc": Apartment.presale_min_price.desc().nullslast(),
        # pp = 평당가 — 데스크톱 '평당가' 컬럼(셀 값 presale_pp) 정렬 짝꿍 (FE sortKey="pp").
        # nullif(pp, 0) 로 0(분양가 양수인데 평당가만 0 적재되는 collector 결함 254건 + 둘다
        # 미공개 57건)을 NULL 동급 → nullslast 로 맨 뒤. Python 경로 _sort_apartments 의
        # `or inf/0` 와 parity (세션 300). ⚠ SQL 경로는 prod(PG) 전용 — CI(SQLite)는 Python
        # fallback 이라 본 nullif 동작은 PG 라이브 실측으로만 검증 (회귀는 Python 경로 케이스).
        "pp_asc": func.nullif(Apartment.presale_pp, 0).asc().nullslast(),
        "pp_desc": func.nullif(Apartment.presale_pp, 0).desc().nullslast(),
    }
    return sort_map.get(sort_by, Apartment.name.asc())


def _build_mb_trade_order_clause(sort_by: str):
    """실거래 정렬 키 → SQLAlchemy ORDER BY 절 (전 컬럼 nullable → NULLS LAST 고정)"""
    sort_map = {
        "deal_month_desc": MBTrade.deal_month.desc().nullslast(),
        "deal_month_asc": MBTrade.deal_month.asc().nullslast(),
        "price_desc": MBTrade.price.desc().nullslast(),
        "price_asc": MBTrade.price.asc().nullslast(),
        "area_desc": MBTrade.area.desc().nullslast(),
    }
    # 기본값도 dict 항목 재사용 — NULLS LAST 일관 (invalid 키 == deal_month_desc 가드 테스트 유지)
    return sort_map.get(sort_by, sort_map["deal_month_desc"])


def _apply_keyword_filter(conditions: list, keyword: Optional[str]):
    """키워드 ILIKE 필터 (% _ 이스케이프)"""
    if keyword:
        kw = keyword.strip()
        if kw:
            escaped = kw.replace("%", "\\%").replace("_", "\\_")
            conditions.append(Apartment.name.ilike(f"%{escaped}%"))


def _is_sqlite(db: Session) -> bool:
    """CI(SQLite) vs Production(PostgreSQL) dialect 판별"""
    return (db.bind.dialect.name if db.bind else "postgresql") == "sqlite"


def _paginate_deduped_apartments(
    db: Session,
    conditions: list,
    sort_by: str,
    page: int,
    page_size: int,
) -> tuple[list["Apartment"], int]:
    """conditions 로 필터된 아파트를 중복 제거 + 정렬 + 페이지네이션해 (행 목록, 전체 수) 반환.

    PostgreSQL: SQL CTE + ROW_NUMBER + regexp_replace (인덱스 활용)
    SQLite: Python fallback (CI 테스트 호환)
    get_apartments_page · get_unsold_by_region 공통 답습 — conditions 빌드만 호출처가 다르다."""
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

    # 전체 수 (중복 제거 후)
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
