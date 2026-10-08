-- V071: SGIS 동네 통계 표 sgis_area_stats + complexes 행정동 코드 칸 2개 (세션 453, 사장님 확정 2026-10-08)
--
-- 설계서 = docs/superpowers/specs/2026-10-08-sgis-neighborhood-card-design.md §4
--
-- 무엇:
--   * sgis_area_stats — 국가데이터처 SGIS 행정구역 통계(공공데이터포털 15129688 zip, 연 1회)를
--     긴 모양(행정구역코드 · 기준연도 · 통계항목 · 값) 그대로 담는다. 1차는 행정동(8글자)만 적재.
--     적재 = scripts/load_sgis_stats.py(수동), 보조 API·재해 항목은 PR ② 수집기가 같은 표에 더한다.
--     미분양도 이 표를 읽기만 한다(service_role 경유).
--   * complexes.sgis_emd_cd / sgis_mapped_at — 단지가 속한 SGIS 행정동 코드(8글자)와 매핑 시각.
--     채우기 = scripts/map_complex_sgis.py(좌표 → rgeocodewgs84, 단지당 1회).
--
-- 보안: 이 DB 의 anon key 는 프런트 번들에 공개돼 있다. 공개 통계라도 쓰기 구멍을 막으려고
--   RLS 를 켜고 정책을 0개로 두며 PUBLIC·anon·authenticated 3역할의 표 권한을 전부 회수한다(V069 모양).
--   backend 는 postgres 역할(표 소유자)이라 REVOKE 에 안 걸린다. service_role 은 건드리지 않는다.
--
-- 공유 DB(mibunyang) 영향:
--   * complexes 두 칸은 nullable 추가라 기존 행·기존 쿼리 동작 변화 0. mibunyang 의 complexes 쓰기는
--     명시 칸 upsert 라 모르는 칸을 NULL 로 밀지 않는다(V058 헤더와 같은 구조).
--   * 새 표는 mibunyang 권한 지문에 들어간다 → 적용 뒤 기준선 재승인 요청 의무(아래).
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 하나라도 어긋나면
--   RAISE EXCEPTION → 전부 취소된다. 적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만).
--
-- 적용 뒤 의무: mibunyang 권한 지문 기준선 재승인 요청(infra.md §권한·정책·뷰·함수를 바꾸는 마이그)
--   — 기대 차이 = 새 표 public.sgis_area_stats 1 · RLS 켬·정책 0 · PUBLIC·anon·authenticated REVOKE ALL.
--   (시퀀스 없음 — 키가 자연키라 bigserial 을 안 쓴다. complexes 칸·인덱스 추가는 지문 밖)
--
-- 순서: 서버 코드는 이 표·칸을 아직 읽지 않는다(Complex 모델에 두 칸을 넣지 않았고, SgisAreaStats 모델은
--   조회하는 라우터가 없다) → 재시작 순서와 무관. 단 두 스크립트는 이 파일이 운영에 적용된 뒤에만 돌린다.
--   ⚠ 나중에 Complex 모델에 두 칸을 넣는 PR 은 반드시 이 파일 운영 적용 뒤에 머지·재시작(V058 관례).

BEGIN;

CREATE TABLE IF NOT EXISTS public.sgis_area_stats (
  adm_cd     text         NOT NULL,
  year       smallint     NOT NULL,
  item_code  text         NOT NULL,
  value      numeric,
  value_text text,
  loaded_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (adm_cd, year, item_code)
);

COMMENT ON TABLE public.sgis_area_stats IS
  'SGIS 행정구역 통계(긴 모양) — 2u 적재, 미분양 읽기. backend(postgres) 전용, RLS 켬·정책 0, PUBLIC·anon·authenticated 권한 0';
