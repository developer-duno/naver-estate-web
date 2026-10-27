"""단지 색인 등급 — 검색엔진에 보일 단지 고르기 (세션 483 PR 3a · 설계 design-pr3 §2 · 결정 14).

- A = 아파트·재건축(APT·JGC)이고 정부 실거래 면적별 표(complex_area_trade_stats)에 최근 24개월 **범위가 있는** 줄이 있음
  (직거래만 있는 달은 범위가 비어 근거가 못 된다 — _RANGE_ROW_*)
- B = A 아님 + 공시가격(complex_official_prices) 또는 K-apt 관리비(kapt_management_costs)가 있음
- C = 그 밖(오피스텔·분양권은 전부 C)
- 지역 없음(cortar_no 가 10자리 숫자가 아니거나 시군구 이름을 모름) = has_region False → 등급과 무관하게 색인 안 함

판정 정의는 이 파일 한 곳(_grade_select + grade_info). 단건(grade_of_complex)·범위(grade_rows)·전체(compute_grades)가
같은 SQL 조각과 같은 분류 함수를 쓴다 — 페이지 robots 와 사이트맵이 어긋나지 않게(상가 교훈).
"""

from __future__ import annotations

from sqlalchemy import exists, or_, select, text
from sqlalchemy.orm import Session

from crawler.metrics_helpers import _cutoff_month
from db.models import Complex, ComplexAreaTradeStat, ComplexOfficialPrice, KaptManagementCost
from db.region_stats_queries import region_display_name
from services.cache import get_cache

# B 등급 색인 스위치 — A 를 2~4주 관찰한 뒤 이 한 줄로 연다(설계 §2)
INDEX_GRADE_B = False
GRADE_TYPES = frozenset({"APT", "JGC"})
GRADE_WINDOW_MONTHS = 24
_ALL_GRADES_TTL = 86400


def grade_since(today=None) -> str:
    """A 판정 창의 첫 달 YYYYMM — 서버 기준 이번 달 포함 24달."""
    return _cutoff_month(GRADE_WINDOW_MONTHS, today)


_DIRECT = "직거래"   # area_price_queries.DIRECT_DEAL 과 같은 글자
_T = "complex_area_trade_stats.trades"
_PRICE_MIN = "complex_area_trade_stats.price_min"
# "그 달 줄에 범위가 있다" — 화면 범위 계산(gov_month_range)과 같은 뜻: trades 목록이 있으면 직거래 아닌 거래 1건 이상,
# 비어 있으면(옛 줄) price_min 있음. 직거래만 있는 달은 범위가 비므로 A 근거가 못 된다(세션 483 보완 F1 — 운영 619곳).
# PostgreSQL 은 jsonb 함수, 시험 DB(SQLite)는 json1 함수 — 같은 판정의 두 표기(domain-mapping-ssot 룰 3).
# 배열이 아닌 값에 길이·펼치기를 부르면 PG 가 오류를 내므로 CASE 로 먼저 거른다.
_RANGE_ROW_PG = f"""(
  (CASE WHEN jsonb_typeof({_T}::jsonb) = 'array' THEN jsonb_array_length({_T}::jsonb) ELSE 0 END > 0
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof({_T}::jsonb) = 'array' THEN {_T}::jsonb ELSE '[]'::jsonb END) e
        WHERE coalesce(trim(e->>'g'), '') <> '{_DIRECT}'))
  OR (CASE WHEN jsonb_typeof({_T}::jsonb) = 'array' THEN jsonb_array_length({_T}::jsonb) ELSE 0 END = 0
      AND {_PRICE_MIN} IS NOT NULL))"""
_RANGE_ROW_SQLITE = f"""(
  (CASE WHEN json_type({_T}) = 'array' THEN json_array_length({_T}) ELSE 0 END > 0
    AND EXISTS (SELECT 1 FROM json_each(CASE WHEN json_type({_T}) = 'array' THEN {_T} ELSE '[]' END) e
        WHERE coalesce(trim(json_extract(e.value, '$.g')), '') <> '{_DIRECT}'))
  OR (CASE WHEN json_type({_T}) = 'array' THEN json_array_length({_T}) ELSE 0 END = 0
      AND {_PRICE_MIN} IS NOT NULL))"""


