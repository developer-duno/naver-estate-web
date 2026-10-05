-- V069: 손님 "의견 보내기" 저장 표 site_opinions (세션 433, 사장님 승인 2026-10-06)
--
-- 무엇: 모든 화면 오른쪽 아래 "의견 보내기" 버튼으로 손님(로그인·비로그인 모두)이 보낸
--   버그 제보·정보 오류 신고·건의를 담는다. 쓰기는 POST /api/opinions, 읽기·답장·공개·삭제는
--   관리자 API(/api/admin/opinions), 공개 목록("고쳤습니다")은 GET /api/opinions/public 이
--   is_public 행의 제목·답만 내보낸다 — 전부 backend(postgres 역할, DATABASE_URL) 경유.
--
-- 이름: 같은 공유 DB 에 미분양의 public.site_feedback 이 이미 있다 → 2u 표는 site_opinions.
--
-- 보안: 이 DB 의 anon key 는 프런트 번들에 공개돼 있다. 그래서 RLS 를 켜고 정책을 0개로 두며
--   PUBLIC·anon·authenticated 3역할의 표·시퀀스 권한을 전부 회수한다 — 공개 열쇠로는 한 줄도
--   못 읽고 못 쓴다. backend 는 postgres 역할(표 소유자)이라 REVOKE 에 안 걸린다(V065 선례).
--   service_role 은 건드리지 않는다(2u 는 service_role 로 이 표를 쓰지 않는다).
--
-- 보존: 보낸 날부터 1년 — 매일 03:50 정리 잡(crawler/vacuum_maintenance.py _purge_old_opinions)이
--   비공개 행은 삭제, 공개 행은 원문·이메일·접속 환경을 NULL 로 지우고 공개 제목·답만 남긴다.
--   그래서 message 는 NULL 을 허용한다(값이 있을 땐 1~1000자).
--
-- 적용: SQL Editor 에서 아래 BEGIN~COMMIT 을 통째로 실행. 끝의 자체검사가 하나라도 어긋나면
--   RAISE EXCEPTION → 전부 취소된다. 적용 직전 스키마 덤프 1회(infra.md §DB 백업 — 추가만).
--
-- 적용 뒤 의무: mibunyang 권한 지문 기준선 재승인 요청(infra.md §권한·정책·뷰·함수를 바꾸는 마이그)
--   — 기대 차이 = 새 표 public.site_opinions 1 · 시퀀스 site_opinions_id_seq 1 · RLS 켬·정책 0 ·
--   PUBLIC·anon·authenticated REVOKE ALL(표+시퀀스).
--
-- ⚠ 코드보다 운영 선행 적용 필수(V034·V058·V068 관례): ORM(db.models.SiteOpinion)이 이 표를
--   쓰는 라우터가 표 없이 뜨면 의견 보내기·관리자 의견함이 500 이 된다. SQLite CI 는
--   create_all() 이 표를 만들어 이 누락을 못 잡는다. 순서: ① 본 파일 운영 적용 → ② 코드 머지·재시작.

BEGIN;

CREATE TABLE IF NOT EXISTS public.site_opinions (
  id               bigserial    PRIMARY KEY,
  kind             text         NOT NULL CHECK (kind IN ('bug', 'data', 'suggest', 'other')),
  message          text         CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 1000),
  page_path        text,
  interests        jsonb,
  user_id          text,
  user_email       text,
  user_agent       text,
  status           text         NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new', 'replied', 'fixed', 'closed')),
  reply            text,
  replied_at       timestamptz,
  reply_mail_sent  boolean      NOT NULL DEFAULT false,
  is_public        boolean      NOT NULL DEFAULT false,
  public_title     text,
  public_answer    text,
  published_at     timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.site_opinions IS
  '2u 손님 의견 보내기(세션 433) — backend(postgres) 전용, RLS 켬·정책 0, PUBLIC·anon·authenticated 권한 0, 1년 보존(공개 행은 개인정보만 지움)';
