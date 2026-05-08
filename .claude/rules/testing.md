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

> 명령 = 루트 `CLAUDE.md` §커밋 전 필수 검증 참조 (SSOT 단일화).

### 레벨별 실행
```bash
# FE 전체
cd frontend && npm test

# BE 전체
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

> 카운트 = 루트 `CLAUDE.md` §테스트 현황 참조 (SSOT 단일화).

### React Query 테스트 패턴
- 컴포넌트/훅 테스트에서 `TestQueryProvider` 래퍼 사용 (test-setup.ts에서 export)
- API 함수는 `vi.mock("@/lib/api")` 로 모킹
- MSW 테스트 (api.test.ts)는 네트워크 레벨 → QueryProvider 불필요
