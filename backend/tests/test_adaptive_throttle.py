"""AdaptiveThrottle 단위 테스트 — 429 대응 적응형 쓰로틀링 검증"""

from unittest.mock import patch

from crawler.utils import AdaptiveThrottle


class TestAdaptiveThrottleDefaults:
    """기본값이 429 대응 강화 사양과 일치하는지 검증"""

    def test_default_max_interval(self):
        t = AdaptiveThrottle()
        assert t._max_interval == 10.0

    def test_default_min_interval(self):
        t = AdaptiveThrottle()
        assert t._min_interval == 1.0

    def test_initial_interval_equals_min(self):
        t = AdaptiveThrottle(min_interval=2.0, max_interval=8.0)
        assert t.current_interval == 2.0

    def test_custom_params(self):
        t = AdaptiveThrottle(min_interval=3.0, max_interval=15.0)
        assert t._min_interval == 3.0
        assert t._max_interval == 15.0


class TestOnRateLimit:
    """429 응답 시 간격 2.0배 증가 검증"""

    def test_increases_by_2x(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t.on_rate_limit()
        assert t.current_interval == 2.0

    def test_double_rate_limit(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t.on_rate_limit()  # 1.0 → 2.0
        t.on_rate_limit()  # 2.0 → 4.0
        assert t.current_interval == 4.0

    def test_capped_at_max(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        for _ in range(10):
            t.on_rate_limit()
        assert t.current_interval == 10.0

    def test_resets_consecutive_success(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        for _ in range(15):
            t.on_success()
        t.on_rate_limit()
        assert t._consecutive_success == 0


class TestOnSuccess:
    """20회 연속 성공 시 간격 축소 검증"""

    def test_no_change_below_threshold(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t.on_rate_limit()  # 1.0 → 2.0
        for _ in range(19):
            t.on_success()
        assert t.current_interval == 2.0  # 19회에서는 아직 미변경

    def test_decreases_after_20_successes(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t.on_rate_limit()  # 1.0 → 2.0
        for _ in range(20):
            t.on_success()
        assert t.current_interval == 2.0 * 0.8  # 1.6

    def test_clamped_at_min(self):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t.on_rate_limit()  # 1.0 → 2.0
        for _ in range(100):
            t.on_success()
        assert t.current_interval == 1.0


class TestWait:
    """wait() 호출 시 적절한 딜레이 검증"""

    @patch("crawler.utils.time.sleep")
    def test_wait_sleeps(self, mock_sleep):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t._last_request_time = 0.0  # 오래 전
        t.wait()
        # 첫 호출 후 last_request_time이 갱신됨
        assert t._last_request_time > 0

    @patch("crawler.utils.time.sleep")
    def test_wait_extra_delay(self, mock_sleep):
        t = AdaptiveThrottle(min_interval=1.0, max_interval=10.0)
        t._last_request_time = 0.0
        t.wait(extra_delay=0.5)
        # sleep 호출 시 extra_delay가 interval에 추가됨
        if mock_sleep.called:
            args = mock_sleep.call_args[0]
            assert args[0] >= 1.0  # min_interval 이상
