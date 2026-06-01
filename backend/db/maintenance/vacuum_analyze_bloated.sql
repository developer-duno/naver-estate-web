-- DB 유지보수: articles / trades 수동 VACUUM ANALYZE (1회 즉시 실행용)
--
-- 목적: visibility map + 통계(pg_statistic) 갱신 = 풀 테이블 집계(COUNT/MAX) 5초 → 수백ms.
--
-- 근인 (세션 260 라이브 실측):
--   - articles relallvisible 72.5% / dead 94,736 / autovacuum_count=0 / last_analyze=None
--   - COUNT(article_no) 는 Index Only Scan(pkey) 인데 buffer 846K(6.6GB) 읽음.
--     visibility map 이 stale 해서 인덱스 엔트리마다 heap 을 다시 확인하기 때문.
--   - autovacuum 이 0회인 이유: ANALYZE 0회 → 통계 stale (n_live_tup=5941, 실제 117만)
--     → autovacuum launcher 가 dead tuple 수를 오판 → 영영 트리거 안 됨 (악순환).
--   - 대조군 complex_price_history 는 autovacuum 정상 → relallvisible 98.3% → COUNT 49ms.
--   수동 VACUUM ANALYZE 1회로 통계를 정상화하면 이후 autovacuum 정상 작동을 기대.
--
-- 안전성: VACUUM(FULL 아님) = ACCESS SHARE 락만 잡음. SELECT/INSERT/UPDATE 비차단.
--   운영 중 실행 안전. IO 부하 분산을 위해 새벽(02~04시) 권장. 예상 30~120초.
--   ⚠️ VACUUM FULL 은 절대 사용 금지 (ACCESS EXCLUSIVE 락 = 테이블 전체 차단).
--
-- 실행 방법: Supabase SQL Editor 또는 psql 직접 접속. 이 프로젝트는 마이그레이션 자동
--   러너가 없으므로 수동 실행 필수. (정기 자동화는 crawler/vacuum_maintenance.py 스케줄러 잡)

VACUUM (ANALYZE, VERBOSE) articles;
VACUUM (ANALYZE, VERBOSE) trades;

-- 적용 확인 쿼리 (실행 후 visible_pct 95%+ / last_analyze 갱신 / n_live_tup 정상 기대):
--   SELECT t.relname,
--          t.last_vacuum, t.last_analyze, t.n_live_tup, t.n_dead_tup,
--          (SELECT round(100.0 * c.relallvisible / NULLIF(c.relpages, 0), 1)
--             FROM pg_class c WHERE c.relname = t.relname) AS visible_pct
--   FROM pg_stat_user_tables t
--   WHERE t.relname IN ('articles', 'trades');
