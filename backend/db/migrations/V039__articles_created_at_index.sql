-- V039: articles.created_at 인덱스 (신선도 new_rows 헛바퀴 감지 timeout 방지)
-- compute_freshness 가 종목마다 "작업 시작 후 새로 들어온 행 수(new_rows)" 를 계산하는데,
-- articles(121만 행)는 `WHERE created_at >= job_start` count 가 인덱스 없어 풀스캔(3.8초,
-- 부하 시 8초 statement_timeout 초과) → monitor 를 죽였다(세션 342, V038 후 남은 병목).
-- created_at 인덱스로 이 범위 count 를 Index Range Scan(ms)으로. articles 외 종목
-- (complexes·complex_price_history)은 작아서 풀스캔이어도 0.07초라 인덱스 불필요.
--
-- V038 과 동일: prod 는 CREATE INDEX CONCURRENTLY 로 락 없이 적용(세션 342 실측 5.7초).
-- 마이그 파일은 비-CONCURRENTLY(멱등 IF NOT EXISTS) — 이미 존재하면 no-op.
-- 공유 DB(mibunyang)도 articles upsert 하나 인덱스 유지 오버헤드 미미.

CREATE INDEX IF NOT EXISTS ix_articles_created_at
ON articles (created_at);

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS ix_articles_created_at;
