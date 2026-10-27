"""단지 관련 API 엔드포인트"""

import re
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from crawler.utils import get_shared_throttle
from db import queries
from db.area_price_queries import complex_area_fields
from db.sgis_queries import build_neighborhood
from deps import get_current_user, get_db, get_viewer, is_approved_user
from routers.public_fields import for_viewer, list_for_viewer
from routers.region_serializers import complex_region_fields
from routers.serializers import (
    article_to_dict,
    build_filter_dict,
    complex_to_dict,
    kapt_cost_to_dict,
)
from services.cache import TTLCache, get_cache
from services.public_pages import nearest_stations, official_price_payload, public_summary
from services.seo_grade import sitemap_ids

router = APIRouter()

# 필터 옵션 & 가격 통계 캐시 (시간대별 동적 TTL) — 레지스트리 기반으로 live.py에서 무효화 가능
_cache = get_cache("complexes", dynamic=True)
# 가격 추이 캐시 — immutable 데이터이므로 고정 12시간 TTL
_price_history_cache = TTLCache(ttl=43200, max_size=1000)


@router.get("/search")
def search_complexes(
    q: str = Query(..., min_length=1, description="검색 키워드"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_viewer),  # 비로그인 = 네이버 재료 칸 걷어냄(세션 481)
):
    """단지명 키워드 검색"""
    results = queries.search_complexes(db, q, limit=limit)
    # 매물 수 배치 조회 (region 엔드포인트와 동일 패턴)
    complex_nos = [c.complex_no for c in results]
    counts = queries.get_article_counts_by_complexes(db, complex_nos)
    trade_counts = queries.get_trade_type_counts_by_complexes(db, complex_nos)
    return list_for_viewer({
        "complexes": [
            {
                **complex_to_dict(c),
                "article_count": counts.get(c.complex_no, 0),
                "trade_type_counts": trade_counts.get(c.complex_no),
            }
            for c in results
        ],
        "total": len(results),
    }, user)


@router.get("/region")
def get_complexes_by_region(
    sido: str = Query(...),
    sigungu: Optional[str] = Query(None),
    dong: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_viewer),  # 비로그인 = 네이버 재료 칸 걷어냄(세션 481)
):
    """지역별 단지 조회"""
    cache_key = f"region:{sido}:{sigungu or ''}:{dong or ''}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return list_for_viewer(cached, user)

    results = queries.get_complexes_by_region(db, sido, sigungu, dong, limit=limit)
    # 매물 수 배치 조회
    complex_nos = [c.complex_no for c in results]
    counts = queries.get_article_counts_by_complexes(db, complex_nos)
    trade_counts = queries.get_trade_type_counts_by_complexes(db, complex_nos)
    result = {
        "complexes": [
            {
                **complex_to_dict(c),
                "article_count": counts.get(c.complex_no, 0),
                "trade_type_counts": trade_counts.get(c.complex_no),
            }
            for c in results
        ],
        "total": len(results),
    }
    _cache.set(cache_key, result)
    return list_for_viewer(result, user)


# ── 검색엔진 색인용 공개 창구(세션 483 PR 3a) — `/{complex_no}` 보다 먼저 등록해야 sitemap-ids 가 안 빨려 간다 ──
_COMPLEX_NO = re.compile(r"\d{1,12}")


@router.get("/sitemap-ids")
def get_sitemap_ids(
    response: Response,
    grade: Literal["A"] = Query(...),
    db: Session = Depends(get_db),
):
    """사이트맵에 넣을 단지 번호 — indexable 인 그 등급 단지만(services/seo_grade 한 곳 판정), 1일 메모리 캐시.

    계산 실패는 5xx 그대로(빈 목록을 굳히지 않는다). lastmod 는 싣지 않는다(설계 v2 O6).
    """
    items = sitemap_ids(db, grade)
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return {"grade": grade, "count": len(items), "items": items}


@router.get("/{complex_no}/public-summary")
def get_public_summary(
    complex_no: str,
    response: Response,
    db: Session = Depends(get_db),
):
    """단지 공개 요약 — 서버 렌더(ISR)가 한 번에 받는 재료. 인증 없음 · 허용 목록 칸만(좌표·중위값·네이버 칸 0).

    숫자가 아닌 번호·없는 단지 = 404(Cache-Control 없음). 200 은 public 1시간 + 백엔드 메모리 1시간.
    """
    if not _COMPLEX_NO.fullmatch(complex_no):
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")
    try:
        result = public_summary(db, complex_no)
    except OperationalError:   # DB 연결 오류·시간 초과 — 캐시에 안 넣고 503(화면이 404 로 굳히지 않게)
        raise HTTPException(status_code=503, detail="잠시 자료를 읽지 못했습니다. 조금 뒤 다시 시도해 주세요")
    if result is None:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return result


