"""get_complexes_for_article_crawl 검증

매물 수집 배치 대상 단지 선정 — 활성매물 0건 단지를 먼저,
그 다음 last_crawled_at 오래된 순. last_crawled_at 허수(2026-04-13
SQL 일괄 UPDATE)로 매물 0건 단지가 후순위로 밀린 문제 보완.
"""

from datetime import timedelta

from db.complex_queries import get_complexes_for_article_crawl
from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel
from services.upsert import upsert_complex_from_search
from utils import utcnow

# ── 팩토리 함수 ──


def _make_complex_data(complex_no, type_code="APT"):
    """테스트용 단지 검색 데이터"""
    return {
        "complexNo": complex_no,
        "complexName": f"단지{complex_no}",
        "cortarNo": "1168010100",
        "realEstateTypeCode": type_code,
    }


def _add_active_article(db, complex_no, article_no):
    """단지에 활성 매물 1건 추가"""
    db.add(ArticleModel(
        article_no=article_no,
        complex_no=complex_no,
        trade_type_name="매매",
        is_active=True,
    ))


# ── 테스트 ──


class TestGetComplexesForArticleCrawl:
    """매물 수집 배치 대상 조회 쿼리 검증"""

    def test_zero_article_complex_comes_first(self, db):
        """정상: 활성매물 0건 단지가 매물 有 단지보다 먼저 반환된다.

        매물 有 단지의 last_crawled_at 을 더 오래되게 찍어도, 매물 0건
        단지가 우선해야 한다 (허수 last_crawled_at 의존 끊기).
        """
        # has_article: 활성매물 있는 단지 (last_crawled_at 을 아주 오래 전으로)
        upsert_complex_from_search(db, _make_complex_data("has_art"))
        _add_active_article(db, "has_art", "a-1")
        db.query(ComplexModel).filter(ComplexModel.complex_no == "has_art").update(
            {"last_crawled_at": utcnow() - timedelta(days=365)}
        )
        # no_article: 매물 0건 단지 (last_crawled_at 은 최근 — 그래도 우선돼야)
        upsert_complex_from_search(db, _make_complex_data("no_art"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "no_art").update(
            {"last_crawled_at": utcnow()}
        )
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert nos.index("no_art") < nos.index("has_art"), (
            "매물 0건 단지가 매물 有 단지보다 먼저 선정되지 않음"
        )

    def test_inactive_article_counts_as_zero(self, db):
        """엣지: is_active=False 매물만 있는 단지는 '매물 0건'으로 취급된다."""
        upsert_complex_from_search(db, _make_complex_data("only_inactive"))
        db.add(ArticleModel(
            article_no="ia-1",
            complex_no="only_inactive",
            trade_type_name="매매",
            is_active=False,
        ))
        upsert_complex_from_search(db, _make_complex_data("active_one"))
        _add_active_article(db, "active_one", "act-1")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert nos.index("only_inactive") < nos.index("active_one"), (
            "비활성 매물만 있는 단지가 '매물 0건'으로 취급되지 않음"
        )

    def test_respects_limit(self, db):
        """정상: limit 만큼만 반환한다."""
        for i in range(5):
            upsert_complex_from_search(db, _make_complex_data(f"lim{i}"))
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=3)
        assert len(result) == 3
