"""단지 관련 API 엔드포인트"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import queries
from deps import get_db
from routers.serializers import article_to_dict, build_filter_dict, complex_to_dict
from services.cache import TTLCache, get_cache

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
):
    """단지명 키워드 검색"""
    results = queries.search_complexes(db, q, limit=limit)
    # 매물 수 배치 조회 (region 엔드포인트와 동일 패턴)
    complex_nos = [c.complex_no for c in results]
    counts = queries.get_article_counts_by_complexes(db, complex_nos)
    return {
        "complexes": [
            {**complex_to_dict(c), "article_count": counts.get(c.complex_no, 0)}
            for c in results
        ],
        "total": len(results),
    }


@router.get("/region")
def get_complexes_by_region(
    sido: str = Query(...),
    sigungu: Optional[str] = Query(None),
    dong: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """지역별 단지 조회"""
    cache_key = f"region:{sido}:{sigungu or ''}:{dong or ''}:{limit}"
    cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    results = queries.get_complexes_by_region(db, sido, sigungu, dong, limit=limit)
    # 매물 수 배치 조회
    complex_nos = [c.complex_no for c in results]
    counts = queries.get_article_counts_by_complexes(db, complex_nos)
    result = {
        "complexes": [
            {**complex_to_dict(c), "article_count": counts.get(c.complex_no, 0)}
            for c in results
        ],
        "total": len(results),
    }
    _cache.set(cache_key, result)
    return result


@router.get("/{complex_no}")
def get_complex_detail(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 상세 정보 (캐시 적용)"""
    detail_key = f"complex_detail:{complex_no}"
    cached = _cache.get(detail_key)
    if cached is not None:
        return cached

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
        "article_count": article_count,
        "filter_options": filter_options,
    }
    _cache.set(detail_key, result)
    return result



@router.get("/{complex_no}/filter-options")
def get_filter_options(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 내 필터 옵션 (동, 태그, 방향)"""
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
    # 정렬/페이지
    sort_by: Literal["rank", "price_asc", "price_desc", "area_asc", "area_desc", "ppyeong_asc", "ppyeong_desc", "maintenance_asc", "maintenance_desc", "confirm_asc", "confirm_desc"] = Query("rank"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """단지별 매물 조회 (필터 + 정렬 + 페이지네이션, 기본 조회 캐시)"""
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
):
    """단지 면적별 상세 정보 (캐시 적용)"""
    pyeong_key = f"pyeong_details:{complex_no}"
    cached = _cache.get(pyeong_key)
    if cached is not None:
        return cached

    details = queries.get_complex_pyeong_details(db, complex_no)
    if not details:
        from services.enricher import enrich_complex_detail
        enrich_complex_detail(db, complex_no)
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
):
    """단지 매물 가격 통계 — 거래유형별 면적/층수 비교 (SQL 집계)"""
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
):
    """단지 월별 가격 추이 (실거래가 + 시세)"""
    cache_key = f"price_history:{complex_no}:{trade_type or 'all'}:{area_no or 'all'}"
    cached = _price_history_cache.get(cache_key)
    if cached is not None:
        return cached

    rows = queries.get_complex_price_history(db, complex_no, trade_type, area_no=area_no)
    result = {
        "complex_no": complex_no,
        "items": [
            {
                "trade_type": r["trade_type"],
                "trade_type_label": _TT_LABELS.get(r["trade_type"], r["trade_type"]),
                "price_upper": r["price_upper"],
                "price_lower": r["price_lower"],
                "price_avg": int(r["price_avg"]) if r["price_avg"] is not None else None,
                "base_month": r["month"][:6],
            }
            for r in rows
        ],
    }
    _price_history_cache.set(cache_key, result)
    return result
