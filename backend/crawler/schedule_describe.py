"""APScheduler trigger → 한국어 schedule 문구 SSOT 생성기.

손으로 쓰던 ``SCHEDULER_JOB_META[*]["schedule"]`` 자유 문자열 drift 를 구조적으로
제거한다. trigger 객체가 진실의 원천 — 이 함수가 런타임에 한국어 문구를 생성한다.

박제 사고 (세션 255~256): collect_metrics 08:30↔실제 04:30 (PR #99), complex_detail
APT/OPST 6시간↔실제 4시간 (PR 6a), crawler_monitor 20분↔실제 10분 (.env) — cron/interval
을 바꾸면서 손글씨 메타를 안 고친 표시 drift 3건. trigger 를 SSOT 로 삼으면 재발 불가.

OSS(cron-descriptor) 불채택 이유 = 한국어 "분기별 첫째 N요일" 같은 도메인 관용구
미지원 + APScheduler 6필드 → 표준 cron 5필드 역변환 어댑터 부담 + 의존성 +1(보안 추적).
6패턴 고정 도메인이라 직접 최소구현이 더 안전 (.claude/rules/oss-first.md 예외 조항).
"""

from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

# day_of_week 한국어. APScheduler 는 소문자 영어 약칭("mon")을 쓰지만,
# 숫자형(0=월 ~ 6=일)으로 등록되는 경우도 방어한다.
_DOW = {
    "mon": "월요일", "tue": "화요일", "wed": "수요일", "thu": "목요일",
    "fri": "금요일", "sat": "토요일", "sun": "일요일",
    "0": "월요일", "1": "화요일", "2": "수요일", "3": "목요일",
    "4": "금요일", "5": "토요일", "6": "일요일",
}


def describe_interval(trigger: IntervalTrigger) -> str:
    """IntervalTrigger → "N시간마다" / "N분마다" (쉬운말 리뉴얼 R2).

    옛 표기는 "N시간 interval"(세션 256) — 관리자 화면에 영어 단어가 그대로 노출돼
    한글 cron 문구("매일 03:30")와 톤이 어긋났다. 표기를 바꿀 때는 반드시
    ``SCHEDULER_JOB_META`` 의 폴백 문자열도 함께 바꾼다 (가드 테스트
    test_meta_fallback_matches_describe_trigger_for_active_jobs 가 == 대조).
    """
    sec = int(trigger.interval.total_seconds())
    if sec % 3600 == 0:
        return f"{sec // 3600}시간마다"
    if sec % 60 == 0:
        return f"{sec // 60}분마다"
    return f"{sec}초마다"


def describe_cron(trigger: CronTrigger) -> str:
    """CronTrigger → 한국어 문구. 6패턴 분기, 미지원 조합은 빈 문자열(라우터 fallback).

    APScheduler 3.x: 기본값 필드는 ``field.is_default`` 가 True. hour-only cron 의
    minute 은 ``'0'`` + is_default=True 라 dict 에서 빠지므로 ``get(..., '0')`` 폴백.
    """
    # 기본값(미지정) 필드는 제외 — 명시된 제약만 본다
    f = {x.name: str(x) for x in trigger.fields if not x.is_default}
    month, day, dow = f.get("month"), f.get("day"), f.get("day_of_week")

    hour_v = f.get("hour")
    if hour_v is None or not hour_v.isdigit():
        # 시각이 단일 정수가 아니면(범위·step·미지정) 안전 폴백
        return ""
    hm = f"{int(hour_v):02d}:{int(f.get('minute', '0')):02d}"

    if month == "1,4,7,10" and day == "1-7" and dow in _DOW:
        return f"분기별 첫째 {_DOW[dow]} {hm}"
    if day == "1-7" and dow in _DOW:
        return f"매월 첫째 {_DOW[dow]} {hm}"
    if dow in _DOW and day is None and month is None:
        return f"주 1회 {_DOW[dow]} {hm}"
    if day is not None and day.isdigit() and dow is None and month is None:
        return f"매월 {int(day)}일 {hm}"
    if dow is None and day is None and month is None:
        return f"매일 {hm}"
    return ""  # 미지원 조합 — 라우터가 META fallback


def describe_trigger(trigger) -> str:
    """trigger → 한국어 schedule 문구. 미지원/예외/None 이면 빈 문자열.

    빈 문자열 = 호출처(scheduler-status)가 META schedule 로 fallback 하라는 신호.
    비활성 잡(env=false 라 add_job 안 됨)·scheduler 미실행(None)은 이 경로로 처리.
    """
    try:
        if isinstance(trigger, IntervalTrigger):
            return describe_interval(trigger)
        if isinstance(trigger, CronTrigger):
            return describe_cron(trigger)
        return ""  # 미지원 trigger 타입 (DateTrigger 등) — 안전 폴백
    except (ValueError, AttributeError):
        return ""  # 예기치 못한 trigger 내부 구조 — admin status 500 방지
