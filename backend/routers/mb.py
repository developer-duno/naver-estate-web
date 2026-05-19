"""mibunyang 데이터 API — Phase 1 (읽기 전용)

같은 Supabase DB의 mibunyang 테이블 조회.
기존 get_db() 세션 + 인증 없는 공개 API (complexes.py 패턴 일치).
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import mb_queries
from deps import get_db
from routers.serializers import (
    apartment_to_dict,
    builder_to_dict,
    infra_to_dict,
    mb_price_to_dict,
    mb_region_to_dict,
    mb_trade_to_dict,
    school_to_dict,
    trade_stats_to_dict,
    transport_to_dict,
    unsold_history_to_dict,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# ── 아파트 단지 ──────────────────────────────────────────────


MbAptSortBy = Literal[
    "name_asc", "unsold_desc", "unsold_asc", "unsold_rate_desc",
    "units_desc", "price_asc", "price_desc",
]
MbTradeSortBy = Literal[
    "deal_month_desc", "deal_month_asc", "price_desc", "price_asc", "area_desc",
]


@router.get("/gu-list")
def get_gu_list(
    region: str = Query(..., min_length=2, max_length=20, description="시도"),
    db: Session = Depends(get_db),
):
    """시/도 내 시/군/구 목록 (apartments 테이블 기준)"""
    items = mb_queries.get_gu_list(db, region)
    return {"region": region, "gu_list": items}


@router.get("/apartments")
def get_apartments(
    region: str = Query(..., min_length=2, max_length=20, description="시도"),
    gu: Optional[str] = Query(None, max_length=20, description="시군구"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: MbAptSortBy = Query("name_asc"),
    keyword: Optional[str] = Query(None, min_length=2, max_length=100),
    db: Session = Depends(get_db),
):
    """지역별 아파트 목록 (정렬 + 검색)"""
    items, total = mb_queries.get_apartments_page(db, region, gu, page, page_size, sort_by, keyword)
    return {
        "apartments": [apartment_to_dict(a) for a in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/apartments/{apartment_id}")
def get_apartment_detail(
    apartment_id: str,
    db: Session = Depends(get_db),
):
    """아파트 상세 정보 (부속 데이터 포함)"""
    apt = mb_queries.get_apartment_by_id(db, apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="아파트를 찾을 수 없습니다")

    result = apartment_to_dict(apt)

    # 부속 정보 병합
    ts = mb_queries.get_trade_stats(db, apartment_id)
    if ts:
        result["trade_stats"] = trade_stats_to_dict(ts)

    infra = mb_queries.get_infra(db, apartment_id)
    if infra:
        result["infra"] = infra_to_dict(infra)

    school = mb_queries.get_school(db, apartment_id)
    if school:
        result["school"] = school_to_dict(school)

    transport = mb_queries.get_transport(db, apartment_id)
    if transport:
        result["transport"] = transport_to_dict(transport)

    prices = mb_queries.get_apartment_prices(db, apartment_id)
    if prices:
        result["prices"] = [mb_price_to_dict(p) for p in prices]

    if apt.builder:
        builder = mb_queries.get_builder(db, apt.builder)
        if builder:
            result["builder_info"] = builder_to_dict(builder)

    return result


# ── 미분양 현황 ──────────────────────────────────────────────


@router.get("/unsold")
def get_unsold(
    region: str = Query(..., min_length=2, max_length=20, description="시도"),
    gu: Optional[str] = Query(None, max_length=20, description="시군구"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: MbAptSortBy = Query("unsold_desc"),
    keyword: Optional[str] = Query(None, min_length=2, max_length=100),
    db: Session = Depends(get_db),
):
    """지역별 미분양 아파트 목록 (unsold > 0, 정렬 + 검색 + 페이지네이션)"""
    items, total = mb_queries.get_unsold_by_region(
        db, region, gu, sort_by, keyword, page, page_size
    )
    return {
        "unsold": [apartment_to_dict(a) for a in items],
        "total": total,
    }


@router.get("/unsold/{apartment_id}/history")
def get_unsold_history(
    apartment_id: str,
    limit: int = Query(24, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """단지별 미분양 추이 (월별)"""
    items = mb_queries.get_unsold_history(db, apartment_id, limit)
    return {
        "apartment_id": apartment_id,
        "items": [unsold_history_to_dict(u) for u in items],
    }


# ── 지역 통계 ────────────────────────────────────────────────


@router.get("/regions")
def get_region_stats(
    region: str = Query(..., min_length=2, max_length=20),
    gu: Optional[str] = Query(None, max_length=20),
    db: Session = Depends(get_db),
):
    """지역별 인구/세대/미분양/시세 통계"""
    items = mb_queries.get_region_stats(db, region, gu)
    return {
        "regions": [mb_region_to_dict(r) for r in items],
        "total": len(items),
    }


# ── 실거래 ───────────────────────────────────────────────────


@router.get("/trades")
def get_trades(
    region: str = Query(..., min_length=2, max_length=20),
    gu: Optional[str] = Query(None, max_length=20),
    dong: Optional[str] = Query(None, max_length=20),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort_by: MbTradeSortBy = Query("deal_month_desc"),
    db: Session = Depends(get_db),
):
    """지역별 실거래 내역 (정렬)"""
    items = mb_queries.get_trades(db, region, gu, dong, page, page_size, sort_by)
    total = mb_queries.count_trades(db, region, gu, dong)
    return {
        "trades": [mb_trade_to_dict(t) for t in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
