"""query_helpers 순수 헬퍼 단위 테스트.

_move_in_cutoff = 입주가능일 "N개월 이내" 필터의 상한 날짜(YYYYMMDD) 계산.
DB·dialect 무관 순수 함수라 SQLite 엔진 없이 직접 호출 검증.
now 를 파라미터로 주입하므로 실행 환경·시간대 무관 (timezone-consistency 룰 답습 —
시각 하드코딩이 아니라 명시적 datetime 주입).
"""

from datetime import datetime
from zoneinfo import ZoneInfo

from db.query_helpers import _move_in_cutoff


def _kst(year, month, day):
    """테스트용 KST aware datetime 팩토리."""
    return datetime(year, month, day, tzinfo=ZoneInfo("Asia/Seoul"))


def test_month_end_clamps_to_target_month_last_day():
    """1/31 + 3개월 = 4월. 4월엔 31일이 없으므로 말일(30)로 clamp.

    옛 코드(min(day,28))는 4/28 로 잘라 4/29·4/30 입주 매물을 누락했다.
    이 테스트가 그 누락 회귀를 막는다.
    """
    assert _move_in_cutoff(_kst(2026, 1, 31), 3) == "20260430"


def test_month_end_kept_when_target_month_has_31_days():
    """5/31 + 3개월 = 8월. 8월은 31일까지 있으므로 손실 0 (8/31 유지)."""
    assert _move_in_cutoff(_kst(2026, 5, 31), 3) == "20260831"


def test_year_boundary_carry():
    """12/15 + 2개월 = 다음 해 2/15 (연 경계 carry)."""
    assert _move_in_cutoff(_kst(2026, 12, 15), 2) == "20270215"


def test_jan31_plus_one_month_non_leap_february():
    """1/31 + 1개월 = 2월. 평년(2027)은 2/28 로 clamp."""
    assert _move_in_cutoff(_kst(2027, 1, 31), 1) == "20270228"


def test_jan31_plus_one_month_leap_february():
    """1/31 + 1개월 = 2월. 윤년(2028)은 2/29 로 clamp (말일이 28→29 로 늘어남)."""
    assert _move_in_cutoff(_kst(2028, 1, 31), 1) == "20280229"


def test_normal_mid_month_day_preserved():
    """말일이 아닌 평범한 일자(15일)는 그대로 보존."""
    assert _move_in_cutoff(_kst(2026, 3, 15), 6) == "20260915"


def test_twelve_month_carry_keeps_day():
    """3/10 + 12개월 = 다음 해 3/10 (1년 후 같은 일자)."""
    assert _move_in_cutoff(_kst(2026, 3, 10), 12) == "20270310"
