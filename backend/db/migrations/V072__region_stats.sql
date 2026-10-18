-- V072: 동네 공식 통계 표 region_stats (세션 473, 사장님 확정 2026-10-18)
--
-- 설계서 = 메모리 design/s473_pr4-public-stats-plan.html 6절
--
-- 무엇:
--   * region_stats — 한국부동산원 R-ONE 통계(전국주택가격동향조사 시군구 전세가율 · 전월세전환율 시도)를
--     긴 모양(지역 코드 · 기준 달 · 통계 항목 · 값) 그대로 담는다. 통계가 늘면 열이 아니라 행이 는다.
--     적재 = crawler/service_region_stats.py(매월 16일 05:45 잡 collect_region_stats, 수동 = scripts/run_region_stats.py).
--     region_code = 시군구 5자리(법정동 코드 앞 5자리) · 시도는 앞 2자리 + '000' · 전국 = '00000'.
--     단지 → 지역은 complexes.cortar_no 앞 5자리로 잇는다(별도 짝짓기 표 없음).
--
-- 보안: 이 DB 의 anon key 는 프런트 번들에 공개돼 있다. 공개 통계라도 쓰기 구멍을 막으려고
--   RLS 를 켜고 정책을 0개로 두며 PUBLIC·anon·authenticated 3역할의 표 권한을 전부 회수한다(V069·V071 모양).
--   backend 는 postgres 역할(표 소유자)이라 REVOKE 에 안 걸린다.
--   service_role 에는 SELECT 를 **명시해서** 준다 — Supabase 가 2026-10-30 부터 기존
--   프로젝트도 새 public 표에 service_role 기본 권한을 주지 않는다(공식 changelog 45329, s454 확인).
--
-- 공유 DB(mibunyang) 영향:
--   * 새 표만 만든다(기존 표·칸 변화 0).
--   * 새 표는 mibunyang 권한 지문에 들어간다 → 적용 뒤 기준선 재승인 요청 의무(아래).
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 하나라도 어긋나면
--   RAISE EXCEPTION → 전부 취소된다. 적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만).
--
-- 적용 뒤 의무: mibunyang 권한 지문 기준선 재승인 요청(infra.md §권한·정책·뷰·함수를 바꾸는 마이그)
--   — 기대 차이 = 새 표 public.region_stats 1 · RLS 켬·정책 0 · PUBLIC·anon·authenticated REVOKE ALL · service_role SELECT 명시.
--   (시퀀스 없음 — 키가 자연키라 bigserial 을 안 쓴다)
--
-- 순서: 서버 코드가 이 표를 읽는다(단지 상세·비교·매물 상세 직렬화 — db/region_stats_queries.py).
--   표가 없으면 그 조회가 실패하므로 **이 파일을 운영에 먼저 적용한 뒤** 머지·재시작한다(V058 관례).

BEGIN;

CREATE TABLE IF NOT EXISTS public.region_stats (
  region_code text         NOT NULL,
  period      text         NOT NULL,
  stat_code   text         NOT NULL,
  value       numeric,
  source      text         NOT NULL,
  loaded_at   timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (region_code, period, stat_code)
);

COMMENT ON TABLE public.region_stats IS
  '동네 공식 통계(긴 모양) — 한국부동산원 R-ONE 월간 통계, 2u 적재(매월 16일 collect_region_stats). backend(postgres) 전용, RLS 켬·정책 0, PUBLIC·anon·authenticated 권한 0';
COMMENT ON COLUMN public.region_stats.region_code IS '지역 코드 5자리 — 시군구(법정동 코드 앞 5자리) · 시도 = 앞 2자리+000 · 전국 = 00000';
COMMENT ON COLUMN public.region_stats.period IS '기준 달 YYYYMM(R-ONE WRTTIME_IDTFR_ID)';
COMMENT ON COLUMN public.region_stats.stat_code IS '통계 항목 — reb_apt_jeonse_ratio_median(아파트 중위 전세가율 %) · reb_rent_conversion_rate(전월세전환율 %)';
COMMENT ON COLUMN public.region_stats.value IS '숫자 값(단위는 항목마다 — 지금 둘 다 %)';
COMMENT ON COLUMN public.region_stats.source IS '출처 문구(기관·통계명) — 화면 출처 각주에 그대로 쓴다';

CREATE INDEX IF NOT EXISTS region_stats_stat_period_idx
  ON public.region_stats (stat_code, period);

-- RLS 켬 + 정책 0 → anon/authenticated 는 0행.
ALTER TABLE public.region_stats ENABLE ROW LEVEL SECURITY;

-- Supabase 는 public 새 표에 기본 권한을 준다 → PUBLIC·anon·authenticated 3역할 전부 회수.
REVOKE ALL ON public.region_stats FROM PUBLIC, anon, authenticated;
-- service_role 은 읽기만 — 2026-10-30 뒤 적용돼도 자체검사 ③ 이 통과하도록 명시(머리 주석).
GRANT SELECT ON public.region_stats TO service_role;

-- 자체검사 — 하나라도 어긋나면 전부 취소('public' = PUBLIC 의사 역할)
DO $$
DECLARE
  t   text := 'public.region_stats';
  r   text;
  pv  text;
BEGIN
  -- ① 3역할은 표 권한·칸 SELECT 권한 0
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH pv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF pg_catalog.has_table_privilege(r, t, pv) THEN
        RAISE EXCEPTION 'region_stats self-check: % has % on %', r, pv, t;
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege(r, t, 'SELECT') THEN
      RAISE EXCEPTION 'region_stats self-check: % has column SELECT on %', r, t;
    END IF;
  END LOOP;
  -- ② RLS 켬 + 정책 0
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'region_stats self-check: RLS off on %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy po WHERE po.polrelid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'region_stats self-check: policy exists on %', t;
  END IF;
  -- ③ 반대 방향 실수 방지 — service_role 은 읽을 수 있어야 한다
  IF NOT pg_catalog.has_table_privilege('service_role', t, 'SELECT') THEN
    RAISE EXCEPTION 'region_stats self-check: service_role lacks SELECT on %', t;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- 표를 지우면 적재한 통계도 사라진다(R-ONE 에서 다시 받을 수 있음 — 수동 스크립트 --months-back 24).
-- ⚠ 서버 코드가 이 표를 읽으므로 지우기 전에 코드를 먼저 되돌린다.
-- DROP TABLE IF EXISTS public.region_stats;
-- (그 뒤 mibunyang 권한 지문 기준선 재승인 — 표 1개 사라짐)
