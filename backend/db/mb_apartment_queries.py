"""mibunyang 아파트 단지 · 미분양 · 분양 조회 쿼리"""

from typing import Literal, Optional

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from db.mb_models import (
    Apartment,
    ApplyhomeUnitSupply,
    OfficetelPresaleSchedule,
    PresaleScheduleOfficial,
    UnsoldHistory,
)
from db.mb_query_helpers import (
    _apply_keyword_filter,
    _paginate_deduped_apartments,
)

# presale_type 분류 (prod 실측 11종 전수 — 세션 314 워크플로 wf_0ed0ffe6 확증).
# PRIVATE∪PUBLIC = non-NULL presale_type 728단지 전량 → silent 누락 0.
# ⚠ in_() 정확일치라 1글자만 달라도 전건 누락 — prod DISTINCT 값 글자그대로 보존.
#   "시프트(장기전세)"는 반각괄호 U+0028/U+0029. "민간임대시행자임의"가 실제값("민간임대" 아님).
# 분류 기준 = 공급주체(민간회사 vs LH/SH 공공기관). 공공지원민간임대·장기민간임대는
#   정부지원받아도 공급주체가 민간이라 PRIVATE (사장님 확정 2026-06-17, 호갱노노 LH탭 정합).
# 신규 유형 추가 시 본 두 리스트 + tests/test_mb_presale.py partition 가드 동시 갱신.
PRIVATE_TYPES = ["민간분양", "민간임대시행자임의", "공공지원민간임대", "장기민간임대"]  # 507단지
PUBLIC_TYPES = [
    "공공분양", "국민임대", "영구임대", "행복주택",
    "공공임대5년", "공공임대6년", "시프트(장기전세)",
]  # 221단지

PresaleSortBy = Literal[
    "recruit_date_desc", "competition_rate_desc", "units_desc", "price_asc", "price_desc",
]


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

    return _paginate_deduped_apartments(db, conditions, sort_by, page, page_size)


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

    return _paginate_deduped_apartments(db, conditions, sort_by, page, page_size)


# ── 분양 단지 조회 ───────────────────────────────────────────


def _presale_sort_order(sort_by: str, recruit_col=None):
    """분양 정렬 키 → SQLAlchemy ORDER BY 절 (NULLS LAST 고정).

    recruit_date_desc 는 apartments.presale_move_in(입주월 Text, '미정' 혼재) 이 아니라
    presale_schedule_official.recruit_date(진짜 DATE 공고일)의 단지별 MAX 로 정렬해야
    의미가 맞다 — recruit_col 에 그 MAX 표현식(get_presale_page 가 서브쿼리로 주입)을 받는다.
    recruit_col 미주입 시(테스트·fallback) presale_min_price 기준으로 안전 폴백.

    ⚠ 반환은 [정렬절, Apartment.id.asc()] 리스트 — 동률 행(같은 max_recruit·NULL 다수 등)이
    OFFSET 페이지 경계에서 중복/누락되지 않도록 PK tie-break 고정 (세션 314 적대리뷰 결함1).
    """
    sort_map = {
        "competition_rate_desc": Apartment.competition_rate.desc().nullslast(),
        "units_desc": Apartment.units.desc().nullslast(),
        "price_asc": Apartment.presale_min_price.asc().nullslast(),
        "price_desc": Apartment.presale_min_price.desc().nullslast(),
    }
    if sort_by == "recruit_date_desc":
        primary = recruit_col.desc().nullslast() if recruit_col is not None else Apartment.presale_min_price.asc().nullslast()
    else:
        primary = sort_map.get(sort_by, Apartment.presale_min_price.asc().nullslast())
    return [primary, Apartment.id.asc()]


