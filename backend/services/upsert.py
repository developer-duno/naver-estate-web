"""공통 upsert 함수 — 매물/단지 DB 저장 로직 통합

Phase 3-2: live.py와 crawler/service.py에서 중복되던 upsert 함수들을 통합.
"""

import logging
import re

from sqlalchemy.dialects.postgresql import insert as pg_insert

from shared.constants import REAL_ESTATE_TYPE_NAMES

logger = logging.getLogger(__name__)


def _do_upsert(
    db, model, values: dict, pk_col: str | list[str], *, exclude_from_update: set | None = None
):
    """dialect-aware upsert — PostgreSQL pg_insert / SQLite sqlite_insert 자동 분기.

    CI에서 SQLite 사용 시에도 ON CONFLICT DO UPDATE 동작.
    stmt.excluded 참조로 파라미터 중복 바인딩 문제 방지.

    pk_col: 충돌 감지 컬럼. 문자열 1개(단일 PK) 또는 문자열 리스트(복합 키).
      복합 키를 쓰려면 그 컬럼 조합에 **DB 레벨 UNIQUE 제약(또는 유니크 인덱스)이
      실제로 존재해야** 한다 — pg/sqlite 모두 `index_elements` 로 나열한 컬럼과
      일치하는 유니크 인덱스를 찾아 추론하며, 없으면 실행 시 에러가 난다.
      (예: complex_official_prices_key UNIQUE(complex_no, stdr_year, prvuse_ar))
      충돌 키 컬럼은 UPDATE SET 목록에서 자동 제외된다.
    """
    pk_cols = [pk_col] if isinstance(pk_col, str) else list(pk_col)
    exclude = set(pk_cols) | (exclude_from_update or set())

    dialect = db.bind.dialect.name if db.bind else "postgresql"
    if dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as sqlite_insert

        stmt = sqlite_insert(model).values(**values)
    else:
        stmt = pg_insert(model).values(**values)

    update_cols = {k: stmt.excluded[k] for k in values if k not in exclude}
    stmt = stmt.on_conflict_do_update(index_elements=pk_cols, set_=update_cols)
    db.execute(stmt)


from db.models import (
    Article as ArticleModel,
)
from db.models import (
    ArticlePriceHistory,
)
from db.models import (
    Complex as ComplexModel,
)
from utils import safe_float, safe_int, utcnow

# 비정규 시/도명 → 정규 시/도명 (네이버 API cortarAddress 파싱 대응)
_SIDO_NORMALIZE = {
    "서울시": "서울특별시",
    "부산시": "부산광역시",
    "대구시": "대구광역시",
    "인천시": "인천광역시",
    "광주시": "광주광역시",
    "대전시": "대전광역시",
    "울산시": "울산광역시",
    "세종시": "세종특별자치시",
}


def parse_maintenance_cost(cost_str):
    """관리비 문자열에서 숫자만 추출"""
    if not cost_str:
        return None
    m = re.search(r"(\d+)", cost_str)
    return int(m.group(1)) if m else None


