-- V027: crawl_jobs (scheduler_job_id, started_at) 복합 인덱스
-- /admin/scheduler-calendar endpoint 가 월 범위 (started_at >= X AND started_at < Y) +
-- scheduler_job_id NOT NULL 필터 조합으로 조회. 단일 인덱스 ix_crawl_jobs_scheduler_job_id
-- (V014, scheduler_job_id 만) 로는 started_at 범위가 sequential scan 위험.
-- 30일 ~4,070 행 / 전체 ~5만 미만 추정이라 CREATE INDEX (CONCURRENTLY 미사용)
-- 로 lock 영향 미미 (V015·V016 답습 패턴).

CREATE INDEX IF NOT EXISTS ix_crawl_jobs_scheduler_started
ON crawl_jobs (scheduler_job_id, started_at);

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS ix_crawl_jobs_scheduler_started;
