-- V028: user_profiles 마케팅 수신 동의 컬럼 추가
-- 회원가입 시 (선택) 마케팅 동의를 Supabase user_metadata → deps.py 프로필 자동생성 경로로 저장.
-- B2B 구독 모델에서 동의자 목록은 자산 — admin/users.py 가 노출, DB 쿼리로 분석 가능.
-- 기존 행은 DEFAULT FALSE 로 채워짐 (PostgreSQL 안전). V025 trade_complete BOOLEAN 패턴 답습.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS agree_marketing BOOLEAN NOT NULL DEFAULT FALSE;

-- 역방향 (롤백):
-- ALTER TABLE user_profiles DROP COLUMN IF EXISTS agree_marketing;
