-- V019: 어린이집 상세 컬럼 추가 (cpmsapi030 전환: 유형, 보육교사 수)
ALTER TABLE infra ADD COLUMN childcare_nearest_type TEXT;
ALTER TABLE infra ADD COLUMN childcare_nearest_teachers INTEGER;
