"""V058 도장 2개가 **찍히는 조건**을 검증한다 — 세션 402 (PR-1).

왜 이 테스트가 필요한가: 두 컬럼의 가치는 전적으로 "아무 때나 안 찍힌다"에 있다.
기존 `complexes.last_crawled_at` 은 자매 프로젝트의 일괄 스탬프와 우리 오류 경로가
함께 찍는 바람에 "우리가 언제 제대로 긁었나"를 못 나타내게 됐고, 그래서 배치 선정
키로 못 쓴다(V058 헤더 참조). 새 컬럼이 같은 운명을 피하려면 조건이 정확해야 한다:

  articles_crawled_at = **완주**했을 때만.
    완주 = 1페이지가 정상 dict(error 없음)였고 마지막 페이지까지 오류 0.
    빈 목록([])도 완주다 — "매물이 실제로 0건"은 정상 결과이지 실패가 아니다.
  last_viewed_at = 사용자가 start-crawl 을 **호출**했을 때.
    cached / already_running / force 어느 경로로 끝나든 호출 자체가 "봤다"의 증거다.

케이스 2·3(오류 경로에서 안 찍힘)이 이 파일의 핵심이다. 뮤테이션으로 스탬프 조건을
`True` 로 고정하면 그 둘이 FAIL 하는 것을 확인했다(2026-09-13, 확인 후 정확히 복원).

⚠ 케이스 2 는 `articles_crawled_at` 이 None 으로 남는 것만 단언한다. 같은 오류 경로에서
`last_crawled_at` 이 찍히는 기존 동작은 PR-1 에서 일부러 안 건드렸고(PR-3 이 잡을
failed 전환 대상), 여기서 단언하면 PR-3 과 충돌한다.
"""

from unittest.mock import patch

import pytest

from crawler import service_discover
from db.models import Complex as ComplexModel
from routers.live._shared import _cache, _crawl_status
from services.upsert import upsert_complex_from_search
from tests.conftest import make_auth_headers

# ── 팩토리 ──


def _make_complex_data(complex_no):
    return {
        "complexNo": complex_no,
        "complexName": "도장테스트아파트",
        "cortarNo": "1168010100",
        "realEstateTypeCode": "APT",
    }


def _page(articles, is_more=False):
    """네이버 매물 목록 API 정상 응답 1장."""
    return {"articleList": articles, "isMoreData": is_more}


_ARTS = [{"articleNo": "st-1", "tradeTypeName": "매매", "dealOrWarrantPrc": "120,000"}]


@pytest.fixture
def no_throttle(monkeypatch):
    """페이지 간 2초 대기 제거 + 호출 카운터 no-op (테스트 속도/격리).

    (test_migration_v057_detail_pending_idx.py 의 no_throttle 답습 — 그쪽은 상세
    throttle, 여기는 목록 throttle.)
    """
    monkeypatch.setattr(service_discover._throttle_articles, "wait", lambda: None)
    monkeypatch.setattr(service_discover, "record_call", lambda *a, **k: None)


def _stamps(db, complex_no):
    """crawl_complex_articles 는 자체 SessionLocal() 세션을 쓰므로 캐시를 비우고 재조회."""
    db.expire_all()
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    return cpx.articles_crawled_at, cpx.last_crawled_at


# ── 1~4: articles_crawled_at (crawl_complex_articles) ──


