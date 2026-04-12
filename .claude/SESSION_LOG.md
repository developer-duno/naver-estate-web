# 세션 35 로그 (2026-04-13)

## 작업 내용

### 1. Vercel 프로덕션 배포
- git push origin main (세션 34 커밋 2개 push)
- Vercel 자동 빌드+배포 트리거

### 2. CI 수정 (GitHub Actions Backend CI 실패)
- 원인: requirements.txt에 `requests` 패키지 누락
- 3개 테스트 파일에서 import 실패 (test_business_api, test_childcare_api, test_crime_stats_api)
- 수정: `requests>=2.31,<3` 추가

### 3. 수익률 범위 필터 구현
- BE: filter_builder/complexes에 min_yield/max_yield (float, 0~100) 파라미터 추가
- BE: query_helpers에 SQL 계산식 필터 (numeric_rent_price*12/numeric_price*100)
- FE: YIELD_PRESETS 6종 (~3%/3~5%/5~8%/8~12%/12%~)
- FE: FilterState에 minYield/maxYield + emitFilters 변환 + FilterChips 칩 + useFilterParams FLOAT_KEYS
- 월세/전체/단기임대 거래유형일 때만 UI 표시

### 4. 공유 쿼터 보호 DB 카운터 도입
- crawler/quota_db.py 신규: INSERT ON CONFLICT DO UPDATE count+1 RETURNING count
- RateLimitCounter 테이블 재활용 (마이그레이션 불필요)
- public_data_api.py, public_data_base.py: DB 카운터 우선 + in-memory 폴백
- GET /api/admin/quota-status: 오늘의 쿼터 현황 (count/limit/remaining/utilization_pct)
- _is_skip_day() 유지 (mibunyang 미연동 이중 보호)

### 5. mibunyang 네이버 429 확인
- mibunyang naver-collect.py가 모든 요청에서 429 Rate Limit
- 같은 IP 공유 → naver-estate-web 크롤러도 영향 가능
- 대응 필요: 시간 분리 재조정 또는 요청 간격 증가

### 6. 9 GATE 하네스 검증: 🟢8 🟡1 🔴0

## 검증
- tsc: 통과 | build: 통과 | lint: 기존 경고 5개 | FE test: 539 passed
- ruff: All passed | BE test: 463 passed (+8 신규)

## 다음 세션 우선순위
1. mibunyang 네이버 429 대응 (시간 분리 재조정)
2. 모바일 실기기 재테스트 (2u.pe.kr)
3. 어린이집 수동 트리거
4. 오피스텔 면적 범위 프리셋 추가
5. mibunyang 쪽 quota_db 연동
