# 페이지별 데이터 흐름 + 미분양 컴포넌트

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

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

> 상세 = `frontend/.claude/tools-lineup.md` §/tools 도구 5종 라인업 참조

### 인증·관리·마케팅·블로그
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/login`, `/signup`, `/verify` | Supabase Auth + `/api/users/login-record` | `/api/users/*` |
| `/admin` (+ /admin/users/scheduler/etc) | `getAdminDetailedStats()`, `getAdminUsers()`, FreshnessCard 등 | `/api/admin/*` |
| `/pricing` | 정적 (B2B 구독 안내) | — |
| `/blog` + `/blog/[slug]` | 라인업 = `.claude/BLOG.md` (단일 진실 공급원) | — |

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
├── MbLocationMap.tsx           # Naver Maps v3 단일마커 지도 (단지 상세, vanilla SDK, dynamic import)
├── MbClusterMap.tsx            # 다중마커 지도 (분양/미분양 탭 list↔map 토글, fitBounds, InfoWindow+선택카드, dynamic import)
├── MbViewToggle.tsx            # 목록↔지도 보기 토글 (mb_view_mode localStorage, MAP_ENABLED 시만 노출)
├── MbSelectedCard.tsx          # 지도 마커 클릭 시 선택 단지 요약+상세보기 (InfoWindow XSS 회피용 React 카드)
├── MbSearchHistory.tsx         # 미분양 검색 히스토리 pill 뱃지 (최근 10개, 클릭→재검색)
└── MbCompareHistory.tsx        # 비교 히스토리+북마크 pill 뱃지 (ComparePill variant, 최근비교+저장된비교)
```

### 미분양 URL 상태 관리
- `useSearchParams` + `useRouter` 직접 사용 (useFilterParams 미사용 — ArticleFilters 전용)
- URL params: `?region=&gu=&tab=&page=&sort_by=&q=`
- 지역 변경 시 sort 유지, page=1 리셋
- 탭 전환 시 apartments/unsold 탭만 keyword 유지, regions/trades/favorites에서 제거
- 즐겨찾기 탭: hasRegion 바이패스 (탭바 항상 표시, 즐겨찾기만 지역 불필요)
- `MB_APT_SORT_OPTIONS` 7개 + `MB_TRADE_SORT_OPTIONS` 5개 (lib/mb-sort-options.ts, BE mb.py Literal verbatim 짝꿍): 모바일 MbSortSelect 옵션 + 탭 전환 whitelist derive 공용 (세션 296)
