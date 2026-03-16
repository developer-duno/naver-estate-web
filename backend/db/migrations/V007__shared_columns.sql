-- V007: mibunyang 프로젝트와 공유를 위한 has_pool 컬럼 추가 및 RLS 정책 설정

-- 1. has_pool 컬럼 추가 (mibunyang naver_complexes.has_pool과 동기화)
ALTER TABLE complexes ADD COLUMN IF NOT EXISTS has_pool BOOLEAN;

-- 2. anon 읽기 RLS (mibunyang 프로젝트의 anon 키로 조회 가능)
ALTER TABLE complexes ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_read_complexes ON complexes FOR SELECT USING (true);

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY anon_read_articles ON articles FOR SELECT USING (is_active = true);
