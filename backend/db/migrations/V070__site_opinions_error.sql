-- V070: 의견함에 "손님 화면 오류" 자동 기록 칸 추가 (세션 439, 사장님 승인 2026-10-06)
--
-- 무엇: 손님 화면에서 오류가 나면 화면이 POST /api/opinions/error 로 알려 온다. 그 기록을
--   site_opinions 에 kind='error' 행으로 담는다. 같은 오류(지문 fingerprint 가 같음)는 행을
--   새로 만들지 않고 repeat_count 만 1 올리고 last_seen_at 을 갱신한다
--   (INSERT … ON CONFLICT (fingerprint) WHERE kind = 'error' DO UPDATE — 아래 부분 유일 색인이 대상).
--   오류 행에는 이메일·회원 번호를 저장하지 않는다(라우터가 넣지 않음).
--
-- 바꾸는 것 = **칸·색인 추가만 + kind CHECK 교체**(기존 4종 + 'error'). 기존 행·칸 타입은 그대로.
--   ① kind CHECK: V069 가 칸 안에 이름 없이 만든 제약(자동 이름)을 pg_constraint 에서 찾아 지우고
--      같은 뜻 + 'error' 로 다시 단다(이름 site_opinions_kind_check — 모델과 같은 이름).
--   ② 칸 3개: fingerprint text · repeat_count integer NOT NULL DEFAULT 1 · last_seen_at timestamptz.
--      기존 행은 repeat_count=1·나머지 NULL 로 채워진다(DEFAULT 상수라 표 다시 쓰기 없음).
--   ③ 부분 유일 색인 (fingerprint) WHERE kind = 'error'.
--   권한·RLS·정책은 손대지 않는다(새 칸도 표 단위 REVOKE 에 그대로 묶인다 — 끝 자체검사가 다시 본다).
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 하나라도 어긋나면
--   RAISE EXCEPTION → 전부 취소된다. 적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만 + CHECK 교체).
--
-- 적용 뒤: 권한·정책·뷰·함수는 바뀌지 않는다. mibunyang 권한 지문에 CHECK 제약 정의가 들어가는지는
--   메인이 확인해, 들어가면 재승인 요청(infra.md §권한·정책·뷰·함수를 바꾸는 마이그) — 기대 차이 =
--   site_opinions kind CHECK 에 'error' 1개 추가.
--
-- ⚠ 코드보다 운영 선행 적용 필수(V034·V058·V068·V069 관례): ORM(db.models.SiteOpinion)이 새 칸 3개를
--   읽으므로, 이 파일 없이 새 코드가 뜨면 의견 보내기·관리자 의견함이 전부 500 이 된다.
--   SQLite CI 는 create_all() 이 칸·색인을 만들어 이 누락을 못 잡는다. 순서: ① 본 파일 운영 적용 → ② 코드 머지·재시작.

BEGIN;

-- ① kind CHECK 교체 — kind 칸 하나만 보는 CHECK 를 전부 찾아 지운다(이름을 하드코딩하지 않는다).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT co.conname
      FROM pg_catalog.pg_constraint co
      JOIN pg_catalog.pg_attribute a
        ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
     WHERE co.conrelid = 'public.site_opinions'::pg_catalog.regclass
       AND co.contype = 'c'
       AND pg_catalog.array_length(co.conkey, 1) = 1
       AND a.attname = 'kind'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.site_opinions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.site_opinions
  ADD CONSTRAINT site_opinions_kind_check
  CHECK (kind IN ('bug', 'data', 'suggest', 'other', 'error'));

-- ② 칸 3개
ALTER TABLE public.site_opinions ADD COLUMN IF NOT EXISTS fingerprint  text;
ALTER TABLE public.site_opinions ADD COLUMN IF NOT EXISTS repeat_count integer NOT NULL DEFAULT 1;
ALTER TABLE public.site_opinions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.site_opinions.kind IS
  'bug=버그·오류 / data=정보가 틀려요 / suggest=건의·제안 / other=기타 / error=손님 화면 오류 자동 기록(V070)';
COMMENT ON COLUMN public.site_opinions.fingerprint IS
  '오류 지문(kind=error 만) — sha256(화면 첫 경로 조각 + 오류 이름 + 오류 첫 줄) 앞 32자. 같은 지문은 한 행';
COMMENT ON COLUMN public.site_opinions.repeat_count IS '같은 오류가 들어온 횟수(오류 행만 의미, 손님 의견은 늘 1)';
COMMENT ON COLUMN public.site_opinions.last_seen_at IS '같은 오류가 마지막으로 들어온 시각(오류 행만)';

