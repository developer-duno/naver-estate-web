"""목록 API 오류·빈 응답 처리 — PR-3 (세션 402).

배경(p0_plan.md §1 ③⑥): 목록 API 1페이지 오류를 "빈 단지"로 오인해 completed·
total=0 으로 마무리하며 last_crawled_at 까지 찍던 결함(⑥), 2페이지 이상 오류 시
부분 목록으로 delete_missing_articles 를 호출해 아직 못 본 뒷 페이지 매물을
부당 삭제하던 결함(⑥-b), dead 매물 재검사 경로가 상세 크롤 쪽에만 있어 목록에서
사라진 매물이 영구 방치되던 결함(③)을 잡는다.

처리 방침(사장님 결정 2026-09-13):
- 1페이지 오류 = 예외로 승격 → job failed, 스탬프 전부 미도달.
- 페이지≥2 오류 = 부분 수집으로 completed 유지, 삭제 단계는 생략.
- 진짜 0건(1페이지 정상 + articleList 빈 배열) = 소프트 비활성화(is_active=False).
- 활성 매물 보유 단지가 연속 5회 진짜 0건이면 배치/인기 회차를 중단(네이버 소프트
  차단 의심 — 소프트 비활성은 되돌릴 수 있는 방어선이라 완전 차단은 아니다).
"""

from unittest.mock import patch

from crawler import service_discover
from db.models import Article as ArticleModel
from db.models import Complex as ComplexModel
from db.models import CrawlJob
from services.upsert import upsert_complex_from_search

# ── 팩토리 ──


def _make_complex_data(complex_no):
    return {
        "complexNo": complex_no,
        "complexName": "빈응답테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _page(articles, is_more=False):
    return {"articleList": articles, "isMoreData": is_more}


_ARTS = [{"articleNo": "ee-1", "tradeTypeName": "매매", "dealOrWarrantPrc": "120,000"}]


def _make_active_article(db, complex_no, article_no):
    db.add(
        ArticleModel(
            article_no=article_no,
            complex_no=complex_no,
            trade_type_name="매매",
            is_active=True,
        )
    )
    db.commit()


def _reload_complex(db, complex_no):
    db.expire_all()
    return db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()


def _no_throttle(monkeypatch):
    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)
    service_discover.reset_empty_streak()


# ── 1: 1페이지 오류 → failed, 스탬프 전무, 기존 매물 불변 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_first_page_error_fails_job_and_no_stamps(mock_api, _mock_detail, db, monkeypatch):
    _no_throttle(monkeypatch)
    upsert_complex_from_search(db, _make_complex_data("EE-1"))
    db.commit()
    _make_active_article(db, "EE-1", "keep-1")
    mock_api.get_complex_articles.return_value = {"error": "네이버 API 요청 실패"}

    result = service_discover.crawl_complex_articles("EE-1")

    assert result is False
    cpx = _reload_complex(db, "EE-1")
    assert cpx.last_crawled_at is None, "1페이지 오류인데 last_crawled_at 이 찍혔다"
    assert cpx.articles_crawled_at is None

    job = db.query(CrawlJob).filter(CrawlJob.target_id == "EE-1").one()
    assert job.status == "failed"
    assert "목록 API 1페이지 실패" in job.error_message

    kept = db.query(ArticleModel).filter(ArticleModel.article_no == "keep-1").first()
    assert kept is not None and kept.is_active is True, "1페이지 오류인데 기존 매물이 건드려졌다"


# ── 2: 2페이지 오류 → completed + 부분수집 문구, 삭제 생략 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_later_page_error_skips_deletion(mock_api, _mock_detail, db, monkeypatch):
    _no_throttle(monkeypatch)
    upsert_complex_from_search(db, _make_complex_data("EE-2"))
    db.commit()
    # 이번 크롤에서 안 보일 기존 매물 — 정상이라면 delete_missing_articles 가 지웠을 것
    _make_active_article(db, "EE-2", "stale-1")
    mock_api.get_complex_articles.side_effect = [
        _page(_ARTS, is_more=True),        # page 1 정상
        {"error": "네이버 API 요청 실패"},  # page 2 오류
    ]

    result = service_discover.crawl_complex_articles("EE-2")

    assert result is True
    cpx = _reload_complex(db, "EE-2")
    assert cpx.articles_crawled_at is None, "부분 수집인데 articles_crawled_at 이 찍혔다"

    job = db.query(CrawlJob).filter(CrawlJob.target_id == "EE-2").one()
    assert job.status == "completed"
    assert "부분 수집" in job.error_message
    assert "2페이지" in job.error_message

    # 1페이지 매물은 정상 upsert
    new_art = db.query(ArticleModel).filter(ArticleModel.article_no == "ee-1").first()
    assert new_art is not None

    # 미목격 기존 매물은 삭제되면 안 된다(부분 목록으로 삭제하면 뒷 페이지 매물 오삭제 위험)
    stale = db.query(ArticleModel).filter(ArticleModel.article_no == "stale-1").first()
    assert stale is not None, "부분 수집인데 미목격 매물이 삭제됐다"


