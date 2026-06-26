-- V035: 결제(유료 구독) 컬럼·테이블 추가 — 공인중개사 B2B 구독 결제 시스템
-- 목적: 무료 공인중개사 검증(approved_until=NULL, 무기한)과 독립된 "유료 이용권 기간"을
--       저장한다. 게이트(get_approved_user)는 approved_until OR paid_until 중 하나라도
--       유효하면 통과 → 결제가 무료 무기한 승인을 격하시키지 않는다(독립 컬럼).
-- paid_until 이 별도 컬럼인 이유: 무료 검증(무기한)과 유료 기간이 같은 컬럼을 쓰면
--       결제 시 무료 무기한 승인이 30일짜리로 격하되는 부작용. 의미가 다른 두 권한이라 분리.
-- payments 테이블이 audit_logs JSON 이 아니라 정식 테이블인 이유: 결제는 멱등성 조회
--       (payment_id 로 중복 결제 차단)·금액 대조·환불 추적이 핵심이라 구조화 컬럼·PK·인덱스 필요
--       (V033 phone·V034 broker 결정 답습 — B2B 핵심 자산은 컬럼이라야 쿼리 가능).
-- ⚠ 코드보다 prod 선행 실행 필수 — paid_until·Payment 가 ORM 매핑되므로 INSERT/SELECT 목록에
--    포함된다. 컬럼/테이블 부재 시 get_current_user·결제 엔드포인트 500. IF NOT EXISTS 라 멱등·안전.

-- 1) user_profiles 에 유료 이용권 만료일 (NULL = 유료 이력 없음)
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ;

-- 2) 결제 내역 테이블
CREATE TABLE IF NOT EXISTS payments (
    payment_id   TEXT PRIMARY KEY,                          -- 우리가 생성 (pay{uuid}, 영숫자만), PortOne paymentId 와 동일
    user_id      TEXT NOT NULL,                             -- UserProfile.user_id (Supabase auth uid)
    plan         TEXT NOT NULL,                             -- PLAN_PRICES 키 (예: basic_30d)
    amount       INTEGER NOT NULL,                          -- 원 단위 결제 금액 (서버가 결정한 값)
    status       TEXT NOT NULL DEFAULT 'ready',             -- ready | paid | failed | refunded
    paid_at      TIMESTAMPTZ,                               -- 결제 확정 시각 (PAID 검증 통과 시각)
    raw          JSONB,                                     -- PortOne GET /payments/{id} 응답 원본 (감사·환불 추적)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용자별 결제 이력 조회 인덱스 (마이페이지·관리자 결제 목록)
CREATE INDEX IF NOT EXISTS ix_payments_user_id ON payments (user_id);

-- 롤백:
-- DROP INDEX IF EXISTS ix_payments_user_id;
-- DROP TABLE IF EXISTS payments;
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS paid_until;
