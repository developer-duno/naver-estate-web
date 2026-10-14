"""B20 ②③④ + B18 덤 회귀 테스트

A. 상세 보강이 429 를 끝까지 받으면 공유 "complex_detail" 간격을 늘린다(enricher 안에서 판정).
B. 상세 배치에서 DB 저장 예외가 나도 네이버 간격은 늘리지 않는다.
C. 요청 시 시세 수집이 도중에 실패해도 시세 차트 캐시를 비운다.
D. 새 단지 찾기가 도중에 실패하면 failed 행에 커밋까지 끝난 건수를 남긴다.

네이버·공공 API 호출 0 — 전부 가짜 객체.
"""

import inspect
from unittest.mock import MagicMock, patch

import pytest

from db.models import CrawlJob
from services.enricher import RATE_LIMIT_EXHAUSTED_ERROR
from services.upsert import upsert_complex_from_search

# ── 팩토리 함수 ──


def _make_complex_data(complex_no, type_code="APT"):
    """테스트용 단지 검색 데이터 (상세 미보강)"""
    return {
        "complexNo": complex_no,
        "complexName": f"B20단지{complex_no}",
        "cortarNo": "1168010100",
        "realEstateTypeCode": type_code,
    }


def _make_detail_response():
    """네이버 단지 상세 정상 응답"""
    return {
        "complexDetail": {"constructionCompanyName": "삼성물산", "parkingPossibleCount": "500"},
        "complexPyeongDetailList": [],
    }


def _rate_limited():
    """shared/naver_api.py 가 429 를 재시도 끝까지 받았을 때 돌려주는 응답"""
    return {"error": RATE_LIMIT_EXHAUSTED_ERROR}


def _recording_throttle_methods(monkeypatch, throttle, events):
    """공유 장치의 wait/on_success/on_rate_limit 를 이벤트 기록으로 바꾼다(대기 0)"""
    monkeypatch.setattr(throttle, "wait", lambda *a, **k: events.append("wait"))
    monkeypatch.setattr(throttle, "on_success", lambda *a, **k: events.append("on_success"))
    monkeypatch.setattr(throttle, "on_rate_limit", lambda *a, **k: events.append("on_rate_limit"))


# ── A. enricher 단위 — 세 경우 ──


def test_rate_limit_text_matches_shared_naver_api():
    """A 가드: 상수 문구가 shared/naver_api.py 의 429 소진 return 과 글자까지 같다.

    shared/ 쪽 문구가 바뀌면 429 판정이 조용히 꺼지므로 여기서 잡는다.
    """
    from shared.naver_api import NaverEstateAPI

    src = inspect.getsource(NaverEstateAPI._request_with_retry)
    assert f'return {{"error": "{RATE_LIMIT_EXHAUSTED_ERROR}"}}' in src
    # 같은 문구가 다른 길(401 등)에도 쓰이면 429 가 아닌 실패까지 간격을 늘리게 된다 — 딱 한 곳이어야 한다
    assert src.count(RATE_LIMIT_EXHAUSTED_ERROR) == 1


@patch("services.enricher.NaverEstateAPI")
def test_enrich_success_calls_on_success_once(mock_api, db):
    """A 정상: 보강 성공 → True + on_success 1회, on_rate_limit 0회"""
    upsert_complex_from_search(db, _make_complex_data("b20a1"))
    db.commit()
    mock_api.get_complex_detail.return_value = _make_detail_response()
    throttle = MagicMock()

    from services.enricher import enrich_complex_detail
    assert enrich_complex_detail(db, "b20a1", throttle=throttle) is True
    assert throttle.on_success.call_count == 1
    assert throttle.on_rate_limit.call_count == 0


@patch("services.enricher.NaverEstateAPI")
def test_enrich_rate_limit_exhausted_calls_on_rate_limit(mock_api, db):
    """A 429 소진: False + on_rate_limit 1회, on_success 0회"""
    mock_api.get_complex_detail.return_value = _rate_limited()
    throttle = MagicMock()

    from services.enricher import enrich_complex_detail
    assert enrich_complex_detail(db, "b20a2", throttle=throttle) is False
    assert throttle.on_rate_limit.call_count == 1
    assert throttle.on_success.call_count == 0


