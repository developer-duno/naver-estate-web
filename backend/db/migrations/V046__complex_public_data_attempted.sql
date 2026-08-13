-- V046: complexes 에 public_data_attempted_at 컬럼 추가.
-- 국토부 실거래가 백필(backfill_price_history)이 "이미 시도했지만 매칭 0건"인
-- 단지와 "아직 시도 안 함"인 단지를 구분할 방법이 없었다 — _count_eligible_remaining()
-- 의 선정 기준이 "이력 6개월 미만"뿐이라, 국토부에 원천적으로 실거래가 없는 단지
-- (실측 92%)를 영원히 재시도 대상으로 남긴다(세션 360 실측: 배치 300개를 반복해도
-- remaining 이 그대로였던 원인). 이 컬럼에 마지막 시도 시각을 기록해 최근 시도한
-- 단지를 재시도 대상에서 일정 기간(예: 90일) 제외하는 근거로 쓴다.
ALTER TABLE complexes
  ADD COLUMN IF NOT EXISTS public_data_attempted_at TIMESTAMPTZ;
COMMENT ON COLUMN complexes.public_data_attempted_at IS
  '국토부 실거래가 백필(backfill_price_history) 마지막 시도 시각. 매칭 결과(성공/0건)
   와 무관하게 시도했다는 사실만 기록 — 무한 재시도 방지용.';

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE complexes DROP COLUMN IF EXISTS public_data_attempted_at;