# ── 3: 진짜 0건 + 기존 활성 2건 → 소프트 비활성 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_genuine_empty_deactivates_existing_active(mock_api, _mock_detail, db, monkeypatch):
    _no_throttle(monkeypatch)
    upsert_complex_from_search(db, _make_complex_data("EE-3"))
    db.commit()
    _make_active_article(db, "EE-3", "ghost-1")
    _make_active_article(db, "EE-3", "ghost-2")
    mock_api.get_complex_articles.return_value = _page([])

    result = service_discover.crawl_complex_articles("EE-3")

    assert result is True
    ghosts = db.query(ArticleModel).filter(ArticleModel.complex_no == "EE-3").all()
    assert len(ghosts) == 2, "물리 삭제되면 안 된다 — 행은 남아야 한다"
    assert all(g.is_active is False for g in ghosts), "진짜 0건인데 소프트 비활성화가 안 됐다"

    job = db.query(CrawlJob).filter(CrawlJob.target_id == "EE-3").one()
    assert job.status == "completed"
    assert job.total_items == 0

    cpx = _reload_complex(db, "EE-3")
    assert cpx.articles_crawled_at is not None, "빈 목록도 완주인데 articles_crawled_at 이 안 찍혔다"


# ── 4: 진짜 0건 + 기존 없음 → 무변화 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_genuine_empty_no_existing_articles_noop(mock_api, _mock_detail, db, monkeypatch):
    _no_throttle(monkeypatch)
    upsert_complex_from_search(db, _make_complex_data("EE-4"))
    db.commit()
    mock_api.get_complex_articles.return_value = _page([])

    result = service_discover.crawl_complex_articles("EE-4")

    assert result is True
    assert db.query(ArticleModel).filter(ArticleModel.complex_no == "EE-4").count() == 0
    job = db.query(CrawlJob).filter(CrawlJob.target_id == "EE-4").one()
    assert job.status == "completed"
    cpx = _reload_complex(db, "EE-4")
    assert cpx.articles_crawled_at is not None