@pytest.mark.parametrize(
    "detail",
    [
        {"error": "API 요청 실패: 상태 코드 404"},
        {"error": "API 인증 실패 (HTTP 403)"},
        {"error": {"code": "errorCode.NotExistInformation"}},
        {},
        None,
        Exception("타임아웃"),
    ],
    ids=["404", "403", "not_exist_dict", "empty", "none", "exception"],
)
@patch("services.enricher.NaverEstateAPI")
def test_enrich_other_failures_leave_throttle_alone(mock_api, db, detail):
    """A 다른 실패: False + on_success·on_rate_limit 둘 다 0회"""
    if isinstance(detail, Exception):
        mock_api.get_complex_detail.side_effect = detail
    else:
        mock_api.get_complex_detail.return_value = detail
    throttle = MagicMock()

    from services.enricher import enrich_complex_detail
    assert enrich_complex_detail(db, "b20a3", throttle=throttle) is False
    assert throttle.on_success.call_count == 0
    assert throttle.on_rate_limit.call_count == 0


@patch("services.enricher.NaverEstateAPI")
def test_enrich_without_throttle_keeps_old_behavior(mock_api, db):
    """A 호환: throttle 없이 부르면 429 여도 False 만 돌려준다(예외 0)"""
    mock_api.get_complex_detail.return_value = _rate_limited()

    from services.enricher import enrich_complex_detail
    assert enrich_complex_detail(db, "b20a4") is False


# ── A. 실제 호출부 경로 ──


@patch("services.enricher.NaverEstateAPI")
def test_detail_batch_429_widens_shared_throttle(mock_api, db, monkeypatch):
    """A 호출부(상세 배치): 상세가 429 소진이면 공유 장치 on_rate_limit, 성공이면 on_success"""
    from crawler import service_discover

    upsert_complex_from_search(db, _make_complex_data("b20b1"))
    upsert_complex_from_search(db, _make_complex_data("b20b2"))
    db.commit()

    responses = {"b20b1": _rate_limited(), "b20b2": _make_detail_response()}
    mock_api.get_complex_detail.side_effect = lambda no: responses[no]
    events: list[str] = []
    _recording_throttle_methods(monkeypatch, service_discover._throttle_detail, events)

    service_discover.crawl_complex_details_batch("APT", batch_size=10)

    assert events.count("on_rate_limit") == 1
    assert events.count("on_success") == 1


@patch("services.enricher.NaverEstateAPI")
@patch("crawler.service_discover.NaverEstateAPI")
def test_crawl_articles_enrich_429_widens_shared_throttle(mock_articles_api, mock_detail_api, db, monkeypatch):
    """A 호출부(새 단지 매물 수집): 상세 보강이 429 소진 → False 인데 on_rate_limit 이 불린다"""
    from crawler import service_discover

    upsert_complex_from_search(db, _make_complex_data("b20c1"))
    db.commit()
    mock_articles_api.get_complex_articles.return_value = {"articleList": [], "isMoreData": False}
    mock_detail_api.get_complex_detail.return_value = _rate_limited()
    events: list[str] = []
    _recording_throttle_methods(monkeypatch, service_discover._throttle_detail, events)

    service_discover.crawl_complex_articles("b20c1")

    assert events == ["wait", "on_rate_limit"]


@patch("services.enricher.NaverEstateAPI")
def test_pyeong_details_enrich_429_widens_shared_throttle(mock_api, client, db, approved_headers, monkeypatch):
    """A 호출부(손님 면적별 상세 화면): 상세 보강이 429 소진 → 공유 장치 on_rate_limit"""
    from crawler.utils import get_shared_throttle

    upsert_complex_from_search(db, _make_complex_data("b20p1"))
    db.commit()
    mock_api.get_complex_detail.return_value = _rate_limited()
    events: list[str] = []
    _recording_throttle_methods(monkeypatch, get_shared_throttle("complex_detail"), events)

    res = client.get("/api/complexes/b20p1/pyeong-details", headers=approved_headers)

    assert res.status_code == 200
    assert events == ["wait", "on_rate_limit"]


