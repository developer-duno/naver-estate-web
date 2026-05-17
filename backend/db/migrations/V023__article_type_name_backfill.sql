-- V023: articles.article_real_estate_type_name NULL 정리
-- 네이버 매물 리스트 API 응답에 realEstateTypeName 이 거의 없어
-- 활성매물 약 78%(51만 건)의 매물 유형명이 NULL 로 저장됐다.
-- 소속 단지의 real_estate_type_name 으로 채운다 (V021 로 단지
-- 유형명은 NULL 0건 — 폴백 소스로 신뢰 가능).

UPDATE articles a
SET article_real_estate_type_name = cx.real_estate_type_name
FROM complexes cx
WHERE a.complex_no = cx.complex_no
  AND a.article_real_estate_type_name IS NULL
  AND cx.real_estate_type_name IS NOT NULL;

-- 역방향: 값 복원 불가 (원래 NULL 이었음). 롤백 시 아래로 되돌림.
-- UPDATE articles a SET article_real_estate_type_name = NULL
--   FROM complexes cx
--   WHERE a.complex_no = cx.complex_no
--     AND a.article_real_estate_type_name = cx.real_estate_type_name;
