"""DB 읽기 쿼리 — 웹앱에서 사용하는 모든 조회 함수

필터링은 반드시 SQL WHERE절로 처리한다.
Python 메모리 필터 금지.
"""

import re
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.orm import Session

from db.models import (
    Article,
    ArticlePriceHistory,
    Complex,
    ComplexPriceHistory,
    ComplexPyeongDetail,
)

# ── 단지 조회 ──

def search_complexes(db: Session, keyword: str, limit: int = 50):
    """단지명 키워드 검색 (pg_trgm 유사도)"""
    # LIKE 와일드카드 문자 이스케이프
    escaped = keyword.replace("%", "\\%").replace("_", "\\_")
    stmt = (
        select(Complex)
        .where(Complex.complex_name.ilike(f"%{escaped}%"))
        .order_by(Complex.complex_name)
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def get_complexes_by_region(
    db: Session, sido: str, sigungu: Optional[str] = None, dong: Optional[str] = None,
    limit: int = 500,
):
    """지역별 단지 조회"""
    conditions = [Complex.sido == sido]
    if sigungu:
        conditions.append(Complex.sigungu == sigungu)
    if dong:
        conditions.append(Complex.dong == dong)

    stmt = (
        select(Complex)
        .where(and_(*conditions))
        .order_by(Complex.complex_name)
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def get_complex_by_no(db: Session, complex_no: str) -> Optional[Complex]:
    """단지번호로 단지 조회"""
    return db.get(Complex, complex_no)


def get_complex_pyeong_details(db: Session, complex_no: str) -> list[ComplexPyeongDetail]:
    """단지 면적별 상세 정보 조회 (공급면적 순)"""
    stmt = (
        select(ComplexPyeongDetail)
        .where(ComplexPyeongDetail.complex_no == complex_no)
        .order_by(ComplexPyeongDetail.supply_area_double)
    )
    return db.execute(stmt).scalars().all()


def get_complex_article_count(db: Session, complex_no: str) -> int:
    """단지의 활성 매물 수"""
    stmt = (
        select(func.count())
        .select_from(Article)
        .where(and_(Article.complex_no == complex_no, Article.is_active == True))
    )
    return db.execute(stmt).scalar() or 0


def get_article_counts_by_complexes(db: Session, complex_nos: list[str]) -> dict[str, int]:
    """복수 단지의 활성 매물 수를 한 번에 조회 (N+1 방지)"""
    if not complex_nos:
        return {}
    stmt = (
        select(Article.complex_no, func.count())
        .where(and_(Article.complex_no.in_(complex_nos), Article.is_active == True))
        .group_by(Article.complex_no)
    )
    results = db.execute(stmt).all()
    return {row[0]: row[1] for row in results}


# ── 매물 조회 (필터 + 정렬 + 페이지네이션) ──

def get_articles_by_complex(
    db: Session,
    complex_no: str,
    filters: Optional[dict] = None,
    sort_by: str = "rank",
    page: int = 1,
    page_size: int = 50,
) -> tuple[list[Article], int]:
    """단지별 매물 조회 (필터링 + 정렬 + 페이지네이션)

    Returns:
        (articles, total_count)
    """
    conditions = [
        Article.complex_no == complex_no,
        Article.is_active == True,
    ]

    if filters:
        conditions.extend(_build_filter_conditions(filters))

    # 전체 건수
    count_stmt = (
        select(func.count())
        .select_from(Article)
        .where(and_(*conditions))
    )
    total_count = db.execute(count_stmt).scalar() or 0

    # 정렬
    order_clause = _build_order_clause(sort_by)

    # 데이터
    stmt = (
        select(Article)
        .where(and_(*conditions))
        .order_by(order_clause)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    articles = db.execute(stmt).scalars().all()

    return articles, total_count


def get_article_by_no(db: Session, article_no: str) -> Optional[Article]:
    """매물번호로 매물 상세 조회"""
    return db.get(Article, article_no)


# ── 통계 ──

def get_db_stats(db: Session) -> dict:
    """DB 통계 (홈페이지용)"""
    complex_count = db.execute(select(func.count()).select_from(Complex)).scalar() or 0
    article_count = db.execute(
        select(func.count()).select_from(Article).where(Article.is_active == True)
    ).scalar() or 0
    return {"complex_count": complex_count, "article_count": article_count}


_ALLOWED_DISTINCT_COLUMNS = {"direction", "building_name", "trade_type_name"}


def get_distinct_values(db: Session, complex_no: str, column_name: str) -> list[str]:
    """단지 내 특정 컬럼의 고유값 목록 (필터 옵션 생성용)"""
    if column_name not in _ALLOWED_DISTINCT_COLUMNS:
        return []
    col = getattr(Article, column_name, None)
    if col is None:
        return []
    stmt = (
        select(col)
        .where(and_(Article.complex_no == complex_no, Article.is_active == True, col.isnot(None)))
        .distinct()
        .order_by(col)
    )
    return [row for row in db.execute(stmt).scalars().all()]



def get_filter_options(db: Session, complex_no: str) -> dict:
    """단지 내 필터 옵션 조회 (동, 태그, 방향의 고유값)"""
    conditions = [Article.complex_no == complex_no, Article.is_active == True]

    # 동 목록
    building_stmt = (
        select(Article.building_name)
        .where(and_(*conditions, Article.building_name.isnot(None)))
        .distinct()
        .order_by(Article.building_name)
    )
    building_names = [r for r in db.execute(building_stmt).scalars().all()]

    # 태그 목록 (PostgreSQL unnest)
    tag_stmt = text(
        "SELECT DISTINCT unnest(tags) AS tag "
        "FROM articles "
        "WHERE complex_no = :cno AND is_active = true AND tags IS NOT NULL "
        "ORDER BY tag"
    ).bindparams(cno=complex_no)
    tags = [r[0] for r in db.execute(tag_stmt).all()]

    # 방향 목록
    dir_stmt = (
        select(Article.direction)
        .where(and_(*conditions, Article.direction.isnot(None)))
        .distinct()
        .order_by(Article.direction)
    )
    directions = [r for r in db.execute(dir_stmt).scalars().all()]

    return {
        "building_names": building_names,
        "tags": tags,
        "directions": directions,
    }

# ── 필터 조건 빌더 ──

def _build_filter_conditions(filters: dict) -> list:
    """필터 딕셔너리를 SQLAlchemy WHERE 조건 리스트로 변환"""
    conditions = []

    # 거래유형
    if trade_types := filters.get("trade_types"):
        conditions.append(Article.trade_type_name.in_(trade_types))

    # 가격 범위 (만원)
    if (min_price := filters.get("min_price")) is not None:
        conditions.append(Article.numeric_price >= min_price)
    if (max_price := filters.get("max_price")) is not None:
        conditions.append(Article.numeric_price <= max_price)

    # 월세 범위
    if (min_rent := filters.get("min_rent")) is not None:
        conditions.append(Article.numeric_rent_price >= min_rent)
    if (max_rent := filters.get("max_rent")) is not None:
        conditions.append(Article.numeric_rent_price <= max_rent)

    # 면적 범위 (m²)
    if (min_area := filters.get("min_area_m2")) is not None:
        conditions.append(Article.area2_m2 >= min_area)
    if (max_area := filters.get("max_area_m2")) is not None:
        conditions.append(Article.area2_m2 <= max_area)

    # 방 수
    min_rooms = filters.get("min_rooms")
    if min_rooms is not None and min_rooms > 0:
        conditions.append(Article.room_count >= min_rooms)

    # 욕실 수
    min_baths = filters.get("min_baths")
    if min_baths is not None and min_baths > 0:
        conditions.append(Article.bathroom_count >= min_baths)

    # 방향
    if direction := filters.get("direction"):
        conditions.append(Article.direction == direction)

    # 평당가 범위
    if (min_ppyeong := filters.get("min_ppyeong")) is not None:
        conditions.append(Article.price_per_pyeong >= min_ppyeong)
    if (max_ppyeong := filters.get("max_ppyeong")) is not None:
        conditions.append(Article.price_per_pyeong <= max_ppyeong)

    # 관리비 범위 (사전 계산된 숫자 컬럼 사용)
    if (min_maint := filters.get("min_maintenance")) is not None:
        conditions.append(Article.numeric_maintenance_cost >= min_maint)
    if (max_maint := filters.get("max_maintenance")) is not None:
        conditions.append(Article.numeric_maintenance_cost <= max_maint)

    # 동 (건물명)
    if building := filters.get("building_name"):
        conditions.append(Article.building_name == building)


    # 층수 범위 (floor_number 컬럼 사용 — V011 마이그레이션 필요)
    if (min_floor := filters.get("min_floor")) is not None:
        conditions.append(Article.floor_number >= min_floor)
    if (max_floor := filters.get("max_floor")) is not None:
        conditions.append(Article.floor_number <= max_floor)

    # 검증 매물만
    if filters.get("verified_only"):
        conditions.append(Article.is_verified == True)

    # 태그 필터 (ANY 사용 — 특수문자 포함 태그도 안전하게 처리)
    if tags := filters.get("tags"):
        for tag in tags:
            conditions.append(
                text("(:tag)::text = ANY(articles.tags)").bindparams(tag=tag)
            )

    # 준공년도 (N년 이내)
    if (max_age := filters.get("max_building_age")) and max_age > 0:
        min_year = datetime.now().year - max_age
        conditions.append(
            text("SUBSTRING(articles.use_approve_ymd, 1, 4)::INTEGER >= :min_year").bindparams(min_year=min_year)
        )

    # 매물유형 필터
    estate_type = filters.get("estate_type")
    if estate_type == "presale":
        conditions.append(Article.is_presale == True)
    elif estate_type == "apt":
        conditions.append(Article.article_real_estate_type_name == "아파트")
    elif estate_type == "opst":
        conditions.append(Article.article_real_estate_type_name == "오피스텔")
    elif estate_type == "jgc":
        conditions.append(Article.article_real_estate_type_name == "재건축")
    elif estate_type == "rdv":
        conditions.append(Article.article_real_estate_type_name == "재개발")

    # 입주가능일 타입
    move_in = filters.get("move_in_type")
    if move_in == "즉시입주":
        conditions.append(Article.move_in_date.in_(["즉시입주", "즉시"]))
    elif move_in == "협의":
        conditions.append(Article.move_in_date.in_(["협의", "협의가능"]))
    elif move_in and move_in.endswith("개월"):
        # "1개월", "3개월", "6개월" — 날짜 기반 필터 (YYYYMMDD 형식)
        months_match = re.match(r"(\d+)개월", move_in)
        if months_match:
            months = int(months_match.group(1))
            now = datetime.now()
            new_month = now.month + months
            new_year = now.year + (new_month - 1) // 12
            new_month = (new_month - 1) % 12 + 1
            cutoff = f"{new_year:04d}{new_month:02d}{min(now.day, 28):02d}"
            conditions.append(
                or_(
                    Article.move_in_date.in_(["즉시입주", "즉시"]),
                    and_(
                        Article.move_in_date.op("~")(r"^\d{8}$"),
                        Article.move_in_date <= cutoff,
                    ),
                )
            )

    return conditions


# ── 시세 이력 (Phase 1) ──

def get_article_price_history(
    db: Session, article_no: str, limit: int = 50
) -> list[ArticlePriceHistory]:
    """매물의 가격 변동 이력 조회"""
    stmt = (
        select(ArticlePriceHistory)
        .where(ArticlePriceHistory.article_no == article_no)
        .order_by(ArticlePriceHistory.recorded_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def get_price_stats(db: Session, complex_no: str) -> dict:
    """단지 매물의 가격 통계 (면적별/층수별 집계용 데이터, 전체 거래유형 포함)"""
    conditions = [
        Article.complex_no == complex_no,
        Article.is_active == True,
        Article.numeric_price.isnot(None),
    ]

    stmt = (
        select(
            Article.area2_m2,
            Article.floor_info,
            Article.numeric_price,
            Article.trade_type_name,
        )
        .where(and_(*conditions))
        .limit(10000)
    )
    rows = db.execute(stmt).all()
    articles = [
        {
            "area2_m2": r[0],
            "floor_info": r[1],
            "numeric_price": r[2],
            "trade_type_name": r[3],
        }
        for r in rows
    ]
    return {"articles": articles, "total": len(articles)}


def get_price_stats_aggregated(db: Session, complex_no: str) -> dict:
    """단지 매물 가격 통계 — SQL 집계 (면적 5m² 버킷 + 층수 3티어)

    Python 루프 대신 SQL GROUP BY로 집계하여 10~20배 빨라짐.
    이상치 제거(IQR) 없이 raw avg/min/max 반환.
    """
    AREA_BUCKET = 5  # 5m² 단위

    # --- 면적별 집계 ---
    area_stmt = text("""
        SELECT
            ROUND(area2_m2 / :bucket) * :bucket AS area_bucket,
            trade_type_name,
            COUNT(*) AS cnt,
            ROUND(AVG(numeric_price)) AS avg_price,
            MIN(numeric_price) AS min_price,
            MAX(numeric_price) AS max_price
        FROM articles
        WHERE complex_no = :cno AND is_active = TRUE AND numeric_price IS NOT NULL
            AND area2_m2 IS NOT NULL AND area2_m2 > 0
        GROUP BY area_bucket, trade_type_name
        ORDER BY area_bucket, trade_type_name
    """).bindparams(cno=complex_no, bucket=AREA_BUCKET)
    area_rows = db.execute(area_stmt).fetchall()

    # --- 층수별 집계 ---
    floor_stmt = text("""
        SELECT
            CASE
                WHEN floor_info ~ '^[0-9]+' THEN
                    CASE
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 1 AND 5 THEN '저층(1-5)'
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 6 AND 15 THEN '중층(6-15)'
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) > 15 THEN '고층(16+)'
                    END
                WHEN LEFT(floor_info, 1) IN ('저', '중', '고') THEN
                    CASE LEFT(floor_info, 1)
                        WHEN '저' THEN '저층(1-5)'
                        WHEN '중' THEN '중층(6-15)'
                        WHEN '고' THEN '고층(16+)'
                    END
            END AS floor_tier,
            trade_type_name,
            COUNT(*) AS cnt,
            ROUND(AVG(numeric_price)) AS avg_price,
            MIN(numeric_price) AS min_price,
            MAX(numeric_price) AS max_price
        FROM articles
        WHERE complex_no = :cno AND is_active = TRUE AND numeric_price IS NOT NULL
            AND floor_info IS NOT NULL
        GROUP BY floor_tier, trade_type_name
        HAVING CASE
                WHEN floor_info ~ '^[0-9]+' THEN
                    CASE
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 1 AND 5 THEN '저층(1-5)'
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) BETWEEN 6 AND 15 THEN '중층(6-15)'
                        WHEN CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER) > 15 THEN '고층(16+)'
                    END
                WHEN LEFT(floor_info, 1) IN ('저', '중', '고') THEN
                    CASE LEFT(floor_info, 1)
                        WHEN '저' THEN '저층(1-5)'
                        WHEN '중' THEN '중층(6-15)'
                        WHEN '고' THEN '고층(16+)'
                    END
            END IS NOT NULL
        ORDER BY floor_tier, trade_type_name
    """).bindparams(cno=complex_no)
    floor_rows = db.execute(floor_stmt).fetchall()

    # --- 면적별 결과 조립 ---
    tt_key_map = {"매매": "maemae", "전세": "jeonse", "월세": "wolse"}
    area_data: dict[float, dict] = {}
    for row in area_rows:
        bucket = float(row[0]) if row[0] is not None else 0
        tt = row[1]
        key = tt_key_map.get(tt)
        if not key:
            continue
        entry = area_data.setdefault(bucket, {"label": f"{int(bucket)}m²"})
        entry[key] = int(row[3]) if row[3] else 0
        entry[f"{key}_count"] = int(row[2])

    by_area = [area_data[b] for b in sorted(area_data)]

    # --- 층수별 결과 조립 ---
    floor_data: dict[str, dict] = {}
    for row in floor_rows:
        tier = row[0]
        tt = row[1]
        key = tt_key_map.get(tt)
        if not key or not tier:
            continue
        entry = floor_data.setdefault(tier, {"label": tier})
        entry[f"{key}_avg"] = int(row[3]) if row[3] else 0
        entry[f"{key}_min"] = int(row[4]) if row[4] else 0
        entry[f"{key}_max"] = int(row[5]) if row[5] else 0
        entry[f"{key}_count"] = int(row[2])

    floor_order = ["저층(1-5)", "중층(6-15)", "고층(16+)"]
    by_floor = [floor_data[f] for f in floor_order if f in floor_data]

    total = sum(
        entry.get(f"{k}_count", 0)
        for entry in by_area
        for k in tt_key_map.values()
    )

    return {
        "complex_no": complex_no,
        "total_articles": total,
        "by_area": by_area,
        "by_floor": by_floor,
    }


def get_price_changed_articles(
    db: Session, complex_no: str | None = None, limit: int = 50
) -> list[Article]:
    """최근 가격 변동 매물 조회"""
    conditions = [
        Article.is_active == True,
        Article.price_changed_at.isnot(None),
    ]
    if complex_no:
        conditions.append(Article.complex_no == complex_no)

    stmt = (
        select(Article)
        .where(and_(*conditions))
        .order_by(Article.price_changed_at.desc())
        .limit(limit)
    )
    return db.execute(stmt).scalars().all()


def _build_order_clause(sort_by: str):
    """정렬 키워드를 SQLAlchemy ORDER BY 절로 변환"""
    sort_map = {
        "rank": Article.article_confirm_ymd.desc(),
        "price_asc": Article.numeric_price.asc(),
        "price_desc": Article.numeric_price.desc(),
        "area_asc": Article.area2_m2.asc(),
        "area_desc": Article.area2_m2.desc(),
        "ppyeong_asc": Article.price_per_pyeong.asc(),
        "ppyeong_desc": Article.price_per_pyeong.desc(),
        "maintenance_asc": Article.numeric_maintenance_cost.asc(),
        "maintenance_desc": Article.numeric_maintenance_cost.desc(),
        "confirm_asc": Article.article_confirm_ymd.asc(),
        "confirm_desc": Article.article_confirm_ymd.desc(),
    }
    return sort_map.get(sort_by, Article.article_confirm_ymd.desc())


# ── 단지 가격 추이 ──

def get_complex_price_history(
    db: Session, complex_no: str, trade_type: Optional[str] = None,
    area_no: Optional[str] = None,
) -> list[dict]:
    """단지의 월별 가격 추이 (base_month를 YYYYMM으로 정규화 + 월별 집계)"""
    month_col = func.left(ComplexPriceHistory.base_month, 6).label("month")

    conditions = [ComplexPriceHistory.complex_no == complex_no]
    if trade_type:
        conditions.append(ComplexPriceHistory.trade_type == trade_type)
    if area_no:
        conditions.append(ComplexPriceHistory.area_no == area_no)

    stmt = (
        select(
            ComplexPriceHistory.trade_type,
            month_col,
            func.max(ComplexPriceHistory.price_upper).label("price_upper"),
            func.min(ComplexPriceHistory.price_lower).label("price_lower"),
            func.round(func.avg(ComplexPriceHistory.price_avg)).label("price_avg"),
        )
        .where(and_(*conditions))
        .group_by(ComplexPriceHistory.trade_type, month_col)
        .order_by(month_col.asc())
    )
    return [dict(row._mapping) for row in db.execute(stmt).all()]
