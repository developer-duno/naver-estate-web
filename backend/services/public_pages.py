"""검색엔진용 공개 페이지 재료 — 단지 공개 요약 · 시군구 허브 · 동 페이지 (세션 483 PR 3a, design-pr3 v2).

인증 없이 부른다. **화면에 보이는 칸만** 싣는다(허용 목록 — 좌표·이 단지 중위값·네이버 재료 칸 0, v2 🟡).
계산은 기존 함수를 그대로 쓴다: 면적 범위 = public_price_history(직거래 제외 gov_month_range) · 공시가격 =
get_complex_official_prices + official_price_payload · 관리비 = get_latest_kapt_cost · 지하철 = nearest_stations ·
지역 추이 = region_trend · 동네 = build_neighborhood. 등급은 services/seo_grade 한 곳.

캐시(메모리): 요약 1시간·단지 번호별 · 허브·동 페이지 1일. 키에 기준월(basis_ym)을 넣는다 — 계산 창이 달마다 바뀌므로.
"""

from __future__ import annotations

import logging
import math
from datetime import date
from types import SimpleNamespace

from sqlalchemy import func, select, text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from crawler.area_group import load_pyeong_tables
from crawler.metrics_helpers import _cutoff_month
from crawler.region_match import region_codes, sido_name_of_region
from crawler.utils import haversine_km
from db import queries
from db.area_price_queries import AREA_PRICE_MONTHS, gov_month_range, recent_area_prices_and_ranges
from db.models import Complex, ComplexAreaTradeStat, ComplexOfficialPrice
from db.price_queries import BASELINE_MONTHS
from db.public_complex_queries import is_missing_schema_error, public_price_history, region_trend
from db.region_stats_queries import region_display_name
from db.sgis_queries import build_neighborhood, get_sgis_neighborhood_items
from services.cache import get_cache
from services.seo_grade import grade_of_complex, grade_rows, info_of_row

logger = logging.getLogger(__name__)

SUMMARY_TTL = 3600
PAGE_TTL = 86400
NEARBY_MAX = 12
DONG_PAGE_MIN = 10          # 동 페이지 = 자료 있는 단지(A·B) 10곳 이상(결정 19)
_IN_CHUNK = 500

SUBWAY_RADIUS_KM = 3.0
SUBWAY_MAX_STATIONS = 3

# 공개 요약에 싣는 단지 기본 칸 — 응답 이름: 단지 칸(허용 목록. 여기 없는 칸은 응답에 못 나간다)
SUMMARY_BASE_FIELDS = {
    "complex_no": "complex_no",
    "name": "complex_name",
    "real_estate_type": "real_estate_type_code",
    "household_count": "total_household_count",
    "building_count": "total_dong_count",
    "parking_count": "total_parking_count",
}


# ── 기존 라우트에서 떼어 낸 계산(동작 같음) ─────────────────────────────────


def normalize_station_name(name: str) -> str:
    """역명 끝의 "역" 접미사를 뗀 묶음 키 — 원본이 "선릉"/"선릉역" 을 섞어 써서(라이브 실측: 역삼IPARK).

    떼어낸 결과가 한 글자 이하면 원본 유지("역" 단독 역명 방어). 호출부가 3km 반경으로 먼저 거른 뒤 묶어
    동명이역 충돌은 실제로 없다(실측 51쌍 전부 4~376m 환승역).
    """
    if name.endswith("역"):
        stripped = name[:-1]
        if len(stripped) > 1:
            return stripped
    return name


def nearest_stations(db: Session, cpx) -> list[dict]:
    """단지 반경 3km 안 가까운 역 최대 3곳 [{station_name, lines, distance_m}] — 좌표 없으면 []."""
    if cpx.latitude is None or cpx.longitude is None:
        return []
    grouped: dict[str, dict] = {}
    for station in queries.get_all_subway_stations(db):
        distance_km = haversine_km(cpx.latitude, cpx.longitude, station.latitude, station.longitude)
        if distance_km > SUBWAY_RADIUS_KM:
            continue
        key = normalize_station_name(station.station_name)
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = {"distance_km": distance_km, "lines": {station.line_name}}
        else:
            entry["distance_km"] = min(entry["distance_km"], distance_km)
            entry["lines"].add(station.line_name)
    nearest = sorted(grouped.items(), key=lambda item: item[1]["distance_km"])[:SUBWAY_MAX_STATIONS]
    return [
        {"station_name": name, "lines": sorted(entry["lines"]), "distance_m": round(entry["distance_km"] * 1000)}
        for name, entry in nearest
    ]


