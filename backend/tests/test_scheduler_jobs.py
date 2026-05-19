"""스케줄러 job 등록 검증
실행: python -m pytest tests/test_scheduler_jobs.py -v

create_scheduler() 가 환경 토글에 따라 올바른 job 을 등록하는지 확인.
create_scheduler() 는 scheduler 를 만들고 add_job 만 하며 start() 는 하지
않으므로(main.py lifespan 이 start), job 목록은 start 없이 조회 가능.
"""

from unittest.mock import patch

from crawler import scheduler as sched_mod


def _job_ids(scheduler):
    """등록된 job id 집합"""
    return {job.id for job in scheduler.get_jobs()}


def test_backfill_price_job_registered_when_public_data_enabled():
    """PUBLIC_DATA_ENABLED=true 면 시세 소급 수집 job 이 등록된다"""
    with patch.object(sched_mod, "PUBLIC_DATA_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    assert "backfill_price" in _job_ids(scheduler)


def test_backfill_price_job_absent_when_public_data_disabled():
    """PUBLIC_DATA_ENABLED=false 면 시세 소급 수집 job 이 등록되지 않는다"""
    with patch.object(sched_mod, "PUBLIC_DATA_ENABLED", False):
        scheduler = sched_mod.create_scheduler()
    assert "backfill_price" not in _job_ids(scheduler)


def test_interval_jobs_have_max_instances():
    """매물 수집·상세 보강 interval job 에 max_instances=1 이 설정돼 있다.

    동시 중복 실행 방지 — 이전 배치가 안 끝났는데 다음 주기가 시작되면 안 됨.
    """
    scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    for job_id in ("crawl_articles", "crawl_details"):
        assert job_id in jobs, f"{job_id} job 미등록"
        assert jobs[job_id].max_instances == 1, (
            f"{job_id} 의 max_instances 가 1 이 아님"
        )


def test_metrics_job_runs_daily():
    """가치지표 수집 job 이 매일 실행된다 (특정 요일 제한 없음).

    주1회→매일 전환 — cron trigger 의 day_of_week 필드가 '*'(전체) 여야 함.
    """
    with patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    assert "collect_metrics" in jobs, "collect_metrics job 미등록"
    # cron 필드 중 day_of_week 가 특정 요일로 제한돼 있지 않은지 확인
    dow_field = next(
        f for f in jobs["collect_metrics"].trigger.fields if f.name == "day_of_week"
    )
    assert str(dow_field) == "*", f"day_of_week 가 매일이 아님: {dow_field}"


def test_crawl_details_uses_batch_size_env():
    """crawl_details job kwargs 의 batch_size 가 CRAWL_DETAIL_BATCH_SIZE 를 따른다.

    배치 크기를 하드코딩 대신 env 상수로 빼면서, 다음 사람이 또 하드코딩하지
    않도록 회귀 방지 — kwargs 가 module-level 상수를 참조하는지 검증.
    """
    with patch.object(sched_mod, "CRAWL_DETAIL_BATCH_SIZE", 777):
        scheduler = sched_mod.create_scheduler()
    job = {j.id: j for j in scheduler.get_jobs()}["crawl_details"]
    assert job.kwargs["batch_size"] == 777


def test_complex_detail_apt_uses_interval_env():
    """COMPLEX_DETAIL_APT_INTERVAL_HOURS env 가 APT backfill 잡 interval 에 반영된다.

    PR #19 답습 — cron(매일 5시) → interval(env 시간) 전환 회귀 방지.
    """
    with patch.object(sched_mod, "COMPLEX_DETAIL_APT_INTERVAL_HOURS", 9):
        scheduler = sched_mod.create_scheduler()
    job = {j.id: j for j in scheduler.get_jobs()}.get("complex_detail_APT")
    assert job is not None, "complex_detail_APT 잡 미등록"
    assert job.trigger.interval.total_seconds() == 9 * 3600


def test_complex_detail_opst_uses_interval_env():
    """COMPLEX_DETAIL_OPST_INTERVAL_HOURS env 가 OPST backfill 잡 interval 에 반영된다."""
    with patch.object(sched_mod, "COMPLEX_DETAIL_OPST_INTERVAL_HOURS", 11):
        scheduler = sched_mod.create_scheduler()
    job = {j.id: j for j in scheduler.get_jobs()}.get("complex_detail_OPST")
    assert job is not None, "complex_detail_OPST 잡 미등록"
    assert job.trigger.interval.total_seconds() == 11 * 3600


def test_complex_detail_batch_size_env():
    """COMPLEX_DETAIL_BATCH_SIZE 가 5종 backfill 잡 batch_size 에 반영된다.

    한 patch 로 APT/OPST/JGC/ABYG/OBYG 5종 동시 검증.
    """
    with patch.object(sched_mod, "COMPLEX_DETAIL_BATCH_SIZE", 999):
        scheduler = sched_mod.create_scheduler()
    jobs = {j.id: j for j in scheduler.get_jobs()}
    for job_id in ["complex_detail_APT", "complex_detail_OPST",
                   "complex_detail_JGC", "complex_detail_ABYG", "complex_detail_OBYG"]:
        job = jobs.get(job_id)
        assert job is not None, f"{job_id} 잡 미등록"
        assert job.kwargs["batch_size"] == 999, f"{job_id} batch_size 가 env 미반영"


def test_complex_detail_small_types_remain_cron():
    """JGC/ABYG/OBYG 는 cron trigger 유지 (PR #20 의 의도된 분리).

    누군가 실수로 interval 로 바꾸면 호출량 폭증 — 소수 유형은 주1회 cron 고정.
    """
    from apscheduler.triggers.cron import CronTrigger

    scheduler = sched_mod.create_scheduler()
    jobs = {j.id: j for j in scheduler.get_jobs()}
    for job_id in ["complex_detail_JGC", "complex_detail_ABYG", "complex_detail_OBYG"]:
        job = jobs.get(job_id)
        assert job is not None, f"{job_id} 잡 미등록"
        assert isinstance(job.trigger, CronTrigger), (
            f"{job_id} 가 cron 이 아님 — 소수 유형은 cron 유지여야 함"
        )


def test_complex_detail_jobs_have_jitter():
    """5종 backfill 잡 모두 jitter 가 설정돼 있다 (같은 IP 다른 잡과 시간 분산)."""
    scheduler = sched_mod.create_scheduler()
    jobs = {j.id: j for j in scheduler.get_jobs()}
    for job_id in ["complex_detail_APT", "complex_detail_OPST",
                   "complex_detail_JGC", "complex_detail_ABYG", "complex_detail_OBYG"]:
        job = jobs.get(job_id)
        assert job is not None, f"{job_id} 잡 미등록"
        assert job.trigger.jitter is not None and job.trigger.jitter > 0, (
            f"{job_id} 에 jitter 미설정 — IP 차단 방지를 위해 jitter 필요"
        )


def test_meta_schedule_matches_add_job_trigger():
    """META schedule 문자열이 add_job trigger 의 시간 단위와 일치하는지 검증.

    PR #19 가 crawl_details interval 을 4시간→30분으로 바꾸면서 META schedule 의
    "4시간마다" 문자열을 안 고친 drift 사고 재발 방지. 한국어 자연어 완전 매칭은
    불가능하므로 시간 단위 키워드 ("분"/"시간"/"interval"/"cron 표기") 만 휴리스틱
    검증.

    규칙:
    - IntervalTrigger 이고 interval < 1시간 → schedule 문자열에 "분" 포함 필수
    - IntervalTrigger 이고 interval >= 1시간 → schedule 문자열에 "시간" 포함 필수
    - CronTrigger → schedule 문자열에 "마다" 만 단독 사용 금지
      (cron 인데 "N시간마다"/"N분마다" 적으면 interval 로 오해 유발)
    """
    from apscheduler.triggers.cron import CronTrigger
    from apscheduler.triggers.interval import IntervalTrigger

    from routers.admin.scheduler import SCHEDULER_JOB_META

    with (
        patch.object(sched_mod, "PUBLIC_DATA_ENABLED", True),
        patch.object(sched_mod, "POPULAR_CRAWL_ENABLED", True),
        patch.object(sched_mod, "AIR_QUALITY_ENABLED", True),
        patch.object(sched_mod, "EMERGENCY_ENABLED", True),
        patch.object(sched_mod, "CHILDCARE_ENABLED", True),
        patch.object(sched_mod, "CRIME_STATS_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_DETAIL_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True),
        patch.object(sched_mod, "MONITOR_ENABLED", True),
    ):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}

    errors: list[str] = []
    for job_id, meta in SCHEDULER_JOB_META.items():
        job = jobs.get(job_id)
        if job is None:
            # 다른 가드가 잡음 — 여기는 trigger 일치만 검증
            continue
        schedule = meta["schedule"]
        if isinstance(job.trigger, IntervalTrigger):
            seconds = job.trigger.interval.total_seconds()
            if seconds < 3600:
                if "분" not in schedule:
                    errors.append(
                        f"{job_id}: IntervalTrigger {seconds}초인데 schedule='{schedule}' 에 '분' 없음"
                    )
            else:
                if "시간" not in schedule:
                    errors.append(
                        f"{job_id}: IntervalTrigger {seconds}초인데 schedule='{schedule}' 에 '시간' 없음"
                    )
        elif isinstance(job.trigger, CronTrigger):
            # cron 인데 "마다" 만 적혀있고 시각 표기 없으면 interval 로 오해
            if "마다" in schedule and ":" not in schedule and "회" not in schedule:
                errors.append(
                    f"{job_id}: CronTrigger 인데 schedule='{schedule}' 가 interval 형식"
                )
    assert not errors, "META schedule 과 add_job trigger drift:\n  " + "\n  ".join(errors)


def test_scheduler_job_meta_covers_all_registered_jobs():
    """SCHEDULER_JOB_META 가 create_scheduler() 의 모든 등록 job id 를 커버한다.

    META 누락 시 admin UI 의 스케줄러 모니터링 표에 해당 job 이 안 보임.
    PR #20·#14 가 새 job 추가하면서 META 동기화를 빠뜨린 사고 재발 방지.
    """
    from routers.admin.scheduler import SCHEDULER_JOB_META

    # 모든 조건부 job 을 켜야 등록되는 잡까지 다 잡힘
    with (
        patch.object(sched_mod, "PUBLIC_DATA_ENABLED", True),
        patch.object(sched_mod, "POPULAR_CRAWL_ENABLED", True),
        patch.object(sched_mod, "AIR_QUALITY_ENABLED", True),
        patch.object(sched_mod, "EMERGENCY_ENABLED", True),
        patch.object(sched_mod, "CHILDCARE_ENABLED", True),
        patch.object(sched_mod, "CRIME_STATS_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_DETAIL_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True),
        patch.object(sched_mod, "MONITOR_ENABLED", True),
    ):
        scheduler = sched_mod.create_scheduler()
    registered_ids = {job.id for job in scheduler.get_jobs()}
    missing = registered_ids - set(SCHEDULER_JOB_META.keys())
    assert not missing, (
        f"SCHEDULER_JOB_META 누락: {sorted(missing)} — "
        "backend/routers/admin/scheduler.py 의 SCHEDULER_JOB_META 에 추가 필요"
    )