class TestArticlesCrawledAtStamp:
    """"완주했을 때만 찍는다"를 네 갈래로 검증."""

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_normal_single_page_stamps(self, mock_api, _mock_detail, db, no_throttle):
        """1) 정상 1페이지 완주 → articles_crawled_at 찍힘 (last_crawled_at 도 찍힘)."""
        upsert_complex_from_search(db, _make_complex_data("V058-1"))
        db.commit()
        mock_api.get_complex_articles.return_value = _page(_ARTS)

        service_discover.crawl_complex_articles("V058-1")

        stamped, legacy = _stamps(db, "V058-1")
        assert stamped is not None, "정상 완주인데 articles_crawled_at 이 안 찍혔다"
        assert legacy is not None, "기존 last_crawled_at 동작이 깨졌다"

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_first_page_error_does_not_stamp(self, mock_api, _mock_detail, db, no_throttle):
        """2) 1페이지가 오류 → articles_crawled_at **None 유지** (핵심 케이스).

        옛 last_crawled_at 오염의 두 원인 중 하나가 정확히 이것이다 — 네이버가 오류를
        답해 매물을 한 건도 못 받았는데 "긁은 단지"로 기록되던 경로. 여기서 새 컬럼이
        안 찍혀야 배치 선정이 이 단지를 계속 우선 대상으로 본다.
        """
        upsert_complex_from_search(db, _make_complex_data("V058-2"))
        db.commit()
        mock_api.get_complex_articles.return_value = {"error": "네이버 API 요청 실패"}

        service_discover.crawl_complex_articles("V058-2")

        stamped, _ = _stamps(db, "V058-2")
        assert stamped is None, (
            "1페이지 오류인데 articles_crawled_at 이 찍혔다 — 오류가 '긁음'으로 "
            "위장돼 last_crawled_at 과 같은 오염이 재현된다"
        )

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_later_page_error_does_not_stamp(self, mock_api, _mock_detail, db, no_throttle):
        """3) 1페이지 정상 · 2페이지 오류 → articles_crawled_at **None 유지**.

        부분 수집도 완주가 아니다. 1페이지 매물만 받고 끊긴 상태를 "다 긁었다"로
        기록하면, 뒷 페이지 매물이 영영 갱신되지 않는 단지가 최신인 척 순번에서
        밀려난다.
        """
        upsert_complex_from_search(db, _make_complex_data("V058-3"))
        db.commit()
        mock_api.get_complex_articles.side_effect = [
            _page(_ARTS, is_more=True),           # page 1 정상, 더 있음
            {"error": "네이버 API 요청 실패"},     # page 2 오류
        ]

        service_discover.crawl_complex_articles("V058-3")

        stamped, _ = _stamps(db, "V058-3")
        assert stamped is None, (
            "2페이지 오류(부분 수집)인데 articles_crawled_at 이 찍혔다"
        )

    @patch("services.enricher.NaverEstateAPI")
    @patch("crawler.service_discover.NaverEstateAPI")
    def test_empty_list_is_completion(self, mock_api, _mock_detail, db, no_throttle):
        """4) 1페이지 정상인데 articleList 가 빈 배열 → articles_crawled_at **찍힘**.

        매물 0건은 오류가 아니라 정상 결과다(실제로 매물이 없는 단지). 이걸 미완주로
        취급하면 빈 단지 수만 곳이 영원히 순번 앞자리를 차지해 순환이 멈춘다.
        """
        upsert_complex_from_search(db, _make_complex_data("V058-4"))
        db.commit()
        mock_api.get_complex_articles.return_value = _page([])

        service_discover.crawl_complex_articles("V058-4")

        stamped, _ = _stamps(db, "V058-4")
        assert stamped is not None, "빈 목록은 완주인데 articles_crawled_at 이 안 찍혔다"


# ── 5: last_viewed_at (start_live_crawl 라우터) ──


class _FakeThread:
    """실제 크롤 스레드를 띄우지 않는 대역 (test_live_crawl_force.py 답습)."""

    def __init__(self, *, target=None, args=(), daemon=True):
        pass

    def start(self):
        pass


def _reset_live_state(complex_no):
    _cache.delete(f"crawl_done:{complex_no}")
    _crawl_status.pop(complex_no, None)


def _make_complex_row(db, complex_no):
    upsert_complex_from_search(db, _make_complex_data(complex_no))
    db.commit()


def _last_viewed(db, complex_no):
    db.expire_all()
    return (
        db.query(ComplexModel)
        .filter(ComplexModel.complex_no == complex_no)
        .first()
        .last_viewed_at
    )


class TestLastViewedAtStamp:
    """start-crawl 호출 = "사용자가 봤다" — 응답 경로와 무관하게 찍힌다."""

    def test_started_path_stamps(self, client, db):
        """5) 신규 크롤 시작(started) 경로에서 last_viewed_at 이 찍힌다."""
        _reset_live_state("V058-5")
        _make_complex_row(db, "V058-5")
        headers = make_auth_headers(db, user_id="viewer-1")
        assert _last_viewed(db, "V058-5") is None

        try:
            with patch("routers.live.crawl.threading.Thread", _FakeThread):
                res = client.post(
                    "/api/live/V058-5/articles/start-crawl", headers=headers
                )
            assert res.status_code == 200
            assert res.json()["status"] == "started"
            assert _last_viewed(db, "V058-5") is not None, (
                "start-crawl 을 호출했는데 last_viewed_at 이 안 찍혔다"
            )
        finally:
            _reset_live_state("V058-5")

    def test_cached_path_also_stamps(self, client, db):
        """5-b) cached 조기 return 경로에서도 찍힌다 (스탬프가 함수 맨 앞이어야 하는 이유).

        쿨다운 캐시가 살아 있으면 크롤은 안 돌지만 사용자는 그 단지를 **봤다**. 이 경로가
        빠지면 인기 있는 단지일수록(= 자주 열려 캐시에 걸리는 단지일수록) 조회 기록이
        덜 남는 역설이 생긴다.
        """
        _reset_live_state("V058-6")
        _make_complex_row(db, "V058-6")
        headers = make_auth_headers(db, user_id="viewer-2")
        _cache.set("crawl_done:V058-6", True)

        try:
            res = client.post("/api/live/V058-6/articles/start-crawl", headers=headers)
            assert res.status_code == 200
            assert res.json()["status"] == "cached"
            assert _last_viewed(db, "V058-6") is not None, (
                "cached 경로에서 last_viewed_at 이 안 찍혔다 — 스탬프가 조기 return "
                "뒤로 밀렸는지 확인하라"
            )
        finally:
            _reset_live_state("V058-6")
