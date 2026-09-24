-- V002: 매물 필터 컬럼 인덱스 추가
-- CV-61 (12차 리뷰): 16개 필터 컬럼에 인덱스 없어 전체 테이블 스캔 발생

-- 핵심 필터 인덱스 (가장 자주 사용되는 필터 기준)
CREATE INDEX IF NOT EXISTS idx_articles_trade_type ON articles(trade_type_name);
CREATE INDEX IF NOT EXISTS idx_articles_numeric_price ON articles(numeric_price);
CREATE INDEX IF NOT EXISTS idx_articles_area2_m2 ON articles(area2_m2);
CREATE INDEX IF NOT EXISTS idx_articles_price_per_pyeong ON articles(price_per_pyeong);

-- 가격 변동 매물 조회용
CREATE INDEX IF NOT EXISTS idx_articles_price_changed ON articles(price_changed_at)
    WHERE price_changed_at IS NOT NULL;

-- 태그 배열 검색용 (GIN)
CREATE INDEX IF NOT EXISTS idx_articles_tags_gin ON articles USING GIN(tags);

-- 단지명 검색용 (trigram) — pg_trgm 확장 필요
-- 확장이 없으면 무시됨
-- WITH SCHEMA extensions: public 스키마에 확장을 두지 않는다 (Supabase 보안 고문 0014,
-- 2026-09-23 운영에서 extensions 스키마로 이관됨 — 세션 417). extensions 스키마가 없는
-- 로컬 PG 에서도 실패하지 않도록 기존 예외 처리(EXCEPTION WHEN OTHERS) 구조는 유지.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
    CREATE INDEX IF NOT EXISTS idx_complexes_name_trgm
        ON complexes USING GIN(complex_name gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_trgm extension not available, skipping trigram index';
END $$;
