# 네이버 아파트 매물 조회 웹

> Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query + Supabase Auth + FastAPI Backend

## 기술 스택

- **프론트엔드**: Next.js 16.1.6, React 19, TypeScript 5, Tailwind CSS 4
- **서버 상태 관리**: React Query (TanStack Query v5) — 캐싱, 중복 제거, 폴링
- **클라이언트 저장소**: localStorage (검색 히스토리, 즐겨찾기, 비교 목록, 미분양 즐겨찾기/비교)
- **지도**: Naver Maps v3 SDK (CDN, vanilla JS + useRef)
- **인증**: Supabase SSR (쿠키 기반 JWT)
- **차트**: Recharts 3 (dynamic import)
- **테스트**: Vitest + @testing-library/react + MSW

## 디렉토리 구조 (2026-05-06 실측)

```
frontend/src/
├── app/           # Next.js App Router (28 페이지, mibunyang/* + tools/* 5종 + admin/* + blog/* 포함)
├── components/    # 재사용 컴포넌트 (admin/18 + filter/6 + mb/20 + article/7 + 루트 23 = 74+ TSX)
├── hooks/         # 커스텀 훅 (21개, useLocalStorageList + useLocalStorageFavorites 제네릭 훅 포함)
├── lib/           # 31개 (api/ 7모듈 + storage/ + format/ + query-keys/ + 도구별 lib(brokerage·acquisition·transfer·property-tax 등))
├── types/         # TypeScript 인터페이스 (estate + Mb* 10개 + naver-maps.d.ts)
├── content/blog/  # MDX 본문 (전세가율 + realestate-calculators + property-tax-guide 등)
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
| `useMbFavorites` | 미분양 즐겨찾기 (localStorage, 최대 200개, useMbFavoriteStatus 포함) |
| `useMbCompare` | 미분양 비교 목록 (localStorage, 최대 4개) |
| `useMbSearchHistory` | 미분양 검색 히스토리 (localStorage, 최근 10개, 중복 제거) |
| `useMbCompareHistory` | 미분양 비교 히스토리 (localStorage, 최대 10개, 자동 저장, ids 정렬 중복 제거) |
| `useMbCompareBookmarks` | 미분양 비교 북마크 (localStorage, 최대 20개, 수동 저장, 이름 지정, isBookmarked) |
| `useMbRadarSettings` | 레이더 차트 설정 영속화 (localStorage, 축 선택+가중치 1-5, toggleAxis/setWeight/applyPreset/reset) |
| `useComplexNote` | 단지 메모 (localStorage, 단지당 500자, 1000개 한도 자동 정리) |
| `useArticleNote` | 매물 메모 (localStorage, 매물당 500자, 1000개 한도 자동 정리) |
| `useArticleFavorites` | 매물 즐겨찾기 (localStorage, useArticleFavoriteStatus 포함, 무제한 토글) |

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

### 5. 관리자 화면 공통 래퍼
- `/admin` 영역에 새 카드형 UI (헤더 + 본문 구조) 추가 시 **반드시 `AdminCard` 컴포넌트 사용**
- Props: `title` (string, required), `children` (ReactNode), `action?` (ReactNode, 헤더 우측 슬롯)
- 외부 여백은 래퍼 div 로 처리 (className prop 도입 금지) — 예: `<div className="mt-6"><AdminCard ...>...</AdminCard></div>`
- 제외 케이스: 타이틀 없는 stat 박스 grid(StatsCards 패턴) 또는 편집모드 분기가 복잡한 카드(settings/page 패턴) 는 AdminCard 부적합. 판단은 `<h3>` 헤더가 자연스러운지 기준

### 6. 타입 안전성
- 프론트 타입(`types/estate.ts`/`analytics.ts`/`progress.ts`/`mibunyang.ts`, `index.ts` 는 barrel) ↔ 백엔드 모델(`db/models.py`) 동기화 유지
- 새 필드 추가 시 양쪽 모두 업데이트 필수
- optional (`?`) 필드에 대해 `??` (nullish coalescing) 사용 (`||` 금지)

### 7. localStorage 패턴
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

### 미분양 비교 (MbCompareFloatingBar + /mibunyang/compare)
- 미분양 테이블에 "+" 버튼 → useMbCompare로 localStorage 관리 (최대 4개)
- 하단 MbCompareFloatingBar: 선택 단지 pill + "비교하기" (2개 이상) + "초기화"
- /mibunyang/compare?ids=id1,id2,... → useQueries 병렬 조회 + 17행 비교 테이블 + 우위★
- 차트 3종: MbCompareRadarChart(13축 정규화 = 기본 9축 + 인프라 4축, 동적 축 선택 칩 최소3개, getAxisChipClass헬퍼, activeAxes useMemo, 종합우위★), MbComparePriceChart(min/max/pp 막대, 최저가★), MbCompareUnsoldChart(다중아파트 추이, 기간필터 6M/1Y/2Y/ALL)
- 인쇄: window.print() + rAF 2회 + no-print 클래스
- URL 복사: navigator.clipboard.writeText + fallback alert
- 단지명→상세 링크: th onClick + router.push
- 엑셀: mb-compare-export.ts (safeCellValue 재사용)
- mb-compare-utils.ts: MB_COMPARE_ROWS(17행), getBestIndices(higher/lower 우위 판정)

### 레이더 가중치 시스템
- useMbRadarSettings: 축 선택 + 가중치(1-5) localStorage 영속화 (mb_radar_settings)
- 프리셋 3종: 균등(모두3)/투자형(전세가율5,주변시세5,할인율5)/실거주형(주차5,세대수4,용적률4)
- 가중 점수: Σ(normalized×weight)/Σ(weight) → 0-100 스케일, "★ 종합 우위: 단지A (78점)"
- 슬라이더: details 접이식 (기본 닫힘, 반응형 grid-cols-1/2/3)
- 축 추가 대응: getMbRadarSettings에서 DEFAULT와 merge → 새 키 자동 기본값

### 미분양 비교 히스토리 + 북마크
- 비교 히스토리: useMbCompareHistory (localStorage, 최대 10개, 비교 진입 시 자동 저장)
- 비교 북마크: useMbCompareBookmarks (localStorage, 최대 20개, 수동 저장, 이름 지정, isBookmarked)
- MbCompareHistory: ComparePill variant(history=회색/bookmark=amber) + PILL_STYLES + title tooltip
- ids 정렬 중복 제거: compareSetKey() (storage.ts export, [...ids].sort().join(","))
- 비교 페이지: 자동 히스토리 저장(useRef guard + idsKey 리셋) + "☆ 저장" 북마크 버튼 + 양쪽 pill UI
- 미분양 메인: 최근 비교(히스토리) + 저장된 비교(북마크) pill 표시 (검색 히스토리 아래)
- 히스토리/북마크 각각 "전체 삭제" 버튼 (onClearBookmarks optional)

### 미분양 즐겨찾기 + 일괄 비교 + 엑셀 + 지도
- 즐겨찾기: useMbFavorites + useMbFavoriteStatus (localStorage, 최대 200개)
- 즐겨찾기 일괄 비교: FavoritesContent 체크박스 선택 (최대 4개) → "선택 비교" → /mibunyang/compare
- 즐겨찾기 정렬: FavSortBy 드롭다운 (추가일순↓/단지명순/지역순, useMemo 클라이언트 정렬)
- MbApartmentTable 액션 열: ★(즐겨찾기) + +(비교) 통합
- 엑셀: mb-export.ts 4개 함수 (apartments/regions/trades/unsoldHistory) + ExportButton (로딩+실패 피드백)
- 지도: MbLocationMap (Naver Maps v3 vanilla SDK, dynamic import, 폴링 기반 SDK 대기, lat/lng null 시 미표시)

### 미분양 중복 제거 (백엔드)
- extract_base_name(): 단지명에서 차수 접미사 제거 ("푸르지오(3차)" → "푸르지오")
- _deduplicate_apartments(): (base_name, region, gu) 그룹에서 마지막 차수만 유지
- get_apartments_page(): 목록+total 단일 쿼리 반환 (기존 get_apartments + count_apartments 통합)
- apartment_to_dict(): name 필드에서 차수 접미사 자동 제거

---

## 페이지별 데이터 흐름 (28 페이지, 카테고리별)

### 매물 영역 (estate)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/` | `getStats()` + localStorage(히스토리/즐겨찾기) | `/api/stats` |
| `/search` | `searchComplexes()`, `getComplexesByRegion()` + useCompare + ComplexSortDropdown | `/api/live/search`, `/api/live/region` |
| `/complex/[no]` | `startLiveCrawl()`, `getCrawlStatus()`, `getArticles()`, `getPyeongDetails()`, `getPriceHistory()`, `startPriceCollect()` + useFavoriteStatus + ComplexNoteButton | `/api/live/{no}/articles/*`, `/api/complexes/{no}/*`, `/api/live/{no}/price-history/*` |
| `/compare` | `getComplex()` x N + `getPriceStats()` x N (useQueries 병렬) + 인쇄/엑셀 | `/api/complexes/{no}`, `/api/complexes/{no}/price-stats` |