def official_price_payload(complex_no: str, rows) -> dict:
    """공시가격 행들 → {complex_no, year(최신), items[{prvuse_ar, price_median, ho_count}] 면적 순}."""
    years = {r.stdr_year for r in rows}
    latest_year = max(years) if years else None
    return {
        "complex_no": complex_no,
        "year": latest_year,
        "items": sorted(
            (
                {"prvuse_ar": float(r.prvuse_ar), "price_median": r.price_median, "ho_count": r.ho_count}
                for r in rows
                if r.stdr_year == latest_year
            ),
            key=lambda item: item["prvuse_ar"],
        ),
    }


# ── 작은 도우미 ────────────────────────────────────────────────────────────


def basis_ym(today: date | None = None) -> str:
    """서버가 정한 기준월 "2026-10" — 화면의 '최근 6개월'·'최근 2년' 창이 이 달 기준."""
    today = today or date.today()
    return f"{today.year:04d}-{today.month:02d}"


def dong_name_of(cortar_address: str | None) -> str | None:
    """법정동 이름 = cortar_address 끝 낱말("경기도 화성시 동탄구 신동" → "신동") — dong 칸은 10%만 채워져 있다."""
    if not cortar_address:
        return None
    parts = cortar_address.split()
    return parts[-1] if parts else None


def use_approve_year(ymd: str | None) -> int | None:
    if not ymd or len(ymd) < 4 or not ymd[:4].isdigit():
        return None
    return int(ymd[:4])


def _no_order(no: str):
    return (len(no), no)


def card_sort_key(card: dict):
    """A 먼저 → B → C · 세대수 큰 순(모르면 뒤) · 번호 순(고정)."""
    rank = {"A": 0, "B": 1}.get(card["grade"], 2)
    return (rank, -(card["household_count"] or 0), _no_order(card["complex_no"]))


def _chunks(seq: list, n: int = _IN_CHUNK):
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


OFFICIAL_AREA_TOLERANCE_M2 = 1   # 화면 officialForArea 의 ±1㎡ 와 같은 값


def _pick_official(items: list[dict], rep_area: int | None) -> dict | None:
    """화면과 같은 규칙(frontend/src/components/complex/consumer/consumer-format.ts officialForArea·representativeOfficial):
    대표 면적이 있으면 ±1㎡ 안에서 가장 가까운 항목(없으면 None — 다른 면적 값을 '공시가격'으로 보이지 않게),
    대표 면적이 없으면 호수가 가장 많은 항목(같으면 앞 — items 는 면적 오름차순)."""
    if not items:
        return None
    if rep_area is not None:
        near = [it for it in items if abs(it["prvuse_ar"] - rep_area) <= OFFICIAL_AREA_TOLERANCE_M2]
        return min(near, key=lambda it: abs(it["prvuse_ar"] - rep_area)) if near else None
    return max(items, key=lambda it: it["ho_count"] or 0)


# ── 단지 묶음 카드(같은 동 단지·허브·동 페이지 공용) ──────────────────────────

_CARD_EXTRA = (Complex.complex_name, Complex.total_household_count, Complex.rep_area_m2,
               Complex.use_approve_ymd, Complex.cortar_address)