def upsert_complex_from_search(db, data, sido=None, sigungu=None, dong=None, commit=True):
    """검색 결과에서 단지 upsert. 반환: 직렬화용 dict 또는 None."""
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

    # 유형명이 네이버 응답에 없으면 code 로 폴백 (NULL 방지)
    type_code = data.get("realEstateTypeCode")
    type_name = data.get("realEstateTypeName") or REAL_ESTATE_TYPE_NAMES.get(type_code)

    values = {
        "complex_no": complex_no,
        "complex_name": data.get("complexName", ""),
        "cortar_no": data.get("cortarNo"),
        "real_estate_type_code": type_code,
        "real_estate_type_name": type_name,
        "latitude": latitude,
        "longitude": longitude,
        "total_household_count": safe_int(data.get("totalHouseholdCount")),
        "high_floor": safe_int(data.get("highFloor")),
        "low_floor": safe_int(data.get("lowFloor")),
        "use_approve_ymd": data.get("useApproveYmd"),
        "total_dong_count": safe_int(data.get("totalDongCount")),
        "min_supply_area_m2": safe_float(data.get("minSupplyArea")),
        "max_supply_area_m2": safe_float(data.get("maxSupplyArea")),
        "cortar_address": data.get("cortarAddress"),
        "updated_at": utcnow(),
    }

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
            values["sido"] = _SIDO_NORMALIZE.get(parts[0], parts[0])
            values["sigungu"] = parts[1]
            if len(parts) >= 3:
                values["dong"] = parts[2]

    _do_upsert(db, ComplexModel, values, "complex_no")
    if commit:
        db.commit()

    return {
        "complex_no": complex_no,
        "complex_name": data.get("complexName", ""),
        "cortar_no": data.get("cortarNo"),
        "real_estate_type_code": type_code,
        "real_estate_type_name": type_name,
        "latitude": latitude,
        "longitude": longitude,
        "total_household_count": safe_int(data.get("totalHouseholdCount")),
        "high_floor": safe_int(data.get("highFloor")),
        "low_floor": safe_int(data.get("lowFloor")),
        "use_approve_ymd": data.get("useApproveYmd"),
        "total_dong_count": safe_int(data.get("totalDongCount")),
        "min_supply_area_m2": safe_float(data.get("minSupplyArea")),
        "max_supply_area_m2": safe_float(data.get("maxSupplyArea")),
        "cortar_address": data.get("cortarAddress"),
        "sido": values.get("sido"),
        "sigungu": values.get("sigungu"),
        "dong": values.get("dong"),
        "last_crawled_at": None,
    }


def _parse_floor_number(floor_info: str | None) -> int | None:
    """floor_info 문자열에서 숫자 층수 추출. "3/20"→3, "저층"→None, None→None"""
    if not floor_info:
        return None
    match = re.match(r"^(\d+)", floor_info)
    return int(match.group(1)) if match else None


def _build_article_values(article):
    """RealEstateArticle -> DB upsert용 dict"""
    return {
        "article_no": article.article_no,
        "complex_no": article.complex_no or "",
        "trade_type_name": article.trade_type_name,
        "building_name": article.building_name,
        "floor_info": article.floor_info,
        "floor_number": _parse_floor_number(article.floor_info),
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
        # #9 매물 가치 필드
        "price_change_state": getattr(article, "price_change_state", None),
        "article_status": getattr(article, "article_status", None),
        "same_addr_cnt": getattr(article, "same_addr_cnt", None),
        "same_addr_min_prc": getattr(article, "same_addr_min_prc", None),
        "same_addr_max_prc": getattr(article, "same_addr_max_prc", None),
        "verification_type_code": getattr(article, "verification_type_code", None),
        "is_direct_trade": getattr(article, "is_direct_trade", False),
        "cp_name": getattr(article, "cp_name", None),
        "site_image_count": getattr(article, "site_image_count", None),
        "same_addr_premium_min": getattr(article, "same_addr_premium_min", None),
        "same_addr_premium_max": getattr(article, "same_addr_premium_max", None),
        "premium_prc": getattr(article, "premium_prc", None),
        "last_seen_at": utcnow(),
        "is_active": True,
        "updated_at": utcnow(),
    }


