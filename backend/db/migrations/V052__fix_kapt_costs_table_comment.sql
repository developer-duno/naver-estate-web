-- V052: kapt_management_costs 테이블 코멘트 정정 — "개별 V2" → "개별 V3" (PR #435 후속)
--
-- 배경: PR #435(04829a9, 세션 389)가 K-apt 개별사용료 5종 오퍼레이션을 V2 → V3 로 선제
-- 전환하며 코드·문서 서술은 전부 현행화했으나(db/models.py KaptManagementCost docstring 등),
-- V051 이 prod 에 박아둔 COMMENT ON TABLE 은 살아있는 DB 메타데이터라 낡은 문구
-- ("개별 V2 5항목")가 잔존했다. #435 커밋 메시지에 "별도 마이그레이션 필요"로 명시된
-- 저우선 후속분이 본 파일이다.
--
-- 실측(2026-08-31, obj_description('public.kapt_management_costs'::regclass, 'pg_class')):
--   'K-apt 월별 관리비 (공용 V3 17항목 + 개별 V2 5항목 합산). 단지×조회월 1행.'
--
-- 공유 DB 영향: kapt_management_costs 는 naver-estate 전용(mibunyang 미사용, V051 답습) — 영향 0.
-- COMMENT 는 표시용 메타데이터라 쿼리 플랜·락·런타임 동작 영향 0, 즉시 적용 가능.
-- V051 원본 파일은 역사 기록이라 수정하지 않는다(마이그레이션은 append-only).

COMMENT ON TABLE kapt_management_costs IS
  'K-apt 월별 관리비 (공용 V3 17항목 + 개별 V3 5항목 합산). 단지×조회월 1행.';

-- 역방향 (롤백):
-- COMMENT ON TABLE kapt_management_costs IS
--   'K-apt 월별 관리비 (공용 V3 17항목 + 개별 V2 5항목 합산). 단지×조회월 1행.';
