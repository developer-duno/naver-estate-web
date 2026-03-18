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

## UI 패턴

### FilterBar (7개 드롭다운 툴바)
- 거래유형, 가격, 면적, 층수, 입주, 방/욕실, 상세
- 프리셋 상수: `PRICE_PRESETS`, `AREA_PRESETS`, `MAINTENANCE_PRESETS`, `PPYEONG_PRESETS`
- 비활성: 회색, 활성: 파란색 + 선택 요약 텍스트

### 매물유형 뱃지 색상
- `ESTATE_TYPE_COLORS` (constants.ts): 유형별 `bg-*-100 border-*-400 text-*-800`
- 아파트(teal), 아파트분양권(orange), 오피스텔(purple), 오피스텔분양권(pink), 재건축(amber), 재개발(rose)
- 검색 결과 테이블 + 단지 상세 헤더에 표시
- EstateTypeTabs: 활성 탭도 동일 색상 적용

### 매물유형 탭 (EstateTypeTabs)
- 6개 토글 버튼 (복수 선택, 최소 1개 보장)
- 선택 해제 시 검색 결과에서 해당 유형 클라이언트 필터로 즉시 숨김
- 홈/검색 페이지 공용

### RegionSelector (네이버 스타일 3컬럼 팝업)
- 트리거 버튼 hover → fixed 팝업 패널 (시/도 | 시/군/구 | 읍/면/동)
- hover로 하위 목록 미리보기, 읍/면/동 선택 시 검색 실행
- `fixed` 포지셔닝 (부모 overflow에 영향받지 않음)
- 200ms 딜레이로 자동 닫힘, 패널 밖 클릭 시 즉시 닫힘

### 홈페이지 레이아웃
- 컴팩트: 통계 타이틀 인라인, 키워드+지역 한 카드에 합침
- `max-w-3xl`, `py-6` (한 화면에 모든 요소 표시)

### 컬럼 헤더 (정렬 전용)
- 클릭 → ▲(asc) → ▼(desc) → 해제
- 필터 기능 없음 (FilterBar에서 담당)

### 매물 상세 모달
- 네이버 부동산 바로가기: `https://new.land.naver.com/complexes/{complex_no}?articleNo={article_no}`
- 네이버 지도: `https://map.naver.com/p?lat={lat}&lng={lng}&title={단지명}`

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
