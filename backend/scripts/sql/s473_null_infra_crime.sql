-- 세션 473 (사장님 결정 ②A 2026-10-18): 우리 범죄 점수 잡을 내리고 infra 의 범죄 칸 3개 값을 비운다.
--
-- 왜: 이 값은 아무 화면도 안 본다(우리 화면은 #745 에서 뺐고 미분양 화면도 안 씀). 인구 자료가 없는 지역은
--     중앙값으로 채운 값이라 "우리 결함"이 표에 남아 있었다. 칸 자체(DB 열)는 그대로 둔다 — 공용 표 infra,
--     칸 삭제 금지 규칙(infra.md §공용 테이블 규칙). 미분양 정본(ownership.json) infra 2u 칸 3개는 "비움" 통보.
--
-- ⚠ 부수효과: 미분양 쪽 BEFORE UPDATE 트리거가 infra.updated_at 을 올려, 미분양 infra-kakao.mjs buildFreshIds 가
--   이 행들(약 3,255행)을 '최근 갱신'으로 보고 카카오 재수집을 1회 건너뛴다 — 실행 전 미분양 세션에 통보(메인 몫).
--
-- 실행: 메인이 사장님 확인 뒤 SQL Editor 에서. 실행 전 데이터 덤프(대량 UPDATE — infra.md §DB 백업).
--
-- ① 확인(기대 ≈ 3,255행, 2026-10-18 설계 조사 값):
-- SELECT count(*) FROM infra
--  WHERE crime_score IS NOT NULL OR crime_grade IS NOT NULL OR crime_updated_at IS NOT NULL;
--
-- ② 비우기:
UPDATE infra SET crime_score = NULL, crime_grade = NULL, crime_updated_at = NULL
 WHERE crime_score IS NOT NULL OR crime_grade IS NOT NULL OR crime_updated_at IS NOT NULL;
--
-- ③ 다시 ① 을 돌려 0 인지 확인.