def get_presale_page(
    db: Session,
    presale_type: str = "all",
    stage: Optional[str] = None,
    region: Optional[str] = None,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "recruit_date_desc",
    keyword: Optional[str] = None,
) -> tuple[list[Apartment], int]:
    """분양 단지 목록 (presale_type 필터 + 정렬 + 페이지네이션).

    presale_type: "private"=민간분양 계열, "public"=공공(LH/SH) 계열, "all"=전체(presale_type 있는 것)
    recruit_date_desc 정렬은 presale_schedule_official.recruit_date 의 단지별 MAX 를
    LEFT JOIN(서브쿼리 1회 집계) 해 진짜 공고일로 내림차순. 차수 여러 행(984/859)이라
    단지당 MAX 집계 필수 — 직접 JOIN 시 행 폭증.
    """
    conditions: list = []

    if presale_type == "private":
        conditions.append(Apartment.presale_type.in_(PRIVATE_TYPES))
    elif presale_type == "public":
        conditions.append(Apartment.presale_type.in_(PUBLIC_TYPES))
    else:
        conditions.append(Apartment.presale_type.isnot(None))

    if stage:
        conditions.append(Apartment.presale_stage == stage)
    if region:
        conditions.append(Apartment.region == region)
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    where_clause = and_(*conditions)

    count_stmt = select(func.count()).select_from(Apartment).where(where_clause)
    total = db.execute(count_stmt).scalar() or 0

    # 단지별 최신 공고일(MAX recruit_date) 서브쿼리 — recruit_date_desc 정렬 전용
    recruit_subq = (
        select(
            PresaleScheduleOfficial.apartment_id.label("apt_id"),
            func.max(PresaleScheduleOfficial.recruit_date).label("max_recruit"),
        )
        .group_by(PresaleScheduleOfficial.apartment_id)
        .subquery()
    )

    order = _presale_sort_order(sort_by, recruit_col=recruit_subq.c.max_recruit)
    stmt = (
        select(Apartment)
        .outerjoin(recruit_subq, Apartment.id == recruit_subq.c.apt_id)
        .where(where_clause)
        .order_by(*order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(db.execute(stmt).scalars().all())
    return items, total


def get_presale_schedules(
    db: Session, apartment_id: str
) -> list[PresaleScheduleOfficial]:
    """단지의 청약홈 공식 분양 일정 전체 (차수별, recruit_date DESC)"""
    stmt = (
        select(PresaleScheduleOfficial)
        .where(PresaleScheduleOfficial.apartment_id == apartment_id)
        .order_by(PresaleScheduleOfficial.recruit_date.desc().nullslast())
    )
    return list(db.execute(stmt).scalars().all())


def get_officetel_schedules(
    db: Session, region: Optional[str] = None
) -> list[OfficetelPresaleSchedule]:
    """오피스텔·도시형 청약 일정 전체 (recruit_date DESC).

    V045 근본수정(2026-08-10): 아파트 청약 전용 테이블(PresaleScheduleOfficial)에
    apartment_id placeholder(`ah-{house_manage_no}`)로 끼워 넣던 방식을 폐기하고,
    완전히 독립된 OfficetelPresaleSchedule 테이블로 이전 — house_type 필터·
    apartments 매칭 게이트가 애초에 불필요해졌다(테이블 자체가 오피스텔 전용).

    region: region_name 필터 (get_rental_schedules 의 region_code 필터와 동일 패턴,
    단 이 테이블은 컬럼명이 region_name).
    2026-08-24 세션382 실측으로 구현 — OfficetelPresaleSchedule.region_name
    (SUBSCRPT_AREA_CODE_NM, "경기" 등)과 mibunyang Apartment.region 의 distinct
    값 17개(강원·경기·경남·경북·광주·대구·대전·부산·서울·세종·울산·인천·전남·
    전북·제주·충남·충북)를 prod DB 에서 직접 대조해 완전히 일치함을 확인했다 —
    "서울특별시" 같은 긴 표기는 존재하지 않는다. mojibake 위험도 이미 기각됨
    (위 §region_name 컬럼 주석 참조). 사장님 승인 후 착수(구 주석의 "별도 승인
    필요" 조건 충족).
    """
    stmt = select(OfficetelPresaleSchedule).order_by(
        OfficetelPresaleSchedule.recruit_date.desc().nullslast()
    )
    if region:
        stmt = stmt.where(OfficetelPresaleSchedule.region_name == region)
    return list(db.execute(stmt).scalars().all())


def get_unit_supplies(
    db: Session, apartment_id: str
) -> list[ApplyhomeUnitSupply]:
    """단지의 청약홈 평형별 공급정보 전체 (공급면적 ASC = 작은 평형부터).

    model_no('01','02'..) 는 Text 라 사전순 정렬 시 '10' < '2' 역전 → supply_area(면적) 기준이
    사용자 직관(작은 평수→큰 평수)에 맞고 dialect 무관. NULL 면적은 맨 뒤(차선 model_no).
    """
    stmt = (
        select(ApplyhomeUnitSupply)
        .where(ApplyhomeUnitSupply.apartment_id == apartment_id)
        .order_by(
            ApplyhomeUnitSupply.supply_area.asc().nullslast(),
            ApplyhomeUnitSupply.model_no.asc(),
        )
    )
    return list(db.execute(stmt).scalars().all())


def get_competition_page(
    db: Session,
    region: Optional[str] = None,
    gu: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    sort_by: str = "competition_rate_desc",
    keyword: Optional[str] = None,
) -> tuple[list[Apartment], int]:
    """분양결과(경쟁률) 단지 목록 — presale_stage 또는 competition_rate 있는 단지"""
    conditions: list = [
        or_(
            Apartment.presale_stage.isnot(None),
            Apartment.competition_rate.isnot(None),
        )
    ]
    if region:
        conditions.append(Apartment.region == region)
    if gu:
        conditions.append(Apartment.gu == gu)
    _apply_keyword_filter(conditions, keyword)

    where_clause = and_(*conditions)

    count_stmt = select(func.count()).select_from(Apartment).where(where_clause)
    total = db.execute(count_stmt).scalar() or 0

    # 분양결과 탭은 경쟁률·접수자수 정렬이 본질. recruit_date_desc 는 presale_move_in('미정' 혼재
    # Text) 결함을 상속하므로 제외 — 공고일순이 필요하면 /presale?sort_by=recruit_date_desc 사용.
    sort_map = {
        "competition_rate_desc": Apartment.competition_rate.desc().nullslast(),
        "applicants_desc": Apartment.competition_applicants.desc().nullslast(),
    }
    order = sort_map.get(sort_by, Apartment.competition_rate.desc().nullslast())

    stmt = (
        select(Apartment)
        .where(where_clause)
        # PK tie-break — 경쟁률 NULL/동률 단지가 OFFSET 페이지 경계에서 중복/누락 안 되게 (세션 314 결함1)
        .order_by(order, Apartment.id.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = list(db.execute(stmt).scalars().all())
    return items, total
