"""schedule_describe.describe_trigger 순수 단위 테스트 (세션 256).

scheduler 인스턴스 없이 trigger 객체만으로 한국어 문구 생성을 검증한다.
SSOT 도입 — 손글씨 schedule drift(PR #99·6a·monitor) 구조적 차단의 핵심 함수.
"""

import pytest
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from crawler.schedule_describe import describe_trigger

# (설명, trigger, 기대 문구) — 실제 20개 잡 패턴 + 엣지케이스
_CASES = [
    # interval — "N단위마다" 한글 표기 (R2 쉬운말 리뉴얼, 옛 "N시간 interval")
    ("12시간마다", IntervalTrigger(hours=12), "12시간마다"),
    ("30분마다", IntervalTrigger(minutes=30), "30분마다"),
    ("4시간마다", IntervalTrigger(hours=4), "4시간마다"),
    ("10분마다 (monitor 실값)", IntervalTrigger(minutes=10), "10분마다"),
    ("초 단위 폴백", IntervalTrigger(seconds=90), "90초마다"),
    # cron 매일 (hour 단일 + minute 명시/생략)
    ("매일 시각만 (minute 생략 → 00)", CronTrigger(hour=2), "매일 02:00"),
    ("매일 04:30", CronTrigger(hour=4, minute=30), "매일 04:30"),
    ("매일 10:45", CronTrigger(hour=10, minute=45), "매일 10:45"),
    ("매일 19:15", CronTrigger(hour=19, minute=15), "매일 19:15"),
    ("매일 03:30 (backfill)", CronTrigger(hour=3, minute=30), "매일 03:30"),
    # cron 주 1회 (단일 요일)
    ("주 1회 일요일", CronTrigger(day_of_week="sun", hour=3), "주 1회 일요일 03:00"),
    ("주 1회 수요일", CronTrigger(day_of_week="wed", hour=4), "주 1회 수요일 04:00"),
    ("주 1회 토요일", CronTrigger(day_of_week="sat", hour=5), "주 1회 토요일 05:00"),
    ("주 1회 화요일", CronTrigger(day_of_week="tue", hour=7), "주 1회 화요일 07:00"),
    # cron 매월 첫째 X요일 (day=1-7 + 요일)
    ("매월 첫째 월요일", CronTrigger(day="1-7", day_of_week="mon", hour=3),
     "매월 첫째 월요일 03:00"),
    ("매월 첫째 목요일", CronTrigger(day="1-7", day_of_week="thu", hour=6),
     "매월 첫째 목요일 06:00"),
    # cron 분기별 첫째 X요일 (month=1,4,7,10 + day=1-7 + 요일)
    ("분기별 첫째 일요일", CronTrigger(month="1,4,7,10", day="1-7", day_of_week="sun", hour=4),
     "분기별 첫째 일요일 04:00"),
    # cron 매월 N일 (day=단일 숫자, dow/month 없음 — 공시가격 수집 PR-A3)
    ("매월 15일", CronTrigger(day="15", hour=6, minute=30), "매월 15일 06:30"),
    # 숫자형 day_of_week 방어 (0=월 ~ 6=일)
    ("숫자형 요일 (6=일요일)", CronTrigger(day_of_week="6", hour=3), "주 1회 일요일 03:00"),
    # 미지원 조합 → 빈 문자열 (라우터 fallback)
    ("step 시각 → 폴백", CronTrigger(hour="*/2"), ""),
    ("범위 시각 → 폴백", CronTrigger(hour="9-18"), ""),
]


@pytest.mark.parametrize("desc, trigger, expected", _CASES,
                         ids=[c[0] for c in _CASES])
def test_describe_trigger_cases(desc, trigger, expected):
    """20개 잡 패턴 + 엣지케이스가 정확한 한국어/폴백을 낸다."""
    assert describe_trigger(trigger) == expected


def test_describe_trigger_none_returns_empty():
    """trigger=None (비활성 잡) → 빈 문자열 (라우터 META fallback 신호)."""
    assert describe_trigger(None) == ""


def test_describe_trigger_unknown_type_returns_empty():
    """미지원 trigger 타입 → 빈 문자열 (status 500 방지)."""
    from apscheduler.triggers.date import DateTrigger

    assert describe_trigger(DateTrigger()) == ""
