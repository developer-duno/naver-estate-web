-- V051: K-apt 관리비 연동 (공동주택관리정보시스템, data.go.kr 1613000).
-- 공인중개사가 "이 단지 관리비 얼마 나와요?"에 답할 수 있도록, 단지별 월 관리비
-- (공용 17항목 + 개별 5항목)를 수집해 단지 상세에 노출한다.
--
-- 테이블 2개:
--   kapt_complex_map       우리 단지(complexes) ↔ K-apt 단지(kaptCode) 매칭 결과
--   kapt_management_costs  매칭된 단지의 월별 관리비 집계
--
-- 공용 DB(mibunyang) 영향 0 — 둘 다 신규 테이블이며 기존 테이블은 건드리지 않는다.
-- ⚠ 코드보다 prod 선행 실행 필수 (Supabase SQL Editor 수동 — 자동 러너 없음).
--   ORM(KaptComplexMap·KaptManagementCost) 매핑됨 — 수집기·조회 API 머지 전 적용해야 한다.

-- 1) 단지 매칭 — 우리 complex_no 하나당 K-apt 단지 하나(1:1)라 complex_no 가 PK.
CREATE TABLE IF NOT EXISTS kapt_complex_map (
  -- FK ON DELETE 미지정(NO ACTION) 은 의도 — 단지 오삭제를 DB 레벨에서 한 겹 더 차단 (V044 답습)
  complex_no VARCHAR(20) PRIMARY KEY REFERENCES complexes(complex_no),
  kapt_code TEXT NOT NULL,
  kapt_name TEXT,
  -- 이름 유사도(difflib ratio 0~1). 매칭 근거를 남겨 사후 감사·임계 조정에 쓴다.
  match_score DOUBLE PRECISION,
  corridor_type TEXT,
  kapt_household_count INTEGER,
  matched_at TIMESTAMPTZ DEFAULT NOW()
);
-- kapt_code 역방향 조회(중복 매칭 감사·디버깅)용. UNIQUE 를 걸지 않는 것은 의도 —
-- 제약 위반으로 수집 전체가 죽는 것보다, 중복이 생기면 감사 쿼리로 찾아내는 편이 안전하다
-- (매칭 게이트가 이미 법정동+이름+세대수 3중으로 중복을 억제한다).
CREATE INDEX IF NOT EXISTS ix_kapt_map_code ON kapt_complex_map (kapt_code);
COMMENT ON TABLE kapt_complex_map IS
  'K-apt 단지 매칭 (getTotalAptList4). 법정동+이름유사도+세대수 3중 게이트 통과분만 저장.';
ALTER TABLE kapt_complex_map ENABLE ROW LEVEL SECURITY;
-- anon/authenticated read 정책 의도적 미생성 — 접근은 FastAPI 경유만 (V044·V047 답습)
CREATE POLICY "Service write" ON kapt_complex_map FOR ALL USING (auth.role() = 'service_role');
-- 이중 빗장: default privileges 가 신규 테이블에 자동 부여하는 anon/authenticated GRANT 회수
-- (V031 답습 — 나중에 read 정책이 실수로 추가돼도 42501 로 차단)
REVOKE ALL ON public.kapt_complex_map FROM anon, authenticated;

-- 2) 월별 관리비 — (단지, 조회월) 유니크. 같은 달을 재수집하면 최신값으로 덮어쓴다.
CREATE TABLE IF NOT EXISTS kapt_management_costs (
  id SERIAL PRIMARY KEY,
  -- FK 는 kapt_complex_map 이 아니라 complexes 를 가리킨다 — 매칭이 갱신·삭제돼도
  -- 이미 수집한 관리비 이력이 연쇄 삭제되지 않게 (수집 비용이 단지당 22콜로 비싸다).
  complex_no VARCHAR(20) NOT NULL REFERENCES complexes(complex_no),
  cost_month VARCHAR(6) NOT NULL,
  common_cost BIGINT,
  individual_cost BIGINT,
  total_cost BIGINT,
  -- 총액 / 세대수. 단지 규모가 달라도 비교 가능한 대표값이라 화면의 주 지표.
  cost_per_household INTEGER,
  household_count INTEGER,
  -- 항목별 원값 {op: 금액}. 합계가 이상할 때 원인 항목을 추적하기 위한 감사 자료.
  breakdown JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT kapt_management_costs_key UNIQUE (complex_no, cost_month)
);
-- 최신월 1건 조회(단지 상세)가 주 패턴이라 (complex_no, cost_month DESC) 정렬 인덱스.
-- UNIQUE 인덱스와 컬럼 조합은 같지만 정렬 방향이 달라 최신월 조회에서 별도 이득이 있다.
CREATE INDEX IF NOT EXISTS ix_kapt_cost_complex
  ON kapt_management_costs (complex_no, cost_month DESC);
COMMENT ON TABLE kapt_management_costs IS
  'K-apt 월별 관리비 (공용 V3 17항목 + 개별 V2 5항목 합산). 단지×조회월 1행.';
ALTER TABLE kapt_management_costs ENABLE ROW LEVEL SECURITY;
-- anon/authenticated read 정책 의도적 미생성 — 접근은 FastAPI 경유만
CREATE POLICY "Service write" ON kapt_management_costs FOR ALL USING (auth.role() = 'service_role');
-- 이중 빗장 (V031 답습)
REVOKE ALL ON public.kapt_management_costs FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS kapt_management_costs;
-- DROP TABLE IF EXISTS kapt_complex_map;
