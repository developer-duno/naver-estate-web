-- V040: presale_schedule_official·applyhome_unit_supply 에 house_type 컬럼 추가
-- 오피스텔/도시형/생활숙박(getUrbtyOfctlLttotPblancDetail/Mdl)을 기존 아파트 청약
-- 테이블에 흡수. 필드 구성이 기존 아파트 API와 거의 동일(공고·일정·평형별 공급)이라
-- 새 테이블을 파지 않는다 (설계 §4-1, 이슈 #323).
ALTER TABLE presale_schedule_official
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN presale_schedule_official.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancDetail)';

ALTER TABLE applyhome_unit_supply
  ADD COLUMN IF NOT EXISTS house_type TEXT NOT NULL DEFAULT 'apt';
COMMENT ON COLUMN applyhome_unit_supply.house_type IS
  '분양 유형: apt(아파트) | officetel(오피스텔/도시형/생활숙박, getUrbtyOfctlLttotPblancMdl)';

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE presale_schedule_official DROP COLUMN IF EXISTS house_type;
-- ALTER TABLE applyhome_unit_supply DROP COLUMN IF EXISTS house_type;
