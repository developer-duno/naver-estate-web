-- V021: complexes.real_estate_type_name NULL 정리
-- code 는 있는데 name 이 NULL 인 단지 659개를, code→name 매핑으로 채운다.
-- (codes.md 7종 답습: APT/ABYG/JGC/PRE/OPST/OBYG/RDV)

UPDATE complexes
SET real_estate_type_name = CASE real_estate_type_code
    WHEN 'APT'  THEN '아파트'
    WHEN 'ABYG' THEN '아파트분양권'
    WHEN 'JGC'  THEN '재건축'
    WHEN 'PRE'  THEN '분양권'
    WHEN 'OPST' THEN '오피스텔'
    WHEN 'OBYG' THEN '오피스텔분양권'
    WHEN 'RDV'  THEN '재개발'
END
WHERE real_estate_type_name IS NULL
  AND real_estate_type_code IS NOT NULL;

-- 역방향: 값 복원 불가 (원래 NULL 이었음). 롤백 시 아래로 되돌림.
-- UPDATE complexes SET real_estate_type_name = NULL
--   WHERE real_estate_type_code IS NOT NULL AND real_estate_type_name IS NOT NULL;
