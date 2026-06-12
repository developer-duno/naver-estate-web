"""mibunyang 쿼리 공통 헬퍼 — 중복 제거 · 정렬 · 필터"""

import re
from datetime import datetime
from typing import Optional

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
        # pp = 평당가 — 데스크톱 '평당가' 컬럼(셀 값 presale_pp) 정렬 짝꿍 (FE sortKey="pp")
        "pp_asc": Apartment.presale_pp.asc().nullslast(),
        "pp_desc": Apartment.presale_pp.desc().nullslast(),
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