### 미분양 영역 (mibunyang)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/mibunyang` | `getMbApartments()`, `getMbUnsold()`, `getMbRegions()`, `getMbTrades()`, `getMbGuList()` (5탭) | `/api/mb/*` |
| `/mibunyang/[id]` | `getMbApartmentDetail()`, `getMbUnsoldHistory()` (5섹션+지도+추이차트) | `/api/mb/apartments/{id}`, `/api/mb/unsold/{id}/history` |
| `/mibunyang/compare` | `getMbApartmentDetail()` x N + `getMbUnsoldHistory()` x N (17행 비교+레이더+막대+추이) | 동일 |

### 도구 5종 (/tools/*) — 모두 클라이언트 산식, BE 호출 없음
| 페이지 | 라이브러리 | 핵심 |
|--------|---------|-------------|
| `/tools/brokerage-fee` | `lib/brokerage*.ts` | 시행규칙 별표1 4종 요율 + 부가세 |
| `/tools/acquisition-tax` | `lib/acquisition-tax*.ts` | standard/multi-house/first-time/officetel/first-time-rejected 5분기 |
| `/tools/area-converter` | inline | 평·㎡ 변환 |
| `/tools/transfer-tax` | `lib/transfer-tax*.ts` | 1주택 비과세·단기·중과·미등기·한시배제 |
| `/tools/property-tax` | `lib/property-tax*.ts` | 재산세+종부세+농특세 (B-1~B-5+법인9종+5종 특례주택) |

