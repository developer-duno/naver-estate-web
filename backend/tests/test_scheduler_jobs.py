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