# ── 5: 차단기 — 활성 단지 5개 연속 0건 → 배치 회차 중단 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_streak_breaker_stops_batch_after_five(mock_api, _mock_detail, db, monkeypatch):
    _no_throttle(monkeypatch)
    from routers.live._shared import _cache, _crawl_status

    # 활성 매물이 있던 단지 6개 — 전부 진짜 0건을 반환하도록 mock
    active_nos = [f"STK-{i}" for i in range(6)]
    for no in active_nos:
        upsert_complex_from_search(db, _make_complex_data(no))
        db.commit()
        _make_active_article(db, no, f"ghost-{no}")
        _cache.delete(f"crawl_done:{no}")
        _crawl_status.pop(no, None)

    call_count = {"n": 0}

    def _fake_get_complexes(_db, _limit):
        return db.query(ComplexModel).filter(ComplexModel.complex_no.in_(active_nos)).order_by(
            ComplexModel.complex_no
        ).all()

    def _count_and_empty(complex_no, page=1):
        call_count["n"] += 1
        return _page([])

    mock_api.get_complex_articles.side_effect = _count_and_empty
    monkeypatch.setattr(service_discover, "get_complexes_for_article_crawl", _fake_get_complexes)

    service_discover.crawl_articles_batch(batch_size=10)

    # 5개 단지가 연속 0건을 내면 6번째는 호출되지 않아야 한다(각 단지 1페이지만 부르므로
    # get_complex_articles 총 호출 수 == 처리된 단지 수)
    assert call_count["n"] == 5, f"6번째 단지가 호출됐다 (호출 횟수={call_count['n']})"


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_streak_breaker_ignores_inactive_complexes(mock_api, _mock_detail, db, monkeypatch):
    """기존 매물이 없던(비활성) 단지의 0건은 카운터를 올리지 않는다."""
    _no_throttle(monkeypatch)
    for i in range(6):
        upsert_complex_from_search(db, _make_complex_data(f"NOACT-{i}"))
    db.commit()

    mock_api.get_complex_articles.return_value = _page([])

    from routers.live._shared import _cache, _crawl_status
    for i in range(6):
        _cache.delete(f"crawl_done:NOACT-{i}")
        _crawl_status.pop(f"NOACT-{i}", None)

    def _fake_get_complexes(_db, _limit):
        return (
            db.query(ComplexModel)
            .filter(ComplexModel.complex_no.like("NOACT-%"))
            .order_by(ComplexModel.complex_no)
            .all()
        )

    monkeypatch.setattr(service_discover, "get_complexes_for_article_crawl", _fake_get_complexes)

    service_discover.crawl_articles_batch(batch_size=10)

    assert service_discover.get_empty_streak() == 0


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_streak_breaker_survives_mixed_discovery_complexes(mock_api, _mock_detail, db, monkeypatch):
    """활성 단지 사이에 발굴 단지(원래 0건)가 섞여도 차단기가 발동한다.

    배치는 활성 lane 80% + 발굴 lane 20% 로 섞여 돌기 때문에(PR-2), 발굴 단지의
    0건이 카운터를 **리셋**하면 다섯 개 안에 하나만 끼어도 차단기가 영원히 발동하지
    못한다. 네이버가 전면 소프트 차단해 모든 단지가 0건을 답하는 상황에서 대량
    비활성화를 못 막게 되는 것이 그 결함의 실제 피해다.

    뮤테이션(세션 402 확인): `_note_empty_result` 가 had_existing_active=False 일 때
    카운터를 0 으로 되돌리도록 되돌리면 이 테스트가 FAIL 한다(7개 전부 호출됨).
    """
    _no_throttle(monkeypatch)
    from routers.live._shared import _cache, _crawl_status

    # 활성 4개 → 발굴 1개 → 활성 2개 순서. 전부 0건을 답한다.
    # 발굴 단지가 카운터를 리셋하지 않는다면 6번째(활성 5번째)에서 차단기가 걸려
    # 총 6개만 호출된다. 리셋하면 7개 전부 호출된다.
    order = ["MIX-1", "MIX-2", "MIX-3", "MIX-4", "MIX-5-discover", "MIX-6", "MIX-7"]
    for no in order:
        upsert_complex_from_search(db, _make_complex_data(no))
        db.commit()
        if "discover" not in no:
            _make_active_article(db, no, f"ghost-{no}")
        _cache.delete(f"crawl_done:{no}")
        _crawl_status.pop(no, None)

    called: list[str] = []

    def _count_and_empty(complex_no, page=1):
        called.append(complex_no)
        return _page([])

    def _fake_get_complexes(_db, _limit):
        rows = {c.complex_no: c for c in db.query(ComplexModel).filter(
            ComplexModel.complex_no.in_(order)
        ).all()}
        return [rows[no] for no in order]

    mock_api.get_complex_articles.side_effect = _count_and_empty
    monkeypatch.setattr(service_discover, "get_complexes_for_article_crawl", _fake_get_complexes)

    service_discover.crawl_articles_batch(batch_size=10)

    assert called == order[:6], (
        f"발굴 단지가 차단기 카운터를 리셋했다 — 호출된 단지: {called}"
    )


# ── 6: _background_crawl 진짜 0건 → 소프트 비활성 ──


def test_background_crawl_genuine_empty_deactivates(db, monkeypatch):
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    complex_no = "EE-BG-1"
    upsert_complex_from_search(db, _make_complex_data(complex_no))
    db.commit()
    _make_active_article(db, complex_no, "bg-ghost-1")

    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    monkeypatch.setattr(
        _crawl_bg, "_fetch_articles_all_trade_types", lambda *_a, **_kw: _page([])
    )
    monkeypatch.setattr(_crawl_bg, "enrich_complex_detail", lambda *_a, **_kw: None)
    monkeypatch.setattr(_crawl_bg, "_crawl_details_for_complex", lambda *_a, **_kw: None)

    _crawl_bg._background_crawl(complex_no)

    db.expire_all()
    ghost = db.query(ArticleModel).filter(ArticleModel.article_no == "bg-ghost-1").first()
    assert ghost is not None, "물리 삭제되면 안 된다"
    assert ghost.is_active is False, "진짜 0건인데 소프트 비활성화가 안 됐다"

    cpx = _reload_complex(db, complex_no)
    assert cpx.articles_crawled_at is not None