@router.get("/{complex_no}")
def get_complex_detail(
    complex_no: str,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_viewer),
):
    """단지 상세 정보 (캐시 적용) — 비로그인도 열람(세션 481 공개 전환).

    캐시는 전체 응답 하나. 비로그인이면 반환 직전 네이버 재료 칸을 걷어낸 사본을 준다(routers/public_fields.py).
    """
    detail_key = f"complex_detail:{complex_no}"
    cached = _cache.get(detail_key)
    if cached is not None:
        return for_viewer(cached, user)

    cpx = queries.get_complex_by_no(db, complex_no)
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

    article_count = queries.get_complex_article_count(db, complex_no)
    fo_key = f"filter_options:{complex_no}"
    filter_options = _cache.get(fo_key)
    if filter_options is None:
        filter_options = queries.get_filter_options(db, complex_no)
        _cache.set(fo_key, filter_options)
    result = {
        **complex_to_dict(cpx),
        # 정부 지역 값(부동산원 시군구 전세가율) — 상세·비교만(세션 473). 목록에는 안 붙인다.
        **complex_region_fields(db, cpx),
        # 면적별 정부 실거래(대표 면적 외 다른 면적도) — 상세·비교만(세션 474 B27). 목록에는 안 붙인다.
        **complex_area_fields(db, cpx),
        "article_count": article_count,
        "trade_type_counts": queries.get_trade_type_counts(db, complex_no),
        "filter_options": filter_options,
    }
    _cache.set(detail_key, result)
    return for_viewer(result, user)



@router.get("/{complex_no}/filter-options")
def get_filter_options(
    complex_no: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # 로그인 게이트 (매물 집계 — 네이버 재료, 세션 481)
):
    """단지 내 필터 옵션 (동, 태그, 방향) — 로그인 회원"""
    cache_key = f"filter_options:{complex_no}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached
    result = queries.get_filter_options(db, complex_no)
    _cache.set(cache_key, result)
    return result


