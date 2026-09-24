-- V066: officetel_presale_schedule 에 address(공급위치) 추가 (세션 417)
--
-- 배경: 미분양 > 분양 탭의 오피스텔·민간임대 목록 표(frontend MbOfficetelRentalTable.tsx)는
-- "주소" 열을 item.address 로 그린다. 민간임대(rental_schedule_official.address)는
-- 청약홈 HSSPLY_ADRES 로 채워지는데, 오피스텔 표에는 그 칸 자체가 없어 **오피스텔 620건
-- 전부가 "-"** 로 보였다(2026-09-24 prod SELECT: 행 620 · address 컬럼 0).
--
-- 출처 확인: 청약홈 getUrbtyOfctlLttotPblancDetail 라이브 응답 1콜(2026-09-24, totalCount 621)
-- 에서 HSSPLY_ADRES 가 10/10 행에 값으로 있었다(예: "인천광역시 미추홀구 숭의동 350-1번지 일원").
-- 민간임대 오퍼레이션과 같은 필드명이다.
--
-- 기존 데이터 영향 0: nullable 컬럼 추가. 다음 주간 수집(월요일 05:00 collect_officetel_presale)이
-- 전량 upsert 하며 기존 행까지 채운다(수집 코드의 fields dict 가 insert·갱신 공용).
-- ("영향 0" 은 이 컬럼 추가 자체 한정이다. 이후 수집은 주소를 채우며, 갱신 경로는 응답에
--  HSSPLY_ADRES 가 없거나 빈 값이면 기존 주소를 지우지 않고 보존한다.)
-- 공유 DB(mibunyang)는 officetel_* 을 읽지도 쓰지도 않는다(V045 신설 테이블, naver 자체 소유).
--
-- ⚠ 코드보다 prod 선행 실행 필수 (V034·V055·V060 관례) — ORM(mb_models.OfficetelPresaleSchedule)
-- 에 매핑된 컬럼은 그 모델을 SELECT 하는 모든 경로의 컬럼 목록에 들어간다. prod 에 컬럼이
-- 없는 채 새 코드가 뜨면 UndefinedColumn 500 이 난다. 폭발 반경 =
-- GET /api/mb/presale/officetel-rental(분양 탭 목록) + collect_officetel_presale(주간 잡)
-- + 관리자 신선도 카드. SQLite CI 는 create_all() 이 컬럼을 자동 생성해 이 누락을 못 잡는다.
-- 배포 순서: ① 본 파일 prod 실행 → ② 코드 머지·재시작.
-- ADD COLUMN IF NOT EXISTS 라 멱등·재실행 안전.
ALTER TABLE officetel_presale_schedule ADD COLUMN IF NOT EXISTS address TEXT;
COMMENT ON COLUMN officetel_presale_schedule.address IS
  '공급위치 — 청약홈 getUrbtyOfctlLttotPblancDetail 의 HSSPLY_ADRES (세션 417). 민간임대 rental_schedule_official.address 와 같은 출처 필드.';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE officetel_presale_schedule DROP COLUMN IF EXISTS address;
