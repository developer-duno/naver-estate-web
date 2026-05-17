-- V025: articles 매물 상세 4필드 추가 (에픽 D #10)
-- 네이버 매물 상세 API 응답(articleDetail 섹션) 중 DB 컬럼이 없던 4필드.
-- 지하철역 도보시간·분양권 유형명·매물 상태코드·거래완료 여부.
-- 상세 API 응답이라 detail 크롤된 매물만 채워진다 — backfill 불가.
-- detail_status_code 는 articleStatusCode 직역 (cf. article_status = V024 리스트 API 출처, 혼동 주의).

ALTER TABLE articles ADD COLUMN IF NOT EXISTS walking_time_to_subway INTEGER;               -- articleDetail.walkingTimeToNearSubway (분)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS isale_right_type_name  VARCHAR(30);           -- articleDetail.isaleRightTypeName (분양권 매물만)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS detail_status_code     VARCHAR(10);           -- articleDetail.articleStatusCode (cf. article_status = 리스트 API)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS trade_complete         BOOLEAN DEFAULT FALSE;  -- articleDetail.tradeCompleteYN ("Y"→true)

-- 역방향 (롤백):
-- ALTER TABLE articles DROP COLUMN IF EXISTS walking_time_to_subway;
-- ALTER TABLE articles DROP COLUMN IF EXISTS isale_right_type_name;
-- ALTER TABLE articles DROP COLUMN IF EXISTS detail_status_code;
-- ALTER TABLE articles DROP COLUMN IF EXISTS trade_complete;
