-- V014: 스케줄러 모니터링을 위한 scheduler_job_id 컬럼 추가
-- crawl_jobs 테이블에서 스케줄러 작업별 실행 이력을 조회할 수 있도록 함

ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS scheduler_job_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS ix_crawl_jobs_scheduler_job_id ON crawl_jobs(scheduler_job_id);

-- ROLLBACK:
-- DROP INDEX IF EXISTS ix_crawl_jobs_scheduler_job_id;
-- ALTER TABLE crawl_jobs DROP COLUMN IF EXISTS scheduler_job_id;
