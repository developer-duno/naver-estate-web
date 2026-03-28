# 테스트 규칙

## 새 기능 추가 시
- 기능 코드와 함께 테스트 코드도 반드시 작성
- 최소: 정상 케이스 1개 + 에러 케이스 1개

## 테스트 코드 작성 기준
- 파일명: [대상].test.ts 또는 [대상].spec.ts
- 한국어 주석으로 "이 테스트가 뭘 검증하는지" 설명
- 테스트 데이터는 하드코딩 말고 팩토리 함수 사용

## 테스트 실행

### 커밋 전 필수 (CI와 동일)
```bash
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

### 한 줄 전체 실행
```bash
cd frontend && npm test && cd ../backend && python -m pytest
```

### 레벨별 실행
```bash
# FE 단위 + 컴포넌트 + 훅 + 페이지 (233개)
cd frontend && npm test

# BE 단위 + 통합 + API + 엣지케이스 (224개)
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
| frontend/src/lib/__tests__/ | Vitest | 99 (단위+엣지케이스+storage+compare-utils) |
| frontend/src/components/__tests__/ | Vitest | 47 (컴포넌트+차트) |
| frontend/src/hooks/__tests__/ | Vitest | 35 (훅: useCrawlProgress + usePriceCollect + useFilterParams) |
| frontend/src/app/__tests__/ | Vitest | 7 (페이지 통합) |
| **프론트 합계** | Vitest | **233** (21개 파일) |
| frontend/e2e/ | Playwright | 13 (E2E) |
| backend/tests/ | pytest | 224 (단위+통합+API+엣지케이스+공유인프라) |

### React Query 테스트 패턴
- 컴포넌트/훅 테스트에서 `TestQueryProvider` 래퍼 사용 (test-setup.ts에서 export)
- API 함수는 `vi.mock("@/lib/api")` 로 모킹 (React Query가 모킹된 함수를 호출)
- MSW 테스트 (api.test.ts)는 네트워크 레벨 → QueryProvider 불필요
