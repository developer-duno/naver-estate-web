-- V034: agent_verifications 에 V-WORLD 중개사 대조 결과 컬럼 3개 추가
-- 목적: 국세청 진위확인만으로는 식당·카페 사업자도 자동승인되는 구멍을 막기 위해,
--       가입 시 V-WORLD 부동산중개업사무소정보 API(getEBOfficeInfo)로 "진짜 중개사무소"인지
--       실시간 대조한 결과를 저장한다. 관리자 심사·정기 재검증·미매칭 필터에 활용.
-- audit JSON 이 아니라 정식 컬럼인 이유: B2B 핵심 자산이라 관리자 목록 조회·필터·정렬·
--       재검증 대상 = 컬럼이라야 인덱스·쿼리 가능 (V033 phone 결정 답습).
-- ⚠ 코드보다 prod 선행 실행 필수 — ORM 매핑 컬럼은 INSERT/SELECT 목록에 포함되므로
--    컬럼 부재 시 submit/status/admin 전부 500. ADD COLUMN IF NOT EXISTS 라 멱등·안전.

ALTER TABLE agent_verifications ADD COLUMN IF NOT EXISTS broker_verified BOOLEAN NOT NULL DEFAULT FALSE;  -- V-WORLD 중개사무소 매칭 + 영업중 여부
ALTER TABLE agent_verifications ADD COLUMN IF NOT EXISTS broker_jurirno TEXT;   -- 매칭된 국토부 등록번호 (jurirno)
ALTER TABLE agent_verifications ADD COLUMN IF NOT EXISTS broker_status TEXT;    -- 매칭된 영업상태명 (영업중/휴업/폐업 등) 또는 미매칭 사유

-- 롤백:
-- ALTER TABLE agent_verifications DROP COLUMN IF EXISTS broker_verified;
-- ALTER TABLE agent_verifications DROP COLUMN IF EXISTS broker_jurirno;
-- ALTER TABLE agent_verifications DROP COLUMN IF EXISTS broker_status;
