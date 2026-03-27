# 테스트 규칙

## 새 기능 추가 시
- 기능 코드와 함께 테스트 코드도 반드시 작성
- 최소: 정상 케이스 1개 + 에러 케이스 1개

## 테스트 코드 작성 기준
- 파일명: [대상].test.ts 또는 [대상].spec.ts
- 한국어 주석으로 "이 테스트가 뭘 검증하는지" 설명
- 테스트 데이터는 하드코딩 말고 팩토리 함수 사용

## 테스트 실행

### 한 줄 전체 실행
```bash
cd frontend && npm test && cd ../backend && python -m pytest
```

### 레벨별 실행
```bash
# FE 단위 + 컴포넌트 + 엣지케이스 (168개)
cd frontend && npm test

# BE 단위 + 통합 + API + 엣지케이스 (221개)
cd backend && python -m pytest

# FE 특정 파일
cd frontend && npx vitest run src/lib/__tests__/format.test.ts

# BE 특정 파일/함수
cd backend && python -m pytest tests/test_queries.py
cd backend && python -m pytest tests/test_queries.py::test_search_complexes_by_name -v

# E2E (서버 실행 필요)
cd frontend && npx playwright test
cd frontend && npx playwright test --headed  # 브라우저 보면서
cd frontend && npx playwright test --ui      # 인터랙티브 모드
```

### 결과 읽기
- **Vitest**: checkmark = 통과, X = 실패 + expected/received diff
- **pytest**: . = 통과, F = 실패, s = 스킵 + traceback
- **Playwright**: PASS/FAIL + 실패 시 스크린샷 test-results/

### 테스트 구조
| 경로 | 도구 | 테스트 수 |
|------|------|----------|
| frontend/src/lib/__tests__/ | Vitest | 55 (단위+엣지케이스) |
| frontend/src/components/__tests__/ | Vitest | 61 (컴포넌트) |
| frontend/src/hooks/__tests__/ | Vitest | 14 (훅: useCrawlProgress 6 + usePriceCollect 8) |
| frontend/src/lib/__tests__/api.msw.test.ts | Vitest | 7 (MSW 통합) |
| frontend/e2e/ | Playwright | 13 (E2E) |
| backend/tests/ | pytest | 221 (단위+통합+API+엣지케이스) |
