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
    filter_options = queries.get_filter_options(db, complex_no)
    return {
        **complex_to_dict(cpx),
        "article_count": article_count,
        "filter_options": filter_options,
    }



@router.get("/{complex_no}/filter-options")
def get_filter_options(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 내 필터 옵션 (동, 태그, 방향)"""
    return queries.get_filter_options(db, complex_no)


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
        min_floor=min_floor, max_floor=max_floor, tags=tags,
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
    if not details:
        from services.enricher import enrich_complex_detail
        enrich_complex_detail(db, complex_no)
        db.commit()
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
                "floor_plan_url": p.floor_plan_url,
                "supply_pyeong": p.supply_pyeong,
                "exclusive_pyeong": p.exclusive_pyeong,
                "latest_maintenance_cost": p.latest_maintenance_cost,
                "maintenance_cost_basis": p.maintenance_cost_basis,
            }
            for p in details
        ]
    }



def _tt_key(tt: str) -> str:
    """거래유형 한글 → ASCII 키 변환"""
    return {"매매": "maemae", "전세": "jeonse", "월세": "wolse"}.get(tt, tt)


@router.get("/{complex_no}/price-stats")
def get_price_stats(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """단지 매물 가격 통계 — 거래유형별 면적/층수 비교"""
    data = queries.get_price_stats(db, complex_no)
    all_articles = data["articles"]

    TRADE_TYPES = ["매매", "전세", "월세"]

    # 거래유형별 분류
    by_tt = {
        tt: [a for a in all_articles if a.get("trade_type_name") == tt]
        for tt in TRADE_TYPES
    }

    # 거래유형별 면적/층수 통계
    area_by_tt = {
        tt: {s.label: s for s in group_by_area(arts)}
        for tt, arts in by_tt.items()
    }
    floor_by_tt = {
        tt: {s.label: s for s in group_by_floor(arts)}
        for tt, arts in by_tt.items()
    }

    # 면적별 복합 데이터: 한 행 = 한 면적 버킷, 열 = 거래유형별 평균가
    all_area_labels = sorted(
        {label for tt_stats in area_by_tt.values() for label in tt_stats}
    )
    by_area = []
    for label in all_area_labels:
        entry: dict = {"label": label}
        for tt in TRADE_TYPES:
            s = area_by_tt[tt].get(label)
            if s:
                entry[_tt_key(tt)] = s.avg_price
                entry[f"{_tt_key(tt)}_count"] = s.count
        by_area.append(entry)

    # 층수별 복합 데이터
    floor_labels = ["저층(1-5)", "중층(6-15)", "고층(16+)"]
    by_floor = []
    for label in floor_labels:
        entry = {"label": label}
        has_data = False
        for tt in TRADE_TYPES:
            s = floor_by_tt[tt].get(label)
            if s:
                entry[f"{_tt_key(tt)}_avg"] = s.avg_price
                entry[f"{_tt_key(tt)}_min"] = s.min_price
                entry[f"{_tt_key(tt)}_max"] = s.max_price
                entry[f"{_tt_key(tt)}_count"] = s.count
                has_data = True
        if has_data:
            by_floor.append(entry)

    # 실제 버킷에 포함된 매물 수 합산 (area 기준 — numeric_price+area2_m2 모두 있는 매물)
    area_total = sum(
        entry.get(f"{_tt_key(tt)}_count", 0)
        for entry in by_area
        for tt in TRADE_TYPES
    )

    return {
        "complex_no": complex_no,
        "total_articles": area_total,
        "by_area": by_area,
        "by_floor": by_floor,
    }