def _range_row_condition(dialect: str):
    return text(_RANGE_ROW_PG if dialect == "postgresql" else _RANGE_ROW_SQLITE)


def _grade_select(since: str, *extra, dialect: str = "postgresql"):
    has_a = exists().where(
        ComplexAreaTradeStat.complex_no == Complex.complex_no,
        ComplexAreaTradeStat.base_month >= since,
        _range_row_condition(dialect),
    )
    has_b = or_(
        exists().where(ComplexOfficialPrice.complex_no == Complex.complex_no),
        exists().where(KaptManagementCost.complex_no == Complex.complex_no),
    )
    return select(
        Complex.complex_no,
        Complex.cortar_no,
        Complex.real_estate_type_code,
        has_a.label("has_a"),
        has_b.label("has_b"),
        *extra,
    )


def has_region(cortar_no: str | None) -> bool:
    """법정동 10자리 숫자이고 앞 5자리 시군구 이름을 아는가(빵부스러기·허브에 붙을 수 있나)."""
    if not cortar_no or len(cortar_no) != 10 or not cortar_no.isdigit():
        return False
    return region_display_name(cortar_no[:5]) is not None


def classify(type_code: str | None, has_a, has_b) -> str:
    if type_code not in GRADE_TYPES:
        return "C"
    if has_a:
        return "A"
    if has_b:
        return "B"
    return "C"


def grade_info(type_code: str | None, cortar_no: str | None, has_a, has_b) -> dict:
    """{"grade","indexable","has_region"} — 색인 여부의 유일한 판정."""
    grade = classify(type_code, has_a, has_b)
    region = has_region(cortar_no)
    indexable = region and (grade == "A" or (grade == "B" and INDEX_GRADE_B))
    return {"grade": grade, "indexable": indexable, "has_region": region}


def info_of_row(row) -> dict:
    return grade_info(row.real_estate_type_code, row.cortar_no, row.has_a, row.has_b)


def grade_rows(db: Session, *where, extra=(), since: str | None = None) -> list:
    """조건에 맞는 단지 줄(번호·지역·유형·has_a·has_b + extra 칸). 등급은 info_of_row 로."""
    bind = db.get_bind()
    stmt = _grade_select(since or grade_since(), *extra, dialect=bind.dialect.name if bind is not None else "")
    if where:
        stmt = stmt.where(*where)
    return list(db.execute(stmt).all())


def grade_of_complex(db: Session, complex_no: str) -> dict | None:
    """단지 하나의 등급(EXISTS 단건) — 없는 단지면 None."""
    rows = grade_rows(db, Complex.complex_no == complex_no)
    return info_of_row(rows[0]) if rows else None


def compute_grades(db: Session) -> dict[str, dict]:
    """전체 단지 {번호: 등급} — 한 번에 계산해 메모리 1일 캐시(키 = 판정 창 첫 달).

    계산이 실패하면 예외 그대로(빈 목록을 캐시에 굳히지 않는다 — error-propagation).
    돌려주는 dict 는 캐시 안 객체라 바꾸지 말 것.
    """
    since = grade_since()
    cache = get_cache("seo_grades", ttl=_ALL_GRADES_TTL, max_size=4)
    key = f"all:{since}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    result = {row.complex_no: info_of_row(row) for row in grade_rows(db, since=since)}
    cache.set(key, result)
    return result


def _no_order(no: str):
    return (len(no), no)


def sitemap_ids(db: Session, grade: str) -> list[str]:
    """사이트맵에 넣을 단지 번호 — 그 등급이고 indexable 인 단지만, 번호 순."""
    grades = compute_grades(db)
    return sorted((no for no, g in grades.items() if g["indexable"] and g["grade"] == grade), key=_no_order)
