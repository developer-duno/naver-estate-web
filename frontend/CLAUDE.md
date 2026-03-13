# 네이버 아파트 매물 조회 웹

> Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase Auth + FastAPI Backend

## 기술 스택

- **프론트엔드**: Next.js 16.1.6, React 19, TypeScript 5, Tailwind CSS 4
- **인증**: Supabase SSR (쿠키 기반 JWT)
- **차트**: Recharts 3 (dynamic import)
- **백엔드**: FastAPI + SQLAlchemy + Supabase PostgreSQL
- **크롤링**: curl_cffi (Chrome TLS 임퍼소네이션) + APScheduler

## 디렉토리 구조

```
frontend/src/
├── app/           # Next.js App Router (11 페이지)
├── components/    # 재사용 컴포넌트 (13개)
├── lib/           # api.ts, supabase.ts, constants.ts, format.ts
├── types/         # TypeScript 인터페이스
└── middleware.ts  # Supabase 세션 + 관리자 라우트 보호
```

## Critical Rules

### 1. 인증 패턴
- 항상 `createClient()` from `@/lib/supabase` 사용 (`createBrowserClient` 직접 호출 금지)
- 보호된 API 호출 시 `session.access_token`을 Authorization 헤더로 전달
- middleware.ts에서 `/admin/*` 경로 보호 (role 체크)

### 2. API 호출 패턴
- 모든 API 호출은 `api.ts`의 `fetchApi()` 래퍼를 통해 수행
- 기본 타임아웃: 15초, Live 크롤링: 120초
- 401/403 시 자동 로그아웃 + `/login` 리다이렉트
- AbortController로 컴포넌트 언마운트 시 요청 취소

### 3. HTML 유효성
- `<table>` 내부에 `<Link>`(`<a>`) 래퍼 사용 금지 (hydration 에러)
- 테이블 행 클릭: `<tr onClick={router.push()}>` 패턴 사용
- 모든 모달: focus trap + ESC 키 닫기 필수

### 4. 컴포넌트 메모이제이션
- `ArticleTable`, `ComplexRow`: `memo()` 적용
- `FilterBar`: debounce 300ms (입력), immediate (셀렉트/체크박스)
- `PriceChart`: `dynamic(() => import(...), { ssr: false })` 동적 임포트

### 5. 타입 안전성
- 프론트 타입(`types/index.ts`) ↔ 백엔드 모델(`db/models.py`) 동기화 유지
- 새 필드 추가 시 양쪽 모두 업데이트 필수
- optional (`?`) 필드에 대해 `??` (nullish coalescing) 사용 (`||` 금지)

---

## 작업 완료 후 필수 프로세스

### 5가지 교차검증 (병렬 에이전트)

| # | 에이전트 | 검증 항목 |
|---|---------|----------|
| 1 | **TypeScript 빌드** | `npm run build` 성공 여부 |
| 2 | **타입 안전성** | 프론트 타입 ↔ 백엔드 모델 불일치 탐지 |
| 3 | **페이지 연동** | 모든 Link/router.push 대상이 실존 라우트인지 |
| 4 | **API 엔드포인트 매칭** | api.ts URL ↔ backend router URL 일치 |
| 5 | **접근성/보안** | ARIA, CSP, XSS, innerHTML 사용 여부 |

### 커밋+푸시

모든 교차검증 통과 후 `git commit` + `git push` 자동 실행.

---

## 페이지별 데이터 흐름

| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/` | `getStats()` | `/api/stats` |
| `/search` | `searchComplexes()`, `getComplexesByRegion()` | `/api/live/search`, `/api/live/region` |
| `/complex/[no]` | `liveArticles()`, `getArticles()`, `getPyeongDetails()` | `/api/live/{no}/articles`, `/api/complexes/{no}/articles` |
| `/login` | Supabase Auth + `/api/users/login-record` | `/api/users/login-record` |
| `/admin` | `getAdminDetailedStats()` | `/api/admin/stats/detailed` |
| `/admin/users` | `getAdminUsers()`, `updateAdminUser()` | `/api/admin/users` |

## 백엔드 영향 체크리스트

프론트엔드 변경 시 아래 확인:
- [ ] 새 API 호출 추가? → `api.ts`에 함수 추가 + 백엔드 라우터 존재 확인
- [ ] 새 타입 필드 사용? → `types/index.ts` + `db/models.py` + `article_to_dict()` 동기화
- [ ] 인증 필요 엔드포인트? → Authorization 헤더 전달 확인
- [ ] 관리자 전용? → middleware.ts 라우트 보호 확인
