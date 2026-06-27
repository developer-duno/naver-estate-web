-- V036: 빌링키 자동결제(정기결제) 테이블 — 공인중개사 B2B 구독 자동결제 (방식 B: 우리 cron)
-- 목적: 카드를 한 번 등록(빌링키 발급)하면, 이용권 만료 시점에 APScheduler 잡이 자동으로
--       PortOne 빌링키 결제(POST /payments/{id}/billing-key)를 호출해 구독이 끊김 없이 이어진다.
--       해지 시 status='deleted' 로 두면 cron 이 더는 집지 않는다.
-- 방식 B(우리 cron) 선택 이유: 결제 실행을 우리가 통제 → 로그·DB 로 디버깅·재시도 정책 자유.
--       (방식 A=PortOne 예약결제 위임은 webhook 유실 추적난으로 미채택, 세션 327 사장님 확정.)
-- 보안: 카드번호는 저장하지 않는다. PortOne 빌링키 문자열만 보관(결제 위임 토큰). 금액은
--       서버(PLAN_PRICES)가 결정하고 결제 후 get_payment 로 재검증한다(payment.py 패턴 답습).
-- payments 테이블(V035)과의 관계: 자동결제 1건이 일어날 때마다 payments 행이 별도 기록된다
--       (멱등·금액대조·환불추적은 기존 payments 인프라 재활용). billing_keys 는 "카드 등록 상태".
-- ⚠ 코드보다 prod 선행 실행 필수 — BillingKey 가 ORM 매핑되므로 빌링키 엔드포인트(PR2+)가
--    INSERT/SELECT 시 컬럼/테이블 부재면 500. IF NOT EXISTS 라 멱등·안전 (V033~V035 답습).

-- 1) 빌링키 등록 테이블
CREATE TABLE IF NOT EXISTS billing_keys (
    id              BIGSERIAL PRIMARY KEY,
    user_id         TEXT NOT NULL,                      -- UserProfile.user_id (Supabase auth uid)
    billing_key     TEXT NOT NULL,                      -- PortOne 빌링키 (카드번호 아님, 결제 위임 토큰)
    plan            TEXT NOT NULL,                      -- PLAN_PRICES 키 (자동결제할 플랜: pro_30d 등)
    card_name       TEXT,                               -- 카드사명 (화면 표시용, PortOne 응답)
    card_last4      TEXT,                               -- 카드 마지막 4자리 (화면 표시용)
    customer_name   TEXT,                               -- 결제자 이름 (KPN 빌링키 결제 필수 — customer.fullName)
    customer_phone  TEXT,                               -- 결제자 연락처 (KPN 빌링키 결제 필수 — customer.phoneNumber)
    status          TEXT NOT NULL DEFAULT 'active',     -- active | deleted(해지) | failed(결제 연속실패)
    next_charge_at  TIMESTAMPTZ,                        -- 다음 자동결제 예정 시각 (cron 이 이 시각 도래분을 집음)
    retry_count     INTEGER NOT NULL DEFAULT 0,         -- 자동결제 실패 누적 재시도 횟수
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 사용자별 빌링키 조회 인덱스 (마이페이지 카드 등록 상태·관리자)
CREATE INDEX IF NOT EXISTS ix_billing_keys_user_id ON billing_keys (user_id);

-- cron 이 "결제할 때가 된 active 빌링키"만 빠르게 찾는 부분 인덱스 (deleted/failed 제외, prod 전용 최적화).
-- SQLite(CI)는 부분 인덱스를 ORM __table_args__ 에 두지 않고 본 SQL 에만 둔다 (dialect 분기 답습).
CREATE INDEX IF NOT EXISTS ix_billing_keys_due ON billing_keys (next_charge_at) WHERE status = 'active';

-- 롤백:
-- DROP INDEX IF EXISTS ix_billing_keys_due;
-- DROP INDEX IF EXISTS ix_billing_keys_user_id;
-- DROP TABLE IF EXISTS billing_keys;