@router.get("/{complex_no}/articles")
def get_complex_articles(
    complex_no: str,
    # 필터
    trade_types: Optional[str] = Query(None, max_length=100, description="거래유형 (쉼표 구분: 매매,전세,월세)"),
    min_price: Optional[int] = Query(None, ge=0),
    max_price: Optional[int] = Query(None, ge=0),
    min_rent: Optional[int] = Query(None, ge=0),
    max_rent: Optional[int] = Query(None, ge=0),
    min_area_m2: Optional[float] = Query(None, ge=0),
    max_area_m2: Optional[float] = Query(None, ge=0),
    min_rooms: Optional[int] = Query(None, ge=0),
    min_baths: Optional[int] = Query(None, ge=0),
    direction: Optional[str] = Query(None),
    min_ppyeong: Optional[int] = Query(None, ge=0),
    max_ppyeong: Optional[int] = Query(None, ge=0),
    min_maintenance: Optional[int] = Query(None, ge=0),
    max_maintenance: Optional[int] = Query(None, ge=0),
    building_name: Optional[str] = Query(None, max_length=100),
    verified_only: bool = Query(False),
    max_building_age: Optional[int] = Query(None),
    move_in_type: Optional[str] = Query(None),
    estate_type: Optional[str] = Query(None),
    min_floor: Optional[int] = Query(None, ge=0),
    max_floor: Optional[int] = Query(None, ge=0),
    tags: Optional[str] = Query(None, max_length=200, description="태그 (쉼표 구분)"),
    min_yield: Optional[float] = Query(None, ge=0, le=100, description="최소 수익률 (%)"),
    max_yield: Optional[float] = Query(None, ge=0, le=100, description="최대 수익률 (%)"),
    # 정렬/페이지
    sort_by: Literal["rank", "price_asc", "price_desc", "area_asc", "area_desc", "ppyeong_asc", "ppyeong_desc", "maintenance_asc", "maintenance_desc", "confirm_asc", "confirm_desc"] = Query("rank"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # 로그인 게이트 (매물 목록 — 네이버 재료, 세션 481: 승인 → 로그인)
):
    """단지별 매물 조회 (필터 + 정렬 + 페이지네이션, 기본 조회 캐시) — 로그인 회원"""
    filters = build_filter_dict(
        trade_types=trade_types, min_price=min_price, max_price=max_price,
        min_rent=min_rent, max_rent=max_rent,
        min_area_m2=min_area_m2, max_area_m2=max_area_m2,
        min_rooms=min_rooms, min_baths=min_baths, direction=direction,
        min_ppyeong=min_ppyeong, max_ppyeong=max_ppyeong,
        min_maintenance=min_maintenance, max_maintenance=max_maintenance,
        building_name=building_name, verified_only=verified_only,
        max_building_age=max_building_age, move_in_type=move_in_type,
        estate_type=estate_type,
        min_floor=min_floor, max_floor=max_floor, tags=tags,
        min_yield=min_yield, max_yield=max_yield,
    )

    # 필터 없는 첫 페이지 기본 조회 → 캐시 (페이지 진입 속도 향상)
    is_default = (
        page == 1 and sort_by == "rank" and page_size == 50
        and not filters
    )
    if is_default:
        art_cache_key = f"articles_default:{complex_no}"
        cached = _cache.get(art_cache_key)
        if cached is not None:
            return cached

    articles, total_count = queries.get_articles_by_complex(
        db, complex_no, filters=filters, sort_by=sort_by,
        page=page, page_size=page_size,
    )

    result = {
        "articles": [article_to_dict(a) for a in articles],
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }

    if is_default:
        _cache.set(art_cache_key, result)

    return result


@router.get("/{complex_no}/pyeong-details")
def get_pyeong_details(
    complex_no: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # 로그인 게이트 (면적별 상세, 세션 481: 승인 → 로그인)
):
    """단지 면적별 상세 정보 (캐시 적용) — 로그인 회원.

    평형표가 비어 있을 때의 즉석 네이버 호출은 승인 중개사만 일으킨다(세션 481 — 네이버를 부르는 행동은
    승인 중개사, 호출 상한 불변). 미승인 회원은 저장분만 보고, 그 빈 결과는 캐시하지 않는다
    (캐시하면 뒤에 온 승인 중개사도 즉석 호출 없이 빈 목록을 받는다).
    """
    pyeong_key = f"pyeong_details:{complex_no}"
    cached = _cache.get(pyeong_key)
    if cached is not None:
        return cached

    details = queries.get_complex_pyeong_details(db, complex_no)
    can_enrich = is_approved_user(user)
    if not details and not can_enrich:
        return {"pyeong_details": []}
    if not details:
        from services.enricher import enrich_complex_detail
        # 상세 배치와 같은 속도 조절 장치를 나눠 쓴다(B18 — 네이버 IP 차단 방지)
        _throttle_detail = get_shared_throttle("complex_detail")
        _throttle_detail.wait()
        enrich_complex_detail(db, complex_no, throttle=_throttle_detail)
        db.commit()
        details = queries.get_complex_pyeong_details(db, complex_no)
    result = {
        "pyeong_details": [
            {
                "pyeong_no": p.pyeong_no,
                "pyeong_name": p.pyeong_name,
                "supply_area": p.supply_area,
                "supply_area_double": p.supply_area_double,
                "exclusive_area": p.exclusive_area,
                "exclusive_rate": p.exclusive_rate,
                "household_count_by_pyeong": p.household_count_by_pyeong,
                "entrance_type": p.entrance_type,
                "room_count": p.room_count,
                "bathroom_count": p.bathroom_count,
                "avg_maintenance_cost": p.avg_maintenance_cost,
                "summer_maintenance_cost": p.summer_maintenance_cost,
                "winter_maintenance_cost": p.winter_maintenance_cost,
                "floor_plan_url": p.floor_plan_url,
                "supply_pyeong": p.supply_pyeong,
                "exclusive_pyeong": p.exclusive_pyeong,
                "latest_maintenance_cost": p.latest_maintenance_cost,
                "maintenance_cost_basis": p.maintenance_cost_basis,
            }
            for p in details
        ]
    }
    _cache.set(pyeong_key, result)
    return result



@router.get("/{complex_no}/price-stats")
def get_price_stats(
    complex_no: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # 로그인 게이트 (호가 통계 — 네이버 재료, 세션 481: 승인 → 로그인)
):
    """단지 매물 가격 통계 — 거래유형별 면적/층수 비교 (SQL 집계) — 로그인 회원"""
    cache_key = f"price_stats:{complex_no}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    result = queries.get_price_stats_aggregated(db, complex_no)
    _cache.set(cache_key, result)
    return result


_TT_LABELS = {"A1": "매매", "B1": "전세", "B2": "월세", "B3": "단기임대"}


@router.get("/{complex_no}/price-history")
def get_price_history(
    complex_no: str,
    trade_type: Optional[Literal["A1", "B1", "B2", "B3"]] = Query(None),
    area_no: Optional[str] = Query(None, max_length=20, pattern=r"^[0-9]+$"),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),  # 로그인 게이트 (가격 추이 — 네이버 시세 포함, 세션 481: 승인 → 로그인)
):
    """단지 월별 가격 추이 (실거래가 + 시세) — 로그인 회원"""
    cache_key = f"price_history:{complex_no}:{trade_type or 'all'}:{area_no or 'all'}"
    cached = _price_history_cache.get(cache_key)
    if cached is not None:
        return cached

    rows = queries.get_complex_price_history(db, complex_no, trade_type, area_no=area_no)
    # 그래프가 그린 면적 묶음과 기준 글자(세션 474 B27) — 기본선 = 대표 면적, 평형 선택 = 그 평형 묶음
    area_m2 = queries.get_price_history_area(db, complex_no, area_no)
    result = {
        "complex_no": complex_no,
        "area_m2": area_m2,
        "basis": queries.price_history_basis(area_m2, area_no),
        # 범위 그래프용 기준 글자(세션 480) — basis 는 옛 그래프(중위 줄)용으로 그대로
        "basis_range": queries.price_history_range_basis(area_m2, area_no),
        "items": [
            {
                "trade_type": r["trade_type"],
                "trade_type_label": _TT_LABELS.get(r["trade_type"], r["trade_type"]),
                "price_upper": r["price_upper"],
                "price_lower": r["price_lower"],
                "price_avg": int(r["price_avg"]) if r["price_avg"] is not None else None,
                "base_month": r["month"][:6],
                # 출처 계열(세션 474 B27) — "정부 실거래" · "네이버 시세" · 옛 동작이면 None
                "series": r.get("series"),
                # 그 달 거래 하나하나(정부 실거래 줄 · 최근 2년만, 세션 479 B29) — 네이버 줄·옛 동작은 []
                "trades": r.get("trades") or [],
                # 정부 줄 최저~최고(그 달 직거래 제외, 세션 480) — 네이버 줄·옛 동작은 None
                "range_lower": r.get("range_lower"),
                "range_upper": r.get("range_upper"),
            }
            for r in rows
        ],
    }
    _price_history_cache.set(cache_key, result)
    return result


