-- V073: 면적별 정부 실거래 표 complex_area_trade_stats + complexes.rep_area_m2 (세션 474 PR 5 B27, 사장님 확정 2026-10-19)
--
-- 설계 = 메모리 scripts/s474_brief-b27-area-price.md · 결정 D1 「나. 2u 전용 새 표」 · D2 「ㄱ. 정수 ㎡로 내림」
--
-- 무엇:
--   * complex_area_trade_stats — 국토부 아파트 매매 실거래를 단지 · 달 · 전용면적 묶음(정수 ㎡, 소수점 버림)으로 모은 값.
--     84.36·84.94·84.97㎡ 는 전부 84 묶음이다. 한 줄 = 그 단지·그 달·그 묶음의 거래 수 · 중위 · 최저 · 최고 · 가격 목록(만원).
--     적재 = crawler/service_public.py 주간 수집(토요일 05:00, 24달)·소급(backfill_price_history) — 옛 달 평균 줄
--     (complex_price_history 의 area_no '' 줄)을 쓰는 바로 옆에서 같은 거래로 같이 쓴다(외부 호출 수 변화 0).
--     읽는 곳 = crawler/service_metrics.py(가치지표) · routers(단지 상세·비교·매물 상세 전세가율·엑셀) · db/price_queries.py(그래프 기본선).
--   * complexes.rep_area_m2 — 대표 면적 묶음(평형표 세대수 최다 묶음). 가치지표 잡이 매일 채운다.
--     nearby_median_price · jeonse_rate · recent_trades_6m 이 이 묶음 하나의 값으로 바뀐다.
--
-- 옛 줄: complex_price_history 의 정부 '' 줄·네이버 줄은 그대로 둔다(미분양이 계속 읽음 — 출처 약속 불변).
--
-- 보안: anon key 는 프런트 번들에 공개돼 있다 → RLS 켬 · 정책 0 · PUBLIC·anon·authenticated 권한 전부 회수(V072 모양).
--   backend 는 postgres 역할(표 소유자)이라 REVOKE 에 안 걸린다. service_role 에는 SELECT 를 명시해서 준다
--   (Supabase 가 2026-10-30 부터 새 public 표에 service_role 기본 권한을 주지 않음 — s454 확인).
--
-- 공유 DB(mibunyang) 영향:
--   * 새 표 1개 + complexes 에 칸 1개 추가(기존 칸 타입·값 변화 0). 칸 추가는 권한 지문에 안 들어간다.
--   * 새 표는 mibunyang 권한 지문에 들어간다 → 적용 뒤 기준선 재승인 요청 의무(아래).
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 하나라도 어긋나면
--   RAISE EXCEPTION → 전부 취소된다. 적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만).
--
-- 적용 뒤 의무: mibunyang 권한 지문 기준선 재승인 요청(infra.md §권한·정책·뷰·함수를 바꾸는 마이그)
--   — 기대 차이 = 새 표 public.complex_area_trade_stats 1 · RLS 켬·정책 0 · PUBLIC·anon·authenticated REVOKE ALL ·
--   service_role SELECT 명시. (시퀀스 없음 — 자연키라 bigserial 을 안 쓴다)
--
-- 순서(운영 선행 적용 필수): 서버 코드가 이 표와 complexes.rep_area_m2 를 읽는다. 표·칸이 없으면 단지 상세 조회가
--   실패하므로 **이 파일을 운영에 먼저 적용한 뒤** 머지·재시작한다(V058·V072 관례).

BEGIN;

CREATE TABLE IF NOT EXISTS public.complex_area_trade_stats (
  complex_no    varchar(20)  NOT NULL,
  base_month    varchar(6)   NOT NULL,
  area_m2       integer      NOT NULL,
  trade_count   integer      NOT NULL,
  price_median  integer,
  price_min     integer,
  price_max     integer,
  prices        jsonb        NOT NULL DEFAULT '[]'::jsonb,
  recorded_at   timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (complex_no, base_month, area_m2)
);

COMMENT ON TABLE public.complex_area_trade_stats IS
  '면적별 정부 실거래(국토부 아파트 매매) — 단지·달·전용면적 정수 ㎡ 묶음별 거래 수·중위·최저·최고·가격 목록(만원). 2u 적재(주간 수집·소급). backend(postgres) 전용, RLS 켬·정책 0, PUBLIC·anon·authenticated 권한 0';