# ── B. DB 예외로 간격 늘리지 않기 ──


def test_detail_batch_db_error_keeps_interval(db, monkeypatch):
    """B: 배치 중 DB 저장 예외 3번 → 공유 간격 2초 그대로(옛 코드: 2→4→8초)"""
    from crawler import service_discover
    from crawler.utils import AdaptiveThrottle

    for i in range(3):
        upsert_complex_from_search(db, _make_complex_data(f"b20d{i}"))
    db.commit()

    throttle = AdaptiveThrottle(min_interval=2.0, max_interval=15.0)
    monkeypatch.setattr(throttle, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "_throttle_detail", throttle)

    def _db_error(_db, _no, throttle=None):
        raise RuntimeError("DB 저장 실패")

    monkeypatch.setattr(service_discover, "enrich_complex_detail", _db_error)

    service_discover.crawl_complex_details_batch("APT", batch_size=10)

    assert throttle._dynamic_interval == 2.0
    job = db.query(CrawlJob).filter(CrawlJob.job_type == "complex_detail_APT").one()
    assert job.status == "completed"


def test_detail_batch_429_still_widens_interval(db, monkeypatch):
    """B 반대: 진짜 429 소진은 간격을 늘린다(2→4초) — DB 예외만 빠졌는지 확인"""
    from crawler import service_discover
    from crawler.utils import AdaptiveThrottle

    upsert_complex_from_search(db, _make_complex_data("b20e1"))
    db.commit()

    throttle = AdaptiveThrottle(min_interval=2.0, max_interval=15.0)
    monkeypatch.setattr(throttle, "wait", lambda *a, **k: None)
    monkeypatch.setattr(service_discover, "_throttle_detail", throttle)

    with patch("services.enricher.NaverEstateAPI") as mock_api:
        mock_api.get_complex_detail.return_value = _rate_limited()
        service_discover.crawl_complex_details_batch("APT", batch_size=10)

    assert throttle._dynamic_interval > 2.0


# ── C. 시세 수집 실패에도 캐시 비우기 ──


def _make_jwt(sub="b20-user", email="b20@test.com"):
    """테스트용 JWT 토큰"""
    import jwt as pyjwt
    return pyjwt.encode(
        {"sub": sub, "aud": "authenticated", "email": email, "exp": 9999999999},
        "test-secret-key-for-testing-only",
        algorithm="HS256",
    )


def _add_admin_and_complex(db, complex_no):
    """관리자 프로필 + 단지 1개"""
    from db.models import Complex, UserProfile
    db.add(UserProfile(user_id="b20-user", email="b20@test.com", role="admin",
                       status="approved", daily_price_collect_quota=5))
    db.add(Complex(complex_no=complex_no, complex_name="B20시세단지"))
    db.commit()


@pytest.fixture
def _sync_price_thread():
    """Thread(target=_run).start() 를 즉시 동기 실행 + 수집 상태 정리"""
    with patch("routers.live.price.threading.Thread") as mock_thread:
        mock_thread.side_effect = lambda target, daemon=None: type(
            "T", (), {"start": staticmethod(target), "daemon": daemon}
        )()
        yield
    from routers.live import _price_collect_lock, _price_collect_status
    with _price_collect_lock:
        _price_collect_status.clear()


def _start_collect(client, complex_no):
    return client.post(f"/api/live/{complex_no}/price-history/start-collect",
                       headers={"Authorization": f"Bearer {_make_jwt()}"})


@pytest.mark.parametrize("fails", [False, True], ids=["success", "midway_exception"])
def test_price_collect_clears_cache_even_on_failure(client, db, _sync_price_thread, fails):
    """C: 수집이 성공해도, 도중에 예외가 나도 그 단지의 시세 차트 캐시를 비운다"""
    from routers.live._shared import _price_collect_semaphore

    _add_admin_and_complex(db, "B20P1")
    before = _price_collect_semaphore._value
    kwargs = (
        {"side_effect": RuntimeError("네이버 응답 끊김")}
        if fails else {"return_value": {"collected": 2, "failed": 0, "total": 2}}
    )
    with patch("crawler.service.collect_price_history_for_complex", **kwargs), \
         patch("routers.complexes._price_history_cache") as mock_cache:
        assert _start_collect(client, "B20P1").status_code == 200

    mock_cache.delete_by_prefix.assert_called_once_with("price_history:B20P1:")
    assert _price_collect_semaphore._value == before
    status = client.get("/api/live/B20P1/price-history/collect-status").json()["status"]
    assert status == ("error" if fails else "done")