def upsert_article(db, article, commit=True, track_price=False, existing_prices=None):
    """매물 upsert. commit=False면 호출자가 관리. track_price=True면 가격 변동 감지.

    existing_prices: {article_no: (numeric_price, numeric_rent_price)} dict.
    전달 시 개별 SELECT 대신 캐시 사용 (N+1 방지).
    """
    values = _build_article_values(article)

    if track_price:
        if existing_prices is not None:
            price_tuple = existing_prices.get(article.article_no)
        else:
            row = db.query(ArticleModel.numeric_price, ArticleModel.numeric_rent_price).filter(
                ArticleModel.article_no == article.article_no
            ).first()
            price_tuple = tuple(row) if row else None

        if price_tuple and values["numeric_price"] is not None:
            old_price, old_rent = price_tuple
            new_price = values["numeric_price"]
            new_rent = values["numeric_rent_price"]
            price_changed = (
                (old_price is not None and old_price != new_price) or
                (old_rent is not None and new_rent is not None and old_rent != new_rent)
            )
            if price_changed:
                values["previous_price"] = old_price
                values["price_changed_at"] = utcnow()
                db.add(ArticlePriceHistory(
                    article_no=article.article_no,
                    price=new_price,
                    rent_price=new_rent,
                ))

    _do_upsert(db, ArticleModel, values, "article_no", exclude_from_update={"first_seen_at"})

    if commit:
        db.commit()


def _extract_maintenance_from_detail(detail_data: dict) -> str | None:
    """상세 API에서 관리비 추출 (dict 형식 호환)"""
    ad = detail_data.get("articleDetail", {})
    mc = ad.get("maintenanceCost")
    if mc is None:
        return None
    # 단순 값 (int/float/str)
    if isinstance(mc, (int, float)):
        return str(mc)
    if isinstance(mc, str):
        return mc
    # dict 형식: {averageTotalPrice: "297616", ...} (원 단위 → 만원 변환)
    if isinstance(mc, dict):
        avg = mc.get("averageTotalPrice")
        if avg:
            try:
                return str(round(int(avg) / 10000))
            except (ValueError, TypeError):
                pass
    return None


def build_detail_update_dict(domain_article, detail_data: dict = None):
    """상세 크롤링 결과 -> DB 업데이트 dict"""
    # 관리비: shared 코드가 dict 형식을 미처리하므로 별도 추출
    maint = domain_article.maintenance_cost
    if maint is None and detail_data:
        maint = _extract_maintenance_from_detail(detail_data)

    update_data = {
        "detail_description": domain_article.detail_description,
        "room_count": domain_article.room_count,
        "bathroom_count": domain_article.bathroom_count,
        "move_in_date": domain_article.move_in_date,
        "maintenance_cost": maint,
        "numeric_maintenance_cost": parse_maintenance_cost(maint),
        "parking_count": domain_article.parking_count,
        "photo_urls": domain_article.photo_urls or [],
        "representative_img_url": domain_article.representative_img_url,
        "realtor_phone_display": domain_article.realtor_phone_display,
        "realtor_address": domain_article.realtor_address,
        "heating_type": domain_article.heating_type,
        "total_floor_count": domain_article.total_floor_count,
        "jibun_address": domain_article.jibun_address,
        "use_approve_ymd": domain_article.use_approve_ymd,
        "acquisition_tax": domain_article.acquisition_tax,
        "broker_fee": domain_article.broker_fee,
        # #10 매물 상세 4필드
        "walking_time_to_subway": domain_article.walking_time_to_subway,
        "isale_right_type_name": domain_article.isale_right_type_name,
        "detail_status_code": domain_article.detail_status_code,
        "trade_complete": domain_article.trade_complete,
        "detail_crawled": True,
        "updated_at": utcnow(),
    }
    if domain_article.numeric_price is not None:
        update_data["numeric_price"] = domain_article.numeric_price
    if domain_article.numeric_rent_price is not None:
        update_data["numeric_rent_price"] = domain_article.numeric_rent_price
    if domain_article.price_per_pyeong is not None:
        update_data["price_per_pyeong"] = domain_article.price_per_pyeong
    return update_data


def delete_missing_articles(db, complex_no, seen_article_nos, commit=True):
    """이번 크롤링에서 보이지 않은 매물 삭제 (네이버에 없는 매물은 보존 불필요)"""
    if not seen_article_nos:
        return
    db.query(ArticleModel).filter(
        ArticleModel.complex_no == complex_no,
        ~ArticleModel.article_no.in_(seen_article_nos),
    ).delete(synchronize_session=False)
    if commit:
        db.commit()
