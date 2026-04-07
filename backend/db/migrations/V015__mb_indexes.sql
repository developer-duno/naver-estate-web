-- V015: mibunyang apartments/trades 테이블 인덱스 추가
-- apartments 테이블에 인덱스 0개 → 모든 쿼리 seq scan 발생
-- trades 테이블에 region/gu/dong 필터 인덱스 없음

-- apartments: 핵심 필터 인덱스
CREATE INDEX IF NOT EXISTS idx_apartments_region
    ON apartments(region);

CREATE INDEX IF NOT EXISTS idx_apartments_region_gu
    ON apartments(region, gu);

-- apartments: 미분양 필터 (unsold > 0 조건부)
CREATE INDEX IF NOT EXISTS idx_apartments_unsold
    ON apartments(unsold) WHERE unsold > 0;

-- apartments: 정렬용
CREATE INDEX IF NOT EXISTS idx_apartments_created_at
    ON apartments(created_at DESC);

-- trades: 지역 필터
CREATE INDEX IF NOT EXISTS idx_trades_region_gu
    ON trades(region, gu);

CREATE INDEX IF NOT EXISTS idx_trades_region_gu_dong
    ON trades(region, gu, dong);

-- trades: 정렬용
CREATE INDEX IF NOT EXISTS idx_trades_deal_month
    ON trades(deal_month DESC);

-- ROLLBACK:
-- DROP INDEX IF EXISTS idx_apartments_region;
-- DROP INDEX IF EXISTS idx_apartments_region_gu;
-- DROP INDEX IF EXISTS idx_apartments_unsold;
-- DROP INDEX IF EXISTS idx_apartments_created_at;
-- DROP INDEX IF EXISTS idx_trades_region_gu;
-- DROP INDEX IF EXISTS idx_trades_region_gu_dong;
-- DROP INDEX IF EXISTS idx_trades_deal_month;
