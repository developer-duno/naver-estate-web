"""스케줄러 job 등록 검증
실행: python -m pytest tests/test_scheduler_jobs.py -v

create_scheduler() 가 환경 토글에 따라 올바른 job 을 등록하는지 확인.
create_scheduler() 는 scheduler 를 만들고 add_job 만 하며 start() 는 하지
않으므로(main.py lifespan 이 start), job 목록은 start 없이 조회 가능.
"""

from unittest.mock import patch

import pytest

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


def test_complex_metric_uses_batch_size_env():
    """collect_metrics job kwargs 의 batch_size 가 COMPLEX_METRIC_BATCH_SIZE 를 따른다.

    가치지표 가속 PR — 기본값 200 → 1000 으로 격상 (env 미설정 시 1000).
    가치 3필드 25,262 단지 잔여 / 200/day = 126일 → 1000/day = 25일.
    회귀 방지 — kwargs 가 module-level 상수를 참조하는지 검증.
    """
    with patch.multiple(
        sched_mod,
        COMPLEX_METRIC_ENABLED=True,
        COMPLEX_METRIC_BATCH_SIZE=555,
    ):
        scheduler = sched_mod.create_scheduler()
    job = {j.id: j for j in scheduler.get_jobs()}["collect_metrics"]
    assert job.kwargs["batch_size"] == 555


def test_complex_metric_runs_offpeak():
    """collect_metrics 가 새벽 04:30 에 돈다 (09~12시 등록 피크 회피).

    세션 255 — 배치 1000 집계가 사용자 요청과 같은 micro 인스턴스 RAM 을
    경합하지 않도록 08:30 → 04:30 으로 이동. 다음 사람이 다시 피크 시간대로
    되돌리지 않도록 cron hour/minute 회귀 방지.
    """
    with patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    job = {j.id: j for j in scheduler.get_jobs()}["collect_metrics"]
    fields = {f.name: str(f) for f in job.trigger.fields}
    assert fields["hour"] == "4", f"collect_metrics 가 04시가 아님: {fields['hour']}시"
    assert fields["minute"] == "30", f"collect_metrics 가 30분이 아님: {fields['minute']}분"


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


def test_add_job_rejects_duplicate_id():
    """create_scheduler() 가 같은 id 두 번 등록을 ValueError 로 거부한다.

    APScheduler 기본 동작은 silent 허용 (2026-05-20 실측: jobs_count=2 통과) —
    동적 id 생성 (예: f"popular_{hour}_{minute}") 충돌 시 발견 지연. 시작 시점에
    명시적 가드. 본 가드 = crawler/scheduler.py 의 _add_job_unique 래퍼.
    """
    scheduler = sched_mod.create_scheduler()
    # 이미 등록된 id 하나를 골라 같은 id 로 한 번 더 add → ValueError
    existing_id = next(iter(j.id for j in scheduler.get_jobs()))
    with pytest.raises(ValueError, match=f"'{existing_id}'"):
        scheduler.add_job(lambda: None, "interval", minutes=1, id=existing_id)


# META fallback 이 가정하는 운영 interval/주기 값 (backend/.env 기준).
# env 가변 잡은 코드 기본값(getenv default)이 CI 와 운영에서 다를 수 있으므로,
# 가드가 이 운영값으로 env 를 명시 patch 해 환경 독립적으로 검증한다.
# 메타 fallback 문자열의 시간수를 바꾸면 여기도 함께 바꿔야 한다.
_OPERATIONAL_INTERVALS = {
    "CRAWL_INTERVAL_HOURS": 12,        # crawl_articles → "12시간 interval"
    "CRAWL_DETAIL_INTERVAL_MIN": 30,   # crawl_details → "30분 interval"
    "COMPLEX_DETAIL_APT_INTERVAL_HOURS": 4,   # → "4시간 interval"
    "COMPLEX_DETAIL_OPST_INTERVAL_HOURS": 4,  # → "4시간 interval"
    "MONITOR_INTERVAL_MIN": 10,        # crawler_monitor → "10분 interval" (.env 운영값)
}


def test_meta_fallback_matches_describe_trigger_for_active_jobs():
    """모든 env on 시: META schedule fallback == describe_trigger(실제 trigger).

    세션 256 — schedule SSOT 도입. META schedule 은 비활성 잡 전용 fallback 으로
    격하됐다(활성 잡은 scheduler-status 가 trigger 에서 런타임 생성). 그래도 손글씨라
    drift 위험이 남으므로, 9개 env 강제 on 한 scheduler 의 각 trigger 와 정확 매칭해
    고정한다. 옛 휴리스틱 가드(키워드 포함 여부)를 정확 매칭으로 대체 —
    PR #99(08:30↔04:30)·PR 6a(6h↔4h)·monitor(20분↔10분) 류 drift 를 구조적으로 차단.

    env 가변 interval 잡은 _OPERATIONAL_INTERVALS 로 운영값을 명시 patch 한다 —
    CI 엔 .env 가 없어 코드 기본값(예: MONITOR_INTERVAL_MIN=30)을 쓰므로, patch
    없이는 메타 fallback(운영 10분)과 환경 불일치로 false fail (CI #823 사고 답습).
    """
    from crawler.schedule_describe import describe_trigger
    from routers.admin.scheduler import SCHEDULER_JOB_META

    with (
        patch.object(sched_mod, "PUBLIC_DATA_ENABLED", True),
        patch.object(sched_mod, "OFFICIAL_PRICE_ENABLED", True),
        patch.object(sched_mod, "POPULAR_CRAWL_ENABLED", True),
        patch.object(sched_mod, "AIR_QUALITY_ENABLED", True),
        patch.object(sched_mod, "EMERGENCY_ENABLED", True),
        patch.object(sched_mod, "CHILDCARE_ENABLED", True),
        patch.object(sched_mod, "CRIME_STATS_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_DETAIL_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True),
        patch.object(sched_mod, "MONITOR_ENABLED", True),
        patch.multiple(sched_mod, **_OPERATIONAL_INTERVALS),
    ):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}

    errors: list[str] = []
    for job_id, meta in SCHEDULER_JOB_META.items():
        job = jobs.get(job_id)
        if job is None:
            errors.append(f"{job_id}: 모든 env on 인데 미등록 (META 만 있고 잡 없음)")
            continue
        generated = describe_trigger(job.trigger)
        if generated != meta["schedule"]:
            errors.append(
                f"{job_id}: meta fallback='{meta['schedule']}' != describe_trigger='{generated}'"
            )
    assert not errors, "META fallback 과 trigger SSOT drift:\n  " + "\n  ".join(errors)


