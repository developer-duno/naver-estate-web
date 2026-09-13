"""get_complexes_for_article_crawl 검증 — 활성 lane + 발굴 lane 두 몫 (세션 402).

배경: 옛 선정 키 `has_article.asc()`(매물 0건 단지 우선)는 2026-04-13 당시엔
정당했으나(그때는 last_crawled_at 이 SQL 일괄 UPDATE 로 75% 허수), 2026-09-13
실측으로 매물 0건 풀이 53,581 로 불어나 그 1차 정렬이 걸리는 한 활성 매물을
가진 10,567 단지에 사실상 도달 불가 — 활성 단지의 76%가 30일+ 미방문이었다.

처방 = 몫 분할(lane): 활성 lane(80%, articles_crawled_at 오래된 순) +
발굴 lane(20%, 활성 매물 없고 articles_crawled_at 도 없는 단지, last_crawled_at
오래된 순). 한쪽이 모자라면 남는 몫을 다른 lane 이 흡수한다.
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


def _make_active_complex(db, complex_no, articles_crawled_at=None, last_crawled_at=None):
    """활성 매물 1건을 가진 단지를 만들고 스탬프를 세팅한다."""
    upsert_complex_from_search(db, _make_complex_data(complex_no))
    _add_active_article(db, complex_no, f"a-{complex_no}")
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
        {"articles_crawled_at": articles_crawled_at, "last_crawled_at": last_crawled_at}
    )


def _make_discover_complex(db, complex_no, last_crawled_at=None):
    """활성 매물이 없고 articles_crawled_at 도 없는(발굴 대상) 단지를 만든다."""
    upsert_complex_from_search(db, _make_complex_data(complex_no))
    db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).update(
        {"last_crawled_at": last_crawled_at}
    )


# ── 테스트 ──


class TestGetComplexesForArticleCrawl:
    """매물 수집 배치 대상 조회 쿼리 검증 — 활성/발굴 두 lane"""

    def test_active_lane_orders_by_articles_crawled_at_null_first(self, db):
        """활성 lane: articles_crawled_at 이 NULL 인 단지가 오래된 순보다 먼저."""
        now = utcnow()
        _make_active_complex(db, "act_old", articles_crawled_at=now - timedelta(days=1))
        _make_active_complex(db, "act_null", articles_crawled_at=None)
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert nos.index("act_null") < nos.index("act_old"), (
            "articles_crawled_at NULL 단지가 활성 lane 에서 먼저 나오지 않음"
        )

    def test_active_lane_tiebreak_by_last_crawled_at(self, db):
        """활성 lane: articles_crawled_at 이 동률(둘 다 NULL)이면 last_crawled_at 오래된 순."""
        now = utcnow()
        _make_active_complex(db, "act_recent", articles_crawled_at=None, last_crawled_at=now)
        _make_active_complex(db, "act_ancient", articles_crawled_at=None, last_crawled_at=now - timedelta(days=365))
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert nos.index("act_ancient") < nos.index("act_recent")

    def test_discover_lane_excludes_active_complexes(self, db):
        """발굴 lane: 활성 매물이 있는 단지는 발굴 몫에 섞이지 않는다."""
        # 활성 lane 을 꽉 채워 발굴 lane 이 뒤에 오도록(limit=10 → n_active=8)
        for i in range(8):
            _make_active_complex(db, f"act{i}")
        _make_discover_complex(db, "disc1")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert "disc1" in nos
        assert nos.index("disc1") >= 8  # 활성 8개 뒤에 위치

    def test_limit_10_splits_8_active_2_discover(self, db):
        """정상: limit=10 이면 활성 8개 + 발굴 2개로 나뉜다(충분히 있을 때)."""
        for i in range(8):
            _make_active_complex(db, f"act{i}")
        for i in range(5):
            _make_discover_complex(db, f"disc{i}")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        active_nos = [n for n in nos if n.startswith("act")]
        discover_nos = [n for n in nos if n.startswith("disc")]
        assert len(active_nos) == 8
        assert len(discover_nos) == 2
        assert len(result) == 10

    def test_active_shortage_fills_with_discover(self, db):
        """엣지: 활성 단지가 3개뿐이면 발굴이 나머지 7개를 채운다(limit=10)."""
        for i in range(3):
            _make_active_complex(db, f"act{i}")
        for i in range(10):
            _make_discover_complex(db, f"disc{i}")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        active_nos = [n for n in nos if n.startswith("act")]
        discover_nos = [n for n in nos if n.startswith("disc")]
        assert len(active_nos) == 3
        assert len(discover_nos) == 7
        assert len(result) == 10

    def test_discover_shortage_fills_with_active(self, db):
        """엣지: 발굴 대상이 0개면 활성 lane 이 limit 전체를 채운다."""
        for i in range(10):
            _make_active_complex(db, f"act{i}")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert len(nos) == 10
        assert all(n.startswith("act") for n in nos)

    def test_stamped_zero_article_complex_excluded_from_discover(self, db):
        """정상: articles_crawled_at 이 이미 찍힌 0건 단지는 발굴 lane 에서 제외된다.

        (한 번 완주했으면 '발굴 대상'이 아니라 활성 lane 쪽 재방문 몫으로
        넘어가야 한다 — 단 이 단지는 활성 매물이 없으므로 활성 lane 조건에도
        안 걸려 이번 배치에서는 아예 안 뽑힌다.)
        """
        now = utcnow()
        upsert_complex_from_search(db, _make_complex_data("stamped_zero"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "stamped_zero").update(
            {"articles_crawled_at": now - timedelta(days=100), "last_crawled_at": now - timedelta(days=100)}
        )
        _make_discover_complex(db, "disc_real")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert "stamped_zero" not in nos
        assert "disc_real" in nos

    def test_respects_limit(self, db):
        """정상: limit 만큼만 반환한다."""
        for i in range(5):
            _make_discover_complex(db, f"lim{i}")
        db.commit()

        result = get_complexes_for_article_crawl(db, limit=3)
        assert len(result) == 3


class TestGetComplexesForPopularCrawl:
    """인기 단지 선제적 크롤링 대상 조회 쿼리 검증 — last_viewed_at 7일 우선 + 활성 폴백"""

    def test_recent_viewed_ordered_by_latest_first(self, db):
        """정상: 최근 7일 내 조회된 단지가 last_viewed_at 최신순으로 반환된다."""
        from db.complex_queries import get_complexes_for_popular_crawl

        now = utcnow()
        upsert_complex_from_search(db, _make_complex_data("v_old"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "v_old").update(
            {"last_viewed_at": now - timedelta(days=3)}
        )
        upsert_complex_from_search(db, _make_complex_data("v_new"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "v_new").update(
            {"last_viewed_at": now - timedelta(hours=1)}
        )
        db.commit()

        result = get_complexes_for_popular_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert nos.index("v_new") < nos.index("v_old")

    def test_viewed_over_7_days_ago_excluded(self, db):
        """엣지: 8일 전 조회된 단지는 인기 lane 에서 제외된다."""
        from db.complex_queries import get_complexes_for_popular_crawl

        now = utcnow()
        upsert_complex_from_search(db, _make_complex_data("v_stale"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "v_stale").update(
            {"last_viewed_at": now - timedelta(days=8)}
        )
        db.commit()

        result = get_complexes_for_popular_crawl(db, limit=10)
        nos = [c.complex_no for c in result]
        assert "v_stale" not in nos

    def test_shortage_filled_by_active_lane_without_duplicates(self, db):
        """정상: 7일 내 조회 단지가 부족하면 활성 lane(오래된 순)으로 채우고 중복이 없다."""
        from db.complex_queries import get_complexes_for_popular_crawl

        now = utcnow()
        upsert_complex_from_search(db, _make_complex_data("v1"))
        db.query(ComplexModel).filter(ComplexModel.complex_no == "v1").update(
            {"last_viewed_at": now - timedelta(hours=1)}
        )
        for i in range(5):
            _make_active_complex(db, f"fallback{i}", articles_crawled_at=now - timedelta(days=i + 1))
        db.commit()

        result = get_complexes_for_popular_crawl(db, limit=3)
        nos = [c.complex_no for c in result]
        assert nos[0] == "v1"
        assert len(nos) == 3
        assert len(set(nos)) == len(nos)  # 중복 없음

    def test_empty_when_nothing_matches(self, db):
        """엣지: 조회 이력도 활성 매물도 없으면 빈 리스트를 반환한다."""
        from db.complex_queries import get_complexes_for_popular_crawl

        upsert_complex_from_search(db, _make_complex_data("nobody"))
        db.commit()

        result = get_complexes_for_popular_crawl(db, limit=10)
        assert result == []
