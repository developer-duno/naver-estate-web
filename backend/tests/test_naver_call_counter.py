"""Naver API 호출 카운터 단위 테스트.

실행: python -m pytest tests/test_naver_call_counter.py -v
"""

from unittest.mock import patch

from services import naver_call_counter


def setup_function():
    """각 테스트 시작 전 카운터 초기화."""
    naver_call_counter.reset()


def test_record_and_get_stats_basic():
    """record_call 3회 → 10m/1h/24h 전부 3으로 나와야 함."""
    for _ in range(3):
        naver_call_counter.record_call("search")
    stats = naver_call_counter.get_stats()
    assert stats["labels"]["search"] == {"10m": 3, "1h": 3, "24h": 3}
    assert stats["totals"] == {"10m": 3, "1h": 3, "24h": 3}


def test_multi_label_totals():
    """두 라벨 호출 → totals 가 합산돼야 함."""
    naver_call_counter.record_call("search")
    naver_call_counter.record_call("search")
    naver_call_counter.record_call("complex_prices")
    stats = naver_call_counter.get_stats()
    assert stats["labels"]["search"]["10m"] == 2
    assert stats["labels"]["complex_prices"]["10m"] == 1
    assert stats["totals"]["10m"] == 3


def test_window_expiry():
    """오래된 레코드는 1h/10m 윈도우에서 빠져야 함."""
    # 3건 먼저 기록
    for _ in range(3):
        naver_call_counter.record_call("crawl_articles")

    # 시계를 2시간 앞으로 당겨서 다음 record_call 이 이전 3건을 1h/10m 밖으로 밀어냄
    import services.naver_call_counter as mod

    original_monotonic = mod.monotonic
    fake_now = [original_monotonic() + 7200]  # +2시간

    def fake_monotonic():
        return fake_now[0]

    with patch.object(mod, "monotonic", fake_monotonic):
        naver_call_counter.record_call("crawl_articles")
        stats = naver_call_counter.get_stats()

    # 이전 3건은 10m/1h 밖, 24h 안. 새 1건은 10m/1h/24h 전부 안
    assert stats["labels"]["crawl_articles"]["10m"] == 1
    assert stats["labels"]["crawl_articles"]["1h"] == 1
    assert stats["labels"]["crawl_articles"]["24h"] == 4


def test_24h_cutoff_drops_records():
    """24시간 초과 레코드는 record_call 호출 시 완전 제거."""
    naver_call_counter.record_call("old")

    import services.naver_call_counter as mod

    fake_now = [mod.monotonic() + 25 * 3600]  # +25시간

    with patch.object(mod, "monotonic", lambda: fake_now[0]):
        naver_call_counter.record_call("old")
        stats = naver_call_counter.get_stats()

    # 25h 이전 건은 제거, 새 1건만 남음
    assert stats["labels"]["old"]["24h"] == 1


def test_reset_clears_all():
    """reset 호출 시 전 라벨 제거."""
    naver_call_counter.record_call("a")
    naver_call_counter.record_call("b")
    naver_call_counter.reset()
    stats = naver_call_counter.get_stats()
    assert stats["labels"] == {}
    assert stats["totals"] == {"10m": 0, "1h": 0, "24h": 0}
