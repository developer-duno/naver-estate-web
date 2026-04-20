"""크롤 안전장치 테스트 — 공유 throttle 레지스트리 + 단지별 active guard.

실행: python -m pytest tests/test_crawl_safety.py -v
"""
from crawler.utils import AdaptiveThrottle, get_shared_throttle
from routers.live._shared import (
    _active_complexes,
    release_complex,
    try_acquire_complex,
)


class TestSharedThrottleRegistry:
    """get_shared_throttle은 동일 name에 대해 동일 인스턴스를 반환해야 한다."""

    def test_same_name_returns_same_instance(self):
        """scheduler 배치와 live 경로가 같은 name으로 조회하면 동일 인스턴스"""
        a = get_shared_throttle("_test_articles")
        b = get_shared_throttle("_test_articles")
        assert a is b

    def test_different_names_different_instances(self):
        """다른 name은 독립 인스턴스"""
        a = get_shared_throttle("_test_discover")
        b = get_shared_throttle("_test_details")
        assert a is not b

    def test_returns_adaptive_throttle_type(self):
        """반환값은 AdaptiveThrottle"""
        t = get_shared_throttle("_test_type_check")
        assert isinstance(t, AdaptiveThrottle)

    def test_init_params_ignored_on_second_call(self):
        """두 번째 호출의 min/max_interval은 무시되고 첫 번째 인스턴스 유지"""
        a = get_shared_throttle("_test_idempotent", min_interval=2.0, max_interval=10.0)
        b = get_shared_throttle("_test_idempotent", min_interval=5.0, max_interval=20.0)
        assert a is b


class TestComplexActiveGuard:
    """try_acquire_complex / release_complex는 단지별 중복 크롤을 차단해야 한다."""

    def setup_method(self):
        _active_complexes.clear()

    def teardown_method(self):
        _active_complexes.clear()

    def test_first_acquire_succeeds(self):
        assert try_acquire_complex("C100") is True
        assert "C100" in _active_complexes

    def test_second_acquire_fails_until_release(self):
        """같은 단지에 대한 중복 acquire는 실패, release 후 다시 성공"""
        assert try_acquire_complex("C200") is True
        assert try_acquire_complex("C200") is False  # 이미 진행 중
        release_complex("C200")
        assert try_acquire_complex("C200") is True  # release 후 재획득 가능

    def test_release_unknown_complex_is_safe(self):
        """등록되지 않은 complex_no에 대한 release도 예외 없이 안전"""
        release_complex("C999")  # discard는 KeyError 안 냄
        assert "C999" not in _active_complexes

    def test_independent_complexes_dont_interfere(self):
        """서로 다른 단지는 독립적으로 획득 가능"""
        assert try_acquire_complex("C301") is True
        assert try_acquire_complex("C302") is True
        assert try_acquire_complex("C301") is False  # C301은 이미 잡힘
        release_complex("C301")
        assert try_acquire_complex("C301") is True  # C302는 여전히 잡힌 상태
        release_complex("C301")
        release_complex("C302")


class TestCrawlConstants:
    """세션 68 dbcc8cf 의 PAGE_COMMIT_INTERVAL=1 회귀방지.

    이 값이 5 이상으로 돌아가면 크롤 중 FE 실시간 매물 증가 UX 가 조용히 깨진다.
    리팩터로 상수가 되돌아가는 것을 막기 위한 잠금 테스트.
    """

    def test_page_commit_interval_is_one(self):
        """매 페이지마다 DB 커밋 — 크롤 중 실시간 반영 (세션 68 트랙 C)"""
        from routers.live._shared import PAGE_COMMIT_INTERVAL
        assert PAGE_COMMIT_INTERVAL == 1

    def test_detail_commit_interval_fifty(self):
        """상세 크롤 50건마다 커밋 — 과부하 방지"""
        from routers.live._shared import DETAIL_COMMIT_INTERVAL
        assert DETAIL_COMMIT_INTERVAL == 50

    def test_detail_failure_threshold_half(self):
        """상세 실패율 50% 초과 시 done_partial 판정"""
        from routers.live._shared import DETAIL_FAILURE_THRESHOLD
        assert DETAIL_FAILURE_THRESHOLD == 0.5

    def test_max_search_pages_cap(self):
        """검색 페이지 상한 — 무한 루프 방지"""
        from routers.live._shared import MAX_SEARCH_PAGES
        assert MAX_SEARCH_PAGES == 50
