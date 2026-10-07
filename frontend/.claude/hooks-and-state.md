# 커스텀 훅 + FilterBar 구조

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

## 커스텀 훅

| 훅 | 역할 |
|---|------|
| `useCrawlProgress` | 매물 크롤링 진행률 — useQuery(crawlStatus, refetchInterval) + invalidateQueries |
| `usePriceCollect` | 실거래가 수집 — useMutation(시작) + useQuery(폴링, 5초 간격, 3분 타임아웃 = 36회 × 5초, 네이버 IP 차단 방지) |
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
| `useArticleFavorites` | 매물 즐겨찾기 (localStorage, useArticleFavoriteStatus 포함, 무제한 토글) |
| `useAdminUserMap` | 관리자 사용자 id ↔ 이메일 매핑 (jobs/logs 표 출력용) |
| `useComplexPrefetch` | 단지 hover 200ms 후 complex + articles prefetch (검색 결과 성능) |
| `useCrawlAction` | 단지 페이지 크롤 트리거(마운트 자동 1회 + "데이터 갱신" 수동) + `crawl-status` **2초 폴링**(`cache:"no-store"` — 서버도 `no-store`; 폴링 응답이 브라우저에 3시간 캐시돼 완료를 영영 못 보던 결함, #466 세션 395) + terminal(done/done_partial/error/idle) 수신 시 메시지. 진행·완료·오류 안내는 `CrawlMessage` 가 "매물 N건" 줄 안 버튼 옆 한 줄로 그린다(표를 밀지 않음, 세션 447). **저장본 나이로 나눈다** — 크롤 시작 순간 `complex.last_crawled_at` 이 24시간 이하면 새 자료: 끝나도 표 쿼리는 다시 받지 않고(`refetchType:"none"`, 받는 동안 중간 갱신도 카드 쿼리만) 같은 조건으로 따로 받아 `lib/article-list-diff.ts` 로 비교 → 바뀌었으면 "데이터 갱신" 자리가 "새 매물 반영 (N건 바뀜)" 버튼(`pendingRefresh`·`applyPendingRefresh`). 24시간 초과·값 없음이면 낡은 자료: 받는 동안 표 흐림 + "5일 전 자료예요 · …" 안내, 끝나면 refetchComplexQueries 로 자동 교체, 실패하면 "5일 전 자료예요 — 지금은 새로 못 받았어요". **판정 칸 = `articles_crawled_at`**(우리가 매물 목록을 끝까지 받은 시각 — `last_crawled_at` 은 다른 수집기가 지도 단지 전부에 찍어 기준이 아니다, 세션 448 · 헤더 "매물 업데이트" 배지도 이 칸, 없으면 배지 안 그림 · cached/started 응답의 값도 캐시에 주입). **already_running** 이면 이 화면에 폴링이 없을 때만 `startPolling()`(interval 중복 금지) — 끝나면 흐림·나이 안내가 풀린다(세션 448). **cached** 는 응답의 `articles_crawled_at` 으로 다시 판정 — 새 자료면 "N분 전 갱신됨" + 다시 받기, 낡은 자료(초과·없음)면 표·카드 다시 받지 않고 빨강 "5일 전 자료예요 — 지금은 새로 못 받았어요"(× 로 닫을 때까지, 세션 448) |
| `useSessionToken` | Supabase 세션 토큰 + `tokenReady` — `getSession()` 1회 + **`onAuthStateChange` 구독**으로 1시간 주기 토큰 갱신을 반영(구독 먼저 등록, 늦게 끝난 getSession 의 stale 토큰은 무시 — 세션 395 후속 PR). 승인 전용 API(`getArticles`·`getPriceStats`·`getPyeongDetails` 등) 호출부는 **반드시** 이 토큰을 넘기고 `enabled: tokenReady` 로 게이트. `page.tsx` 와 `ArticleDetail`(모달, 자식 MarketPosition·CompetingListings·MaintenanceCost 까지 props 전달 — #467 세션 395: 모달만 누락돼 B2 게이트 이후 항상 401 이던 결함) |
| `useLocalStorageFavorites` / `useLocalStorageList` | 즐겨찾기·리스트 제네릭 훅 (위 useFavorites·useSearchHistory 등의 베이스) |
| `useMbViewMode` | 미분양 탭 목록↔지도 보기 (localStorage mb_view_mode, MAP_ENABLED=false 시 list 강제 — 세션 315) |
| `useGeolocation` | 브라우저 현재 위치(GPS) 1회 조회 (enabled 게이트, SSR·타임아웃·거부 안전, status 4종 — 미분양 지도 "내 위치" 줌, 세션 316) |

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
