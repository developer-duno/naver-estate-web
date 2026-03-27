-- V010: 누락 필터/정렬 인덱스 추가 (성능 개선)
-- 인덱스만 추가, 컬럼 변경 없음
-- 롤백: 각 CREATE INDEX의 DROP INDEX 실행

-- 월세 가격 필터
CREATE INDEX IF NOT EXISTS idx_articles_numeric_rent_price
    ON articles(numeric_rent_price) WHERE is_active = TRUE;

-- 욕실 수 필터
CREATE INDEX IF NOT EXISTS idx_articles_bathroom_count
    ON articles(bathroom_count) WHERE is_active = TRUE;

-- 검증 매물 필터
CREATE INDEX IF NOT EXISTS idx_articles_is_verified
    ON articles(is_verified) WHERE is_verified = TRUE;

-- 매물유형 필터 (아파트/오피스텔/재건축 등)
CREATE INDEX IF NOT EXISTS idx_articles_estate_type
    ON articles(article_real_estate_type_name) WHERE is_active = TRUE;

-- 입주일 필터
CREATE INDEX IF NOT EXISTS idx_articles_move_in_date
    ON articles(move_in_date) WHERE is_active = TRUE;

-- 기본 정렬(article_confirm_ymd) 커버링 인덱스
CREATE INDEX IF NOT EXISTS idx_articles_confirm_sort
    ON articles(complex_no, is_active, article_confirm_ymd DESC);
