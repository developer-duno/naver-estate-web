-- V009: 실거래가 수집 일일 쿼터 추가
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS daily_price_collect_quota INTEGER DEFAULT 5;
