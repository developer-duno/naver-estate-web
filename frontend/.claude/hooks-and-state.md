# 커스텀 훅 + FilterBar 구조

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

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
