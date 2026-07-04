-- V038: articles.updated_at 인덱스 (신선도 monitor timeout 방지)
-- 크롤링 monitor(10분 interval)가 compute_freshness 로 매번 articles(121만 행)의
-- max(updated_at) 을 조회하는데, 인덱스가 없어 풀스캔 → 부하 시 8초 statement_timeout
-- 초과로 트랜잭션 aborted → monitor 반복 크래시(세션 342 실측: slow query 9.6초).
-- updated_at DESC 인덱스로 max() 가 인덱스 역스캔 첫 행(ms)이 되게 한다.
-- (freshness.py 에서 max 와 count 를 별도 쿼리로 분리해 이 인덱스가 max 에 먹게 함 —
--  묶으면 count 풀스캔이 인덱스를 무효화. 메모리 combined-aggregate-index-void 답습.)
--
-- articles 는 대형(121만)이지만 CREATE INDEX (CONCURRENTLY 미사용) 로 실행 —
-- Supabase SQL Editor/엔진은 단일 statement 라 트랜잭션 래핑 없이 실행 가능.
-- 인덱스 빌드 중 ACCESS EXCLUSIVE 락이 잠깐 걸리나(수십 초 내외) 크롤·검색을 블록하므로
-- **한가한 시간(새벽)에 실행 권장**. 공유 DB(mibunyang)도 articles 에 upsert 하지만(naver
-- 수집기) AdaptiveThrottle 저빈도라 인덱스 유지 오버헤드는 미미. 신규 인덱스라 스키마
-- 호환성 영향 0 — 양쪽 프로젝트의 기존 쿼리는 인덱스 유무와 무관하게 동작(있으면 빨라질 뿐).

CREATE INDEX IF NOT EXISTS ix_articles_updated_at
ON articles (updated_at DESC);

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS ix_articles_updated_at;
