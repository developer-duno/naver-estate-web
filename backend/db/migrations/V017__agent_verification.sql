-- V017: 공인중개사 검증 테이블
-- 목적: 중개사 자격증/사업자등록 검증 데이터 저장 + 관리자 심사

CREATE TABLE IF NOT EXISTS agent_verifications (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES user_profiles(user_id),
    license_number TEXT,                          -- 공인중개사 자격증번호
    business_number TEXT,                         -- 사업자등록번호 (10자리)
    office_name TEXT,                             -- 중개사무소명
    representative_name TEXT NOT NULL,            -- 대표자명
    business_verified BOOLEAN NOT NULL DEFAULT FALSE,   -- 국세청 API 검증 결과
    license_verified BOOLEAN NOT NULL DEFAULT FALSE,    -- 자격증 API 검증 결과 (2차)
    verification_status TEXT NOT NULL DEFAULT 'pending', -- pending/approved/rejected
    rejection_reason TEXT,                        -- 거부 사유
    reviewed_by TEXT,                             -- 심사한 관리자 user_id
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_verifications_status ON agent_verifications(verification_status);
CREATE INDEX idx_agent_verifications_user ON agent_verifications(user_id);

-- 롤백: DROP TABLE IF EXISTS agent_verifications;
