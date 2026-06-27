-- V037: 빌링키 기본 카드 표시 — 카드 여러 장 보관, 자동결제는 기본 1장 (정기결제 PR2, 세션 329)
-- 목적: 사용자가 카드를 여러 장 등록·보관(모두 status='active')하되, 자동결제(cron, PR3)는
--       is_default=True 인 카드 1장으로만 실행한다. 새 카드 등록 시 기존 기본 카드를
--       is_default=False 로 내리고 신규를 기본으로 승격(billing.py register 엔드포인트).
-- 왜: 카드 여러 장이면 cron 이 "어느 카드로 결제할지" 모호 → 한 user 당 기본 1장으로 명확화.
--     사장님 확정(세션 329): "카드 여러 장 보관" + 자동결제는 기본 카드.
-- ⚠ 코드보다 prod 선행 실행 필수 — is_default 가 ORM 매핑되므로 빌링키 엔드포인트가
--    INSERT/SELECT 시 컬럼 부재면 500. IF NOT EXISTS 라 멱등·안전 (V036 답습).

-- 1) 기본 카드 표시 컬럼 (기존 행은 모두 기본으로 — 단일 카드 가정 안전)
ALTER TABLE billing_keys ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) 한 user 당 active 기본 카드는 1장만 강제 (부분 유니크 인덱스, prod 전용).
--    동시 등록 경합 시에도 DB 레벨에서 기본 카드 중복을 차단하는 안전망.
--    SQLite(CI)는 본 부분 유니크를 ORM __table_args__ 에 두지 않고 SQL 에만 둔다(dialect 분기).
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_keys_default
    ON billing_keys (user_id) WHERE is_default AND status = 'active';

-- 롤백:
-- DROP INDEX IF EXISTS uq_billing_keys_default;
-- ALTER TABLE billing_keys DROP COLUMN IF EXISTS is_default;
