-- V044: 공동주택 공시가격 (국토교통부 getApartHousingPriceAttr).
-- 단지(complexes) × 기준연도 × 전용면적 단위의 공시가격 중위값 집계 테이블.
-- 같은 (단지, 연도, 전용면적) 조합의 여러 호(dongNm/hoNm)를 median 으로 묶어 1행 저장한다.
-- ⚠ 코드보다 prod 선행 실행 필수 (Supabase SQL Editor 수동 — 자동 러너 없음).
--   ORM(ComplexOfficialPrice) 매핑됨 — 수집기(PR-A2) 머지 전 적용해야 한다.
CREATE TABLE IF NOT EXISTS complex_official_prices (
  id SERIAL PRIMARY KEY,
  -- FK ON DELETE 미지정(NO ACTION) 은 의도 — 단지 오삭제를 DB 레벨에서 한 겹 더 차단
  complex_no VARCHAR(20) NOT NULL REFERENCES complexes(complex_no),
  stdr_year VARCHAR(4) NOT NULL,
  prvuse_ar NUMERIC(8,2) NOT NULL,
  price_median BIGINT NOT NULL,
  ho_count INTEGER NOT NULL,
  aphus_code VARCHAR(20),
  aphus_nm VARCHAR(200),
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT complex_official_prices_key UNIQUE (complex_no, stdr_year, prvuse_ar)
);
-- 별도 (complex_no, stdr_year) 인덱스는 두지 않는다 — UNIQUE 인덱스 선두 접두사로 커버 (V030 중복 인덱스 제거 답습)
COMMENT ON TABLE complex_official_prices IS
  '국토교통부 공동주택 공시가격 (getApartHousingPriceAttr). 단지×연도×전용면적 중위값 집계.';
ALTER TABLE complex_official_prices ENABLE ROW LEVEL SECURITY;
-- anon/authenticated read 정책 의도적 미생성 — 접근은 FastAPI 경유만
-- (V031 의 공유 테이블 GRANT 차단과 이중 방어. 공시가격 자체는 무료 공개 데이터지만
--  단지 매칭 결과는 우리 자산이라 PostgREST 직접 노출은 막는다).
CREATE POLICY "Service write" ON complex_official_prices FOR ALL USING (auth.role() = 'service_role');
-- 이중 빗장: default privileges 가 신규 테이블에 자동 부여하는 anon/authenticated GRANT 회수
-- (V031 답습 — 나중에 read 정책이 실수로 추가돼도 42501 로 차단)
REVOKE ALL ON public.complex_official_prices FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS complex_official_prices;
