"""트래픽 계측 서비스 단위 테스트 (services/traffic_metrics.py)

실행: python -m pytest tests/test_traffic_metrics.py -v

DB 를 전혀 안 쓰는 순수 in-memory 모듈이라 dialect 무관.
"""

import pytest

from services import traffic_metrics
from services.traffic_metrics import get_stats, normalize_path, record_request


@pytest.fixture(autouse=True)
def _reset():
    """각 테스트 전후 카운터 초기화 (전역 상태 격리)."""
    traffic_metrics.reset()
    yield
    traffic_metrics.reset()


# ── 경로 정규화 (카디널리티 통제) ──


def test_normalize_path_keeps_two_segments():
    """2단계까지만 남긴다 — 단지·매물 번호가 그룹을 폭발시키지 않게"""
    assert normalize_path("/api/complexes/12345/articles") == "/api/complexes"
    assert normalize_path("/api/complexes/99999") == "/api/complexes"
    assert normalize_path("/api/live/search") == "/api/live"
    assert normalize_path("/api/mb/apartments") == "/api/mb"
    assert normalize_path("/api/admin/traffic") == "/api/admin"


def test_normalize_path_non_api_is_other():
    """/api/ 밖(헬스체크 등)은 other 로 합침"""
    assert normalize_path("/health") == "other"
    assert normalize_path("/") == "other"


def test_normalize_path_id_second_segment():
    """두 번째 세그먼트가 식별자면 그룹으로 삼지 않는다"""
    assert normalize_path("/api/12345/detail") == "/api"
    assert normalize_path("/api") == "/api"


# ── 집계 ──


def test_empty_stats_are_zero():
    """기록이 없으면 모든 수치 0, 업타임은 양수"""
    stats = get_stats()
    for key in ("10m", "1h", "24h"):
        w = stats["windows"][key]
        assert w["total_requests"] == 0
        assert w["unique_visitors"] == 0
        assert w["p50_ms"] == 0.0
        assert w["rate_4xx"] == 0.0
        assert w["rate_5xx"] == 0.0
        assert w["top_paths"] == []
    assert stats["process_uptime_seconds"] > 0
    assert stats["window_truncated"] is False


def test_counts_requests_and_unique_visitors():
    """총 요청 수 + 고유 방문자 수 (같은 식별자는 1명으로 묶임)"""
    for _ in range(3):
        record_request("/api/live/search", 200, 100.0, "ip:1.1.1.1")
    record_request("/api/live/search", 200, 100.0, "ip:2.2.2.2")

    w = get_stats()["windows"]["1h"]
    assert w["total_requests"] == 4
    assert w["unique_visitors"] == 2


def test_error_rates():
    """4xx / 5xx 비율 계산 — 10건 중 2건 4xx, 1건 5xx"""
    for _ in range(7):
        record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
    record_request("/api/live/search", 404, 10.0, "ip:1.1.1.1")
    record_request("/api/live/search", 429, 10.0, "ip:1.1.1.1")
    record_request("/api/live/search", 500, 10.0, "ip:1.1.1.1")

    w = get_stats()["windows"]["1h"]
    assert w["total_requests"] == 10
    assert w["rate_4xx"] == 20.0
    assert w["rate_5xx"] == 10.0


def test_percentiles():
    """p50 / p95 응답시간 — 1~100ms 균등 분포"""
    for i in range(1, 101):
        record_request("/api/live/search", 200, float(i), "ip:1.1.1.1")

    w = get_stats()["windows"]["1h"]
    assert 49 <= w["p50_ms"] <= 52
    assert 94 <= w["p95_ms"] <= 96


def test_top_paths_sorted_desc():
    """경로 그룹별 요청 수 내림차순"""
    for _ in range(5):
        record_request("/api/complexes/1/articles", 200, 10.0, "ip:1.1.1.1")
    for _ in range(2):
        record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")

    top = get_stats()["windows"]["1h"]["top_paths"]
    assert top[0] == {"path": "/api/complexes", "count": 5}
    assert top[1] == {"path": "/api/live", "count": 2}


def test_top_identities_only_in_1h_window():
    """상위 식별자는 남용 감지용이라 1시간 창에만 포함 (10m/24h 는 빈 리스트)"""
    for _ in range(9):
        record_request("/api/live/search", 200, 10.0, "ip:9.9.9.9")
    record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")

    windows = get_stats()["windows"]
    assert windows["1h"]["top_identities"][0]["count"] == 9
    assert windows["10m"]["top_identities"] == []
    assert windows["24h"]["top_identities"] == []


def test_identity_is_hashed_not_raw():
    """식별자 원문(IP·토큰)이 응답에 그대로 노출되지 않는다 (개인정보)"""
    for _ in range(3):
        record_request("/api/live/search", 200, 10.0, "ip:203.0.113.7")

    identities = get_stats()["windows"]["1h"]["top_identities"]
    assert len(identities) == 1
    value = identities[0]["identity"]
    assert "203.0.113.7" not in value
    assert len(value) == 12


def test_same_identity_hashes_consistently():
    """같은 원문은 프로세스 안에서 같은 해시 → 같은 사람으로 집계"""
    record_request("/api/live/search", 200, 10.0, "ip:5.5.5.5")
    record_request("/api/mb/apartments", 200, 10.0, "ip:5.5.5.5")

    assert get_stats()["windows"]["1h"]["unique_visitors"] == 1


def test_path_group_cardinality_cap():
    """경로 그룹 상한 초과분은 other 로 합쳐 메모리 폭발을 막는다"""
    # 상한(_MAX_PATH_GROUPS)보다 많은 서로 다른 그룹을 만든다
    for i in range(traffic_metrics._MAX_PATH_GROUPS + 15):
        record_request(f"/api/seg{i}/x", 200, 10.0, "ip:1.1.1.1")

    top = get_stats()["windows"]["1h"]["top_paths"]
    groups = {t["path"] for t in top}
    # 상한을 넘긴 것들이 other 로 몰려 가장 큰 그룹이 된다
    assert "other" in groups
    assert top[0]["path"] == "other"
    assert top[0]["count"] == 15


def test_record_cap_evicts_oldest_and_flags():
    """레코드 총량 상한 초과 시 오래된 것부터 버리고 window_truncated 로 알린다"""
    original = traffic_metrics._MAX_RECORDS
    traffic_metrics._MAX_RECORDS = 5
    try:
        for _ in range(8):
            record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
        stats = get_stats()
        assert stats["record_count"] == 5
        assert stats["window_truncated"] is True
    finally:
        traffic_metrics._MAX_RECORDS = original


def test_reset_clears_everything():
    """reset 후 상태가 완전히 비워진다"""
    record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
    traffic_metrics.reset()
    stats = get_stats()
    assert stats["windows"]["1h"]["total_requests"] == 0
    assert stats["record_count"] == 0