def _rep_recent6(db: Session, rows) -> dict[str, tuple[int, int]]:
    """{단지 번호: (최근 6개월 대표 면적 최저, 최고)} — 직거래 제외(gov_month_range). 한 번에 몇 백 곳씩."""
    rep = {r.complex_no: r.rep_area_m2 for r in rows if r.rep_area_m2 is not None}
    out: dict[str, list[int]] = {}
    cutoff = _cutoff_month(AREA_PRICE_MONTHS)
    for part in _chunks(list(rep)):
        stats = db.execute(
            select(ComplexAreaTradeStat.complex_no, ComplexAreaTradeStat.area_m2, ComplexAreaTradeStat.price_min,
                   ComplexAreaTradeStat.price_max, ComplexAreaTradeStat.trade_count, ComplexAreaTradeStat.trades)
            .join(Complex, Complex.complex_no == ComplexAreaTradeStat.complex_no)
            .where(ComplexAreaTradeStat.complex_no.in_(part), ComplexAreaTradeStat.base_month >= cutoff,
                   ComplexAreaTradeStat.area_m2 == Complex.rep_area_m2)
        ).all()
        for no, area, low, high, count, trades in stats:
            if area != rep.get(no):
                continue
            lower, upper, _n = gov_month_range(low, high, trades, count)
            if lower is None or upper is None:
                continue
            out.setdefault(no, []).extend((lower, upper))
    return {no: (min(v), max(v)) for no, v in out.items()}


def _official_by_complex(db: Session, rows) -> dict[str, int]:
    """{단지 번호: 대표 면적 공시가격(원)} — 최신 연도에서 _pick_official."""
    rep = {r.complex_no: r.rep_area_m2 for r in rows}
    grouped: dict[str, list] = {}
    for part in _chunks(list(rep)):
        for r in db.execute(
            select(ComplexOfficialPrice.complex_no, ComplexOfficialPrice.stdr_year, ComplexOfficialPrice.prvuse_ar,
                   ComplexOfficialPrice.price_median, ComplexOfficialPrice.ho_count)
            .where(ComplexOfficialPrice.complex_no.in_(part))
        ).all():
            grouped.setdefault(r.complex_no, []).append(r)
    out: dict[str, int] = {}
    for no, prs in grouped.items():
        items = official_price_payload(no, prs)["items"]
        pick = _pick_official(items, rep.get(no))
        if pick is not None:
            out[no] = pick["price_median"]
    return out


def build_cards(db: Session, rows, with_year: bool = False) -> list[dict]:
    """grade_rows(extra=_CARD_EXTRA) 줄들 → 카드 목록(정렬 전). 화면 작은 글씨 재료만."""
    if not rows:
        return []
    ranges = _rep_recent6(db, rows)
    officials = _official_by_complex(db, rows)
    cards = []
    for r in rows:
        rng = ranges.get(r.complex_no)
        card = {
            "complex_no": r.complex_no,
            "name": r.complex_name,
            "grade": info_of_row(r)["grade"],
            "household_count": r.total_household_count,
            "rep_area_key": r.rep_area_m2,
            "recent6_min": rng[0] if rng else None,
            "recent6_max": rng[1] if rng else None,
            "official_price": officials.get(r.complex_no),
        }
        if with_year:
            card["use_approve_year"] = use_approve_year(r.use_approve_ymd)
        cards.append(card)
    return cards


def _scope_rows(db: Session, prefix: str) -> list:
    """법정동(10자리) 또는 시군구(5자리) 안 단지 줄 — 등급 칸 + 카드 칸."""
    cond = Complex.cortar_no == prefix if len(prefix) == 10 else Complex.cortar_no.startswith(prefix)
    return grade_rows(db, cond, extra=_CARD_EXTRA)


def _is_ab(row) -> bool:
    return info_of_row(row)["grade"] in ("A", "B")


# ── 단지 공개 요약 ─────────────────────────────────────────────────────────


def _area_ranges(db: Session, complex_no: str) -> list[dict]:
    """면적별 최근 6개월·2년 범위 — 면적마다 public_price_history(직거래 제외) 재사용."""
    since = _cutoff_month(BASELINE_MONTHS)
    cutoff6 = _cutoff_month(AREA_PRICE_MONTHS)
    areas = sorted(
        a for (a,) in db.execute(
            select(ComplexAreaTradeStat.area_m2).distinct()
            .where(ComplexAreaTradeStat.complex_no == complex_no, ComplexAreaTradeStat.base_month >= since)
        ).all()
    )
    out = []
    for area in areas:
        hist = public_price_history(db, complex_no, area)
        recent = [m for m in hist["months"] if m["month"] >= cutoff6]
        recent6 = None
        if recent:
            recent6 = {"min": min(m["price_min"] for m in recent), "max": max(m["price_max"] for m in recent),
                       "count": sum(m["trade_count"] or 0 for m in recent)}
        if recent6 is None and hist["two_year"] is None:
            continue
        out.append({"area_key": area, "exclusive_area": area, "recent6": recent6, "recent24": hist["two_year"]})
    return out


