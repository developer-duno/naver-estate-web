"""DB 통계 + 필터 옵션 쿼리"""

from sqlalchemy import and_, exists, func, select, text
from sqlalchemy.orm import Session

from db.models import Article, Complex, ComplexPriceHistory

_ALLOWED_DISTINCT_COLUMNS = {"direction", "building_name", "trade_type_name"}


def get_db_stats(db: Session) -> dict:
    """DB 통계 (홈페이지용)"""
    complex_count = db.execute(select(func.count()).select_from(Complex)).scalar() or 0
    article_count = db.execute(
        select(func.count()).select_from(Article).where(Article.is_active == True)  # noqa: E712
    ).scalar() or 0
    return {"complex_count": complex_count, "article_count": article_count}


def get_distinct_values(db: Session, complex_no: str, column_name: str) -> list[str]:
    """단지 내 특정 컬럼의 고유값 목록 (필터 옵션 생성용)"""
    if column_name not in _ALLOWED_DISTINCT_COLUMNS:
        return []
    col = getattr(Article, column_name, None)
    if col is None:
        return []
    stmt = (
        select(col)
        .where(and_(Article.complex_no == complex_no, Article.is_active == True, col.isnot(None)))  # noqa: E712
        .distinct()
        .order_by(col)
    )
    return [row for row in db.execute(stmt).scalars().all()]


def get_filter_options(db: Session, complex_no: str) -> dict:
    """단지 내 필터 옵션 조회 (동, 태그, 방향의 고유값)"""
    conditions = [Article.complex_no == complex_no, Article.is_active == True]  # noqa: E712

    building_stmt = (
        select(Article.building_name)
        .where(and_(*conditions, Article.building_name.isnot(None)))
        .distinct()
        .order_by(Article.building_name)
    )
    building_names = [r for r in db.execute(building_stmt).scalars().all()]

    tag_stmt = text(
        "SELECT DISTINCT unnest(tags) AS tag "
        "FROM articles "
        "WHERE complex_no = :cno AND is_active = true AND tags IS NOT NULL "
        "ORDER BY tag"
    ).bindparams(cno=complex_no)
    tags = [r[0] for r in db.execute(tag_stmt).all()]

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


def count_coverage_by_type(db: Session) -> dict:
    """매물유형별 데이터 커버리지 집계.

    반환: {type_code: {complexes, with_article, with_price, with_detail}}
    유형별로 단지 수 / 활성매물 있는 단지 / 시세이력 있는 단지 /
    단지 상세 수집된 단지를 집계해, 유형별 수집 진행률을 한눈에 본다.
    """
    has_article = exists().where(
        and_(Article.complex_no == Complex.complex_no, Article.is_active == True)  # noqa: E712
    )
    has_price = exists().where(ComplexPriceHistory.complex_no == Complex.complex_no)

    stmt = (
        select(
            Complex.real_estate_type_code,
            func.count().label("complexes"),
            func.count().filter(has_article).label("with_article"),
            func.count().filter(has_price).label("with_price"),
            func.count(Complex.detail_crawled_at).label("with_detail"),
        )
        .group_by(Complex.real_estate_type_code)
        .order_by(func.count().desc())
    )

    result = {}
    for code, complexes, with_article, with_price, with_detail in db.execute(stmt).all():
        result[code or "UNKNOWN"] = {
            "complexes": complexes,
            "with_article": with_article,
            "with_price": with_price,
            "with_detail": with_detail,
        }
    return result
