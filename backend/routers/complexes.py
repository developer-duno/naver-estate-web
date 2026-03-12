"""단지 관련 API 엔드포인트"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from deps import get_db
from db import queries
from routers.serializers import complex_to_dict, article_to_dict, build_filter_dict
from crawler.stats import group_by_area, group_by_floor

router = APIRouter()


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
    results = queries.get_complexes_by_region(db, sido, sigungu, dong, limit=limit)
    # 매물 수 배치 조회
    complex_nos = [c.complex_no for c in results]
    counts = queries.get_article_counts_by_complexes(db, complex_nos)
    return {
        "complexes": [
            {**complex_to_dict(c), "article_count": counts.get(c.complex_no, 0)}
            for c in results
        ],
        "total": len(results),
    }


@router.get("/{complex_no}")
def get_complex_detail(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 상세 정보"""
    cpx = queries.get_complex_by_no(db, complex_no)
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

    article_count = queries.get_complex_article_count(db, complex_no)
    return {
        **complex_to_dict(cpx),
        "article_count": article_count,
    }


@router.get("/{complex_no}/articles")
def get_complex_articles(
    complex_no: str,
    # 필터
    trade_types: Optional[str] = Query(None, description="거래유형 (쉼표 구분: 매매,전세,월세)"),
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
    building_name: Optional[str] = Query(None),
    verified_only: bool = Query(False),
    max_building_age: Optional[int] = Query(None),
    move_in_type: Optional[str] = Query(None),
    estate_type: Optional[str] = Query(None),
    # 정렬/페이지
    sort_by: Literal["rank", "price_asc", "price_desc", "area_asc", "area_desc", "ppyeong_asc", "maintenance_asc", "confirm_desc"] = Query("rank"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """단지별 매물 조회 (필터 + 정렬 + 페이지네이션)"""
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
    )

    articles, total_count = queries.get_articles_by_complex(
        db, complex_no, filters=filters, sort_by=sort_by,
        page=page, page_size=page_size,
    )

    return {
        "articles": [article_to_dict(a) for a in articles],
        "total": total_count,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{complex_no}/pyeong-details")
def get_pyeong_details(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 면적별 상세 정보"""
    details = queries.get_complex_pyeong_details(db, complex_no)
    return {
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
            }
            for p in details
        ]
    }


@router.get("/{complex_no}/price-history")
def get_price_history(
    complex_no: str,
    trade_type: str = Query("A1", description="거래유형 (A1=매매, B1=전세)"),
    months: int = Query(24, ge=1, le=120),
    db: Session = Depends(get_db),
):
    """단지 시세 이력 조회 (Phase 1)"""
    history = queries.get_price_history(db, complex_no, trade_type, months)
    return {
        "complex_no": complex_no,
        "trade_type": trade_type,
        "history": [
            {
                "base_month": h.base_month,
                "price_upper": h.price_upper,
                "price_lower": h.price_lower,
                "price_avg": h.price_avg,
                "area_no": h.area_no,
            }
            for h in history  # 쿼리에서 ASC 정렬됨
        ],
    }


@router.get("/{complex_no}/price-stats")
def get_price_stats(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 매물 가격 통계 — 면적별/층수별 집계 (Phase 1)"""
    data = queries.get_price_stats(db, complex_no)
    articles = data["articles"]

    # 면적별/층수별 통계 집계
    area_stats = group_by_area([
        {"area2_m2": a["area2_m2"], "numeric_price": a["numeric_price"]}
        for a in articles
    ])
    floor_stats = group_by_floor([
        {"floor_info": a["floor_info"], "numeric_price": a["numeric_price"]}
        for a in articles
    ])

    return {
        "complex_no": complex_no,
        "total_articles": data["total"],
        "by_area": [
            {
                "label": s.label,
                "min": s.min_price,
                "avg": s.avg_price,
                "max": s.max_price,
                "median": s.median_price,
                "count": s.count,
            }
            for s in area_stats
        ],
        "by_floor": [
            {
                "label": s.label,
                "min": s.min_price,
                "avg": s.avg_price,
                "max": s.max_price,
                "median": s.median_price,
                "count": s.count,
            }
            for s in floor_stats
        ],
    }
