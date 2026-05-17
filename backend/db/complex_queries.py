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


# 거래유형 4종 고정 (codes.md 답습 — trade_type_name 한국어 값)
_TRADE_TYPES = ("매매", "전세", "월세", "단기임대")


def get_trade_type_counts(db: Session, complex_no: str) -> dict[str, int]:
    """단지의 거래유형별 활성 매물 수. 4종 키 항상 포함(0 채움)."""
    stmt = (
        select(Article.trade_type_name, func.count())
        .where(and_(
            Article.complex_no == complex_no,
            Article.is_active == True,  # noqa: E712
            Article.trade_type_name.in_(_TRADE_TYPES),
        ))
        .group_by(Article.trade_type_name)
    )
    rows = dict(db.execute(stmt).all())
    return {t: rows.get(t, 0) for t in _TRADE_TYPES}


def get_trade_type_counts_by_complexes(
    db: Session, complex_nos: list[str]
) -> dict[str, dict[str, int]]:
    """복수 단지의 거래유형별 활성 매물 수 (N+1 방지)."""
    if not complex_nos:
        return {}
    stmt = (
        select(Article.complex_no, Article.trade_type_name, func.count())
        .where(and_(
            Article.complex_no.in_(complex_nos),
            Article.is_active == True,  # noqa: E712
            Article.trade_type_name.in_(_TRADE_TYPES),
        ))
        .group_by(Article.complex_no, Article.trade_type_name)
    )
    result: dict[str, dict[str, int]] = {
        no: {t: 0 for t in _TRADE_TYPES} for no in complex_nos
    }
    for cno, tname, cnt in db.execute(stmt).all():
        result[cno][tname] = cnt
    return result


def get_complexes_for_article_crawl(db: Session, limit: int = 50) -> list[Complex]:
    """매물 수집 배치 대상 단지 — 활성매물 0건 단지를 먼저 반환.

    기존엔 last_crawled_at 오래된 순으로만 골랐는데, 이 컬럼은 2026-04-13
    SQL 일괄 UPDATE 로 약 75% 가 허수라 매물 0건 단지(약 3.6만 개)가
    "크롤한 척"하며 영원히 후순위로 밀렸다. 활성매물 유무를 1차 정렬
    기준으로 삼아 진짜 미수집 단지부터 채운다. 2차는 last_crawled_at
    오래된 순(NULL 우선).
    """
    has_article = (
        select(Article.complex_no)
        .where(and_(Article.complex_no == Complex.complex_no, Article.is_active == True))  # noqa: E712
        .exists()
    )
    stmt = (
        select(Complex)
        .order_by(
            has_article.asc(),  # False(매물 0건) 가 먼저
            Complex.last_crawled_at.asc().nullsfirst(),
        )
        .limit(limit)
    )
    return list(db.execute(stmt).scalars().all())


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