def test_price_collect_cache_clear_error_still_releases(client, db, _sync_price_thread):
    """C 에러: 캐시 비우기 자체가 실패해도 동시 실행 자리는 반납된다"""
    from routers.live._shared import _price_collect_semaphore

    _add_admin_and_complex(db, "B20P2")
    before = _price_collect_semaphore._value
    with patch("crawler.service.collect_price_history_for_complex",
               return_value={"collected": 1, "failed": 0, "total": 1}), \
         patch("routers.complexes._price_history_cache") as mock_cache:
        mock_cache.delete_by_prefix.side_effect = RuntimeError("캐시 고장")
        assert _start_collect(client, "B20P2").status_code == 200

    assert _price_collect_semaphore._value == before


# ── D. 새 단지 찾기 실패 시 처리 건수 ──


def _run_discover(pages_or_errors, upsert_side_effect=None, job_id="b20_discover"):
    """search_by_keyword 가 페이지 목록대로 답하거나(Exception 이면 raise) 하는 지역 찾기 실행"""
    import crawler.service_discover as sd

    def search(keyword, page=1):
        item = pages_or_errors[page - 1]
        if isinstance(item, Exception):
            raise item
        return item

    with patch.object(sd.NaverEstateAPI, "search_by_keyword", side_effect=search), \
         patch.object(sd, "upsert_complex_from_search", side_effect=upsert_side_effect), \
         patch.object(sd, "record_call"), \
         patch.object(sd._throttle_discover, "wait"):
        sd.discover_complexes_by_region("서울특별시", "강남구", scheduler_job_id=job_id)


def _page(prefix, n, more):
    return {
        "complexes": [{"complexNo": f"{prefix}{i}", "realEstateTypeCode": "APT"} for i in range(n)],
        "isMoreData": more,
    }


def test_discover_failure_records_committed_count(db):
    """D: 1쪽 20건 커밋 → 2쪽 호출 도중 예외 → failed 행 processed_items 20(옛: 비어 있음)"""
    _run_discover([_page("D", 20, True), RuntimeError("네이버 끊김")])

    job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "b20_discover").one()
    assert job.status == "failed"
    assert job.processed_items == 20


def test_discover_failure_counts_only_committed_pages(db):
    """D 반대: 2쪽 저장 도중 예외 → 커밋 안 된 2쪽 건수는 빼고 20(센 건수 22 가 아니다)"""
    calls = {"n": 0}

    def upsert(*a, **k):
        calls["n"] += 1
        if calls["n"] == 23:
            raise RuntimeError("저장 실패")

    _run_discover([_page("E", 20, True), _page("F", 5, False)], upsert_side_effect=upsert)

    job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "b20_discover").one()
    assert job.status == "failed"
    assert job.processed_items == 20


def test_discover_failure_page_commit_error_not_counted(db, monkeypatch):
    """D 반대(커밋 실패): 2쪽 커밋 자체가 실패 → 그 쪽 5건은 저장 안 됐으니 20(25 가 아니다)"""
    import crawler.service_discover as sd

    real_factory = sd.SessionLocal

    def factory():
        session = real_factory()
        real_commit = session.commit
        calls = {"n": 0}

        def commit():
            calls["n"] += 1
            if calls["n"] == 3:  # 1 = 잡 행, 2 = 1쪽, 3 = 2쪽
                raise RuntimeError("커밋 실패")
            return real_commit()

        session.commit = commit
        return session

    monkeypatch.setattr(sd, "SessionLocal", factory)
    _run_discover([_page("G", 20, True), _page("H", 5, False)])

    job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "b20_discover").one()
    assert job.status == "failed"
    assert job.processed_items == 20
