-- V048: 신선도 monitor 의 max() 대상 3컬럼 인덱스 (10분 주기 풀스캔 제거 — 세션 381)
--
-- 배경: crawler/monitor.py(10분 interval)가 routers/admin/freshness.compute_freshness 로
-- 매번 아래 세 max() 를 조회하는데, V038(articles.updated_at)·V039(articles.created_at)와 달리
-- 이 세 컬럼엔 인덱스가 없어 매번 Parallel Seq Scan:
--   max(trades.recorded_at)                → trades 976,565행·347MB (7일 slow 248회, 2~4.6초)
--   max(complex_price_history.recorded_at) → 382,506행·72MB (65회)
--   max(complexes.last_crawled_at)         → 63,966행·44MB (215회, count 와 묶여 있던 것은
--                                             freshness.py 에서 분리 + reltuples 근사로 전환)
-- freshness.py:141 주석("max 는 인덱스 역스캔(ms)")이 이 세 테이블에선 사실이 아니었음.
-- Micro(RAM 1GB) 인스턴스에서 1.2GB 데이터를 10분마다 스캔 → 버퍼 캐시 축출·IOwait 스파이크
-- (8/24 03:05 CPU IOwait 60%) — 8/22·8/24 DB OOM 크래시의 직접 원인은 아니나(메모리 포화)
-- 상시 부하를 없애는 보조 처방.
--
-- 공유 DB 영향: trades 는 mibunyang write 전용(naver read-only), complex_price_history 는
-- 양쪽 upsert, complexes 는 양쪽 upsert. 신규 인덱스라 스키마 호환성 영향 0 — 기존 쿼리는
-- 인덱스 유무와 무관하게 동작(있으면 빨라질 뿐). 쓰기 오버헤드 = 행당 btree 1건 추가(미미;
-- trades 는 월 1회 대량 적재라 적재 시 수초 증가 가능). mibunyang 세션에 통지 완료.
--
-- prod 적용 = V038 선례대로 `CREATE INDEX CONCURRENTLY`(락 0, 단일 statement, autocommit)로
-- Claude 가 실행(컴퓨트 업그레이드 재시작과 겹치지 않게 순서 조율 — 재시작 중 빌드 끊기면
-- INVALID 인덱스 잔존 → DROP 후 재생성 필요). 본 파일은 멱등(IF NOT EXISTS) 비-CONCURRENTLY
-- (CI SQLite 무관, 문서·재현용).
-- ⚠ 적용 연결은 db/database.py connect 이벤트가 statement_timeout=8000 을 박으므로 CIC 직전
--   같은 연결에서 `SET statement_timeout = '10min'` 필수(8초 초과·VACUUM(03:50) 충돌·
--   스냅샷 대기 시 QueryCanceled → INVALID 잔존). 인덱스 1개씩(작은 것부터: complexes →
--   complex_price_history → trades), 직후 indisvalid 확인:
--   SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
--    WHERE c.relname IN ('ix_trades_recorded_at','ix_complex_price_history_recorded_at','ix_complexes_last_crawled_at');
--   INVALID 면 `DROP INDEX CONCURRENTLY IF EXISTS <name>;` 후 재생성 (IF NOT EXISTS 는 INVALID 를
--   못 고친다 — 이름만 보고 no-op). 세션 모드(5432) 연결로 실행(transaction 모드 풀러는 SET 미고정).
--   마이그 안전성 리뷰(세션 381) GO_WITH_FIXES 반영.
--
-- DESC 는 V038 답습 — PostgreSQL 은 max(col) 을 `ORDER BY col DESC LIMIT 1` 로 풀어 인덱스
-- 정방향 첫 non-NULL 행을 읽는다(NULL 은 DESC NULLS FIRST 로 앞쪽에 오지만 `IS NOT NULL`
-- 인덱스 조건으로 건너뜀 → nullable 컬럼(complexes.last_crawled_at)에서도 ms).

CREATE INDEX IF NOT EXISTS ix_trades_recorded_at
ON trades (recorded_at DESC);

CREATE INDEX IF NOT EXISTS ix_complex_price_history_recorded_at
ON complex_price_history (recorded_at DESC);

CREATE INDEX IF NOT EXISTS ix_complexes_last_crawled_at
ON complexes (last_crawled_at DESC);

-- 역방향 (롤백 — prod 은 CONCURRENTLY 로 락 0):
-- DROP INDEX CONCURRENTLY IF EXISTS ix_trades_recorded_at;
-- DROP INDEX CONCURRENTLY IF EXISTS ix_complex_price_history_recorded_at;
-- DROP INDEX CONCURRENTLY IF EXISTS ix_complexes_last_crawled_at;