COMMENT ON COLUMN public.site_opinions.kind IS 'bug=버그·오류 / data=정보가 틀려요 / suggest=건의·제안 / other=기타';
COMMENT ON COLUMN public.site_opinions.message IS '손님 원문 1~1000자. 1년 지난 공개 행은 NULL 로 지운다';
COMMENT ON COLUMN public.site_opinions.page_path IS '보던 화면 경로 — 서버가 검증(/ 로 시작·쿼리 제거·200자 이하), 아니면 NULL';
COMMENT ON COLUMN public.site_opinions.interests IS '받고 싶은 소식 설문(market·presale·tax·other) — 준비 참고용, 소식 발송에 쓰지 않음';
COMMENT ON COLUMN public.site_opinions.user_email IS '로그인한 경우만 토큰에서 서버가 읽은 가입 이메일 — 답장 메일 주소';
COMMENT ON COLUMN public.site_opinions.user_agent IS '요청 헤더 User-Agent 300자(클라이언트가 보낸 본문 값은 안 믿음)';
COMMENT ON COLUMN public.site_opinions.reply_mail_sent IS '답장 메일 발송 성공 여부 — 답을 고쳐도 자동 재발송은 없고 관리자가 다시 보내기로 보낸다';

CREATE INDEX IF NOT EXISTS site_opinions_created_at_idx
  ON public.site_opinions (created_at DESC);
CREATE INDEX IF NOT EXISTS site_opinions_status_created_at_idx
  ON public.site_opinions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS site_opinions_public_published_idx
  ON public.site_opinions (published_at DESC) WHERE is_public;

-- RLS 켬 + 정책 0 → anon/authenticated 는 0행.
ALTER TABLE public.site_opinions ENABLE ROW LEVEL SECURITY;

-- Supabase 는 public 새 표에 기본 권한을 준다 → PUBLIC·anon·authenticated 3역할 전부 회수.
REVOKE ALL ON public.site_opinions FROM PUBLIC, anon, authenticated;

-- bigserial 시퀀스도 같은 3역할에서 회수(이름을 하드코딩하지 않고 표에서 찾는다).
DO $$
BEGIN
  EXECUTE pg_catalog.format(
    'REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated',
    pg_catalog.pg_get_serial_sequence('public.site_opinions', 'id')
  );
END $$;

-- 자체검사 — 하나라도 어긋나면 전부 취소('public' = PUBLIC 의사 역할)
DO $$
DECLARE
  t   text := 'public.site_opinions';
  seq text;
  r   text;
  pv  text;
BEGIN
  -- ① 3역할은 표 권한·칸 SELECT 권한 0
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH pv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF pg_catalog.has_table_privilege(r, t, pv) THEN
        RAISE EXCEPTION 'site_opinions self-check: % has % on %', r, pv, t;
      END IF;
    END LOOP;
    IF pg_catalog.has_any_column_privilege(r, t, 'SELECT') THEN
      RAISE EXCEPTION 'site_opinions self-check: % has column SELECT on %', r, t;
    END IF;
  END LOOP;
  -- ② RLS 켬 + 정책 0
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'site_opinions self-check: RLS off on %', t;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policy po WHERE po.polrelid = t::pg_catalog.regclass) THEN
    RAISE EXCEPTION 'site_opinions self-check: policy exists on %', t;
  END IF;
  -- ③ 시퀀스: 3역할 권한 0
  seq := pg_catalog.pg_get_serial_sequence('public.site_opinions', 'id');
  IF seq IS NULL THEN
    RAISE EXCEPTION 'site_opinions self-check: serial sequence not found';
  END IF;
  FOREACH r IN ARRAY ARRAY['public', 'anon', 'authenticated'] LOOP
    FOREACH pv IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
      IF pg_catalog.has_sequence_privilege(r, seq, pv) THEN
        RAISE EXCEPTION 'site_opinions self-check: % has % on sequence %', r, pv, seq;
      END IF;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 역방향 (롤백):
-- 순서: 코드 되돌림·재시작 확인 → DROP. 새 코드가 떠 있는 채 표를 지우면 의견 보내기가 500 이 된다.
-- 표를 지우면 손님 의견도 함께 사라진다 — 필요하면 먼저 덤프.
-- DROP TABLE IF EXISTS public.site_opinions;
-- (그 뒤 mibunyang 권한 지문 기준선 재승인 — 표·시퀀스 1개씩 사라짐)
