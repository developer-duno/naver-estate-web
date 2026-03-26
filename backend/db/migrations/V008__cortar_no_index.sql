-- V008: cortar_no 인덱스 추가 (공공데이터 API 시군구 매칭용)
-- 롤백: DROP INDEX IF EXISTS ix_complexes_cortar;

CREATE INDEX IF NOT EXISTS ix_complexes_cortar ON complexes (cortar_no);
