"""Naver API 호출 카운터 단위 테스트.

실행: python -m pytest tests/test_naver_call_counter.py -v
"""

from unittest.mock import patch

from services import naver_call_counter


def setup_function():
    """각 테스트 시작 전 카운터 초기화 + DB 테이블 정리."""
    naver_call_counter.reset()
    # DB 테이블도 비우기 (conftest 가 매 테스트 drop/create 하지만 안전장치)
    try:
        from db.database import SessionLocal
        from db.models import NaverApiCallCount

        db = SessionLocal()
        try:
            db.query(NaverApiCallCount).delete()
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def test_record_and_get_stats_basic():
    """record_call 3회 → 10m/1h 전부 3, 24h 도 DB 에서 3."""
    for _ in range(3):
        naver_call_counter.record_call("search")
    stats = naver_call_counter.get_stats()
    assert stats["labels"]["search"]["10m"] == 3
    assert stats["labels"]["search"]["1h"] == 3
    assert stats["labels"]["search"]["24h"] == 3
    assert stats["totals"] == {"10m": 3, "1h": 3, "24h": 3}
    # process_uptime_seconds 는 양수여야 함
    assert stats["process_uptime_seconds"] > 0


def test_multi_label_totals():
    """두 라벨 호출 → totals 가 합산돼야 함."""
    naver_call_counter.record_call("search")
    naver_call_counter.record_call("search")
    naver_call_counter.record_call("complex_prices")
    stats = naver_call_counter.get_stats()
    assert stats["labels"]["search"]["10m"] == 2
    assert stats["labels"]["complex_prices"]["10m"] == 1
    assert stats["totals"]["10m"] == 3


def test_window_expiry_10m_1h():
    """오래된 레코드는 1h/10m in-memory 윈도우에서 빠져야 함.

    24h 는 DB 기반이라 monotonic 시계와 무관 — 여기서는 10m/1h 만 검증.
    """
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

    # 이전 3건은 10m/1h 밖. 새 1건만 10m/1h 에 남음
    assert stats["labels"]["crawl_articles"]["10m"] == 1
    assert stats["labels"]["crawl_articles"]["1h"] == 1
    # 24h 는 DB 기반: 전체 4건 (시간 버킷은 실제 시각 기준)
    assert stats["labels"]["crawl_articles"]["24h"] == 4


def test_db_persistence_survives_reset():
    """in-memory reset 후에도 DB 의 24h 집계는 살아있어야 함."""
    for _ in range(5):
        naver_call_counter.record_call("search")

    naver_call_counter.reset()

    stats = naver_call_counter.get_stats()
    # in-memory 는 비어있으므로 10m/1h=0
    assert stats["labels"]["search"]["10m"] == 0
    assert stats["labels"]["search"]["1h"] == 0
    # DB 에는 5건 남아있음
    assert stats["labels"]["search"]["24h"] == 5


def test_reset_clears_in_memory():
    """reset 호출 시 in-memory 전 라벨 제거 (DB 는 건드리지 않음)."""
    naver_call_counter.record_call("a")
    naver_call_counter.record_call("b")
    naver_call_counter.reset()
    stats = naver_call_counter.get_stats()
    # in-memory 10m/1h 는 0
    assert stats["totals"]["10m"] == 0
    assert stats["totals"]["1h"] == 0
    # DB 24h 에는 기록이 남아있을 수 있음 (reset 은 in-memory 만 클리어)
    assert stats["totals"]["24h"] == 2
