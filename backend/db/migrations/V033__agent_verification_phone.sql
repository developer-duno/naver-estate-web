-- V033: agent_verifications 연락처(phone) 컬럼 추가
-- 공인중개사 검증 신청 폼에서 받는 연락처를 저장. 이름(representative_name)·중개사무소명(office_name)이
-- 이미 정식 컬럼이므로 같은 성격(연락 가능한 중개사 정보)인 연락처도 정식 컬럼으로 일관 저장.
-- B2B 구독 모델에서 연락처는 핵심 자산 — admin/users.py 가 노출, 관리자 화면에서 연락 가능.
-- 선택 입력이라 NULL 허용 (기존 행은 NULL). V018 license_doc_path TEXT 패턴 답습.

ALTER TABLE agent_verifications ADD COLUMN IF NOT EXISTS phone TEXT;

-- 역방향 (롤백):
-- ALTER TABLE agent_verifications DROP COLUMN IF EXISTS phone;
