-- V024: articles 매물 가치 필드 12개 추가 (에픽 D #9 + #5)
-- 네이버 매물 리스트 API 응답 중 DB 컬럼이 없던 가치 필드.
-- 가격변동·동일주소 묶음·검증유형·직거래·제공플랫폼·사진수 + 분양권 프리미엄 3종.
-- 크롤 시점 값이라 backfill 불가 — 신규 매물 크롤부터 채워진다.
-- 가격 필드(same_addr_*_prc, *premium*)는 "13억 5,000"/"-1000" 문자열 형태라 VARCHAR.

ALTER TABLE articles ADD COLUMN IF NOT EXISTS price_change_state     VARCHAR(20);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS article_status         VARCHAR(10);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS same_addr_cnt          INTEGER;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS same_addr_min_prc      VARCHAR(50);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS same_addr_max_prc      VARCHAR(50);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS verification_type_code VARCHAR(20);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_direct_trade        BOOLEAN DEFAULT FALSE;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS cp_name                VARCHAR(50);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS site_image_count       INTEGER;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS same_addr_premium_min  VARCHAR(30);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS same_addr_premium_max  VARCHAR(30);
ALTER TABLE articles ADD COLUMN IF NOT EXISTS premium_prc            VARCHAR(30);

-- 역방향 (롤백):
-- ALTER TABLE articles DROP COLUMN IF EXISTS price_change_state;
-- ALTER TABLE articles DROP COLUMN IF EXISTS article_status;
-- ALTER TABLE articles DROP COLUMN IF EXISTS same_addr_cnt;
-- ALTER TABLE articles DROP COLUMN IF EXISTS same_addr_min_prc;
-- ALTER TABLE articles DROP COLUMN IF EXISTS same_addr_max_prc;
-- ALTER TABLE articles DROP COLUMN IF EXISTS verification_type_code;
-- ALTER TABLE articles DROP COLUMN IF EXISTS is_direct_trade;
-- ALTER TABLE articles DROP COLUMN IF EXISTS cp_name;
-- ALTER TABLE articles DROP COLUMN IF EXISTS site_image_count;
-- ALTER TABLE articles DROP COLUMN IF EXISTS same_addr_premium_min;
-- ALTER TABLE articles DROP COLUMN IF EXISTS same_addr_premium_max;
-- ALTER TABLE articles DROP COLUMN IF EXISTS premium_prc;