-- ③ 부분 유일 색인 — ON CONFLICT (fingerprint) WHERE kind = 'error' 의 대상
CREATE UNIQUE INDEX IF NOT EXISTS site_opinions_error_fingerprint_uidx
  ON public.site_opinions (fingerprint) WHERE kind = 'error';

-- 자체검사 — 하나라도 어긋나면 전부 취소('public' = PUBLIC 의사 역할)
DO $$
DECLARE
  t    text := 'public.site_opinions';
  defs text;
  n    int;
  r    text;
BEGIN
  -- ① kind CHECK 는 정확히 하나, 'error' 를 포함
  SELECT pg_catalog.count(*), pg_catalog.string_agg(pg_catalog.pg_get_constraintdef(co.oid), ' | ')
    INTO n, defs
    FROM pg_catalog.pg_constraint co
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
   WHERE co.conrelid = t::pg_catalog.regclass
     AND co.contype = 'c'
     AND pg_catalog.array_length(co.conkey, 1) = 1
     AND a.attname = 'kind';
  IF n <> 1 THEN
    RAISE EXCEPTION 'V070 self-check: expected 1 kind CHECK, found % (%)', n, defs;
  END IF;
  IF pg_catalog.strpos(defs, '''error''') = 0 OR pg_catalog.strpos(defs, '''suggest''') = 0 THEN
    RAISE EXCEPTION 'V070 self-check: kind CHECK lacks error or old kinds: %', defs;
  END IF;
  -- ② 칸 3개의 타입·NOT NULL·기본값
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'site_opinions'
                    AND column_name = 'fingerprint' AND data_type = 'text') THEN
    RAISE EXCEPTION 'V070 self-check: fingerprint column missing or wrong type';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'site_opinions'
                    AND column_name = 'repeat_count' AND data_type = 'integer'
                    AND is_nullable = 'NO' AND column_default = '1') THEN
    RAISE EXCEPTION 'V070 self-check: repeat_count column missing or wrong type/default';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'site_opinions'
                    AND column_name = 'last_seen_at' AND data_type = 'timestamp with time zone') THEN
    RAISE EXCEPTION 'V070 self-check: last_seen_at column missing or wrong type';
  END IF;
  -- ③ 부분 유일 색인
  IF NOT EXISTS (
    SELECT 1
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class ic ON ic.oid = i.indexrelid
     WHERE i.indrelid = t::pg_catalog.regclass
       AND ic.relname = 'site_opinions_error_fingerprint_uidx'
       AND i.indisunique
       AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'V070 self-check: partial unique index on fingerprint missing';
  END IF;
  -- ④ 권한·RLS 는 V069 그대로 — 새 칸도 3역할 SELECT 0 · RLS 켬 · 정책 0
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    IF pg_catalog.has_any_column_privilege(r, t, 'SELECT')
       OR pg_catalog.has_table_privilege(r, t, 'INSERT')
       OR pg_catalog.has_table_privilege(r, t, 'UPDATE') THEN
      RAISE EXCEPTION 'V070 self-check: % has privilege on %', r, t;
    END IF;
  END LOOP;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'V070 self-check: RLS off on %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy po WHERE po.polrelid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'V070 self-check: policy exists on %', t;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- 순서: 코드 되돌림·재시작 확인 → 아래. 새 코드가 떠 있는 채 칸을 지우면 의견함이 500 이 된다.
-- 오류 행(kind='error')이 남아 있으면 CHECK 를 되돌릴 수 없으니 먼저 지운다(손님 의견은 그대로).
-- BEGIN;
-- DELETE FROM public.site_opinions WHERE kind = 'error';
-- DROP INDEX IF EXISTS public.site_opinions_error_fingerprint_uidx;
-- ALTER TABLE public.site_opinions DROP COLUMN IF EXISTS last_seen_at;
-- ALTER TABLE public.site_opinions DROP COLUMN IF EXISTS repeat_count;
-- ALTER TABLE public.site_opinions DROP COLUMN IF EXISTS fingerprint;
-- ALTER TABLE public.site_opinions DROP CONSTRAINT site_opinions_kind_check;
-- ALTER TABLE public.site_opinions ADD CONSTRAINT site_opinions_kind_check
--   CHECK (kind IN ('bug', 'data', 'suggest', 'other'));
-- COMMIT;
