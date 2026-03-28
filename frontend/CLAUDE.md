# 네이버 아파트 매물 조회 웹

> Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query + Supabase Auth + FastAPI Backend

## 기술 스택

- **프론트엔드**: Next.js 16.1.6, React 19, TypeScript 5, Tailwind CSS 4
- **서버 상태 관리**: React Query (TanStack Query v5) — 캐싱, 중복 제거, 폴링
- **클라이언트 저장소**: localStorage (검색 히스토리, 즐겨찾기, 비교 목록)
- **인증**: Supabase SSR (쿠키 기반 JWT)
- **차트**: Recharts 3 (dynamic import)
- **테스트**: Vitest + @testing-library/react + MSW

## 디렉토리 구조

```
frontend/src/
├── app/           # Next.js App Router (16 페이지)
├── components/    # 재사용 컴포넌트 (22개 + filter/ 서브디렉토리)
├── hooks/         # 커스텀 훅 (10개)
├── lib/           # api.ts, supabase.ts, constants.ts, format.ts, query-client.ts, query-keys.ts, storage.ts, compare-utils.ts, compare-export.ts
├── types/         # TypeScript 인터페이스
└── middleware.ts  # Supabase 세션 + 관리자 라우트 보호
```

## 커스텀 훅

| 훅 | 역할 |
|---|------|
| `useCrawlProgress` | 매물 크롤링 진행률 — useQuery(crawlStatus, refetchInterval) + invalidateQueries |
| `usePriceCollect` | 실거래가 수집 — useMutation(시작) + useQuery(폴링, 3초 간격, 3분 타임아웃) |
| `useExport` | 엑셀 내보내기 — useMutation 래퍼 |
| `useAdminQuery` | 관리자 쿼리 유틸 — token 비동기 해소 + useQuery/useMutation 래핑 |
| `useFilterParams` | URL searchParams ↔ ArticleFilters 양방향 변환 (필터 URL 공유) |
| `useSmartBack` | 뒤로가기 (이전 페이지 or 홈) |
| `useAdminToken` | 관리자 토큰 접근자 |
| `useSearchHistory` | 검색 히스토리 (localStorage, 최근 10개, 중복 제거) |
| `useFavorites` | 즐겨찾기 단지 (localStorage, 토글 방식) |
| `useCompare` | 단지 비교 목록 (localStorage, 최대 4개) |

## FilterBar 구조 (모듈 분리)

```
components/
├── FilterBar.tsx              # 컨테이너 (143줄) — 훅 + 드롭다운 조합
└── filter/
    ├── reducer.ts             # FilterState, FilterAction, filterReducer, buildInitState
    ├── emitFilters.ts         # buildArticleFilters (State → ArticleFilters 변환)
    ├── FilterSections.tsx     # 7개 드롭다운 섹션 (TradeType/Price/Area/Floor/MoveIn/Room/Detail)
    ├── FilterChips.tsx        # 활성 필터 칩 목록 + 개별 해제
    └── PresetButtons.tsx      # 프리셋 버튼 공통 컴포넌트
```

## Critical Rules

### 1. 인증 패턴
- 항상 `createClient()` from `@/lib/supabase` 사용 (`createBrowserClient` 직접 호출 금지)
- 보호된 API 호출 시 `session.access_token`을 Authorization 헤더로 전달
- middleware.ts에서 `/admin/*` 경로 보호 (role 체크)

### 2. API 호출 패턴 (React Query)
- 모든 데이터 페칭은 `useQuery`/`useMutation` + `api.ts` 함수 조합
- `api.ts`의 `fetchApi()` 래퍼: 타임아웃(15초/120초), 401 자동 로그아웃, Supabase 폴백 내장
- React Query가 요청 중복 제거 + 캐싱 + 자동 재시도 담당
- `queryKeys` (`lib/query-keys.ts`): 모든 쿼리 키 팩토리 (admin 키에 token 미포함)
- `Providers.tsx`: QueryClientProvider + 로그아웃 시 `queryClient.clear()`
- 폴링: `refetchInterval` 옵션 사용 (크롤 상태 3초, 매물 목록 8초, 가격 수집 3초)

### 3. HTML 유효성
- `<table>` 내부에 `<Link>`(`<a>`) 래퍼 사용 금지 (hydration 에러)
- 테이블 행 클릭: `<tr onClick={router.push()}>` 패턴 사용
- 모든 모달: focus trap + ESC 키 닫기 필수

### 4. 컴포넌트 메모이제이션
- `ArticleTable`, `ComplexRow`: `memo()` 적용
- `FilterBar`: `memo()` + useReducer, debounce 500ms (입력), immediate (셀렉트/체크박스)
- `PriceHistoryChart`: `dynamic(() => import(...), { ssr: false })` 동적 임포트

### 5. 타입 안전성
- 프론트 타입(`types/index.ts`) ↔ 백엔드 모델(`db/models.py`) 동기화 유지
- 새 필드 추가 시 양쪽 모두 업데이트 필수
- optional (`?`) 필드에 대해 `??` (nullish coalescing) 사용 (`||` 금지)