### 인증·관리·마케팅·블로그
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/login`, `/signup`, `/verify` | Supabase Auth + `/api/users/login-record` | `/api/users/*` |
| `/admin` (+ /admin/users/scheduler/etc) | `getAdminDetailedStats()`, `getAdminUsers()`, FreshnessCard 등 | `/api/admin/*` |
| `/pricing` | 정적 (B2B 구독 안내) | — |
| `/blog` + `/blog/[slug]` | MDX dynamic import (generateStaticParams + dynamicParams=false) | — |

## 미분양 (mibunyang) 컴포넌트

```
components/mb/
├── MbRegionSelector.tsx        # 시도/시군구 2단계 셀렉터 + 키워드 검색 입력
├── MbApartmentTable.tsx        # 아파트 목록 테이블 (정렬+즐겨찾기★+비교+)
├── MbTradeTable.tsx            # 실거래 테이블 (정렬 가능 헤더: 가격/거래월/면적)
├── MbRegionStatsTable.tsx      # 지역 통계 테이블
├── MbDetailSections.tsx        # 상세 5개 섹션 (개요/분양/주변환경/거래통계/미분양추이)
├── MbUnsoldTrendChart.tsx      # Recharts 미분양 추이 차트 (dynamic import)
├── MbCompareFloatingBar.tsx    # 비교 하단 플로팅 바 (최대 4개, 비교하기 버튼)
├── MbCompareRadarChart.tsx    # 레이더 차트 (13축 정규화 = 기본 9축 + 인프라 4축, 가중치프리셋3종+슬라이더1-5+가중점수, 종합우위★, dynamic import)
├── MbComparePriceChart.tsx    # 분양가 막대 차트 (min/max/pp, 최저가★, dynamic import)
├── MbCompareUnsoldChart.tsx   # 미분양 추이 비교 차트 (ComposedChart, 기간필터 6M/1Y/2Y/ALL, dynamic import)
├── MbLocationMap.tsx           # Naver Maps v3 지도 (vanilla SDK, dynamic import)
├── MbSearchHistory.tsx         # 미분양 검색 히스토리 pill 뱃지 (최근 10개, 클릭→재검색)
└── MbCompareHistory.tsx        # 비교 히스토리+북마크 pill 뱃지 (ComparePill variant, 최근비교+저장된비교)
```

### 미분양 URL 상태 관리
- `useSearchParams` + `useRouter` 직접 사용 (useFilterParams 미사용 — ArticleFilters 전용)
- URL params: `?region=&gu=&tab=&page=&sort_by=&q=`
- 지역 변경 시 sort 유지, page=1 리셋
- 탭 전환 시 apartments/unsold 탭만 keyword 유지, regions/trades/favorites에서 제거
- 즐겨찾기 탭: hasRegion 바이패스 (탭바 항상 표시, 즐겨찾기만 지역 불필요)
- `MB_SORT_OPTIONS` (constants.ts): 7개 정렬 옵션

### localStorage 키 (storage.ts, 총 10개)
| 키 | 용도 | 제한 |
|---|---|---|
| `search_history` | 최근 검색 (키워드/지역) | 최대 10개 |
| `favorite_complexes` | 즐겨찾기 단지 | 무제한 |
| `complex_notes` | 단지 메모 (손님 응대용) | 단지당 500자, 1000개 자동 정리 |
| `article_notes` | 매물 메모 (손님 응대용) | 매물당 500자, 1000개 자동 정리 |
| `favorite_articles` | 매물 즐겨찾기 | 무제한, 토글 방식 |
| `mb_favorites` | 미분양 즐겨찾기 | 최대 200개 |
| `mb_search_history` | 미분양 검색 히스토리 | 최대 10개 |
| `mb_compare_history` | 미분양 비교 히스토리 (자동) | 최대 10개, ids 정렬 중복 제거 |
| `mb_compare_bookmarks` | 미분양 비교 북마크 (수동) | 최대 20개, 이름 지정 가능 |
| `mb_radar_settings` | 레이더 축 선택+가중치 (영속화) | 축 9개, 가중치 1-5 |

## 백엔드 영향 체크리스트

프론트엔드 변경 시 아래 확인:
- [ ] 새 API 호출 추가? → `api.ts`에 함수 추가 + 백엔드 라우터 존재 확인
- [ ] 새 타입 필드 사용? → `types/index.ts` + `db/models.py` + `serializers.py` 동기화
- [ ] 인증 필요 엔드포인트? → Authorization 헤더 전달 확인
- [ ] 관리자 전용? → middleware.ts 라우트 보호 확인
