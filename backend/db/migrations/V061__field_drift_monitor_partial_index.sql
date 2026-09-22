-- V061: field_drift_monitor 쿼리 부분 인덱스 (새벽 statement timeout 반복 — 세션 561)
--
-- 배경: `run_field_drift_monitor`(매일 04:40)가 15개 필드를 SUM(CASE) 로 묶어 세는
-- compute_fill_rates 쿼리가 **statement_timeout 으로 격일 반복 실패**했다
-- (crawl_jobs id=55677 09-19 실패 · id=56589 09-21 실패, 둘 다 정확히 7~8초에서 취소 —
-- QueryCanceled). 09-20 성공(7.7초)과 09-21 실패(timeout)가 하루 차이라, DB 부하에
-- 따라 timeout 경계선을 아슬아슬하게 오갔던 것이다.
--
-- 원인 (EXPLAIN ANALYZE 실측, 세션 561):
--   WHERE is_active=true AND detail_crawled=true AND heating_type IS NOT NULL
--         AND updated_at > now() - interval '48h'
--   기존엔 이 조합을 받는 인덱스가 없어, planner 가 이 쿼리와 무관한
--   idx_articles_floor_number(313,014행 스캔)를 "그나마 나은 선택"으로 골랐다.
--   실측: Bitmap Heap Scan, Buffers 13,248, **Execution Time 4,642ms**.
--
-- 처방 = V057 과 같은 패턴(부분 인덱스). WHERE 의 상수 조건 3개(is_active·
-- detail_crawled·heating_type)로 부분 인덱스를 만들고 updated_at 을 키로 넣으면,
-- 이 감시가 보는 population(48시간 창의 정상 매물)이 정확히 이 인덱스 범위와
-- 일치해 count(*) 자체가 인덱스만 스캔하면 끝난다 — count 가 있으면 인덱스가
-- 무효화된다는 [[feedback-combined-aggregate-index-void]] 의 함정은 max+count 를
-- **다른 컬럼**으로 묶을 때 생기는 것이고, 여기는 count 대상 자체가 부분 인덱스
-- 조건과 동일해 해당하지 않는다(실측으로 확인, 아래 결과).
--
-- 실측 (같은 15필드 쿼리, EXPLAIN ANALYZE, 인덱스 생성→측정→삭제 후 재현):
--   Before: Bitmap Heap Scan, Buffers hit=3895 read=9353, **4,642ms**
--   After:  Index Scan using 본 인덱스, Buffers hit=20308 read=83, **54ms**
--   → 약 86배. Execution Time 이 8초 timeout 대비 압도적 여유로 전환.
--
-- 기존 데이터 영향 0: 신규 인덱스 추가일 뿐, 쿼리 결과·다른 경로는 무영향.
-- 공유 DB(mibunyang)도 articles 에 upsert 하지만(naver 수집기) V038 선례와 동일하게
-- 저빈도 upsert 라 인덱스 유지 오버헤드 미미.
--
-- articles 는 대형(153만)이지만 CREATE INDEX (CONCURRENTLY 미사용)로 실행 —
-- Supabase SQL Editor 는 단일 statement 라 트랜잭션 래핑 없이 실행 가능. 인덱스 빌드 중
-- 짧은 ACCESS EXCLUSIVE 락이 걸리므로(V038 선례, 수십 초 내외) **한가한 시간(새벽) 권장**.
--
-- 코드 변경 불필요 — 쿼리는 그대로 두고 인덱스만 추가. compute_fill_rates 는 이미
-- 이 조건 그대로 실행 중이라 인덱스 적용 즉시 다음 04:40 회차부터 빨라진다.

CREATE INDEX IF NOT EXISTS ix_articles_field_drift_window
ON articles (updated_at DESC)
WHERE is_active = true AND detail_crawled = true AND heating_type IS NOT NULL;

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS ix_articles_field_drift_window;