### 6. localStorage 패턴
- SSR에서 접근 불가 → 반드시 `"use client"` + `useEffect` 내부에서 읽기
- `lib/storage.ts` 래퍼 사용 (try/catch로 에러 방어)
- 브라우저별 독립 (기기 간 동기화 없음)

---

## UI 패턴

### FilterBar (7개 드롭다운 툴바)
- 거래유형, 가격, 면적, 층수, 입주, 방/욕실, 상세
- **useReducer** 21개 필터 상태 통합 (`filter/reducer.ts`)
- **buildArticleFilters()**: State → API 필터 변환 (`filter/emitFilters.ts`)
- **PresetButtons**: 가격/면적/평당가/관리비 프리셋 버튼 (`filter/PresetButtons.tsx`)
- **FilterChips**: 활성 필터 칩 생성 + 개별 해제 (`filter/FilterChips.tsx`)
- 프리셋 상수: `PRICE_PRESETS`, `AREA_PRESETS`, `MAINTENANCE_PRESETS`, `PPYEONG_PRESETS`
- **useFilterParams**: URL searchParams ↔ 필터 양방향 동기화 (필터 URL 공유)

### 매물유형 뱃지 색상
- `ESTATE_TYPE_COLORS` (constants.ts): 유형별 `bg-*-100 border-*-400 text-*-800`
- 아파트(teal), 아파트분양권(orange), 오피스텔(purple), 오피스텔분양권(pink), 재건축(amber), 재개발(rose)

### 실거래가 추이 (PriceHistoryChart)
- ComposedChart: Line(매매 빨강/전세 파랑) + Area(가격 범위) + 점선(상한/하한)
- 기간 필터: 6개월/1년/2년/전체
- 면적 드롭다운: pyeong_no 기반 필터
- "실거래가 수집" 버튼: 탭 진입 시 자동 트리거 (24시간 TTL)
- usePriceCollect: useMutation(시작) + useQuery(refetchInterval: 3초) → 완료 시 invalidateQueries(priceHistory)

### RegionSelector (네이버 스타일 3컬럼 팝업)
- 트리거 버튼 hover → fixed 팝업 패널 (시/도 | 시/군/구 | 읍/면/동)
- hover로 하위 목록 미리보기, 읍/면/동 선택 시 검색 실행

### 단지 비교 (CompareFloatingBar + CompareCharts)
- 검색 결과 테이블에 "+" 버튼 → useCompare로 localStorage 관리 (최대 4개)
- 하단 플로팅 바에 선택 단지 표시 + "비교하기" 버튼
- /compare 페이지: useQueries로 병렬 조회, 24행 비교 테이블 (평당가 포함) + 우위 판정(★)
- 차트 5종: CompareRadarChart(9축, 평당가 invert), ComparePriceTrendChart, ComparePriceBarChart(매매/전세/월세 ★), CompareFloorChart
- 상세 테이블 3종: 면적별 가격, 관리비, 세대구성
- 인쇄: @media print .no-print + expandAll(아코디언 전체 펼침) + rAF 2회
- 엑셀: xlsx dynamic import + safeCellValue 수식 인젝션 방어 (compare-export.ts)

---

## 페이지별 데이터 흐름

| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/` | `getStats()` + localStorage(히스토리/즐겨찾기) | `/api/stats` |
| `/search` | `searchComplexes()`, `getComplexesByRegion()` + useCompare | `/api/live/search`, `/api/live/region` |
| `/complex/[no]` | `startLiveCrawl()`, `getCrawlStatus()`, `getArticles()`, `getPyeongDetails()`, `getPriceHistory()`, `startPriceCollect()` + useFavoriteStatus | `/api/live/{no}/articles/*`, `/api/complexes/{no}/*`, `/api/live/{no}/price-history/*` |
| `/compare` | `getComplex()` x N + `getPriceStats()` x N (useQueries 병렬, 캐시 공유) + 인쇄/엑셀 | `/api/complexes/{no}`, `/api/complexes/{no}/price-stats` |
| `/login` | Supabase Auth + `/api/users/login-record` | `/api/users/login-record` |
| `/admin` | `getAdminDetailedStats()` | `/api/admin/stats/detailed` |
| `/admin/users` | `getAdminUsers()`, `updateAdminUser()` | `/api/admin/users` |

## 백엔드 영향 체크리스트

프론트엔드 변경 시 아래 확인:
- [ ] 새 API 호출 추가? → `api.ts`에 함수 추가 + 백엔드 라우터 존재 확인
- [ ] 새 타입 필드 사용? → `types/index.ts` + `db/models.py` + `serializers.py` 동기화
- [ ] 인증 필요 엔드포인트? → Authorization 헤더 전달 확인
- [ ] 관리자 전용? → middleware.ts 라우트 보호 확인
