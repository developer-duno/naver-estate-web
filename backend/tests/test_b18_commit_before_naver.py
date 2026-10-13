"""B18 ②③ 회귀 테스트 — 네이버 호출 동안 DB 쓰기를 붙잡지 않기 + 상세 보강 속도 조절 장치

배경: 시세 수집(요청 시·주간 배치)과 새 단지 찾기(crawl_complex_articles)가 쓰기를 쌓은 채
네이버를 기다려, 그동안 행 잠금·열린 트랜잭션을 쥐고 있었다(세션 396·B14·B18① 과 같은 꼴).
또 상세 보강(enrich_complex_detail) 호출처 3곳에 속도 조절 장치가 없었다(IP 차단 방지 규칙 1번).

테스트 DB 는 SQLite 라 PostgreSQL 잠금 자체는 못 잰다 → "커밋 순서·장치 호출" 로 단언한다.
"""

from unittest.mock import patch

import pytest

from db.models import Complex as ComplexModel
from services.upsert import upsert_complex_from_search

# ── 팩토리 함수 ──


def _make_complex_data(complex_no):
    """테스트용 단지 검색 데이터 (상세 미보강)"""
    return {
        "complexNo": complex_no,
        "complexName": "B18테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _make_price_response():
    """네이버 시세 API 응답 (marketPrices 형식, 2건)"""
    return {
        "areaNo": None,
        "marketPrices": [
            {"baseYearMonthDay": "20260301", "upperPriceLimit": 160000,
             "lowPriceLimit": 140000, "averagePriceLimit": 150000},
            {"baseYearMonthDay": "20260201", "upperPriceLimit": 155000,
             "lowPriceLimit": 135000, "averagePriceLimit": 145000},
        ],
    }


def _make_real_price_response():
    """네이버 실거래가 API 응답 (1개월)"""
    return {
        "areaNo": 1001,
        "realPriceOnMonthList": [
            {"realPriceList": [
                {"tradeYear": "2026", "tradeMonth": "3", "dealPrice": 155000},
                {"tradeYear": "2026", "tradeMonth": "3", "dealPrice": 148000},
            ]},
        ],
    }


def _make_articles_response():
    """네이버 매물 리스트 응답 (2건, 1페이지)"""
    return {
        "articleList": [
            {"articleNo": "b18-art-1", "tradeTypeName": "매매", "dealOrWarrantPrc": "120,000"},
            {"articleNo": "b18-art-2", "tradeTypeName": "전세", "dealOrWarrantPrc": "60,000"},
        ],
        "isMoreData": False,
    }


def _make_detail_response():
    """네이버 단지 상세 정상 응답"""
    return {
        "complexDetail": {"constructionCompanyName": "삼성물산", "parkingPossibleCount": "500"},
        "complexPyeongDetailList": [],
    }


def _assert_commit_between_calls(events: list[str]) -> None:
    """네이버 호출('call') 두 번 사이마다 커밋('commit')이 한 번 이상 있어야 한다."""
    call_idx = [i for i, e in enumerate(events) if e == "call"]
    assert len(call_idx) >= 2, f"호출이 2번 미만: {events}"
    for prev, nxt in zip(call_idx, call_idx[1:]):
        assert "commit" in events[prev + 1:nxt], f"호출 사이에 커밋 없음: {events}"


class _RecordingThrottle:
    """wait/on_success/on_rate_limit 호출 순서를 공용 이벤트 목록에 기록하는 가짜 장치"""

    def __init__(self, name, events):
        self.name = name
        self.events = events

    def wait(self, *a, **k):
        self.events.append(f"{self.name}.wait")

    def on_success(self, *a, **k):
        self.events.append(f"{self.name}.on_success")

    def on_rate_limit(self, *a, **k):
        self.events.append(f"{self.name}.on_rate_limit")


# ── A. 요청 시 시세 수집 ──


@patch("crawler.service_price._throttle_ondemand")
@patch("crawler.service_price.NaverEstateAPI")
def test_ondemand_price_commits_after_each_naver_call(mock_api, _mock_throttle, db, monkeypatch):
    """A: 네이버 호출 한 번의 결과를 upsert 한 뒤 바로 커밋 — 다음 호출 전 열린 쓰기 0.

    뮤테이션: 루프 안 커밋(시세·실거래가)을 지우면 호출 사이 커밋이 없어 FAIL.
    """
    upsert_complex_from_search(db, _make_complex_data("b18p1"))
    db.commit()

    events: list[str] = []
    real_commit = db.commit

    def _commit():
        events.append("commit")
        return real_commit()

    monkeypatch.setattr(db, "commit", _commit)

    def _prices(*a, **k):
        events.append("call")
        return _make_price_response()

    def _real(*a, **k):
        events.append("call")
        return _make_real_price_response()

    mock_api.get_complex_prices.side_effect = _prices
    mock_api.get_complex_real_prices.side_effect = _real

    from crawler.service_price import collect_price_history_for_complex
    result = collect_price_history_for_complex(db, "b18p1")

    # 반환값 의미 그대로: 시세 2건×2 + 실거래 1건×2 = 6, 실패 0, total = 1 area×2 + 2
    assert result == {"collected": 6, "failed": 0, "total": 4}
    assert events.count("call") == 4
    _assert_commit_between_calls(events)
    assert events[-1] == "commit", f"마지막 호출 결과가 커밋되지 않음: {events}"


@patch("crawler.service_price._throttle_ondemand")
@patch("crawler.service_price.NaverEstateAPI")
def test_ondemand_price_no_commit_when_nothing_collected(mock_api, _mock_throttle, db, monkeypatch):
    """A 에러: 호출이 전부 실패하면 커밋하지 않고 failed 만 센다(빈 커밋 0)."""
    upsert_complex_from_search(db, _make_complex_data("b18p2"))
    db.commit()

    commits = []
    real_commit = db.commit
    monkeypatch.setattr(db, "commit", lambda: (commits.append(1), real_commit())[1])
    mock_api.get_complex_prices.side_effect = Exception("429")
    mock_api.get_complex_real_prices.side_effect = Exception("429")

    from crawler.service_price import collect_price_history_for_complex
    result = collect_price_history_for_complex(db, "b18p2")

    assert result == {"collected": 0, "failed": 4, "total": 4}
    assert commits == []


# ── B. 주간 배치 ──


@patch("crawler.service_price._throttle")
@patch("crawler.service_price.NaverEstateAPI")
def test_weekly_batch_commits_after_each_complex(mock_api, _mock_throttle, db, monkeypatch):
    """B: 네이버 호출(A1·B1) 한 번의 결과를 upsert 한 뒤 바로 커밋 — 다음 호출 대기 전에 쓰기를 놓는다.

    체크포인트는 그대로 5단지마다만 저장(3단지 배치 → 저장 0회).
    뮤테이션: 호출마다 커밋을 지우면 3단지(체크포인트 주기 5 미만)에서 호출 사이 커밋이 없어 FAIL.
    """
    from crawler import service_price

    for i in range(3):
        upsert_complex_from_search(db, _make_complex_data(f"b18w{i}"))
    db.commit()

    events: list[str] = []
    real_factory = service_price.SessionLocal

    def _factory():
        session = real_factory()
        real_commit = session.commit

        def _commit():
            events.append("commit")
            return real_commit()

        session.commit = _commit
        return session

    monkeypatch.setattr(service_price, "SessionLocal", _factory)

    def _prices(complex_no, trade_type=None, **k):
        events.append("call")
        return _make_price_response()

    mock_api.get_complex_prices.side_effect = _prices

    saves = []
    monkeypatch.setattr(service_price._checkpoint, "save", lambda *a, **k: saves.append(a))

    service_price.collect_price_history(batch_size=10)

    assert events.count("call") == 6  # 3단지 × A1·B1
    # 같은 단지 A1→B1 사이, 단지 사이 모두 커밋이 있어야 한다
    _assert_commit_between_calls(events)
    assert saves == [], "체크포인트 저장 주기가 바뀜"


# ── C. 새 단지 찾기 — 상세 보강 전 커밋 + 장치 ──


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_crawl_articles_commits_before_enrich_and_throttles(
    mock_articles_api, mock_detail_api, db, monkeypatch,
):
    """C: complexes UPDATE 를 커밋한 뒤 상세 보강을 부르고, 그 전에 장치 wait.

    검증: 상세 API 가 불리는 순간 다른 세션에서 articles_crawled_at 이 보인다(=커밋됨).
    (매물 upsert 는 upsert_article(commit=True) 가 이미 건마다 커밋한다.)
    뮤테이션: 상세 보강 전 커밋 줄을 지우면 다른 세션에서 안 보여 FAIL.
    """
    from crawler import service_discover
    from db.database import SessionLocal as TestSession

    upsert_complex_from_search(db, _make_complex_data("b18c1"))
    db.commit()

    events: list[str] = []
    seen_at_enrich: dict = {}
    throttle = service_discover._throttle_detail
    monkeypatch.setattr(throttle, "wait", lambda *a, **k: events.append("wait"))
    monkeypatch.setattr(throttle, "on_success", lambda *a, **k: events.append("on_success"))

    def _detail(complex_no):
        events.append("enrich")
        other = TestSession()
        try:
            cpx = other.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
            seen_at_enrich["articles_crawled_at"] = cpx.articles_crawled_at
        finally:
            other.close()
        return _make_detail_response()

    mock_articles_api.get_complex_articles.return_value = _make_articles_response()
    mock_detail_api.get_complex_detail.side_effect = _detail

    assert service_discover.crawl_complex_articles("b18c1") is True

    assert events == ["wait", "enrich", "on_success"]
    assert seen_at_enrich["articles_crawled_at"] is not None, "상세 보강 전에 단지 UPDATE 가 커밋되지 않음"


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_crawl_articles_enrich_failure_skips_on_success(
    mock_articles_api, mock_detail_api, db, monkeypatch,
):
    """C 에러: 상세 보강이 실패(False)하면 on_success 를 부르지 않는다(배치와 같은 쓰는 법)."""
    from crawler import service_discover

    upsert_complex_from_search(db, _make_complex_data("b18c2"))
    db.commit()

    events: list[str] = []
    throttle = service_discover._throttle_detail
    monkeypatch.setattr(throttle, "wait", lambda *a, **k: events.append("wait"))
    monkeypatch.setattr(throttle, "on_success", lambda *a, **k: events.append("on_success"))
    mock_articles_api.get_complex_articles.return_value = _make_articles_response()
    mock_detail_api.get_complex_detail.side_effect = Exception("타임아웃")

    assert service_discover.crawl_complex_articles("b18c2") is True
    assert events == ["wait"]


# ── D. 실시간 크롤 백그라운드·면적별 상세 — 장치 ──


@pytest.mark.parametrize(
    "enrich_ok, expected_tail",
    [
        (True, ["complex_detail.wait", "enrich", "complex_detail.on_success"]),
        (False, ["complex_detail.wait", "enrich"]),  # 실패 → on_success 없음
    ],
)
def test_background_crawl_waits_complex_detail_throttle(db, monkeypatch, enrich_ok, expected_tail):
    """D: _crawl_bg 의 상세 보강 직전에 complex_detail 장치 wait, 성공일 때만 on_success."""
    from routers.live import _crawl_bg
    from routers.live._shared import _active_complexes, _crawl_lock, _crawl_status

    complex_no = "b18d1"
    upsert_complex_from_search(db, _make_complex_data(complex_no))
    db.commit()
    with _crawl_lock:
        _crawl_status.pop(complex_no, None)
        _active_complexes.discard(complex_no)

    events: list[str] = []
    monkeypatch.setattr(
        _crawl_bg, "get_shared_throttle", lambda name, *a, **k: _RecordingThrottle(name, events),
    )
    monkeypatch.setattr(
        _crawl_bg, "_fetch_articles_all_trade_types",
        lambda *_a, **_kw: {"articleList": [], "isMoreData": False},
    )

    def _enrich(_db, _no):
        events.append("enrich")
        return enrich_ok

    monkeypatch.setattr(_crawl_bg, "enrich_complex_detail", _enrich)
    monkeypatch.setattr(_crawl_bg, "_crawl_details_for_complex", lambda *_a, **_kw: None)

    _crawl_bg._background_crawl(complex_no)

    tail = events[events.index("complex_detail.wait"):]
    assert tail == expected_tail


def test_pyeong_details_waits_complex_detail_throttle(client, db, approved_headers, monkeypatch):
    """D: 면적별 상세(평형 없음 → 상세 보강) 직전에 complex_detail 장치 wait."""
    import routers.complexes as complexes_router
    import services.enricher as enricher

    upsert_complex_from_search(db, _make_complex_data("b18d2"))
    db.commit()

    events: list[str] = []
    monkeypatch.setattr(
        complexes_router, "get_shared_throttle",
        lambda name, *a, **k: _RecordingThrottle(name, events),
    )

    def _enrich(_db, _no):
        events.append("enrich")
        return False  # 실패 → on_success 없음

    monkeypatch.setattr(enricher, "enrich_complex_detail", _enrich)

    res = client.get("/api/complexes/b18d2/pyeong-details", headers=approved_headers)
    assert res.status_code == 200
    assert events == ["complex_detail.wait", "enrich"]
