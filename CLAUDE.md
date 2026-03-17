# 네이버 아파트 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi
- **DB**: Supabase (PostgreSQL) + Supabase Auth
- **배포**: Vercel (frontend) + Railway (backend)

## 아키텍처

```
[브라우저] → [Next.js (Vercel)]
                ↓ API 호출
           [FastAPI (Railway)]
                ↓ 실시간 크롤링
           [네이버 부동산 API] → [PostgreSQL (Supabase)]
```

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 프로젝트 구조

### Frontend (`frontend/`)

| 경로 | 역할 |
|------|------|
| `src/app/page.tsx` | 홈 (검색 + 지역 선택 + 통계) |
| `src/app/search/page.tsx` | 검색 결과 (단지 테이블) |
| `src/app/complex/[no]/page.tsx` | 단지 상세 (매물 + 필터 + 시세) |
| `src/app/login/page.tsx` | 로그인 |
| `src/app/signup/page.tsx` | 회원가입 |
| `src/app/admin/*.tsx` | 관리자 페이지 (6개) |
| `src/app/terms/page.tsx` | 이용약관 |
| `src/app/privacy/page.tsx` | 개인정보 처리방침 |
| `src/components/` | 재사용 컴포넌트 (15개) |
| `src/lib/api.ts` | FastAPI 백엔드 호출 래퍼 (25개 함수) |
| `src/lib/supabase.ts` | Supabase 클라이언트 |
| `src/types/` | TypeScript 타입 정의 |

### Backend (`backend/`)

| 경로 | 역할 |
|------|------|
| `main.py` | FastAPI 앱 진입점, 라우터 등록, CORS |
| `deps.py` | 인증 의존성 (get_current_user, get_admin_user) |
| `routers/live.py` | 실시간 크롤링 API (핵심) |
| `routers/complexes.py` | 단지 조회/필터/시세 |
| `routers/articles.py` | 매물 조회/엑셀 내보내기 |
| `routers/admin.py` | 관리자 API |
| `routers/serializers.py` | ORM → dict 변환 |
| `db/models.py` | SQLAlchemy ORM 모델 |
| `db/queries.py` | DB 쿼리 함수 |
| `shared/naver_api.py` | NaverEstateAPI (수정 금지) |
| `shared/constants.py` | 상수 (수정 금지) |
| `auth/rate_limiter.py` | IP 기반 요청 제한 |

## 핵심 상수

- `M2_TO_PYEONG = 3.3058` (프론트/백엔드 동일)
- `LIVE_TIMEOUT_MS = 120_000` (실시간 크롤링 타임아웃)
- `_CACHE_TTL_SECONDS = 300` (live 엔드포인트 캐시 5분)

## 거래유형 코드

| 코드 | 이름 | 설명 |
|------|------|------|
| A1 | 매매 | 매매 거래 |
| B1 | 전세 | 전세 거래 |
| B2 | 월세 | 월세 (보증금/월세) |
| B3 | 단기임대 | 단기임대 (보증금/월세) |

## 데이터 흐름

```
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 선택 → /api/live/{no}/articles (매물 크롤링 → DB upsert → 단지정보 보강 → 반환)
필터 변경 → /api/complexes/{no}/articles (DB 쿼리, SQL WHERE절)
엑셀 → /api/articles/export (pandas DataFrame → xlsx)
```

## 코딩 규칙

`.claude/rules/web-rules.md` 참조.

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
# FE 단위 + 컴포넌트 + 엣지케이스 (118개)
cd frontend && npm test

# BE 단위 + 통합 + API + 엣지케이스 (183개)
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
| frontend/src/lib/__tests__/ | Vitest | 54 (단위+엣지케이스) |
| frontend/src/components/__tests__/ | Vitest | 58 (컴포넌트) |
| frontend/src/hooks/__tests__/ | Vitest | 6 (훅) |
| frontend/e2e/ | Playwright | 13 (E2E) |
| backend/tests/ | pytest | 183 (단위+통합+API+엣지케이스) |
