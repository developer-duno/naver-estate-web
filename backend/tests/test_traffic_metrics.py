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
    """p50 / p95 응답시간 — 1~100ms 균등 분포.

    ⚠ 기대값을 **정확히** 못박는다(옛 범위 단언 `94 <= p95 <= 96` 은 옛 구현의
    96 과 올바른 95 를 **둘 다 통과**시켜, W7 오프바이원을 전혀 못 봤다 —
    "테스트가 있다"와 "그 테스트가 이 결함을 볼 수 있다"는 별개다).

    nearest-rank 정의: ceil(pct/100 * n) 번째 값(1-based).
    n=100 → p50 = 50번째 = 50.0, p95 = 95번째 = 95.0.
    """
    for i in range(1, 101):
        record_request("/api/live/search", 200, float(i), "ip:1.1.1.1")

    w = get_stats()["windows"]["1h"]
    assert w["p50_ms"] == 50.0, "p50 은 50번째 값이어야 한다"
    assert w["p95_ms"] == 95.0, (
        "p95 는 95번째 값(95.0)이어야 한다. 96.0 이 나오면 한 칸 위쪽을 고르는 "
        "옛 계산식으로 되돌아간 것 — 느린 쪽을 실제보다 빠르게 보이게 한다."
    )


def test_percentile_nearest_rank_exact_small_n():
    """작은 n 에서도 nearest-rank 정의를 정확히 따른다 (W7 회귀 가드).

    n=10·p50 은 5번째(=5.0)다. 옛 식은 6번째(6.0)를 골랐다. n 이 작을수록
    한 칸 차이가 비율로는 크다 — 10분 창처럼 표본이 적은 구간이 특히 취약.

    뮤테이션 검증: _percentile 을 옛 식(int(round(pct/100*n + 0.5)) - 1)으로
    되돌리면 이 테스트가 FAIL 한다.
    """
    for i in range(1, 11):
        record_request("/api/live/search", 200, float(i), "ip:1.1.1.1")

    w = get_stats()["windows"]["1h"]
    assert w["p50_ms"] == 5.0, "n=10 의 p50 은 5번째 값(5.0)"
    assert w["p95_ms"] == 10.0, "n=10 의 p95 는 ceil(9.5)=10번째 값(10.0)"


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


def test_truncated_flag_clears_when_records_fall_below_cap():
    """트래픽이 줄어 상한 아래로 내려오면 잘림 경고가 꺼진다 (W9 회귀 가드).

    _evicted 는 "한 번이라도 버린 적 있다"는 래치라, 그대로 노출하면 트래픽이
    한참 줄어도 "24시간 숫자가 실제보다 작습니다" 경고가 **영원히** 켜져 있다.
    거짓 경고가 상시 떠 있으면 진짜 잘림을 알리는 신호로서 쓸모가 없어진다.

    뮤테이션 검증: get_stats 의 `evicted = _evicted and len(_records) >= _MAX_RECORDS`
    를 `evicted = _evicted` 로 되돌리면 마지막 단언이 FAIL 한다.
    """
    original = traffic_metrics._MAX_RECORDS
    traffic_metrics._MAX_RECORDS = 5
    try:
        # 1) 상한을 넘겨 잘림 발생 → 경고 켜짐
        for _ in range(8):
            record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
        assert get_stats()["window_truncated"] is True

        # 2) 트래픽이 줄어 상한 아래로 내려온 상황 (레코드 일부 만료 모사)
        while len(traffic_metrics._records) >= traffic_metrics._MAX_RECORDS:
            traffic_metrics._records.popleft()

        # 3) 더 이상 잘리지 않으므로 경고도 꺼져야 한다
        assert get_stats()["window_truncated"] is False, (
            "상한 아래로 내려왔는데도 잘림 경고가 켜져 있다 — 래치가 영구 true 로 남았다"
        )
    finally:
        traffic_metrics._MAX_RECORDS = original


def test_visitors_capped_flag_when_identity_limit_exceeded():
    """식별자 상한 초과분이 방문자 수에서 빠지면 그 사실을 알린다 (W10 회귀 가드).

    상한을 넘으면 방문자 수가 **실제보다 적게** 나오는데, 옛 구현은 이를
    조용히 누락시켜 화면이 틀린 수치를 사실처럼 보여줬다. 같은 카드가
    window_truncated 는 성실히 고지하므로 일관성 결여이기도 했다.

    뮤테이션 검증: _summarize 의 else 분기(identities_capped = True)를 지우면
    두 번째 단언이 FAIL 한다.
    """
    original = traffic_metrics._MAX_IDENTITIES_PER_WINDOW
    traffic_metrics._MAX_IDENTITIES_PER_WINDOW = 3
    try:
        # 상한(3) 안이면 깃발 꺼짐
        for i in range(3):
            record_request("/api/live/search", 200, 10.0, f"ip:1.1.1.{i}")
        w = get_stats()["windows"]["1h"]
        assert w["unique_visitors"] == 3
        assert w["visitors_capped"] is False

        # 상한을 넘는 새 식별자가 오면 방문자 수에서 빠지고 깃발이 켜진다
        record_request("/api/live/search", 200, 10.0, "ip:9.9.9.9")
        w = get_stats()["windows"]["1h"]
        assert w["unique_visitors"] == 3, "상한 초과분은 방문자 수에 안 들어간다"
        assert w["visitors_capped"] is True, (
            "상한 초과로 누락이 생겼는데 고지 깃발이 꺼져 있다 — 조용한 누락"
        )
    finally:
        traffic_metrics._MAX_IDENTITIES_PER_WINDOW = original


def test_known_groups_rebuilt_after_records_expire():
    """경로 그룹 집합이 레코드 만료와 함께 재구축돼야 한다 (세션 398 적대검증 HIGH).

    이 재구축이 없으면 집합이 **영원히 줄지 않아**, 공격자가 /api/<랜덤> 을 상한만큼만
    난사해도 그 그룹들이 자리를 영구 점유하고 이후의 진짜 경로가 전부 "other" 로 합쳐진다.
    = 경로별 관측이 프로세스 수명 내내 무력화되는 사각.

    뮤테이션 검증: record_request 의 `if dropped: _known_groups.clear()/update(...)` 를
    지우면 마지막 단언(그룹이 other 가 아님)이 FAIL 한다.
    """
    # 1) 상한을 꽉 채우도록 랜덤 경로를 난사 (공격 모사)
    for i in range(traffic_metrics._MAX_PATH_GROUPS):
        record_request(f"/api/zz{i}/x", 200, 10.0, "ip:9.9.9.9")
    assert len(traffic_metrics._known_groups) == traffic_metrics._MAX_PATH_GROUPS

    # 2) 그 레코드들이 24h 창을 벗어난 상황을 모사 (전량 만료)
    traffic_metrics._records.clear()

    # 3) 이후 들어온 **진짜 경로**가 other 로 뭉개지지 않아야 한다
    record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
    groups = {t["path"] for t in get_stats()["windows"]["1h"]["top_paths"]}
    assert "/api/live" in groups, f"만료 후에도 공격 그룹이 자리를 점유했다: {groups}"
    assert "other" not in groups


def test_reset_clears_everything():
    """reset 후 상태가 완전히 비워진다"""
    record_request("/api/live/search", 200, 10.0, "ip:1.1.1.1")
    traffic_metrics.reset()
    stats = get_stats()
    assert stats["windows"]["1h"]["total_requests"] == 0
    assert stats["record_count"] == 0
