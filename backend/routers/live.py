"""Live crawling API"""

import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from deps import get_db
from db.models import Complex as ComplexModel, Article as ArticleModel
from routers.serializers import complex_to_dict, article_to_dict
from shared.constants import M2_TO_PYEONG, NAVER_COMPLEX_ARTICLES_API, NAVER_LAND_BASE
from shared.domain.article import RealEstateArticle
from shared.naver_api import NaverEstateAPI

logger = logging.getLogger(__name__)
router = APIRouter()

CRAWL_REAL_ESTATE_TYPES = {"APT", "ABYG", "JGC", "PRE"}


def _utcnow():
    return datetime.now(timezone.utc)


def _safe_int(val):
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val):
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


@router.get("/search")
def live_search(
    q: str = Query(..., min_length=1, description="Search keyword"),
    db: Session = Depends(get_db),
):
    """Live keyword search - Naver API -> DB upsert -> return"""
    all_complexes = []
    page = 1

    while True:
        result = NaverEstateAPI.search_by_keyword(q, page=page)
        if not result or "error" in result:
            break

        complex_list = result.get("complexes") or result.get("complexList") or []
        if not complex_list:
            break

        for c_data in complex_list:
            re_type = c_data.get("realEstateTypeCode", "")
            if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                continue
            cpx = _upsert_complex_from_search(db, c_data)
            if cpx:
                all_complexes.append(cpx)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)

    return {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }




@router.get("/region")
def live_region(
    sido: str = Query(...),
    sigungu: str = Query(None),
    dong: str = Query(None),
    db: Session = Depends(get_db),
):
    """Live region search - Naver API -> DB upsert -> return"""
    keyword = sido
    if sigungu:
        keyword += f" {sigungu}"
    if dong:
        keyword += f" {dong}"

    all_complexes = []
    page = 1

    while True:
        result = NaverEstateAPI.search_by_keyword(keyword, page=page)
        if not result or "error" in result:
            break

        complex_list = result.get("complexes") or result.get("complexList") or []
        if not complex_list:
            break

        for c_data in complex_list:
            re_type = c_data.get("realEstateTypeCode", "")
            if re_type and re_type not in CRAWL_REAL_ESTATE_TYPES:
                continue
            cpx = _upsert_complex_from_search(db, c_data, sido=sido, sigungu=sigungu, dong=dong)
            if cpx:
                all_complexes.append(cpx)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    complex_nos = [c["complex_no"] for c in all_complexes]
    counts = _get_article_counts(db, complex_nos)

    return {
        "complexes": [
            {**c, "article_count": counts.get(c["complex_no"], 0)}
            for c in all_complexes
        ],
        "total": len(all_complexes),
    }



def _fetch_articles_all_trade_types(complex_no: str, page: int = 1):
    """Fetch articles with all trade types (A1=매매, B1=전세, B2=월세, B3=단기임대).

    NaverEstateAPI.get_complex_articles() uses empty tradeType= which may exclude
    월세/단기임대. This helper explicitly includes all trade types.
    """
    token = NaverEstateAPI._ensure_jwt(complex_no)
    headers = {
        'Referer': f'{NAVER_LAND_BASE}/complexes/{complex_no}',
    }
    if token:
        headers['Authorization'] = f'Bearer {token}'

    url = (
        f"{NAVER_COMPLEX_ARTICLES_API}/{complex_no}"
        f"?realEstateType=APT%3AABYG%3AJGC%3APRE"
        f"&tradeType=A1%3AB1%3AB2%3AB3"
        f"&tag=%3A%3A%3A%3A%3A%3A%3A%3A"
        f"&rentPriceMin=0&rentPriceMax=900000000"
        f"&priceMin=0&priceMax=900000000"
        f"&areaMin=0&areaMax=900000000"
        f"&oldBuildYears&recentlyBuildYears"
        f"&minHouseHoldCount&maxHouseHoldCount"
        f"&showArticle=false&sameAddressGroup=false"
        f"&minMaintenanceCost&maxMaintenanceCost"
        f"&priceType=RETAIL&directions="
        f"&page={page}&complexNo={complex_no}"
        f"&buildingNos=&areaNos=&type=list&order=rank"
    )
    return NaverEstateAPI._request_with_retry(url, extra_headers=headers)

