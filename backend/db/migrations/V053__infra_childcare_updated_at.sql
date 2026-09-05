-- V053: infra.childcare_updated_at 컬럼 추가 (어린이집 배치 순환 결함 근본수정, 세션 392)
--
-- 결함: crawler/env_childcare.py 의 대상 선정 쿼리가 ORDER BY 없이 .limit(batch_size)
-- 만 걸어, 매월 1회 배치(100개)가 DB 가 돌려주는 임의(사실상 고정) 순서의 앞쪽 100개만
-- 반복 재갱신했다. prod 실측(2026-09-05): 위경도 보유 apartments 2,938개 중 901개
-- (30.7%)가 infra.childcare_count 를 한 번도 못 받고 NULL 방치 — 2026-04-14 대량 백필
-- 이후 5개월간 잔여가 전혀 안 줄었다.
--
-- 처방: "오래된 것 우선" 순환(childcare_updated_at ASC NULLS FIRST). 그러려면 어린이집
-- 갱신 시각을 담을 컬럼이 필요한데, 기존에 그런 컬럼이 없었다(air_updated_at·
-- crime_updated_at 은 있는데 childcare 만 빠져 있던 비대칭).
--
-- ⚠ 왜 기존 infra.updated_at 을 순환 키로 쓰지 않는가 (공유 DB 함정):
-- infra 는 mibunyang 과 공용 테이블이고, mibunyang 의 collect-childcare.mjs 가 자기
-- 수집(Kakao 기반 childcare·childcare_dist 컬럼)마다 공용 updated_at 을 통째로 갱신한다.
-- 그걸 순환 키로 삼으면 mibunyang 이 전 행의 시각을 밀어버려 우리 순환이 무너진다.
-- 반면 childcare_count·childcare_nearest_* (CPMS 기반)는 이 프로젝트 전용 컬럼이므로,
-- 짝을 이루는 전용 타임스탬프를 새로 두는 것이 air/crime 선례와도 일치한다.
--
-- 기존 데이터 영향 0: nullable 컬럼 추가라 기존 행은 전부 NULL = "한 번도 안 받음"으로
-- 취급돼 순환 최우선이 된다(= 위 901개 미수집 단지가 먼저 채워진다). 이미 값이 있는
-- 2,037개도 NULL 이라 첫 몇 회차는 뒤섞이지만, 한 바퀴 돌고 나면 전 행에 시각이 박혀
-- 정상 순환에 진입한다. 공유 DB(mibunyang)는 이 컬럼을 읽지도 쓰지도 않아 영향 0.
ALTER TABLE infra ADD COLUMN IF NOT EXISTS childcare_updated_at TIMESTAMP;
COMMENT ON COLUMN infra.childcare_updated_at IS
  'CPMS 어린이집 수집(childcare_count·childcare_nearest_*) 최종 갱신 시각 — collect_childcare_data 의 "오래된 것 우선" 배치 순환 키 (세션 392). mibunyang 이 갱신하는 공용 infra.updated_at 과는 별개.';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE infra DROP COLUMN IF EXISTS childcare_updated_at;
