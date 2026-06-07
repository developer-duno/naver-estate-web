-- Phase 1: 시세 이력 + 크롤러 체크포인트 테이블

-- 단지별 시세 이력 (네이버 API)
CREATE TABLE IF NOT EXISTS complex_price_history (
    id SERIAL PRIMARY KEY,
    complex_no TEXT NOT NULL,
    trade_type TEXT NOT NULL,           -- A1=매매, B1=전세, B2=월세
    area_no TEXT,
    price_upper INTEGER,                -- 만원
    price_lower INTEGER,
    price_avg INTEGER,
    base_month TEXT NOT NULL,           -- YYYYMM
    recorded_at TIMESTAMPTZ DEFAULT NOW(),
    -- NOTE: prod 는 이 이름·정의가 아니라 complex_price_history_upsert_key
    --   UNIQUE(complex_no, trade_type, area_no, base_month) 로 out-of-band 존재 (세션 280 실측).
    --   코드(service_common.py)는 complex_price_history_upsert_key 를 쓴다. 정합은 V032 가 처리.
    CONSTRAINT uq_cph_composite UNIQUE(complex_no, trade_type, COALESCE(area_no, ''), base_month)
);
CREATE INDEX IF NOT EXISTS idx_cph_complex ON complex_price_history(complex_no, trade_type);

-- 매물 가격 변동 이력
CREATE TABLE IF NOT EXISTS article_price_history (
    id SERIAL PRIMARY KEY,
    article_no TEXT NOT NULL,
    price INTEGER,
    rent_price INTEGER,
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aph_article ON article_price_history(article_no);

-- 크롤러 체크포인트 (중단 복구용)
CREATE TABLE IF NOT EXISTS crawler_checkpoints (
    job_id INTEGER PRIMARY KEY,
    state_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- complexes 테이블 신규 컬럼
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS nearby_median_price INTEGER;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS jeonse_rate REAL;
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS recent_trades_6m INTEGER;

-- articles 테이블 신규 컬럼
ALTER TABLE articles ADD COLUMN IF NOT EXISTS previous_price INTEGER;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS price_changed_at TIMESTAMPTZ;
