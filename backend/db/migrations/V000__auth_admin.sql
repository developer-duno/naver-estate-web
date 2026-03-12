-- Phase 0: 인증 강화 + 관리자 페이지 테이블
-- 사용자 프로필 (Supabase Auth 보완)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    status TEXT NOT NULL DEFAULT 'approved',
    daily_crawl_quota INTEGER DEFAULT 5,
    daily_export_quota INTEGER DEFAULT 10,
    last_login_at TIMESTAMPTZ,
    login_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 감사 로그
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_al_user ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_al_action ON audit_logs(action, created_at);

-- API 요청 제한 카운터
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key TEXT PRIMARY KEY,
    count INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rl_expires ON rate_limit_counters(expires_at);

-- 관리자 설정 (키-값)
CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
