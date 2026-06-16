"""live_search/live_region 동시성 세마포어 가드 테스트 (세션 313 가드 2)

검색 캐시 miss 경로의 동시 네이버 호출 수를 _live_search_semaphore 로 제한한다.
- 캐시 hit 은 세마포어 우회 (네이버 호출 0, 부하 무시)
- 캐시 miss 동시 N+1 요청 시 초과분은 timeout 후 503
- acquire 후 모든 경로(정상·예외)가 finally 로 release 보장

실행: python -m pytest tests/test_live_search_semaphore.py -v

동시성 검증은 SQLite db fixture 세션 경합을 피하기 위해 _search_with_fallback 을
monkeypatch 로 대체(DB·네이버 미접근, sleep 만)하고 엔드포인트 함수를 직접 스레드로
호출한다. db 인자는 fixture 세션을 그대로 넘겨도 대체 함수가 안 쓰므로 안전.
"""
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi import HTTPException

import routers.live.search as search_mod
from routers.live._shared import _cache


@pytest.fixture(autouse=True)
def _reset_semaphore_and_cache():
    """각 테스트 전후 세마포어 풀 가득 + 검색 캐시 비우기 (테스트 격리)."""
    # 세마포어를 신선한 Semaphore(10)로 교체 — 이전 테스트의 누수/단축값 잔재 차단
    fresh = threading.Semaphore(10)
    search_mod._live_search_semaphore = fresh
    import routers.live._shared as shared_mod
    shared_mod._live_search_semaphore = fresh
    _cache.delete_by_prefix("search:")
    _cache.delete_by_prefix("region:")
    yield
    _cache.delete_by_prefix("search:")
    _cache.delete_by_prefix("region:")


def _current_semaphore():
    """live_search 가 실제 참조하는 세마포어 (모듈 전역)."""
    return search_mod._live_search_semaphore


# ── ① 캐시 hit 은 세마포어 미점유 ──

def test_cache_hit_bypasses_semaphore(db):
    """캐시 hit 은 세마포어를 잡지 않는다 — 풀이 0이어도 즉시 200."""
    cache_key = "search:캐시히트:ABYG,APT,JGC,OBYG,OPST,PRE,RDV"
    _cache.set(cache_key, {"complexes": [], "total": 0, "source": "naver"})

    # 세마포어 풀을 0으로 고갈시켜도 캐시 hit 은 통과해야 함
    sem = _current_semaphore()
    drained = [sem.acquire(blocking=False) for _ in range(10)]
    assert all(drained), "세마포어 10슬롯 전부 점유 준비"
    try:
        # _search_with_fallback 가 호출되면 안 됨 (캐시 hit 이므로)
        called = {"v": False}

        def _should_not_call(**kwargs):
            called["v"] = True
            return {}

        orig = search_mod._search_with_fallback
        search_mod._search_with_fallback = _should_not_call
        try:
            result = search_mod.live_search(q="캐시히트", types=None, db=db)
        finally:
            search_mod._search_with_fallback = orig
        assert result["total"] == 0
        assert called["v"] is False  # 캐시 hit → 폴백 미호출 → 세마포어 우회
    finally:
        for _ in range(10):
            sem.release()


# ── ② 동시 N+1 요청 시 초과분 503 ──

