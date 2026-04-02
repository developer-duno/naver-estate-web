-- V012: 대기질(에어코리아) + 응급의료기관 데이터 컬럼 추가
-- 미분양 단지별 환경 지표 강화를 위한 infra 테이블 확장 + 측정소 캐시 테이블

-- ── infra 테이블: 응급의료기관 4컬럼 ──
ALTER TABLE infra ADD COLUMN IF NOT EXISTS emergency_hospital INTEGER;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS emergency_hospital_dist FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS emergency_beds INTEGER;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS emergency_level TEXT;

-- ── infra 테이블: 대기질 7컬럼 ──
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_station_name TEXT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_station_dist FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_pm10 FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_pm25 FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_o3 FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_grade TEXT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS air_updated_at TIMESTAMP;

-- ── 에어코리아 측정소 위치 캐시 테이블 ──
CREATE TABLE IF NOT EXISTS air_quality_stations (
    station_name TEXT PRIMARY KEY,
    address TEXT,
    lat FLOAT,
    lng FLOAT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ROLLBACK:
-- ALTER TABLE infra DROP COLUMN IF EXISTS emergency_hospital;
-- ALTER TABLE infra DROP COLUMN IF EXISTS emergency_hospital_dist;
-- ALTER TABLE infra DROP COLUMN IF EXISTS emergency_beds;
-- ALTER TABLE infra DROP COLUMN IF EXISTS emergency_level;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_station_name;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_station_dist;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_pm10;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_pm25;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_o3;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_grade;
-- ALTER TABLE infra DROP COLUMN IF EXISTS air_updated_at;
-- DROP TABLE IF EXISTS air_quality_stations;
