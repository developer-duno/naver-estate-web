-- V022: complexes 유형별 인덱스
-- 유형별 단지 상세 backfill 쿼리(WHERE real_estate_type_code=:type
-- AND detail_crawled_at IS NULL)와 유형별 커버리지 통계 쿼리를 가속.
-- 기존 인덱스(cortar_no/complex_no/region)에 real_estate_type_code 없음.

CREATE INDEX IF NOT EXISTS ix_complexes_type_detail
    ON complexes (real_estate_type_code, detail_crawled_at);

-- 역방향 (롤백):
-- DROP INDEX IF EXISTS ix_complexes_type_detail;
