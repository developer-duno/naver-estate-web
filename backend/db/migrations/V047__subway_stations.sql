-- V047: 전국 도시철도 역사 (국가철도공단 레일포털 표준데이터).
-- 단지 상세의 "가까운 지하철" 표시를 위한 역사 좌표 테이블. 원본 그대로 "역사 × 노선"
-- 1행 구조를 유지한다 — 환승역은 같은 station_name 이 노선 수만큼 여러 행으로 존재하며,
-- 묶는 것은 조회 시점의 책임(역명 그룹핑)이라 DB 에 환승 컬럼을 두지 않는다.
-- 공용 DB(mibunyang) 영향 0 — 신규 테이블이며 기존 테이블은 건드리지 않는다.
-- ⚠ 코드보다 prod 선행 실행 필수 (Supabase SQL Editor 수동 — 자동 러너 없음).
--   ORM(SubwayStation) 매핑됨 — 적재 스크립트/API 머지 전 적용해야 한다.
CREATE TABLE IF NOT EXISTS subway_stations (
  id SERIAL PRIMARY KEY,
  station_number TEXT,
  station_name TEXT NOT NULL,
  line_number TEXT,
  line_name TEXT NOT NULL,
  operator TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  -- 원본의 행별 게시일. 결측·비정상값(1900-01-00 등 13행)이 섞여 있어 nullable —
  -- 데이터셋 기준일(2026-06-30)은 이 컬럼이 아니라 CSV 파일명이 진실의 원천이다.
  data_date DATE
);
-- 좌표 인덱스는 두지 않는다 — 1,099행 소형 테이블이고 조회는 전량 로드 후 파이썬
-- haversine 계산이며 결과가 단지별 12시간 캐시된다(과잉 인덱스 방지).
CREATE INDEX IF NOT EXISTS ix_subway_stations_name ON subway_stations (station_name);
COMMENT ON TABLE subway_stations IS
  '국가철도공단 레일포털 전체_도시철도역사정보. 역사×노선 1행, 연 1회 CSV 전량 재적재.';
ALTER TABLE subway_stations ENABLE ROW LEVEL SECURITY;
-- anon/authenticated read 정책 의도적 미생성 — 접근은 FastAPI 경유만 (V044 답습).
CREATE POLICY "Service write" ON subway_stations FOR ALL USING (auth.role() = 'service_role');
-- 이중 빗장: default privileges 가 신규 테이블에 자동 부여하는 anon/authenticated GRANT 회수
-- (V031 답습 — 나중에 read 정책이 실수로 추가돼도 42501 로 차단)
REVOKE ALL ON public.subway_stations FROM anon, authenticated;
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS subway_stations;
