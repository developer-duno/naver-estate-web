-- V043: presale_schedule_official 에 house_nm 컬럼 추가.
-- 오피스텔 수집기(house_manage_no 기준 전량 upsert 근본수정, 이슈 #323)가
-- apartments 로스터 매칭을 포기하면서 화면 "이름" 열이 apartment_id(자체 발급
-- placeholder)를 그대로 노출하게 됐다. 청약홈 API 응답의 HOUSE_NM(실제 단지명)을
-- 저장할 컬럼이 없었던 것 — 본 마이그로 보강. 기존 아파트 청약 행은 이 컬럼이
-- 없어도(NULL) 무방해 nullable 유지.
ALTER TABLE presale_schedule_official
  ADD COLUMN IF NOT EXISTS house_nm TEXT;
COMMENT ON COLUMN presale_schedule_official.house_nm IS
  '청약홈 API 단지명(HOUSE_NM). 오피스텔 행에서 사용, 아파트 행은 NULL(기존 Apartment 조인으로 이름 표시).';

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE presale_schedule_official DROP COLUMN IF EXISTS house_nm;
