-- V050: complex_official_prices 신선도 monitor 풀스캔 제거 (V048 후속 — 세션 385)
--
-- 배경: crawler/monitor.py(10분 interval)가 routers/admin/freshness.compute_freshness 로
-- official_price 축을 조회하는데, 이 축만 아래처럼 max+count 를 한 SELECT 에 묶어
-- collected_at 인덱스 없이 매번 Seq Scan:
--   select(func.max(ComplexOfficialPrice.collected_at), func.count(ComplexOfficialPrice.id))
-- V048(세션 381)이 정확히 같은 패턴을 trades/complex_price_history/complexes 3테이블에서
-- 고쳤는데(max 는 인덱스 스캔으로 분리, count 는 _approx_count 근사로 분리) 이 테이블만
-- 그 정리에서 빠져 있었다.
--
-- 실측(세션 385, prod EXPLAIN ANALYZE BUFFERS): Seq Scan, 33.574ms, Buffers shared hit=1837,
-- 138,795행(reltuples), 28MB. 지금 당장 8초 statement_timeout 을 위협하는 수준은 아니나
-- (trades 347MB·2~4.6초와 비교해 훨씬 작음), 이 데이터는 월 1회(official_price 정기수집,
-- 매월 15일)만 갱신되는데 스캔은 10분마다 반복돼 갱신 빈도 대비 스캔 낭비 비율이 크고,
-- 앞으로 연도별 데이터가 누적되며 계속 커지는 테이블이라 V048과 동일하게 선제 정리한다.
--
-- 공유 DB 영향: complex_official_prices 는 naver-estate 전용(mibunyang 은 이 테이블을
-- 쓰지 않음, backend/CLAUDE.md V044 참조) — 공유 DB 영향 0. 신규 인덱스라 스키마
-- 호환성 영향도 0(기존 쿼리는 인덱스 유무와 무관하게 동작, 있으면 빨라질 뿐).
--
-- prod 적용 = V038/V048 선례대로 `CREATE INDEX CONCURRENTLY`(락 0, 단일 statement,
-- autocommit)로 Claude 가 직접 실행. 본 파일은 멱등(IF NOT EXISTS) 비-CONCURRENTLY
-- (CI SQLite 무관, 문서·재현용).
-- ⚠ 적용 연결은 db/database.py connect 이벤트가 statement_timeout=8000 을 박으므로 CIC 직전
--   같은 연결에서 `SET statement_timeout = '10min'` 필수. 직후 indisvalid 확인:
--   SELECT c.relname, i.indisvalid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
--    WHERE c.relname = 'ix_complex_official_prices_collected_at';
--   INVALID 면 `DROP INDEX CONCURRENTLY IF EXISTS ix_complex_official_prices_collected_at;`
--   후 재생성 (IF NOT EXISTS 는 INVALID 를 못 고친다 — 이름만 보고 no-op). 세션 모드(5432)
--   연결로 실행(transaction 모드 풀러는 SET 미고정).
--
-- DESC 는 V038/V048 답습 — PostgreSQL 은 max(col) 을 `ORDER BY col DESC LIMIT 1` 로 풀어
-- 인덱스 정방향 첫 non-NULL 행을 읽는다.

CREATE INDEX IF NOT EXISTS ix_complex_official_prices_collected_at
ON complex_official_prices (collected_at DESC);

-- 역방향 (롤백 — prod 은 CONCURRENTLY 로 락 0):
-- DROP INDEX CONCURRENTLY IF EXISTS ix_complex_official_prices_collected_at;
