-- V031 적용 검증: 공유 4테이블 anon REST 노출 차단 확인 (라이브 smoke)
--
-- 목적: V031__revoke_anon_shared_tables.sql 적용 후, 외부가 공개 anon key 로 매물/단지/
--   실거래 데이터를 더 이상 못 긁는지 실제 role 로 검증한다. CI(SQLite)는 RLS/role 을
--   실행 못 하므로(테스트는 마이그 SQL 텍스트 자산 검사만), 라이브 차단은 이 수동 smoke 로 본다.
--
-- 실행 방법: Supabase SQL Editor (또는 service_role/postgres psql 접속). 마이그 자동 러너 없음.
--   V031 COMMIT 직후 1회 실행.

-- ─────────────────────────────────────────────────────────────
-- 1. anon role 로 4테이블 SELECT 시도 → 전부 42501 permission denied 기대
--    (GRANT REVOKE 이중 빗장. 한 줄씩 실행 — 첫 에러에서 멈추면 나머지도 개별 확인.)
-- ─────────────────────────────────────────────────────────────
-- SET ROLE anon; SELECT count(*) FROM public.articles;              RESET ROLE;  -- 기대: ERROR 42501
-- SET ROLE anon; SELECT count(*) FROM public.complexes;             RESET ROLE;  -- 기대: ERROR 42501
-- SET ROLE anon; SELECT count(*) FROM public.trades;                RESET ROLE;  -- 기대: ERROR 42501
-- SET ROLE anon; SELECT count(*) FROM public.complex_price_history; RESET ROLE;  -- 기대: ERROR 42501

-- ─────────────────────────────────────────────────────────────
-- 2. anon SELECT permissive 정책이 모두 사라졌는지 (trades "Service write" 만 잔존 허용)
-- ─────────────────────────────────────────────────────────────
SELECT tablename, policyname, roles::text, cmd
  FROM pg_policies
 WHERE tablename IN ('articles', 'complexes', 'trades', 'complex_price_history')
 ORDER BY tablename, policyname;
-- 기대: articles/complexes/complex_price_history = 0행.
--       trades = "Service write" (cmd=ALL, service_role 의도) 1행만.

-- ─────────────────────────────────────────────────────────────
-- 3. anon/authenticated GRANT 가 SELECT~TRUNCATE 모두 회수됐는지
-- ─────────────────────────────────────────────────────────────
SELECT grantee, table_name,
       string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
  FROM information_schema.role_table_grants
 WHERE table_name IN ('articles', 'complexes', 'trades', 'complex_price_history')
   AND grantee IN ('anon', 'authenticated')
 GROUP BY grantee, table_name
 ORDER BY grantee, table_name;
-- 기대: 0행 (anon/authenticated 가 4테이블에 어떤 권한도 없음).

-- ─────────────────────────────────────────────────────────────
-- 4. (적용 수시간 후) PostgREST 부하 감소 추이 — pg_stat_statements
-- ─────────────────────────────────────────────────────────────
-- SELECT calls, round(mean_exec_time::numeric, 0) AS mean_ms,
--        round(total_exec_time::numeric / 1000, 0) AS total_s
--   FROM pg_stat_statements
--  WHERE query LIKE '%pgrst_source%' AND query LIKE '%articles%'
--  ORDER BY total_exec_time DESC LIMIT 5;
-- 기대: V031 적용 후 calls 증가 멈춤 (외부 anon 조회 차단). articles cache hit 회복
--       (pg_statio_user_tables 70.9% → 90%+).