def test_concurrent_miss_excess_gets_503(db, monkeypatch):
    """캐시 miss 동시 11요청 → 10 통과, 11번째는 timeout 후 503.

    _search_with_fallback 을 '오래 걸리는' 함수로 대체해 슬롯을 점유시킨다.
    acquire timeout 을 짧게(0.3s) 단축해 11번째가 빠르게 503 나게.
    """
    monkeypatch.setattr(search_mod, "_LIVE_SEARCH_ACQUIRE_TIMEOUT", 0.3)

    hold = threading.Event()
    in_flight = []
    in_flight_lock = threading.Lock()

    def _slow_fallback(**kwargs):
        with in_flight_lock:
            in_flight.append(1)
        hold.wait(timeout=5)  # 슬롯 점유 유지
        return {"complexes": [], "total": 0, "source": "naver"}

    monkeypatch.setattr(search_mod, "_search_with_fallback", _slow_fallback)

    results = {}
    results_lock = threading.Lock()

    def _call(idx):
        try:
            search_mod.live_search(q=f"동시테스트{idx}", types=None, db=db)
            with results_lock:
                results[idx] = 200
        except HTTPException as e:
            with results_lock:
                results[idx] = e.status_code

    with ThreadPoolExecutor(max_workers=11) as ex:
        futures = [ex.submit(_call, i) for i in range(11)]
        # 10개가 슬롯을 잡고 _slow_fallback 안에서 대기할 때까지 기다림
        deadline = time.time() + 3
        while len(in_flight) < 10 and time.time() < deadline:
            time.sleep(0.02)
        # 이 시점에 11번째는 슬롯을 못 잡아 timeout(0.3s) → 503 나야 함
        for f in futures:
            # 11번째가 먼저 끝나도록 잠깐 대기 후 hold 해제
            pass
        time.sleep(0.5)  # 11번째 timeout 경과 보장
        hold.set()       # 나머지 10개 슬롯 해제
        for f in futures:
            f.result(timeout=5)

    status_counts = {}
    for v in results.values():
        status_counts[v] = status_counts.get(v, 0) + 1
    # 정확히 1개가 503(슬롯 초과), 나머지 10개는 200
    assert status_counts.get(503, 0) == 1, f"503 정확히 1개 기대, 실제 {status_counts}"
    assert status_counts.get(200, 0) == 10, f"200 정확히 10개 기대, 실제 {status_counts}"


# ── ③ release 보장 (예외 시에도) ──

def test_semaphore_released_after_exception(db, monkeypatch):
    """_search_with_fallback 가 예외를 던져도 finally 로 세마포어 release.

    예외 후 세마포어 풀이 10으로 복구되어야 한다.
    """
    sem = _current_semaphore()

    def _raising_fallback(**kwargs):
        raise HTTPException(status_code=502, detail="네이버 실패")

    monkeypatch.setattr(search_mod, "_search_with_fallback", _raising_fallback)

    with pytest.raises(HTTPException) as exc:
        search_mod.live_search(q="예외테스트", types=None, db=db)
    assert exc.value.status_code == 502

    # release 가 됐으면 10슬롯 모두 다시 잡을 수 있어야 함
    acquired = [sem.acquire(blocking=False) for _ in range(10)]
    try:
        assert all(acquired), "예외 후에도 세마포어 10슬롯 복구 (release 보장)"
        # 11번째는 없어야 함 (정확히 10)
        assert sem.acquire(blocking=False) is False
    finally:
        for got in acquired:
            if got:
                sem.release()


def test_region_semaphore_released_after_exception(db, monkeypatch):
    """live_region 도 동일하게 예외 시 release 보장."""
    sem = _current_semaphore()

    def _raising_fallback(**kwargs):
        raise HTTPException(status_code=502, detail="네이버 실패")

    monkeypatch.setattr(search_mod, "_search_with_fallback", _raising_fallback)

    with pytest.raises(HTTPException) as exc:
        search_mod.live_region(sido="없는시", sigungu="없는구", dong=None, types=None, db=db)
    assert exc.value.status_code == 502

    acquired = [sem.acquire(blocking=False) for _ in range(10)]
    try:
        assert all(acquired), "region 예외 후에도 세마포어 10슬롯 복구"
    finally:
        for got in acquired:
            if got:
                sem.release()


# ── ④ 503 거부 시 release 안 함 (acquire 실패는 try 진입 전) ──

def test_503_does_not_overrelease(db, monkeypatch):
    """슬롯 고갈로 503 거부된 요청은 release 를 호출하지 않아야 한다 (over-release 방지).

    503 이 release 를 부르면 세마포어 카운트가 비정상 증가한다.
    """
    monkeypatch.setattr(search_mod, "_LIVE_SEARCH_ACQUIRE_TIMEOUT", 0.1)
    sem = _current_semaphore()

    # 풀 전체 점유 (다른 요청이 다 쓰고 있는 상황)
    drained = [sem.acquire(blocking=False) for _ in range(10)]
    assert all(drained)
    try:
        with pytest.raises(HTTPException) as exc:
            search_mod.live_search(q="고갈테스트", types=None, db=db)
        assert exc.value.status_code == 503
    finally:
        for _ in range(10):
            sem.release()

    # over-release 가 없었다면, 지금 정확히 10슬롯만 잡을 수 있어야 함
    after = [sem.acquire(blocking=False) for _ in range(11)]
    try:
        assert sum(1 for x in after if x) == 10, "503 후 세마포어 카운트 정상(over-release 없음)"
    finally:
        for got in after:
            if got:
                sem.release()