COMMENT ON COLUMN public.sgis_area_stats.adm_cd IS 'SGIS 행정구역코드 2/5/8글자(시도 코드는 SGIS 자체 — 세종 29·전남 36). 1차는 8글자(행정동)만';
COMMENT ON COLUMN public.sgis_area_stats.year IS '통계 기준연도(예 2024)';
COMMENT ON COLUMN public.sgis_area_stats.item_code IS '파일 항목 to_in_001·ga_sd_005·ho_yr_004 … / 건축년도 구간 라벨 ho_cy_label_<시작>_<끝> / 보조 API api_* / 재해 ndsm_*';
COMMENT ON COLUMN public.sgis_area_stats.value IS '숫자 값. 원본 "N/A"(작은 수 통계 보호)는 NULL';
COMMENT ON COLUMN public.sgis_area_stats.value_text IS '글자 값 — 건축년도 구간 라벨 원문(예 "1979년 이전"), 행정동 이름 등';

CREATE INDEX IF NOT EXISTS sgis_area_stats_item_idx
  ON public.sgis_area_stats (item_code, year);

-- RLS 켬 + 정책 0 → anon/authenticated 는 0행.
ALTER TABLE public.sgis_area_stats ENABLE ROW LEVEL SECURITY;

-- Supabase 는 public 새 표에 기본 권한을 준다 → PUBLIC·anon·authenticated 3역할 전부 회수.
REVOKE ALL ON public.sgis_area_stats FROM PUBLIC, anon, authenticated;

-- complexes: 단지 → SGIS 행정동 코드(8글자) + 매핑 시각
ALTER TABLE public.complexes ADD COLUMN IF NOT EXISTS sgis_emd_cd text;
ALTER TABLE public.complexes ADD COLUMN IF NOT EXISTS sgis_mapped_at timestamptz;
COMMENT ON COLUMN public.complexes.sgis_emd_cd IS
  'SGIS 행정동 코드 8글자(sido_cd+sgg_cd+emdong_cd, rgeocodewgs84) — scripts/map_complex_sgis.py 가 채움. NULL = 아직 안 함 또는 결과 없음';
COMMENT ON COLUMN public.complexes.sgis_mapped_at IS 'sgis_emd_cd 를 채운 시각';

CREATE INDEX IF NOT EXISTS complexes_sgis_emd_idx
  ON public.complexes (sgis_emd_cd);

-- 자체검사 — 하나라도 어긋나면 전부 취소('public' = PUBLIC 의사 역할)
DO $$
DECLARE
  t   text := 'public.sgis_area_stats';
  r   text;
  pv  text;
BEGIN
  -- ① 3역할은 표 권한·칸 SELECT 권한 0
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH pv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF pg_catalog.has_table_privilege(r, t, pv) THEN
        RAISE EXCEPTION 'sgis_area_stats self-check: % has % on %', r, pv, t;
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege(r, t, 'SELECT') THEN
      RAISE EXCEPTION 'sgis_area_stats self-check: % has column SELECT on %', r, t;
    END IF;
  END LOOP;
  -- ② RLS 켬 + 정책 0
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'sgis_area_stats self-check: RLS off on %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy po WHERE po.polrelid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'sgis_area_stats self-check: policy exists on %', t;
  END IF;
  -- ③ complexes 두 칸이 생겼는지
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'complexes'
         AND column_name IN ('sgis_emd_cd', 'sgis_mapped_at')) <> 2 THEN
    RAISE EXCEPTION 'sgis_area_stats self-check: complexes.sgis_emd_cd/sgis_mapped_at missing';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- 표를 지우면 적재한 통계도 사라진다(zip 으로 다시 적재 가능). 칸을 지우면 매핑 결과(약 6만 콜 분량)도 사라진다.
-- DROP TABLE IF EXISTS public.sgis_area_stats;
-- DROP INDEX IF EXISTS public.complexes_sgis_emd_idx;
-- ALTER TABLE public.complexes DROP COLUMN IF EXISTS sgis_mapped_at;
-- ALTER TABLE public.complexes DROP COLUMN IF EXISTS sgis_emd_cd;
-- (그 뒤 mibunyang 권한 지문 기준선 재승인 — 표 1개 사라짐)