# 공시가격 캐시 — 월 1회 갱신이라 오래 캐시 가능 (12시간 고정 TTL, price-history 답습)
_official_price_cache = TTLCache(ttl=43200, max_size=1000)


@router.get("/{complex_no}/official-prices")
def get_official_prices(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 공동주택 공시가격 (국토교통부) — 무료 공개 (게이트 없음, 플랜 §0-2)"""
    cache_key = f"official_prices:{complex_no}"
    cached = _official_price_cache.get(cache_key)
    if cached is not None:
        return cached

    # 계산 본문은 공개 요약(services/public_pages)과 공용 — 동작 같음(세션 483 PR 3a 에서 떼어 냄)
    result = official_price_payload(complex_no, queries.get_complex_official_prices(db, complex_no))
    _official_price_cache.set(cache_key, result)
    return result


# 가까운 지하철 캐시 — 역사 데이터는 연 1회 갱신이라 오래 캐시 가능
# (12시간 고정 TTL, official-prices 답습)
_subway_cache = TTLCache(ttl=43200, max_size=1000)


@router.get("/{complex_no}/subway")
def get_nearby_subway(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 반경 3km 내 가까운 지하철역 최대 3곳 — 무료 공개 (게이트 없음, 공시가격 답습)

    같은 역이 노선별로 여러 행인 원본 구조라 역명으로 묶는다 — 거리는 최단 행 기준,
    노선명은 반경 안에 든 그 역의 모든 노선을 모아 보여준다. 원본이 "선릉"/"선릉역"
    처럼 접미사를 섞어 쓰므로 정규형(normalize_station_name)을 그룹핑 키로 쓴다.
    계산 본문 = services/public_pages.nearest_stations(공개 요약과 공용 — 세션 483 PR 3a 에서 떼어 냄, 동작 같음).

    응답 station_name 도 접미사 없는 정규형이다 — FE formatStationName 이 "역"을
    붙여 표시하므로 화면에는 "선릉역"으로 나온다.
    """
    cache_key = f"subway:{complex_no}"
    cached = _subway_cache.get(cache_key)
    if cached is not None:
        return cached

    cpx = queries.get_complex_by_no(db, complex_no)
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

    # 좌표 없는 단지는 계산이 불가능 — 에러가 아니라 빈 목록 (FE 계약)
    result = {"stations": nearest_stations(db, cpx)}
    _subway_cache.set(cache_key, result)
    return result


@router.get("/{complex_no}/neighborhood")
def get_complex_neighborhood(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지가 속한 행정동의 "이 동네는" 통계 — 무료 공개 (게이트 없음, 공개 통계).

    404 = 단지 없음 · 행정동 코드 없음 · 그 동에 총인구(to_in_001) 행 없음(이름만 있는 동 포함).
    캐시 헤더는 main.py 미들웨어가 200 에만 `private, max-age=3600` 을 붙인다(오류 응답엔 없음).
    """
    found, emd_cd = queries.get_complex_sgis_emd_cd(db, complex_no)
    if not found:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")
    result = None
    if emd_cd:
        result = build_neighborhood(emd_cd, queries.get_sgis_neighborhood_items(db, emd_cd))
    if result is None:
        raise HTTPException(status_code=404, detail="이 단지의 동네 통계가 아직 없습니다")
    return result


# K-apt 관리비 캐시 — 월 1회 갱신이라 오래 캐시 가능 (12시간, official-prices 답습)
_kapt_cost_cache = TTLCache(ttl=43200, max_size=1000)


@router.get("/{complex_no}/kapt")
def get_kapt_management_cost(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 월 관리비 (K-apt 공동주택관리정보시스템) — 최신 수집월 1건.

    **매칭이 없을 때만 404** 다(K-apt 미등록·게이트 탈락). 매칭은 있는데 관리비가
    아직 없으면(수집 대기·미공개) 200 + 금액 필드 전부 null 로 내린다 — 복도유형은
    매칭 시점에 이미 확보되므로 관리비를 못 모았다는 이유로 그것까지 숨길 이유가
    없다(매칭 1,212건 중 관리비 보유 19건, 2026-08-28 실측).

    금액이 null 인 것과 "관리비 0원"은 여전히 구분된다 — 0 은 숫자로 내려간다.
    """
    cache_key = f"kapt:{complex_no}"
    cached = _kapt_cost_cache.get(cache_key)
    if cached is not None:
        return cached

    row = queries.get_latest_kapt_cost(db, complex_no)
    if row is None:
        raise HTTPException(status_code=404, detail="관리비 정보가 없습니다")

    cost, mapping = row
    result = kapt_cost_to_dict(cost, mapping)
    _kapt_cost_cache.set(cache_key, result)
    return result


# 공개 단지 화면(세션 482 PR 1b) — 인증 없음 · 네이버 재료 칸 0. 200 에만 public 1시간(오류 응답엔 안 붙는다).
_PUBLIC_CACHE = "public, max-age=3600"


@router.get("/{complex_no}/public-price-history")
def get_public_price_history(
    complex_no: str,
    response: Response,
    area_m2: Optional[int] = Query(None, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """면적 하나의 최근 24개월 정부 실거래 최저~최고(달마다 직거래 제외) + 2년 범위 — 무료 공개.

    area_m2 가 없으면 그 단지 대표 면적(rep_area_m2), 그것도 없으면 months [].
    """
    from db.public_complex_queries import public_price_history

    cpx = queries.get_complex_by_no(db, complex_no)
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")
    area = area_m2 if area_m2 is not None else getattr(cpx, "rep_area_m2", None)
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return public_price_history(db, complex_no, area)


@router.get("/{complex_no}/region-trend")
def get_region_trend(
    complex_no: str,
    response: Response,
    db: Session = Depends(get_db),
):
    """그 단지 시군구의 부동산원 중위 매매가·중위 전세가율 최근 24개월 — 무료 공개(지역 공식 통계)."""
    from db.public_complex_queries import region_trend

    cpx = queries.get_complex_by_no(db, complex_no)
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")
    response.headers["Cache-Control"] = _PUBLIC_CACHE
    return region_trend(db, cpx)