def _kapt_cost(db: Session, complex_no: str) -> dict | None:
    """최신 관리비 {ym, monthly_total} — monthly_total = 세대당 한 달 관리비(cost_per_household, 화면 '한 달 관리비'와 같은 값)."""
    row = queries.get_latest_kapt_cost(db, complex_no)
    if row is None:
        return None
    cost, _mapping = row
    if cost is None or cost.cost_per_household is None:
        return None
    return {"ym": cost.cost_month, "monthly_total": cost.cost_per_household}


def _name_dups(db: Session, cpx) -> tuple[str, str]:
    """(name_dup_scope, title_suffix) — 제목 꼬리를 서버가 정한다(세션 483 보완 F2 · 설계 v2 🟡 제목 규칙).

    name_dup_scope: 같은 법정동 안 같은 이름 → "dong" · 같은 시군구 안 → "sigungu" · 없음 → "none".
    title_suffix: "none"(시군구 안 동명 없음) · "dong"(시군구 안 동명, 같은 동엔 없음 → "(동)") ·
    "dong_households"(같은 동 동명 전부와 세대수가 다름 → "(동 N세대)") · "dong_year"(세대수로 못 가르고 사용승인 연도가
    전부와 다름 → "(동 YYYY년)") · "dong_no"(그것도 같음 → 단지 번호). 세대수·연도를 모르면(None) 그 단계로 못 가른다.
    """
    cortar = cpx.cortar_no
    if not cortar or len(cortar) != 10:
        return "none", "none"
    others = db.execute(
        select(Complex.cortar_no, Complex.total_household_count, Complex.use_approve_ymd).where(
            Complex.complex_name == cpx.complex_name,
            Complex.complex_no != cpx.complex_no,
            Complex.cortar_no.startswith(cortar[:5]),
        )
    ).all()
    if not others:
        return "none", "none"
    same_dong = [o for o in others if o.cortar_no == cortar]
    if not same_dong:
        return "sigungu", "dong"
    hh = cpx.total_household_count
    if hh is not None and all(o.total_household_count != hh for o in same_dong):
        return "dong", "dong_households"
    year = use_approve_year(cpx.use_approve_ymd)
    if year is not None and all(use_approve_year(o.use_approve_ymd) != year for o in same_dong):
        return "dong", "dong_year"
    return "dong", "dong_no"


def _sigungu_candidates(db: Session, sigungu5: str) -> list:
    """같은 시군구의 가까운 단지 후보(A·B · 지역 온전 · 좌표 있음) 줄 — 1일 캐시(키 = 시군구:기준월).

    요약마다 시군구 전체를 다시 읽지 않게(결정 27 · PR 3a-2). 조회 실패는 예외 그대로(캐시에 굳히지 않음 — F5 원칙).
    """
    key = f"{sigungu5}:{basis_ym()}"
    cache = get_cache("region_nearby_candidates", ttl=PAGE_TTL, max_size=300)
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = grade_rows(db, Complex.cortar_no.startswith(sigungu5),
                      extra=_CARD_EXTRA + (Complex.latitude, Complex.longitude))
    cands = [r for r in rows
             if _is_ab(r) and info_of_row(r)["has_region"] and r.latitude is not None and r.longitude is not None]
    cache.set(key, cands)
    return cands


def round_10m(distance_km: float) -> int:
    """거리(km) → 10m 단위 반올림 정수 미터(반은 올림)."""
    return int(math.floor(distance_km * 100 + 0.5)) * 10


