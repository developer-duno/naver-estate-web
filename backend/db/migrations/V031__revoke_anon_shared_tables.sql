-- V031: 공유 4테이블 anon/authenticated REST 노출 차단 (2026-06-02 세션 261)
--
-- 사건: Supabase t4g.micro 인스턴스 RAM 71% 과부하 실증 진단 (사용자 "검토하고 실증
--   통해 정리해줘"). 라이브 pg_stat_statements 측정 결과 micro 부하 1위(누적 3814초 /
--   10,416회)가 PostgREST `/rest/v1/articles` 직접 조회. 1위 쿼리 =
--   `SELECT complex_no, numeric_maintenance_cost, direction FROM articles WHERE is_active=$1
--   LIMIT/OFFSET` (4316회 × 424ms). 우리 FastAPI 가 아니라 외부 클라이언트가 공개 anon
--   key 로 매물 전량(active 44.7만 행, articles 615MB)을 페이지네이션하며 긁는 것.
--   articles cache hit 70.9% 까지 떨어뜨려 micro shared_buffers(256MB) 오염 → Auth 등
--   다른 컨테이너와 1GB RAM 경합 → 71% 스파이크 (세션 254 522 장애 발단).
--
-- 노출 경로 (라이브 전수 실측 2026-06-02): 공유 4테이블에 permissive SELECT 정책이
--   {public} role 로 깔려 있고, anon·authenticated 둘 다 SELECT~TRUNCATE GRANT 보유.
--     - articles               anon_read_articles                  (V007)
--     - complexes              anon_read_complexes                 (V007)
--     - complex_price_history  anon_read_complex_price_history     (mibunyang)
--     - trades                 "Public read"                       (mibunyang)
--   (trades "Service write" cmd=ALL 은 service_role 전용 의도라 유지 — 본 마이그 미대상.)
--
-- 비즈니스 모델 위반이기도 함: B2B 공인중개사 구독 단독인데 매물 데이터를 anon 에 전량
--   무료 노출. PostgREST 부하 1위 + 보안/모델 유출 동시 해소.
--
-- 영향 0 검증 (3개 탐색 에이전트 교차 + 라이브 실측):
--   - 우리 FastAPI = DATABASE_URL postgres 직결(슈퍼유저, RLS/GRANT bypass) → 정상 조회 무관.
--   - FE Supabase JS = auth(login/signup) + user_profiles upsert 만 사용. 공유 4테이블
--     `.from()` 0건 (api-direct.ts 폴백은 backend 장애 시만 발동 — 후속 별도 PR 처리).
--   - mibunyang = service_role(SUPABASE_SERVICE_KEY) 단독으로 공유 테이블 접근 (RLS bypass).
--     mibunyang anon 클라는 mibunyang 전용 테이블만 조회 → 공유 4테이블 anon 0건.
--
-- RLS ENABLE 은 유지 (V007 에서 켜둔 상태 그대로). 정책 DROP + GRANT REVOKE 만 수행.
-- 이중 빗장: permissive 정책을 전수 DROP 해도, GRANT 까지 REVOKE 하면 행 평가 이전에
--   42501 permission denied 로 거부됨 (정책 누락/추가 시에도 안전).
--
-- 실행 방법: Supabase SQL Editor 수동 실행 (마이그레이션 자동 러너 없음). 적용 직전
--   아래 사전 조회로 실제 정책명/GRANT 를 재확인해 DROP/REVOKE 목록을 보정할 것.
--
--   사전 조회 (적용 전 실행 — 정책명 drift 보정):
--     SELECT tablename, policyname, roles::text, cmd FROM pg_policies
--      WHERE tablename IN ('articles','complexes','trades','complex_price_history')
--      ORDER BY tablename, policyname;
--     SELECT grantee, table_name,
--            string_agg(privilege_type, ',' ORDER BY privilege_type) privs
--       FROM information_schema.role_table_grants
--      WHERE table_name IN ('articles','complexes','trades','complex_price_history')
--        AND grantee IN ('anon','authenticated')
--      GROUP BY grantee, table_name;
--
--   먼저 `BEGIN; <본문> ROLLBACK;` 로 에러 0 시뮬 후 실제 COMMIT 권장.

BEGIN;

-- ① 과잉 쓰기 GRANT 회수 (anon·authenticated 둘 다 — 정책 roles={public} 대응)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.articles              FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.complexes             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.trades                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.complex_price_history FROM anon, authenticated;

-- ② anon SELECT permissive 정책 전수 DROP (V007 + mibunyang 양쪽 생성분)
DROP POLICY IF EXISTS anon_read_articles              ON public.articles;
DROP POLICY IF EXISTS anon_read_complexes             ON public.complexes;
DROP POLICY IF EXISTS anon_read_complex_price_history ON public.complex_price_history;
DROP POLICY IF EXISTS "Public read"                   ON public.trades;
-- (사전 조회에서 추가 permissive SELECT 정책 발견 시 여기 줄 추가)

-- ③ SELECT GRANT 회수 = 이중 빗장 (정책 누락해도 42501 로 차단)
REVOKE SELECT ON public.articles              FROM anon, authenticated;
REVOKE SELECT ON public.complexes             FROM anon, authenticated;
REVOKE SELECT ON public.trades                FROM anon, authenticated;
REVOKE SELECT ON public.complex_price_history FROM anon, authenticated;

-- ④ PostgREST 스키마 캐시 리로드 (정책/권한 변경 즉시 반영)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- 적용 확인 (라이브 smoke — backend/db/maintenance/verify_anon_shared_locked.sql 참조):
--   SET ROLE anon; SELECT count(*) FROM articles; RESET ROLE;   -- 기대: 42501 permission denied
--   SELECT tablename, policyname FROM pg_policies
--    WHERE tablename IN ('articles','complexes','trades','complex_price_history');  -- 기대: 0행 (Service write 제외)
--
-- 역방향 (롤백) — 노출을 되살림. 쓰기 GRANT 는 과잉이라 의도적으로 복원 안 함:
--   BEGIN;
--   GRANT SELECT ON public.articles              TO anon, authenticated;
--   GRANT SELECT ON public.complexes             TO anon, authenticated;
--   GRANT SELECT ON public.trades                TO anon, authenticated;
--   GRANT SELECT ON public.complex_price_history TO anon, authenticated;
--   CREATE POLICY anon_read_articles              ON public.articles              FOR SELECT USING (is_active = true);
--   CREATE POLICY anon_read_complexes             ON public.complexes             FOR SELECT USING (true);
--   CREATE POLICY anon_read_complex_price_history ON public.complex_price_history FOR SELECT USING (true);
--   CREATE POLICY "Public read"                   ON public.trades                FOR SELECT USING (true);
--   NOTIFY pgrst, 'reload schema';
--   COMMIT;
