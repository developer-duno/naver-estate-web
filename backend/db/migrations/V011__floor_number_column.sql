-- V011: floor_number 계산 컬럼 추가 (층수 필터 성능 개선)
-- floor_info 문자열 파싱("3/20" → 3)을 쿼리마다 반복하지 않도록 정수 컬럼으로 저장
-- 롤백: ALTER TABLE articles DROP COLUMN IF EXISTS floor_number;

-- 1. 컬럼 추가
ALTER TABLE articles ADD COLUMN IF NOT EXISTS floor_number INT;

-- 2. 기존 데이터 업데이트 (숫자로 시작하는 floor_info만)
UPDATE articles SET floor_number =
    CAST(SPLIT_PART(floor_info, '/', 1) AS INTEGER)
WHERE floor_number IS NULL
  AND floor_info IS NOT NULL
  AND floor_info ~ '^[0-9]+';

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_articles_floor_number
    ON articles(floor_number) WHERE is_active = TRUE;
