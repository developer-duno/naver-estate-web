-- V054: infra.emergency_updated_at 컬럼 추가 (응급의료 배치 순환 결함 근본수정, 세션 394)
--
-- 결함: crawler/env_emergency.py 의 대상 선정 쿼리가 ORDER BY 없이 .limit(batch_size)
-- 만 걸어, 매월 1회 배치(100개)가 DB 가 돌려주는 임의(사실상 고정) 순서의 앞쪽 100개만
-- 반복 재갱신했다. prod 실측(2026-09-05): 위경도 보유 apartments 2,938개 중 496개
-- (16.9%)만 infra.emergency_hospital 이 채워져 있고, 나머지 2,442개(83.1%)는 영구
-- 방치 상태다. 세션 392 어린이집(V053)과 완전히 동일한 계열의 결함이다.
--
-- 처방: "오래된 것 우선" 순환(emergency_updated_at ASC NULLS FIRST) + 배치 전량 전환.
-- 그러려면 응급의료 갱신 시각을 담을 컬럼이 필요한데, 기존에 그런 컬럼이 없었다
-- (air_updated_at·crime_updated_at·childcare_updated_at 은 있는데 emergency 만 빠져
-- 있던 비대칭 — V053 이 childcare 를 메웠고 본 파일이 마지막 하나를 메운다).
--
-- ⚠ 왜 기존 infra.updated_at 을 순환 키로 쓰지 않는가 (공유 DB 함정 — V053 과 동일):
-- infra 는 mibunyang 과 공용 테이블이고, mibunyang 의 collectors 가 자기 수집마다
-- 공용 updated_at 을 통째로 갱신한다. 그걸 순환 키로 삼으면 mibunyang 이 전 행의
-- 시각을 밀어버려 우리 순환이 무너진다. 반면 emergency_hospital·emergency_beds·
-- emergency_level 등은 이 프로젝트(NEMC 수집) 소관 컬럼이므로, 짝을 이루는 전용
-- 타임스탬프를 새로 두는 것이 air/crime/childcare 선례와 일치한다.
--
-- 기존 데이터 영향 0: nullable 컬럼 추가라 기존 행은 전부 NULL = "한 번도 안 받음"으로
-- 취급돼 순환 최우선이 된다(= 위 2,442개 미수집 단지가 먼저 채워진다). 전량 전환이라
-- 첫 회차에 전 단지가 한 바퀴 돌며 시각이 박히고, 그 다음부터 정상 순환에 진입한다.
-- 공유 DB(mibunyang)는 이 컬럼을 읽지도 쓰지도 않아 영향 0.
--
-- ⚠ 코드보다 prod 선행 실행 필수 (V034 관례) — ORM(mb_models.Infra)에 매핑된 컬럼은
-- Infra 를 SELECT 하는 모든 경로의 컬럼 목록에 포함되므로, prod 에 컬럼이 없는 채로
-- 새 코드가 뜨면 UndefinedColumn 500. 폭발 반경 = env_common._prefetch_infra_map 을
-- 공유하는 환경 수집기 4종(air/emergency/crime/childcare) + mb_misc_queries.get_infra
-- (미분양 단지 상세 인프라 API). SQLite CI 는 create_all() 이 컬럼을 자동 생성해 이
-- 누락을 못 잡는다. 배포 순서: ① 본 파일 prod 실행 → ② 코드 머지·재시작.
-- ADD COLUMN IF NOT EXISTS 라 멱등·재실행 안전.
ALTER TABLE infra ADD COLUMN IF NOT EXISTS emergency_updated_at TIMESTAMP;
COMMENT ON COLUMN infra.emergency_updated_at IS
  'NEMC 응급의료기관 수집(emergency_hospital·emergency_beds·emergency_level 등) 최종 갱신 시각 — collect_emergency_data 의 "오래된 것 우선" 배치 순환 키 (세션 394). mibunyang 이 갱신하는 공용 infra.updated_at 과는 별개.';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE infra DROP COLUMN IF EXISTS emergency_updated_at;