def _nearby(db: Session, cpx, region: bool) -> tuple[list[dict], str | None, int]:
    """(가까운 단지 카드 최대 12, 범위, 그 동 단지 수).

    결정 27(10-27): 같은 시군구 A·B 단지 중 자기 좌표에서 가까운 순 12곳 — 범위 "near", 카드마다 distance_m.
    같은 거리면 번호 순. 자기·C·좌표 없는 후보는 뺀다. 자기 좌표가 없으면 옛 방식(같은 동 → 없으면 같은 시군구,
    A → 세대수 → 번호) — 범위 "dong"/"sigungu". 세 번째 값 = 그 동의 단지 수(C 포함, 동 페이지 목록과 같은 dong_flags
    판정 — 화면 '{동} 단지 전체 보기' 용).
    """
    if not region:
        return [], None, 0
    dong_total = dong_flags(db, cpx.cortar_no[:5])["dongs"].get(cpx.cortar_no, {}).get("complex_count", 0)
    if cpx.latitude is not None and cpx.longitude is not None:
        scored = sorted(
            ((haversine_km(cpx.latitude, cpx.longitude, r.latitude, r.longitude), r)
             for r in _sigungu_candidates(db, cpx.cortar_no[:5]) if r.complex_no != cpx.complex_no),
            key=lambda item: (item[0], _no_order(item[1].complex_no)),
        )[:NEARBY_MAX]
        cards = {c["complex_no"]: c for c in build_cards(db, [r for _d, r in scored])}
        return [{**cards[r.complex_no], "distance_m": round_10m(d)} for d, r in scored], "near", dong_total
    dong_rows = _scope_rows(db, cpx.cortar_no)
    cands = [r for r in dong_rows if _is_ab(r) and r.complex_no != cpx.complex_no]
    scope = "dong"
    if not cands:
        scope = "sigungu"
        cands = [r for r in _scope_rows(db, cpx.cortar_no[:5]) if _is_ab(r) and r.complex_no != cpx.complex_no]
    cards = sorted(build_cards(db, cands), key=card_sort_key)
    return cards[:NEARBY_MAX], scope, dong_total


def _rep_area_key(db: Session, cpx) -> int | None:
    """요약 기본 면적 — 화면 defaultArea(frontend/src/components/complex/consumer/ConsumerComplexView.tsx) 와 같은 규칙.

    대표 면적(rep_area_m2)에 최근 6개월 범위가 있으면 그것 → 범위 있는 면적 중 면적 목록 순서(대표 먼저 → 6개월 거래 수
    많은 순 → 작은 면적, summarize_area_prices 와 같은 정렬) 첫 면적 → 대표 면적 → 평형표 첫 면적(작은 순) → None.
    (평형표에만 있는 면적은 거래가 없어 범위가 없으므로 앞 단계 결과는 화면과 같다.)
    """
    prices, ranges = recent_area_prices_and_ranges(db, cpx.complex_no)
    rep = cpx.rep_area_m2
    if rep is not None and ranges.get(rep):
        return rep
    ordered = sorted(prices, key=lambda a: (a != rep, -len(prices[a]), a))
    ranged = next((a for a in ordered if ranges.get(a)), None)
    if ranged is not None:
        return ranged
    if rep is not None:
        return rep
    if ordered:
        return ordered[0]
    table = load_pyeong_tables(db, [cpx.complex_no]).get(cpx.complex_no, [])
    areas = sorted({area for _pno, area, _hh in table if area is not None})
    return areas[0] if areas else None


def _data_last_ym(db: Session, complex_no: str) -> str | None:
    """그 단지 정부 실거래 자료의 마지막 달 "YYYYMM"(없으면 None) — 화면 '기준월' 줄용(basis_ym 은 오늘 달)."""
    return db.execute(
        select(func.max(ComplexAreaTradeStat.base_month)).where(ComplexAreaTradeStat.complex_no == complex_no)
    ).scalar()


def _dong_has_page(db: Session, cpx) -> bool:
    """동 페이지가 있나 — 동 페이지(dong_page)와 **같은 캐시된 판정**(dong_flags)에서 읽는다(수명 어긋남으로 링크가 404 가
    되지 않게, F9). 지역 추이를 부르지 않는다 — 추이 실패가 요약으로 번지지 않게(F12)."""
    flags = dong_flags(db, cpx.cortar_no[:5])
    return bool(flags["dongs"].get(cpx.cortar_no, {}).get("has_page"))


