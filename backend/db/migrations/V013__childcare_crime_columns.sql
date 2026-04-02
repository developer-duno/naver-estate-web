-- V013: 어린이집(CPMS) + 범죄통계 데이터 컬럼 추가
-- 미분양 단지별 환경 지표 강화를 위한 infra 테이블 확장

-- ── infra 테이블: 어린이집 4컬럼 ──
ALTER TABLE infra ADD COLUMN IF NOT EXISTS childcare_count INTEGER;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS childcare_nearest_dist FLOAT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS childcare_nearest_name TEXT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS childcare_nearest_capacity INTEGER;

-- ── infra 테이블: 범죄통계 3컬럼 ──
ALTER TABLE infra ADD COLUMN IF NOT EXISTS crime_score INTEGER;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS crime_grade TEXT;
ALTER TABLE infra ADD COLUMN IF NOT EXISTS crime_updated_at TIMESTAMP;

-- ROLLBACK:
-- ALTER TABLE infra DROP COLUMN IF EXISTS childcare_count;
-- ALTER TABLE infra DROP COLUMN IF EXISTS childcare_nearest_dist;
-- ALTER TABLE infra DROP COLUMN IF EXISTS childcare_nearest_name;
-- ALTER TABLE infra DROP COLUMN IF EXISTS childcare_nearest_capacity;
-- ALTER TABLE infra DROP COLUMN IF EXISTS crime_score;
-- ALTER TABLE infra DROP COLUMN IF EXISTS crime_grade;
-- ALTER TABLE infra DROP COLUMN IF EXISTS crime_updated_at;
