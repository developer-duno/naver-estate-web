"""db/stats_queries.py count_coverage_by_type 검증

매물유형별 데이터 커버리지 집계 — 유형별 단지/매물/시세/단지상세 수.
"""

from db.models import Article, Complex, ComplexPriceHistory
from db.stats_queries import count_coverage_by_type
from utils import utcnow

# ── 팩토리 함수 ──


def _add_complex(db, complex_no, type_code, detail_crawled=False):
    """테스트용 단지 추가"""
    db.add(Complex(
        complex_no=complex_no,
        complex_name=f"단지{complex_no}",
        real_estate_type_code=type_code,
        detail_crawled_at=utcnow() if detail_crawled else None,
    ))


def _add_article(db, article_no, complex_no, is_active=True):
    """테스트용 매물 추가"""
    db.add(Article(article_no=article_no, complex_no=complex_no, is_active=is_active))


def _add_price(db, complex_no):
    """테스트용 시세 이력 추가"""
    db.add(ComplexPriceHistory(
        complex_no=complex_no, trade_type="A1", base_month="202605",
    ))


# ── 테스트 ──


class TestCountCoverageByType:
    """count_coverage_by_type 검증"""

    def test_groups_by_type_code(self, db):
        """정상: 유형별로 단지 수가 분리 집계된다"""
        _add_complex(db, "c1", "APT")
        _add_complex(db, "c2", "APT")
        _add_complex(db, "c3", "OPST")
        db.commit()

        result = count_coverage_by_type(db)
        assert result["APT"]["complexes"] == 2
        assert result["OPST"]["complexes"] == 1

    def test_coverage_counts(self, db):
        """정상: 활성매물·시세·단지상세 보유 단지가 각각 집계된다"""
        # APT 단지: 1개는 매물+시세+단지상세 모두, 1개는 아무것도 없음
        _add_complex(db, "c1", "APT", detail_crawled=True)
        _add_complex(db, "c2", "APT")
        _add_article(db, "a1", "c1")
        _add_price(db, "c1")
        db.commit()

        result = count_coverage_by_type(db)
        apt = result["APT"]
        assert apt["complexes"] == 2
        assert apt["with_article"] == 1
        assert apt["with_price"] == 1
        assert apt["with_detail"] == 1

    def test_inactive_article_not_counted(self, db):
        """엣지: 비활성 매물만 있는 단지는 with_article 에서 제외"""
        _add_complex(db, "c1", "APT")
        _add_article(db, "a1", "c1", is_active=False)
        db.commit()

        result = count_coverage_by_type(db)
        assert result["APT"]["with_article"] == 0

    def test_null_type_code_bucketed_as_unknown(self, db):
        """엣지: real_estate_type_code 가 NULL 이면 UNKNOWN 으로 집계"""
        _add_complex(db, "c1", None)
        db.commit()

        result = count_coverage_by_type(db)
        assert result["UNKNOWN"]["complexes"] == 1

    def test_empty_db(self, db):
        """엣지: 단지가 없으면 빈 dict"""
        result = count_coverage_by_type(db)
        assert result == {}
