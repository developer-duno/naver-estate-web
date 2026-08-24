-- V045: 오피스텔·도시형 청약 전용 테이블 신설 (이슈 #323 P0 재발방지).
--
-- 배경: officetel_presale 수집기가 아파트 청약 전용 테이블 presale_schedule_official/
-- applyhome_unit_supply 에 house_type='officetel' 행을 끼워 넣는 방식이었는데, 이 테이블은
-- mibunyang 의 apartments 로스터와 매칭될 상대가 구조적으로 없어(mibunyang 은 오피스텔 API를
-- 아예 호출하지 않음, 2026-08-08 근본수정) 오피스텔 행이 늘어날수록 mibunyang 이 전제하는
-- "이 테이블은 apartments 와 매칭되는 청약 정보"라는 무결성 가정을 조용히 어그러뜨렸다.
-- 이번 마이그레이션은 오피스텔 전용 데이터를 완전히 독립된 새 테이블로 분리해, 기존
-- presale_schedule_official/applyhome_unit_supply/apartments 는 아파트 청약 전용으로
-- 순수하게 남기고 전혀 건드리지 않는다(ALTER/DROP 없음).
--
-- 선례 답습: V041(rental_schedule_official)/V042(rental_unit_supply) 와 동일 패턴 —
-- apartments FK 없는 완전 독립 테이블 + house_manage_no UNIQUE + Public read/Service write RLS.
--
-- 2026-08-10 재설계: 아파트 청약 API(getAPTLttotPblancMdl)의 general_supply/
-- special_supply/special_by_type 을 그대로 복사해 처음 만들었으나, 실제 오피스텔
-- API(getUrbtyOfctlLttotPblancMdl)는 이 필드들을 전혀 주지 않는다(재검증 라이브
-- 실측 확정 — 값은 항상 NULL 고정, 죽은 컬럼). 오피스텔 API가 실제로 주는 필드
-- (SUPLY_HSHLDCO/SUPLY_AMOUNT/SUBSCRPT_REQST_AMOUNT)로 다시 설계한다.
-- top_amount 는 삭제하지 않고 유지 — grep 결과 mb_serializers.py/FE MbUnitSupplyTable
-- 이 아파트·오피스텔 시리얼라이저 공통 키로 참조하므로, 오피스텔 쪽은 항상 NULL임을
-- 주석으로 명시(§comment 참조).
--
-- officetel_presale_schedule.region_name(SUBSCRPT_AREA_CODE_NM)도 함께 추가한다
-- — 청약 지역명("경기" 등, mibunyang Apartment.region 과 동일 포맷)을 미리
-- 받아두면 나중에 지역 필터를 켜기 쉬워진다(컬럼 추가는 저비용). 단, 이번
-- 마이그레이션은 region 필터링 로직 자체는 구현하지 않는다(범위 밖 — 다음 후보로
-- get_officetel_schedules() 주석에 명시). 한글 필드라 mojibake 우려가 있었으나
-- (2026-08-24 세션 382 실측 정정) API charset=UTF-8 명시 + prod 저장값 정상 확인
-- — 이론상 위험이었을 뿐 재현 안 됨. backend/db/mb_apartment_queries.py 주석 참조.

CREATE TABLE IF NOT EXISTS officetel_presale_schedule (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL UNIQUE,
  pblanc_no TEXT,
  house_nm TEXT NOT NULL,
  recruit_date DATE,
  special_receipt_bgnde DATE,
  special_receipt_endde DATE,
  general_rank1_bgnde DATE,
  general_rank1_endde DATE,
  general_rank2_bgnde DATE,
  general_rank2_endde DATE,
  winner_announce_date DATE,
  contract_bgnde DATE,
  contract_endde DATE,
  move_in_ym TEXT,
  tot_supply INTEGER,
  pblanc_url TEXT,
  biz_entity TEXT,
  constructor TEXT,
  region_name TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE officetel_presale_schedule IS
  '청약홈 오피스텔·도시형 청약 공고 일정 (getUrbtyOfctlLttotPblancDetail). apartments 테이블과 완전 독립(FK 없음), naver-estate-web 자체 소유.';
COMMENT ON COLUMN officetel_presale_schedule.region_name IS
  'SUBSCRPT_AREA_CODE_NM(청약 지역명, 예: "경기") — 지역 필터 미구현(dead), 향후 필터 후보로 데이터만 미리 적재. mojibake 우려는 2026-08-24 실측으로 재현 안 됨 확인(API charset=UTF-8 명시).';
ALTER TABLE officetel_presale_schedule ENABLE ROW LEVEL SECURITY;
-- 의도적 공개: 청약홈 공고 일정은 정부(한국부동산원)가 원래 공개하는 공식 정보라
-- anon read 제한 불필요 (V029/V031이 차단한 매물·시세 등 B2B 가치 데이터와 다름,
-- rental_schedule_official V041 선례와 동일 사유, 사장님 확인 2026-08-08 답습).
CREATE POLICY "Public read" ON officetel_presale_schedule FOR SELECT USING (true);
CREATE POLICY "Service write" ON officetel_presale_schedule FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS officetel_unit_supply (
  id SERIAL PRIMARY KEY,
  house_manage_no TEXT NOT NULL REFERENCES officetel_presale_schedule(house_manage_no) ON DELETE CASCADE,
  model_no TEXT NOT NULL,
  house_ty TEXT,
  supply_area FLOAT,
  supply_hshldco INTEGER,
  supply_amount INTEGER,
  subscrpt_reqst_amount INTEGER,
  top_amount INTEGER,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (house_manage_no, model_no)
);
COMMENT ON TABLE officetel_unit_supply IS
  '청약홈 오피스텔·도시형 평형별 공급정보 (getUrbtyOfctlLttotPblancMdl). apartments 테이블과 무관, officetel_presale_schedule 하나만 참조.';
COMMENT ON COLUMN officetel_unit_supply.supply_hshldco IS
  'SUPLY_HSHLDCO — 공급세대수(일반/특별 구분 없는 통합값, 오피스텔 API는 아파트처럼 일반/특별을 나눠 주지 않음).';
COMMENT ON COLUMN officetel_unit_supply.supply_amount IS
  'SUPLY_AMOUNT — 공급금액(단위 미확인, 만원 추정).';
COMMENT ON COLUMN officetel_unit_supply.subscrpt_reqst_amount IS
  'SUBSCRPT_REQST_AMOUNT — 청약신청금(단위 미확인, 만원 추정).';
COMMENT ON COLUMN officetel_unit_supply.top_amount IS
  '분양최고금액 — 아파트 청약(applyhome_unit_supply)과 시리얼라이저·FE(MbUnitSupplyTable)가 공유하는 키라 컬럼은 유지하나, 오피스텔 API(getUrbtyOfctlLttotPblancMdl) 응답엔 대응 필드가 없어 항상 NULL(2026-08-10 재검증 확정).';
ALTER TABLE officetel_unit_supply ENABLE ROW LEVEL SECURITY;
-- 의도적 공개: 위 officetel_presale_schedule 과 동일 사유(정부 공개 정보).
CREATE POLICY "Public read" ON officetel_unit_supply FOR SELECT USING (true);
CREATE POLICY "Service write" ON officetel_unit_supply FOR ALL USING (auth.role() = 'service_role');

NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS officetel_unit_supply;
-- DROP TABLE IF EXISTS officetel_presale_schedule;