@router.get("/{complex_no}/articles")
def live_articles(
    complex_no: str,
    db: Session = Depends(get_db),
):
    """Live article crawl - Naver API -> DB upsert -> return"""
    all_article_nos = set()
    page = 1

    while True:
        result = _fetch_articles_all_trade_types(complex_no, page=page)
        if not result or "error" in result:
            break

        article_list = result.get("articleList") or []
        if not article_list:
            break

        for a_data in article_list:
            article = RealEstateArticle.from_dict(a_data)
            article.complex_no = complex_no
            _upsert_article(db, article)
            all_article_nos.add(article.article_no)

        if not result.get("isMoreData", False):
            break
        page += 1
        time.sleep(0.5)

    # Deactivate missing articles
    if all_article_nos:
        db.query(ArticleModel).filter(
            ArticleModel.complex_no == complex_no,
            ArticleModel.is_active == True,
            ~ArticleModel.article_no.in_(all_article_nos),
        ).update(
            {"is_active": False, "updated_at": _utcnow()},
            synchronize_session=False,
        )
        db.commit()

    # Update last_crawled_at
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
        {"last_crawled_at": _utcnow()}
    )
    db.commit()

    # Enrich complex detail if not yet done
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    if cpx and not cpx.detail_crawled_at:
        _enrich_complex_detail(db, complex_no)

    # Return active articles from DB
    articles = (
        db.query(ArticleModel)
        .filter(ArticleModel.complex_no == complex_no, ArticleModel.is_active == True)
        .all()
    )

    return {
        "articles": [article_to_dict(a) for a in articles],
        "total": len(articles),
        "page": 1,
        "page_size": len(articles),
    }


def _upsert_complex_from_search(db: Session, data: dict, sido: str = None, sigungu: str = None, dong: str = None) -> dict | None:
    """Upsert complex from search result, return dict"""
    complex_no = str(data.get("complexNo", ""))
    if not complex_no:
        return None

    lat = data.get("latitude")
    lng = data.get("longitude")
    try:
        latitude = float(lat) if lat else None
        longitude = float(lng) if lng else None
    except (ValueError, TypeError):
        latitude = None
        longitude = None

    values = {
        "complex_no": complex_no,
        "complex_name": data.get("complexName", ""),
        "cortar_no": data.get("cortarNo"),
        "real_estate_type_code": data.get("realEstateTypeCode"),
        "real_estate_type_name": data.get("realEstateTypeName"),
        "latitude": latitude,
        "longitude": longitude,
        "total_household_count": _safe_int(data.get("totalHouseholdCount")),
        "high_floor": _safe_int(data.get("highFloor")),
        "low_floor": _safe_int(data.get("lowFloor")),
        "use_approve_ymd": data.get("useApproveYmd"),
        "total_dong_count": _safe_int(data.get("totalDongCount")),
        "min_supply_area_m2": _safe_float(data.get("minSupplyArea")),
        "max_supply_area_m2": _safe_float(data.get("maxSupplyArea")),
        "cortar_address": data.get("cortarAddress"),
        "updated_at": _utcnow(),
    }

    # Use explicit params if provided, otherwise parse from address
    if sido:
        values["sido"] = sido
        if sigungu:
            values["sigungu"] = sigungu
        if dong:
            values["dong"] = dong
    else:
        address = data.get("cortarAddress", "")
        parts = address.split() if address else []
        if len(parts) >= 2:
            values["sido"] = parts[0]
            values["sigungu"] = parts[1]
            if len(parts) >= 3:
                values["dong"] = parts[2]

    stmt = pg_insert(ComplexModel).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=["complex_no"],
        set_={k: v for k, v in values.items() if k != "complex_no"},
    )
    db.execute(stmt)
    db.commit()

    return {
        "complex_no": complex_no,
        "complex_name": data.get("complexName", ""),
        "cortar_no": data.get("cortarNo"),
        "real_estate_type_code": data.get("realEstateTypeCode"),
        "real_estate_type_name": data.get("realEstateTypeName"),
        "latitude": latitude,
        "longitude": longitude,
        "total_household_count": _safe_int(data.get("totalHouseholdCount")),
        "high_floor": _safe_int(data.get("highFloor")),
        "low_floor": _safe_int(data.get("lowFloor")),
        "use_approve_ymd": data.get("useApproveYmd"),
        "total_dong_count": _safe_int(data.get("totalDongCount")),
        "min_supply_area_m2": _safe_float(data.get("minSupplyArea")),
        "max_supply_area_m2": _safe_float(data.get("maxSupplyArea")),
        "cortar_address": data.get("cortarAddress"),
        "sido": values.get("sido"),
        "sigungu": values.get("sigungu"),
        "dong": values.get("dong"),
        "last_crawled_at": None,
    }


