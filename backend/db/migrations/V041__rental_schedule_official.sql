-- V041: 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail).
-- apartments 테이블과 독립 — 임대주택은 우리 아파트/오피스텔 로스터에 없는
-- 별도 매물이라 apartment_id 매칭 대상이 없다 (설계 §4-2, 이슈 #323).
CREATE TABLE IF NOT EXISTS rental_schedule_official (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL,
  pblanc_no TEXT,
  house_nm TEXT NOT NULL,
  address TEXT,
  recruit_date DATE,
  receipt_bgnde DATE,
  receipt_endde DATE,
  winner_announce_date DATE,
  contract_bgnde DATE,
  contract_endde DATE,
  move_in_ym TEXT,
  tot_supply INTEGER,
  pblanc_url TEXT,
  biz_entity TEXT,
  constructor TEXT,
  region_code TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no)
);
CREATE INDEX IF NOT EXISTS idx_rental_schedule_region ON rental_schedule_official(region_code);
COMMENT ON TABLE rental_schedule_official IS
  '청약홈 공공지원 민간임대 공고 일정 (getPblPvtRentLttotPblancDetail). apartments 테이블과 독립.';
ALTER TABLE rental_schedule_official ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON rental_schedule_official FOR SELECT USING (true);
CREATE POLICY "Service write" ON rental_schedule_official FOR ALL USING (auth.role() = 'service_role');
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS rental_schedule_official;
