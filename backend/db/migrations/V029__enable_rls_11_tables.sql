-- V029: RLS 미활성 11개 테이블 보안 잠금 (2026-05-31 세션 254)
--
-- 사건: Supabase Advisor CRITICAL 12건 — public 스키마 11개 테이블이 RLS off +
-- 정책 0개라, 브라우저 공개 anon key 로 user_profiles(회원 이메일·등급)·
-- agent_verifications(공인중개사 자격서류)·audit_logs(관리자 로그) 등이 SELECT/INSERT
-- 모두 노출. 실측: anon key 로 rows=1 읽힘 + INSERT 도 NOT NULL 위반(23502)까지 도달
-- = write 권한도 뚫림.
--
-- 백엔드는 DATABASE_URL postgres 직결(슈퍼유저)이라 RLS 우회 → 영향 0.
-- 프론트(anon)는 user_profiles 만 본인 것 직접 읽음(Header role 조회 / login upsert).
-- 나머지 10개는 프론트 직접 접근 0 (전부 백엔드 API 경유) → anon 완전 차단.
--
-- 기존 정책 패턴 답습: complexes(anon_read_complexes SELECT using=true) /
-- subscribers(Service read auth.role()='service_role') / consults(anon INSERT check=true).

-- ─────────────────────────────────────────────────────────────
-- A. user_profiles — 본인 데이터만 (auth.uid() 매칭) + service_role 전권
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 읽기 (Header.tsx role 조회 = .eq user_id .single)
-- user_id 컬럼이 character varying 라 auth.uid()(uuid) 를 ::text 캐스트해 비교.
CREATE POLICY "own profile select" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (auth.uid()::text = user_id);

-- 본인 프로필 생성/수정 (login/page.tsx upsert = last_login_at)
CREATE POLICY "own profile insert" ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "own profile update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (auth.uid()::text = user_id);

-- 백엔드(service_role) 전권 (관리자 사용자 목록·역할 변경 등)
CREATE POLICY "user_profiles service" ON public.user_profiles
  FOR ALL TO public
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- B. 백엔드 전용 10개 — anon 완전 차단, service_role 만 (프론트 직접 접근 0)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.agent_verifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitor_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.naver_api_call_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawler_checkpoints   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complex_pyeong_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_verifications service"   ON public.agent_verifications   FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "audit_logs service"            ON public.audit_logs            FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "admin_settings service"        ON public.admin_settings        FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "crawl_jobs service"            ON public.crawl_jobs            FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "monitor_alerts service"        ON public.monitor_alerts        FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "naver_api_call_counts service" ON public.naver_api_call_counts FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "rate_limit_counters service"   ON public.rate_limit_counters   FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "crawler_checkpoints service"   ON public.crawler_checkpoints   FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "article_price_history service" ON public.article_price_history FOR ALL TO public USING (auth.role() = 'service_role');
CREATE POLICY "complex_pyeong_details service" ON public.complex_pyeong_details FOR ALL TO public USING (auth.role() = 'service_role');
