-- V042: 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).
CREATE TABLE IF NOT EXISTS rental_unit_supply (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL REFERENCES rental_schedule_official(house_manage_no) ON DELETE CASCADE,
  model_no TEXT NOT NULL,
  house_ty TEXT,
  supply_area FLOAT,
  exclusive_area FLOAT,
  contract_area FLOAT,
  general_supply INTEGER,
  youth_supply INTEGER,
  newlywed_supply INTEGER,
  elderly_supply INTEGER,
  monthly_rent INTEGER,
  deposit INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no, model_no)
);
COMMENT ON TABLE rental_unit_supply IS
  '청약홈 공공지원 민간임대 평형별 공급정보 (getPblPvtRentLttotPblancMdl).';
ALTER TABLE rental_unit_supply ENABLE ROW LEVEL SECURITY;
-- 의도적 공개: 청약홈 공고 일정은 정부(한국부동산원)가 원래 공개하는 공식 정보라
-- anon read 제한 불필요 (V029/V031이 차단한 매물·시세 등 B2B 가치 데이터와 다름, 사장님 확인 2026-08-08).
CREATE POLICY "Public read" ON rental_unit_supply FOR SELECT USING (true);
CREATE POLICY "Service write" ON rental_unit_supply FOR ALL USING (auth.role() = 'service_role');
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS rental_unit_supply;