def test_scheduler_job_meta_covers_all_registered_jobs():
    """SCHEDULER_JOB_META 가 create_scheduler() 의 모든 등록 job id 를 커버한다.

    META 누락 시 admin UI 의 스케줄러 모니터링 표에 해당 job 이 안 보임.
    PR #20·#14 가 새 job 추가하면서 META 동기화를 빠뜨린 사고 재발 방지.
    """
    from routers.admin.scheduler import SCHEDULER_JOB_META

    # 모든 조건부 job 을 켜야 등록되는 잡까지 다 잡힘
    with (
        patch.object(sched_mod, "PUBLIC_DATA_ENABLED", True),
        patch.object(sched_mod, "OFFICIAL_PRICE_ENABLED", True),
        patch.object(sched_mod, "POPULAR_CRAWL_ENABLED", True),
        patch.object(sched_mod, "AIR_QUALITY_ENABLED", True),
        patch.object(sched_mod, "EMERGENCY_ENABLED", True),
        patch.object(sched_mod, "CHILDCARE_ENABLED", True),
        patch.object(sched_mod, "CRIME_STATS_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_DETAIL_ENABLED", True),
        patch.object(sched_mod, "COMPLEX_METRIC_ENABLED", True),
        patch.object(sched_mod, "MONITOR_ENABLED", True),
        patch.object(sched_mod, "VACUUM_MAINTENANCE_ENABLED", True),
    ):
        scheduler = sched_mod.create_scheduler()
    registered_ids = {job.id for job in scheduler.get_jobs()}
    missing = registered_ids - set(SCHEDULER_JOB_META.keys())
    assert not missing, (
        f"SCHEDULER_JOB_META 누락: {sorted(missing)} — "
        "backend/routers/admin/scheduler.py 의 SCHEDULER_JOB_META 에 추가 필요"
    )


def test_vacuum_maintenance_job_registered_by_default():
    """VACUUM_MAINTENANCE_ENABLED=true(기본) 면 정기 VACUUM job 이 새벽 03:50 에 등록 (세션 260)"""
    with patch.object(sched_mod, "VACUUM_MAINTENANCE_ENABLED", True):
        scheduler = sched_mod.create_scheduler()
    jobs = {job.id: job for job in scheduler.get_jobs()}
    assert "vacuum_maintenance" in jobs
    fields = {f.name: str(f) for f in jobs["vacuum_maintenance"].trigger.fields if not f.is_default}
    assert fields.get("hour") == "3" and fields.get("minute") == "50"


def test_vacuum_maintenance_job_absent_when_disabled():
    """VACUUM_MAINTENANCE_ENABLED=false 면 정기 VACUUM job 미등록"""
    with patch.object(sched_mod, "VACUUM_MAINTENANCE_ENABLED", False):
        scheduler = sched_mod.create_scheduler()
    assert "vacuum_maintenance" not in _job_ids(scheduler)


def test_run_vacuum_maintenance_skips_on_sqlite():
    """run_vacuum_maintenance 는 SQLite(테스트)에선 no-op (VACUUM 문법 PostgreSQL 전용)"""
    from crawler.vacuum_maintenance import run_vacuum_maintenance

    result = run_vacuum_maintenance()
    assert result["skipped"] == "sqlite"
    assert result["vacuumed"] == []


def test_run_vacuum_maintenance_records_crawl_job(db):
    """세션 359: 전수조사로 발견된 사각지대 회귀 가드 — 이전엔 CrawlJob 을 아예
    안 남겨 monitor.py 3축(작업실패/작업마비/데이터미축적) 어디도 이 잡의 존재
    자체를 몰랐다. 이제 job_type='vacuum_maintenance' 로 완료 기록이 남아야 하고,
    이걸로 monitor.py 의 범용 job_type 스캔(작업실패/작업마비)에 자연 편입된다."""
    from crawler.vacuum_maintenance import run_vacuum_maintenance
    from db.models import CrawlJob

    run_vacuum_maintenance()

    job = db.query(CrawlJob).filter(CrawlJob.job_type == "vacuum_maintenance").first()
    assert job is not None, "CrawlJob 기록이 생성되지 않음 — 사각지대 재발"
    assert job.status == "completed"
    assert job.completed_at is not None