COMMENT ON COLUMN public.complex_area_trade_stats.base_month IS '계약 달 YYYYMM';
COMMENT ON COLUMN public.complex_area_trade_stats.area_m2 IS '전용면적 묶음 — 국토부 excluUseAr 의 소수점을 버린 정수 ㎡(84.94 → 84)';
COMMENT ON COLUMN public.complex_area_trade_stats.trade_count IS '그 달·그 묶음 거래 수(해제 거래 제외)';
COMMENT ON COLUMN public.complex_area_trade_stats.prices IS '그 달·그 묶음 거래 가격 목록(만원, 오름차순) — 6개월 중위를 거래 단위로 다시 셀 때 쓴다';

-- 가치지표 잡이 최근 6개월을 한 번에 읽는다(base_month ≥ 기준 달)
CREATE INDEX IF NOT EXISTS complex_area_trade_stats_month_idx
  ON public.complex_area_trade_stats (base_month);

ALTER TABLE public.complexes ADD COLUMN IF NOT EXISTS rep_area_m2 integer;
COMMENT ON COLUMN public.complexes.rep_area_m2 IS
  '대표 전용면적 묶음(정수 ㎡) — 평형표 세대수 최다 묶음. nearby_median_price·jeonse_rate·recent_trades_6m 이 이 묶음 값(2u 가치지표 잡, 세션 474)';

-- RLS 켬 + 정책 0 → anon/authenticated 는 0행.
ALTER TABLE public.complex_area_trade_stats ENABLE ROW LEVEL SECURITY;

-- Supabase 는 public 새 표에 기본 권한을 준다 → PUBLIC·anon·authenticated 3역할 전부 회수.
REVOKE ALL ON public.complex_area_trade_stats FROM PUBLIC, anon, authenticated;
-- service_role 은 읽기만 — 2026-10-30 뒤 적용돼도 자체검사 ③ 이 통과하도록 명시(머리 주석).
GRANT SELECT ON public.complex_area_trade_stats TO service_role;

-- 자체검사 — 하나라도 어긋나면 전부 취소('public' = PUBLIC 의사 역할)
DO $$
DECLARE
  t   text := 'public.complex_area_trade_stats';
  r   text;
  pv  text;
BEGIN
  -- ① 3역할은 표 권한·칸 SELECT 권한 0
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH pv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF pg_catalog.has_table_privilege(r, t, pv) THEN
        RAISE EXCEPTION 'complex_area_trade_stats self-check: % has % on %', r, pv, t;
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege(r, t, 'SELECT') THEN
      RAISE EXCEPTION 'complex_area_trade_stats self-check: % has column SELECT on %', r, t;
    END IF;
  END LOOP;
  -- ② RLS 켬 + 정책 0
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'complex_area_trade_stats self-check: RLS off on %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy po WHERE po.polrelid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'complex_area_trade_stats self-check: policy exists on %', t;
  END IF;
  -- ③ 반대 방향 실수 방지 — service_role 은 읽을 수 있어야 한다
  IF NOT pg_catalog.has_table_privilege('service_role', t, 'SELECT') THEN
    RAISE EXCEPTION 'complex_area_trade_stats self-check: service_role lacks SELECT on %', t;
  END IF;
  -- ④ complexes.rep_area_m2 칸이 생겼다
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'complexes' AND column_name = 'rep_area_m2'
  ) THEN
    RAISE EXCEPTION 'complex_area_trade_stats self-check: complexes.rep_area_m2 missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- ⚠ 서버 코드가 이 표·칸을 읽으므로 지우기 전에 코드를 먼저 되돌린다.
-- 표를 지우면 면적별 값도 사라진다(주간 수집이 24달을 다시 받으며 채운다).
-- DROP TABLE IF EXISTS public.complex_area_trade_stats;
-- ALTER TABLE public.complexes DROP COLUMN IF EXISTS rep_area_m2;
-- (그 뒤 mibunyang 권한 지문 기준선 재승인 — 표 1개 사라짐)
