-- V032: complex_price_history UNIQUE 제약명·정의를 prod 진실에 정합 (세션 280)
--
-- 배경 (FLOW_INTEGRITY_AUDIT_s278 medium (e) 제약명 drift):
--   코드(crawler/service_common.py:_upsert_price_history)는 ON CONFLICT 에
--   constraint="complex_price_history_upsert_key" 를 쓴다. 그러나 V001 은
--   "uq_cph_composite" 라는 다른 이름 + COALESCE(area_no,'') 표현식으로 정의했다.
--
--   prod 실측(세션 280, Supabase SQL Editor):
--     - 제약명 = complex_price_history_upsert_key (contype='u', named UNIQUE constraint)
--     - 정의   = UNIQUE(complex_no, trade_type, area_no, base_month)  -- COALESCE 없는 단순 4컬럼
--     -> 코드는 prod 와 일치(정상 동작 중). V001 만 이름·정의가 어긋남(재현성 위험).
--
--   코드는 area_no 를 항상 '' 로 채운다(area_key = area_no or "")므로, area_no 가 NULL 이
--   아니라 ''(빈문자열)이 되어 COALESCE 없이도 UNIQUE 가 올바로 작동한다.
--
-- 목적: 빈 DB 에서 V001 -> ... -> V032 순서로 적용하면, 코드가 찾는 이름·정의의
--       제약이 반드시 존재하도록 정합한다. prod 에는 이미 올바른 제약이 있어 no-op.
--
-- 자동 러너 없음 -- Supabase SQL Editor 수동 실행 (backend/CLAUDE.md DB 마이그레이션).
--    트랜잭션으로 감싸 ROLLBACK 시뮬 후 COMMIT 권장.

BEGIN;

-- 1) V001 이 만든 옛 이름 제약(uq_cph_composite, COALESCE 정의)이 있으면 제거.
--    prod 에는 없으므로 IF EXISTS 로 no-op.
ALTER TABLE complex_price_history DROP CONSTRAINT IF EXISTS uq_cph_composite;

-- 2) 코드가 쓰는 이름 제약(complex_price_history_upsert_key)이 없으면 생성.
--    prod 에는 이미 있으므로 IF NOT EXISTS 가드로 no-op.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'complex_price_history'::regclass
          AND conname = 'complex_price_history_upsert_key'
    ) THEN
        ALTER TABLE complex_price_history
            ADD CONSTRAINT complex_price_history_upsert_key
            UNIQUE (complex_no, trade_type, area_no, base_month);
    END IF;
END $$;

COMMIT;

-- 롤백(역방향): 새 환경에서 V032 를 되돌리려면 --
--   ALTER TABLE complex_price_history DROP CONSTRAINT IF EXISTS complex_price_history_upsert_key;
--   ALTER TABLE complex_price_history
--     ADD CONSTRAINT uq_cph_composite
--     UNIQUE (complex_no, trade_type, COALESCE(area_no, ''), base_month);
-- (단 COALESCE 표현식 UNIQUE 는 expression index 형태라 코드의 constraint= 와 불일치 ->
--  롤백은 코드 동작을 깨므로 권장하지 않음. 정합 방향은 V032 정방향이 진실.)