def _breadcrumb(cpx, region: bool, dong_has_page: bool) -> dict | None:
    if not region:
        return None
    sgg = cpx.cortar_no[:5]
    return {
        "sido": sido_name_of_region(sgg),
        "sigungu_code": sgg,
        "sigungu_name": region_display_name(sgg),
        "dong_code": cpx.cortar_no,
        "dong_name": dong_name_of(cpx.cortar_address),
        "dong_has_page": dong_has_page,
    }


def public_summary(db: Session, complex_no: str) -> dict | None:
    """GET /api/complexes/{no}/public-summary 본문 — 없는 단지면 None(→ 404). 1시간 캐시."""
    ym = basis_ym()
    cache = get_cache("public_summary", ttl=SUMMARY_TTL, max_size=5000)
    key = f"{complex_no}:{ym}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    cpx = queries.get_complex_by_no(db, complex_no)
    if cpx is None:
        return None
    grade = grade_of_complex(db, complex_no)
    region = grade["has_region"]
    nearby, scope, total = _nearby(db, cpx, region)
    official = official_price_payload(complex_no, queries.get_complex_official_prices(db, complex_no))
    dup_scope, title_suffix = _name_dups(db, cpx) if region else ("none", "none")
    result = {
        **{out: getattr(cpx, col) for out, col in SUMMARY_BASE_FIELDS.items()},
        "use_approve_year": use_approve_year(cpx.use_approve_ymd),
        "rep_area_key": _rep_area_key(db, cpx),
        **grade,
        "breadcrumb": _breadcrumb(cpx, region, _dong_has_page(db, cpx) if region else False),
        "name_dup_scope": dup_scope,
        "title_suffix": title_suffix,
        "basis_ym": ym,
        "data_last_ym": _data_last_ym(db, complex_no),
        "area_ranges": _area_ranges(db, complex_no),
        "official_price": {"year": official["year"], "items": official["items"]} if official["year"] else None,
        "kapt_cost": _kapt_cost(db, complex_no),
        "subway": nearest_stations(db, cpx),
        "nearby": nearby,
        "nearby_scope": scope,
        "nearby_total": total,
    }
    cache.set(key, result)
    return result


# ── 시군구 허브 · 동 페이지 ─────────────────────────────────────────────────
# 동 페이지·색인 판정은 dong_flags 한 곳(1일 캐시, 지역 추이와 분리 — F12). 요약 dong_has_page · 동 페이지 404 ·
# 허브 dongs[].has_page/indexable · 허브 indexable · sitemap-codes 가 모두 이 캐시를 읽는다(F9 "같은 판정").
# 동 페이지 = A·B 10곳 이상 · 색인 = indexable 단지 1곳 이상.


def _dong_has_page_rows(rows) -> bool:
    return sum(1 for r in rows if _is_ab(r)) >= DONG_PAGE_MIN


def _any_indexable(rows) -> bool:
    return any(info_of_row(r)["indexable"] for r in rows)


def _flags_from_rows(rows) -> dict:
    """한 시군구 단지 줄들 → {"indexable", "dongs": {동10: {dong_name, has_page, indexable, complex_count}}} (지역 온전한 줄만)."""
    by_dong: dict[str, list] = {}
    for r in rows:
        if info_of_row(r)["has_region"]:
            by_dong.setdefault(r.cortar_no, []).append(r)
    dongs = {}
    for code, drows in by_dong.items():
        has_page = _dong_has_page_rows(drows)
        dongs[code] = {
            "dong_name": dong_name_of(drows[0].cortar_address),
            "has_page": has_page,
            "indexable": has_page and _any_indexable(drows),
            "complex_count": len(drows),
        }
    return {"indexable": any(_any_indexable(d) for d in by_dong.values()), "dongs": dongs}


def _flags_cache():
    return get_cache("region_dong_flags", ttl=PAGE_TTL, max_size=300)


def dong_flags(db: Session, sigungu5: str) -> dict:
    """그 시군구의 동 페이지·색인 판정 — 1일 캐시(키 = 시군구:기준월). 지역 추이는 부르지 않는다."""
    key = f"{sigungu5}:{basis_ym()}"
    cache = _flags_cache()
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = grade_rows(db, Complex.cortar_no.startswith(sigungu5), extra=(Complex.cortar_address,))
    flags = _flags_from_rows(rows)
    cache.set(key, flags)
    return flags


