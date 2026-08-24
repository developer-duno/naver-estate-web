-- V049: rental_schedule_official.region_name 컬럼 추가 (민간임대 지역 필터 결함 근본수정, 세션 384)
--
-- 세션383이 발견한 알려진 결함 — region_code 는 청약홈 응답의 SUBSCRPT_AREA_CODE
-- (숫자코드, "100" 등)를 그대로 저장하는데, get_rental_schedules() 의 region 필터는
-- 한글 시도명("서울" 등)과 비교해 항상 빈 결과만 반환했다. 짝꿍 함수 get_officetel_
-- schedules() (officetel_presale_schedule.region_name, V045 선례)는 청약홈이 함께
-- 주는 SUBSCRPT_AREA_CODE_NM(한글 지역명) 필드를 이미 쓰고 있었으므로, 같은 패턴을
-- rental_schedule_official 에도 적용한다 — 별도 매핑 테이블 불필요.
--
-- 기존 region_code 컬럼은 유지(컬럼 삭제 금지 원칙, web-rules.md 준용) — 다만 필터는
-- 이제 region_name 기준으로 전환한다. 기존 저장분은 region_name 이 NULL 이라 다음
-- 정기 수집(월요일) 또는 수동 재수집 전까지는 여전히 region 필터에서 빠진다.
ALTER TABLE rental_schedule_official ADD COLUMN IF NOT EXISTS region_name TEXT;
CREATE INDEX IF NOT EXISTS idx_rental_schedule_region_name ON rental_schedule_official(region_name);
COMMENT ON COLUMN rental_schedule_official.region_name IS
  'SUBSCRPT_AREA_CODE_NM(청약 지역명, 예: "서울") — get_rental_schedules() 지역 필터 기준 컬럼 (세션 384, region_code 숫자코드 결함 근본수정).';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS idx_rental_schedule_region_name;
-- ALTER TABLE rental_schedule_official DROP COLUMN IF EXISTS region_name;
