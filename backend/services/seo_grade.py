"""단지 색인 등급 — 검색엔진에 보일 단지 고르기 (세션 483 PR 3a · 설계 design-pr3 §2 · 결정 14).

- A = 아파트·재건축(APT·JGC)이고 정부 실거래 면적별 표(complex_area_trade_stats)에 최근 24개월 줄이 있음
- B = A 아님 + 공시가격(complex_official_prices) 또는 K-apt 관리비(kapt_management_costs)가 있음
- C = 그 밖(오피스텔·분양권은 전부 C)
- 지역 없음(cortar_no 가 10자리 숫자가 아니거나 시군구 이름을 모름) = has_region False → 등급과 무관하게 색인 안 함

판정 정의는 이 파일 한 곳(_grade_select + grade_info). 단건(grade_of_complex)·범위(grade_rows)·전체(compute_grades)가
같은 SQL 조각과 같은 분류 함수를 쓴다 — 페이지 robots 와 사이트맵이 어긋나지 않게(상가 교훈).
"""

from __future__ import annotations

from sqlalchemy import exists, or_, select
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


def _grade_select(since: str, *extra):
    has_a = exists().where(
        ComplexAreaTradeStat.complex_no == Complex.complex_no,
        ComplexAreaTradeStat.base_month >= since,
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
    stmt = _grade_select(since or grade_since(), *extra)
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