def _hub_base(db: Session, sigungu5: str, name: str) -> dict | None:
    """허브의 판정 없는 몸통(동별 단지 카드·지역 추이) — 1일 캐시. 지역 추이가 연결 오류·시간 초과면 예외(F5)."""
    ym = basis_ym()
    cache = get_cache("region_hub", ttl=PAGE_TTL, max_size=300)
    key = f"{sigungu5}:{ym}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    rows = [r for r in _scope_rows(db, sigungu5) if info_of_row(r)["has_region"]]
    if not rows:
        return None
    cards = {c["complex_no"]: c for c in build_cards(db, rows, with_year=True)}
    by_dong: dict[str, list] = {}
    for r in rows:
        by_dong.setdefault(r.cortar_no, []).append(r)
    dongs = [
        {
            "dong_code": code,
            "dong_name": dong_name_of(drows[0].cortar_address),
            "complex_count": len(drows),
            "complexes": sorted((cards[r.complex_no] for r in drows), key=card_sort_key),
        }
        for code, drows in by_dong.items()
    ]
    dongs.sort(key=lambda d: (-d["complex_count"], d["dong_code"]))
    trend = region_trend(db, SimpleNamespace(cortar_no=sigungu5 + "00000"), raise_errors=True)
    base = {
        "sigungu_code": sigungu5,
        "sido": sido_name_of_region(sigungu5),
        "sigungu_name": name,
        "complex_count": len(rows),
        "region_trend": trend,
        "dongs": dongs,
    }
    cache.set(key, base)
    return base


def region_hub(db: Session, sigungu5: str) -> dict | None:
    """GET /api/regions/{sigungu5}/hub 본문 — 이름 모르는 코드·단지 0 이면 None(→ 404).

    몸통(_hub_base, 1일 캐시) + 판정(dong_flags, 1일 캐시)을 요청마다 합친다 — has_page·indexable 은 늘 dong_flags 값.
    dongs[] 는 단지 많은 동 먼저 · 각 동 단지 목록은 C 단지까지 둔다(손님 탐색용 — 그 단지 페이지는 noindex).
    지역 추이 실패는 예외 그대로(허브만 503 — 요약·동 페이지는 추이를 안 부른다).
    """
    name = region_display_name(sigungu5)
    if name is None:
        return None
    base = _hub_base(db, sigungu5, name)
    if base is None:
        return None
    flags = dong_flags(db, sigungu5)
    dongs = []
    for d in base["dongs"]:
        f = flags["dongs"].get(d["dong_code"], {})
        dongs.append({
            "dong_code": d["dong_code"],
            "dong_name": d["dong_name"],
            "has_page": bool(f.get("has_page")),
            "indexable": bool(f.get("indexable")),
            "complex_count": d["complex_count"],
            "complexes": d["complexes"],
        })
    return {
        "sigungu_code": base["sigungu_code"],
        "sido": base["sido"],
        "sigungu_name": base["sigungu_name"],
        "indexable": flags["indexable"],
        "complex_count": base["complex_count"],
        "region_trend": base["region_trend"],
        "dongs": dongs,
    }


def _dong_neighborhood(db: Session, dong10: str) -> list[dict]:
    """그 법정동 단지들이 붙은 SGIS 행정동마다 동네 자료 — [{emd_cd, emd_name, …build_neighborhood 칸}].

    동네 자료는 행정동(8자리) 키라 법정동과 1:1 이 아니다(10-27 실측: 동 페이지 1,091 중 행정동 1개 572 · 여럿 519)
    → 행정동별 목록(메인 판정 10-27). 순서 = 그 동 단지가 많이 붙은 행정동 먼저 → 코드 순. 행정동 이름은
    sgis_area_stats 의 adm_nm(build_neighborhood 의 emd_nm). 자료 없는 행정동(총인구 행 없음)은 뺀다. 0개면 [].
    칸·표가 아예 없는 DB(시험·V071 전)만 [] 로 두고, 연결 오류·시간 초과는 그대로 올린다(1일 캐시에 굳히지 않게 — F5).
    """
    try:
        with db.begin_nested():
            rows = db.execute(
                text("SELECT sgis_emd_cd, count(*) FROM complexes WHERE cortar_no = :d AND sgis_emd_cd IS NOT NULL"
                     " GROUP BY sgis_emd_cd"),
                {"d": dong10},
            ).all()
            out = []
            for code, _n in sorted(rows, key=lambda r: (-r[1], r[0])):
                hood = build_neighborhood(code, get_sgis_neighborhood_items(db, code))
                if hood is not None:
                    out.append({"emd_cd": code, "emd_name": hood.get("emd_nm"), **hood})
            return out
    except (ProgrammingError, OperationalError) as e:
        if not is_missing_schema_error(e):
            raise
        logger.warning("동 페이지 동네 자료 표·칸이 없어 비워요: %s", type(e).__name__)
        return []


