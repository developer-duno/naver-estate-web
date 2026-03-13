-- V003: 단지 상세 크롤링 누락 필드 보완
-- Complex: 상세주소, 도로명, 난방연료, 세대당주차, 관리사무소 전화
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS address VARCHAR(500);
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS road_address VARCHAR(500);
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS heat_fuel_type VARCHAR(50);
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS parking_count_by_household FLOAT;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS management_office_tel VARCHAR(30);

-- ComplexPyeongDetail: 평면도, 평수, 최신관리비
ALTER TABLE complex_pyeong_details ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;
ALTER TABLE complex_pyeong_details ADD COLUMN IF NOT EXISTS supply_pyeong VARCHAR(20);
ALTER TABLE complex_pyeong_details ADD COLUMN IF NOT EXISTS exclusive_pyeong VARCHAR(20);
ALTER TABLE complex_pyeong_details ADD COLUMN IF NOT EXISTS latest_maintenance_cost INTEGER;
ALTER TABLE complex_pyeong_details ADD COLUMN IF NOT EXISTS maintenance_cost_basis VARCHAR(6);
