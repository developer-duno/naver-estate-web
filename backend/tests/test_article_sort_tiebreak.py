"""매물 목록 정렬 2차 기준(매물 번호 오름차순) 결정성 시험.

1차 정렬 값(확인일자·가격)이 같은 매물은 DB 가 아무 순서로나 돌려줄 수 있어
새로고침마다 줄이 바뀌었다. `_build_order_clause` 가 모든 정렬 뒤에 매물 번호 오름차순을
붙이므로, 같은 값 매물은 항상 번호 순서로 나와야 한다.

매물은 번호 **역순**(A003 → A002 → A001)으로 넣는다 — 2차 기준이 없으면 SQLite 가
넣은 순서(역순)를 그대로 돌려줘 이 시험이 FAIL 한다(뮤테이션 확인용).
실행: python -m pytest tests/test_article_sort_tiebreak.py -v
"""
import pytest

from db.article_queries import get_articles_by_complex
from db.models import Article, Complex


def _add_complex(db, no="C001"):
    db.add(Complex(complex_no=no, complex_name="정렬시험단지"))
    db.commit()


def _add_same_value_articles(db, complex_no="C001"):
    """확인일자·가격이 모두 같은 매물 3건을 번호 역순으로 넣는다."""
    for no in ("A003", "A002", "A001"):
        db.add(
            Article(
                article_no=no,
                complex_no=complex_no,
                trade_type_name="매매",
                is_active=True,
                article_confirm_ymd="20261007",
                numeric_price=50000,
            )
        )
        db.commit()


@pytest.mark.parametrize("sort_by", [None, "confirm_desc", "price_asc", "no_such_key"])
def test_same_value_articles_ordered_by_article_no(db, sort_by):
    """같은 1차 값 매물은 정렬 종류와 무관하게 매물 번호 오름차순"""
    _add_complex(db)
    _add_same_value_articles(db)

    if sort_by is None:
        articles, total = get_articles_by_complex(db, "C001")  # 기본(rank = 확인일자 내림차순)
    else:
        articles, total = get_articles_by_complex(db, "C001", sort_by=sort_by)

    assert total == 3
    assert [a.article_no for a in articles] == ["A001", "A002", "A003"]


def test_primary_sort_still_wins_over_article_no(db):
    """1차 기준이 다르면 1차가 먼저 — 2차 기준은 동점일 때만 쓰인다"""
    _add_complex(db)
    # 번호는 A001 이 앞이지만 가격은 A002 가 더 싸다
    db.add(Article(article_no="A001", complex_no="C001", trade_type_name="매매",
                   is_active=True, article_confirm_ymd="20261007", numeric_price=90000))
    db.add(Article(article_no="A002", complex_no="C001", trade_type_name="매매",
                   is_active=True, article_confirm_ymd="20261007", numeric_price=30000))
    db.commit()

    articles, _ = get_articles_by_complex(db, "C001", sort_by="price_asc")
    assert [a.article_no for a in articles] == ["A002", "A001"]