def dong_page(db: Session, sigungu5: str, dong10: str) -> dict | None:
    """GET /api/regions/{sigungu5}/dongs/{dong10} 본문 — 시작이 안 맞음·A·B 10곳 미만이면 None(→ 404).

    404 판정·indexable·다른 동 목록은 요청마다 dong_flags(캐시)에서, 단지 목록·동네 자료만 1일 캐시. 지역 추이 안 부름(F12).
    """
    if not dong10.startswith(sigungu5):
        return None
    name = region_display_name(sigungu5)
    if name is None:
        return None
    flags = dong_flags(db, sigungu5)
    mine = flags["dongs"].get(dong10)
    if mine is None or not mine["has_page"]:
        return None
    ym = basis_ym()
    cache = get_cache("region_dong", ttl=PAGE_TTL, max_size=2000)
    key = f"{dong10}:{ym}"
    body = cache.get(key)
    if body is None:
        rows = [r for r in _scope_rows(db, dong10) if info_of_row(r)["has_region"]]
        body = {
            "complexes": sorted(build_cards(db, rows, with_year=True), key=card_sort_key),
            "neighborhood": _dong_neighborhood(db, dong10),
        }
        cache.set(key, body)
    siblings = sorted(
        ((code, f) for code, f in flags["dongs"].items() if f["has_page"] and code != dong10),
        key=lambda item: (-item[1]["complex_count"], item[0]),
    )
    return {
        "dong_code": dong10,
        "dong_name": mine["dong_name"],
        "sido": sido_name_of_region(sigungu5),
        "sigungu_code": sigungu5,
        "sigungu_name": name,
        "indexable": mine["indexable"],
        "complexes": body["complexes"],
        "neighborhood": body["neighborhood"],
        "sibling_dongs": [{"dong_code": code, "dong_name": f["dong_name"]} for code, f in siblings],
    }


def region_sitemap_codes(db: Session) -> dict:
    """GET /api/regions/sitemap-codes 본문 — {"hubs":[색인 대상 시군구5…], "dongs":[색인 대상이고 페이지 있는 동10…]}.

    dong_flags 캐시를 그대로 읽는다(페이지와 같은 판정). 비어 있는 시군구만 전체 단지 한 번 읽기로 채운다 —
    이미 캐시된 시군구는 그 값을 쓴다(페이지가 보는 값과 어긋나지 않게). 실패는 예외 그대로(빈 목록을 굳히지 않는다).
    """
    ym = basis_ym()
    cache = _flags_cache()
    codes = sorted(region_codes())
    flags = {sgg: cache.get(f"{sgg}:{ym}") for sgg in codes}
    missing = [sgg for sgg, f in flags.items() if f is None]
    if missing:
        by_sgg: dict[str, list] = {}
        for r in grade_rows(db, extra=(Complex.cortar_address,)):
            if r.cortar_no and len(r.cortar_no) >= 5:
                by_sgg.setdefault(r.cortar_no[:5], []).append(r)
        for sgg in missing:
            flags[sgg] = _flags_from_rows(by_sgg.get(sgg, []))
            cache.set(f"{sgg}:{ym}", flags[sgg])
    return {
        "hubs": [sgg for sgg in codes if flags[sgg]["indexable"]],
        "dongs": sorted(code for f in flags.values() for code, d in f["dongs"].items() if d["indexable"]),
    }
