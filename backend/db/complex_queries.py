"""단지 조회 쿼리"""

from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from db.models import Article, Complex, ComplexPyeongDetail


def search_complexes(db: Session, keyword: str, limit: int = 50):
    """단지명 키워드 검색 (pg_trgm 유사도)"""
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
        .where(and_(Article.complex_no == complex_no, Article.is_active == True))  # noqa: E712
    )
    return db.execute(stmt).scalar() or 0


def get_article_counts_by_complexes(db: Session, complex_nos: list[str]) -> dict[str, int]:
    """복수 단지의 활성 매물 수를 한 번에 조회 (N+1 방지)"""
    if not complex_nos:
        return {}
    stmt = (
        select(Article.complex_no, func.count())
        .where(and_(Article.complex_no.in_(complex_nos), Article.is_active == True))  # noqa: E712
        .group_by(Article.complex_no)
    )
    results = db.execute(stmt).all()
    return {row[0]: row[1] for row in results}


def get_complexes_for_detail_enrich(db: Session, real_estate_type: str, limit: int = 500) -> list[str]:
    """단지 상세 미수집 단지의 complex_no 목록 (유형별 backfill 용).

    real_estate_type 으로 매물유형을 분리해 backfill 한다 (전 유형 일괄 금지).
    detail_crawled_at IS NULL 인 단지만 반환 — V022 인덱스
    (real_estate_type_code, detail_crawled_at) 가 가속.
    """
    stmt = (
        select(Complex.complex_no)
        .where(and_(
            Complex.real_estate_type_code == real_estate_type,
            Complex.detail_crawled_at.is_(None),
        ))
        .limit(limit)
    )
    return [row[0] for row in db.execute(stmt).all()]
