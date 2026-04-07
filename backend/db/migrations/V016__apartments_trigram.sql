-- V016: apartments 단지명 trigram 인덱스 (ILIKE 검색 가속)
-- mb_queries.py _apply_keyword_filter()의 ILIKE 호출 시 seq scan 방지
-- pg_trgm 확장은 V002에서 이미 생성됨 (complexes 테이블에 적용)

CREATE INDEX IF NOT EXISTS idx_apartments_name_trgm
    ON apartments USING GIN(name gin_trgm_ops);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_apartments_name_trgm;
