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
# BE 변경 시
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

> **주의**: `ruff check .`를 빠뜨리면 CI에서 import 정렬(I001), 미사용 import(F401) 등으로 실패.
> `ruff check --fix .`로 자동 수정 가능.

### 한 줄 전체 실행
```bash
cd backend && ruff check . && python -m pytest && cd ../frontend && npm test
```

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

### 테스트 구조 (2026-04-21 기준)

| 영역 | 경로 | 도구 | 테스트 수 |
|------|------|------|----------|
| FE 단위 | frontend/src/lib/__tests__/ | Vitest | 12파일 |
| FE 컴포넌트 | frontend/src/components/__tests__/ | Vitest | 27파일 (admin/5 + mb/3) |
| FE 훅 | frontend/src/hooks/__tests__/ | Vitest | 15파일 |
| FE 페이지 | frontend/src/app/__tests__/ | Vitest | 5파일 |
| **FE 합계** | | Vitest | **612개 (71파일)** |
| E2E | frontend/e2e/ | Playwright | **16파일 (--webpack)** |
| **BE 합계** | backend/tests/ | pytest | **563개 (46파일)** |

### React Query 테스트 패턴
- 컴포넌트/훅 테스트에서 `TestQueryProvider` 래퍼 사용 (test-setup.ts에서 export)
- API 함수는 `vi.mock("@/lib/api")` 로 모킹
- MSW 테스트 (api.test.ts)는 네트워크 레벨 → QueryProvider 불필요
