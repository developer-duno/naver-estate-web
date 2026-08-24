"""mibunyang 지역 통계 · 실거래 · 단지 부속 정보 조회 쿼리"""

from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.mb_models import (
    Builder,
    Infra,
    MBPrice,
    MBRegion,
    MBTrade,
    RentalScheduleOfficial,
    School,
    TradeStats,
    Transport,
)
from db.mb_query_helpers import _build_mb_trade_order_clause

# ── 지역 통계 ────────────────────────────────────────────────


def get_region_stats(
    db: Session,
    region: str,
    gu: Optional[str] = None,
) -> list[MBRegion]:
    """지역별 통계 — (region, gu) 조합별 최신 레코드만 반환.

    mibunyang 수집기가 주기적으로 MBRegion을 누적 저장하므로,
    같은 (region, gu)가 여러 recorded_at으로 중복될 수 있음.
    recorded_at desc로 정렬 후 (region, gu) 첫 등장만 유지.
    """
    conditions = [MBRegion.region == region]
    if gu:
        conditions.append(MBRegion.gu == gu)

    stmt = (
        select(MBRegion)
        .where(and_(*conditions))
        .order_by(MBRegion.recorded_at.desc())
    )
    rows = list(db.execute(stmt).scalars().all())

    seen: set[tuple[str, Optional[str]]] = set()
    unique: list[MBRegion] = []
    for r in rows:
        key = (r.region, r.gu)
        if key not in seen:
            seen.add(key)
            unique.append(r)

    # 종합(gu=None) 먼저, 그 다음 시군구 이름순으로 정렬
    unique.sort(key=lambda r: (r.gu is not None, r.gu or ""))
    return unique


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


# ── 공공지원 민간임대 (apartments 독립, 이슈 #323) ─────────────


def get_rental_schedules(
    db: Session, region: Optional[str] = None
) -> list[RentalScheduleOfficial]:
    """공공지원 민간임대 청약 일정 전체 (region_code 필터, recruit_date DESC).

    ⚠ **알려진 결함** (2026-08-25 세션 383 발견, 사장님 판단으로 별도 처리 보류) —
    `region_code` 는 숫자코드("100" 등, SUBSCRPT_AREA_CODE)로 저장되는데, 호출부
    (`routers/mb.py` `get_officetel_rental`)가 넘기는 `region` 은 한글 시도명
    ("서울" 등)이라 절대 매칭되지 않는다. `region` 을 넘기면 이 함수는 **항상
    빈 리스트**를 반환한다 — 오피스텔의 짝꿍 함수 `get_officetel_schedules()`
    (`db/mb_apartment_queries.py`, `region_name` 한글명 필터라 정상 동작)와
    비교하면 이 비대칭이 뚜렷하다. 고치려면 region_code → 한글 시도명 매핑
    테이블 추가 또는 region_code 컬럼 자체를 한글명으로 백필해야 하는데,
    왜 숫자코드로 저장하게 됐는지 원인 조사가 먼저 필요하다.
    """
    stmt = select(RentalScheduleOfficial).order_by(
        RentalScheduleOfficial.recruit_date.desc().nullslast()
    )
    if region:
        stmt = stmt.where(RentalScheduleOfficial.region_code == region)
    return list(db.execute(stmt).scalars().all())
