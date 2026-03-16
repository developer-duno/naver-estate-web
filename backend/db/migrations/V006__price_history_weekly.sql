-- V006: Expand base_month to varchar(8) for weekly YYYYMMDD storage
-- 기존 월별(YYYYMM) 데이터를 주간(YYYYMMDD)으로 변경하기 위해 컬럼 확장

ALTER TABLE complex_price_history
  ALTER COLUMN base_month TYPE varchar(8);
