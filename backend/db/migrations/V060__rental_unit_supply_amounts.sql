-- V060: rental_unit_supply 에 supply_amount / subscrpt_reqst_amount 추가 (세션 557)
--
-- 배경: rental_unit_supply 는 14컬럼 중 8칸이 **전수 0%** 였다(2026-09-22 전수 count 실측).
-- 그 빈 값은 mb_serializers.rental_unit_supply_to_dict 에서 가공되지만, 그 함수는 **어느 라우터에서도 호출되지 않는다**(주간 검토 확인, mb.py 임포트 목록에 없음). 현재는 손님 화면에 닿지 않는다 — 다만 DB 값 자체가 틀린 것은 사실이고, 다른 소비자(관리자 도구·직접 쿼리)가 생길 수 있어 고친다. 짝꿉 표(RentalScheduleOfficial)의 rental_schedule_to_dict 는 mb.py:283 에서 실제 호출되므로 그쪽 일정 4칸은 실제로 손님 화면에 나간다.
-- 원인은 두 가지였고 라이브 API 100행 전수(전 필드 100/100 출현)로 확정했다:
--
--   ① 필드명 6개가 실제 응답과 다르다
--      HOUSE_TY                  → TP
--      EXCLU_AR                  → EXCLUSE_AR
--      GNRL_HSHLDCO              → GNSPLY_HSHLDCO
--      YGMN_HSHLDCO              → SPSPLY_YGMN_HSHLDCO
--      NWWDS_HSHLDCO             → SPSPLY_NEW_MRRG_HSHLDCO
--      OLD_PARNTS_SUPORT_HSHLDCO → SPSPLY_AGED_HSHLDCO
--      (이 6개는 코드 수정만으로 해결 — DDL 불필요)
--
--   ② 월세·보증금은 **이 API 가 아예 주지 않는다**
--      MTH_RENT_AMOUNT / DEPOSIT_AMOUNT 는 응답 어디에도 없다(100행 전수 0회 출현).
--      대신 SUPLY_AMOUNT(공급금액)·SUBSCRPT_REQST_AMOUNT(청약신청금)를 준다.
--      → 본 마이그레이션이 그 둘을 받을 자리를 만든다.
--
-- 컬럼 이름은 **OfficetelUnitSupply 와 맞췄다**(같은 청약홈 계열이 이미 supply_amount /
-- subscrpt_reqst_amount 를 쓴다). monthly_rent·deposit 컬럼은 **지우지 않는다** —
-- 다른 출처가 생기면 채울 자리이고, 지금은 "비어 있는 것이 정상"임을 모델 주석에 남겼다.
--
-- 기존 데이터 영향 0: nullable 컬럼 추가. 다음 주간 수집(월요일)이 전량 upsert 하며 채운다.
-- 공유 DB(mibunyang)는 rental_* 을 읽지도 쓰지도 않아 영향 0
-- (2026-09-22 전수 grep 실측 — mibunyang 레포 참조 0건).
--
-- ⚠ 코드보다 prod 선행 실행 필수 (V034·V055 관례) — ORM(mb_models.RentalUnitSupply)에
-- 매핑된 컬럼은 그 모델을 SELECT 하는 모든 경로의 컬럼 목록에 들어간다. prod 에 컬럼이
-- 없는 채 새 코드가 뜨면 UndefinedColumn 500 이 난다. 폭발 반경 =
-- service_applyhome_rental.collect_rental_presale(주간 잡) + mb_serializers 를 쓰는
-- 민간임대 상세 응답. SQLite CI 는 create_all() 이 컬럼을 자동 생성해 이 누락을 못 잡는다.
-- 배포 순서: ① 본 파일 prod 실행 → ② 코드 머지·재시작.
-- ADD COLUMN IF NOT EXISTS 라 멱등·재실행 안전.
ALTER TABLE rental_unit_supply ADD COLUMN IF NOT EXISTS supply_amount INTEGER;
ALTER TABLE rental_unit_supply ADD COLUMN IF NOT EXISTS subscrpt_reqst_amount INTEGER;
COMMENT ON COLUMN rental_unit_supply.supply_amount IS
  '공급금액 — 청약홈 getPblPvtRentLttotPblancMdl 의 SUPLY_AMOUNT (세션 557). 이 API 는 월세·보증금을 주지 않아 monthly_rent/deposit 은 항상 NULL 이며, 화면은 이 값을 쓴다.';
COMMENT ON COLUMN rental_unit_supply.subscrpt_reqst_amount IS
  '청약신청금 — 청약홈 getPblPvtRentLttotPblancMdl 의 SUBSCRPT_REQST_AMOUNT (세션 557). OfficetelUnitSupply 의 동명 컬럼과 같은 의미.';
NOTIFY pgrst, 'reload schema';

-- 역방향 (롤백):
-- ALTER TABLE rental_unit_supply DROP COLUMN IF EXISTS supply_amount;
-- ALTER TABLE rental_unit_supply DROP COLUMN IF EXISTS subscrpt_reqst_amount;