def _upsert_article(db: Session, article: RealEstateArticle):
    """Upsert article"""
    values = {
        "article_no": article.article_no,
        "complex_no": article.complex_no or "",
        "trade_type_name": article.trade_type_name,
        "building_name": article.building_name,
        "floor_info": article.floor_info,
        "deal_or_warrant_prc": article.deal_or_warrant_prc,
        "rent_prc": article.rent_prc,
        "area1_m2": article.area1_m2,
        "area2_m2": article.area2_m2,
        "direction": article.direction,
        "article_feature_desc": article.article_feature_desc,
        "tags": article.tags or [],
        "realtor_name": article.realtor_name,
        "article_confirm_ymd": article.article_confirm_ymd,
        "latitude": article.latitude,
        "longitude": article.longitude,
        "complex_name": article.complex_name,
        "article_name": article.article_name,
        "realtor_id": article.realtor_id,
        "realtor_phone": article.realtor_phone,
        "is_verified": article.is_verified,
        "article_real_estate_type_name": article.article_real_estate_type_name,
        "is_presale": article.is_presale,
        "numeric_price": article.numeric_price,
        "numeric_rent_price": article.numeric_rent_price,
        "price_per_pyeong": article.price_per_pyeong,
        "last_seen_at": _utcnow(),
        "is_active": True,
        "updated_at": _utcnow(),
    }

    stmt = pg_insert(ArticleModel).values(**values)
    update_cols = {k: v for k, v in values.items() if k not in ("article_no", "first_seen_at")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["article_no"],
        set_=update_cols,
    )
    db.execute(stmt)
    db.commit()


def _get_article_counts(db: Session, complex_nos: list[str]) -> dict[str, int]:
    """Get active article counts per complex"""
    if not complex_nos:
        return {}
    from sqlalchemy import func
    rows = (
        db.query(ArticleModel.complex_no, func.count(ArticleModel.article_no))
        .filter(ArticleModel.complex_no.in_(complex_nos), ArticleModel.is_active == True)
        .group_by(ArticleModel.complex_no)
        .all()
    )
    return {r[0]: r[1] for r in rows}


def _enrich_complex_detail(db: Session, complex_no: str):
    """Enrich complex with detail info (pyeong details etc)"""
    from db.models import ComplexPyeongDetail

    try:
        detail = NaverEstateAPI.get_complex_detail(complex_no)
    except Exception as e:
        logger.warning("Complex detail fetch failed: %s -> %s", complex_no, e)
        return

    if not detail or not isinstance(detail, dict) or "error" in detail:
        return

    cd = detail.get("complexDetail") or {}

    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update({
        "heat_method_type": cd.get("heatMethodTypeName"),
        "total_parking_count": _safe_int(cd.get("totalParkingCount")),
        "construction_company": cd.get("constructionCompanyName"),
        "floor_area_ratio": cd.get("floorAreaRatio"),
        "building_coverage_ratio": cd.get("buildingCoverageRatio"),
        "detail_crawled_at": _utcnow(),
    }, synchronize_session=False)

    pyeong_list = detail.get("complexPyeongDetailList") or []
    for p in pyeong_list:
        pyeong_no = _safe_int(p.get("pyeongNo"))
        if pyeong_no is None:
            continue

        avg_maint = p.get("averageMaintenanceCost") or {}
        values = {
            "complex_no": complex_no,
            "pyeong_no": pyeong_no,
            "pyeong_name": p.get("pyeongName"),
            "supply_area": p.get("supplyArea"),
            "supply_area_double": _safe_float(p.get("supplyAreaDouble")),
            "exclusive_area": p.get("exclusiveArea"),
            "exclusive_rate": p.get("exclusiveRate"),
            "household_count_by_pyeong": p.get("householdCountByPyeong"),
            "entrance_type": p.get("entranceType"),
            "room_count": _safe_int(p.get("roomCnt")),
            "bathroom_count": _safe_int(p.get("bathroomCnt")),
            "avg_maintenance_cost": _safe_int(avg_maint.get("averageTotalPrice")),
            "summer_maintenance_cost": _safe_int(avg_maint.get("summerTotalPrice")),
            "winter_maintenance_cost": _safe_int(avg_maint.get("winterTotalPrice")),
            "updated_at": _utcnow(),
        }

        stmt = pg_insert(ComplexPyeongDetail).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="complex_pyeong_details_complex_no_pyeong_no_key",
            set_={k: v for k, v in values.items() if k not in ("complex_no", "pyeong_no")},
        )
        db.execute(stmt)

    db.commit()
    logger.info("Complex detail enriched: %s -> %d pyeong", complex_no, len(pyeong_list))
