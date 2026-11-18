# UI 패턴 (8 하위)

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

## FilterBar (7개 드롭다운 툴바)
- 거래유형, 가격, 면적, 층수, 입주, 방/욕실, 상세
- **useReducer** 21개 필터 상태 통합 (`filter/reducer.ts`)
- **buildArticleFilters()**: State → API 필터 변환 (`filter/emitFilters.ts`)
- **PresetButtons**: 가격/면적/평당가/관리비 프리셋 버튼 (`filter/PresetButtons.tsx`)
- **FilterChips**: 활성 필터 칩 생성 + 개별 해제 (`filter/FilterChips.tsx`)
- 프리셋 상수: `PRICE_PRESETS`, `AREA_PRESETS`, `MAINTENANCE_PRESETS`, `PPYEONG_PRESETS`
- **useFilterParams**: URL searchParams ↔ 필터 양방향 동기화 (필터 URL 공유)

## 매물유형 뱃지 색상
- `ESTATE_TYPE_COLORS` (constants.ts): 유형별 `bg-*-100 border-*-400 text-*-800`
- 아파트(teal), 아파트분양권(orange), 오피스텔(purple), 오피스텔분양권(pink), 재건축(amber), 재개발(rose)

## 실거래가 추이 (PriceHistoryChart)
- ComposedChart: Line(매매 빨강/전세 파랑) + Area(가격 범위) + 점선(상한/하한)
- 기간 필터: 6개월/1년/2년/전체
- 면적 드롭다운: pyeong_no 기반 필터
- "실거래가 수집" 버튼: 탭 진입 시 자동 트리거 (24시간 TTL)
- usePriceCollect: useMutation(시작) + useQuery(refetchInterval: 5초, 네이버 IP 차단 방지) → 완료 시 invalidateQueries(priceHistory)

## RegionSelector (네이버 스타일 3컬럼 팝업)
- 트리거 버튼 hover → fixed 팝업 패널 (시/도 | 시/군/구 | 읍/면/동)
- hover로 하위 목록 미리보기, 읍/면/동 선택 시 검색 실행

## 단지 화면 새 틀 (세션 524 B40 PR 1 — 홈과 같은 남색 띠 + 흰 카드 + 주황 대출 판)
- 공통 부품 `components/brand/` 3개: `PageBand`(남색 띠 · eyebrow·h1·설명·단추 자리 · `overlap` = 아래 첫 카드가 걸칠 여백 · `innerClassName` 안쪽 폭, 기본 1160) · `BrandCard`(흰 카드 `rounded-2xl` + 그림자 `rgba(11,31,58,0.14)` · `as="section"`) · `BrandPage`(바탕 `-mb-16 bg-brand-bg pb-16`). 홈 부품(`components/home/**`)은 따로 — 손대지 않는다
- `/complex/[no]` 서버 껍데기: `BrandPage` > `PageBand overlap`(빵부스러기 `tone="navy"` · h1 단지명 · 사실 줄 `bandFactLine` 「1998년 사용승인 · N세대 · N개동」 · 단추 자리 `#complex-title-actions` min-h-11) → `max-w-7xl px-4` 묶음 안 **`-mt-16` 한 곳**(Suspense 묶음 — 어느 상태든 첫 요소 '한눈에 보기'·중개사 접힌 요약이 걸친다) → 가까운 단지(흰 카드). 안쪽 폭은 띠·본문 모두 `max-w-7xl px-4`(중개사 표 폭 그대로)
- 공유 부품은 「고르는 칸」: `ComplexBreadcrumb tone`(기본 = 회색 · 지역 3장은 tone 없이 그대로) · `FavoriteCompareButtons tone`(기본 = 별 글자 · 중개사 머리 그대로). 기본값이 바뀌면 `band-parts.test.tsx`·`ComplexHeader.test.tsx` 가 깨진다
- '한눈에 보기'(`ComplexGlance`): 큰 줄 `glance-headline`(대표 면적 `repAreaRange` · 6개월 없으면 「최근 2년」) · 면적별 표 `glance-areas` 는 면적 2개 이상일 때만 · 사실 칸 3(공시가격·관리비·역 · 홀수면 마지막 칸 두 칸 폭)
- 소비자 화면 순서(휴대폰 = DOM): 머리(뒤로·배지·주소 칩 — 한 줄 요약 없음) → 「최근 거래」(면적 칩·2년 막대·거래 5줄 + 「N건 모두 보기 ▾」, 면적 바꾸면 접힘) → 「2년 동안 어떻게 변했나」 → 대출 판 → 「주변은 어떤가」 → 잠금 카드. lg 는 한 격자 `grid-rows-[repeat(5,auto)_1fr]` 에 대출 판만 `col-start-2 row-start-1 row-span-6`(order 로 뒤집지 않음 · 1fr 행이 판 높이를 받아 펼쳐도 왼쪽 간격 그대로)
- 대출 판(`LoanEstimateSection`): 주황 위쪽 = h2 「이 집을 담보로」 · 큰 줄 `consumer-loan-headline`(= `loanHeadline()` — 결과 칸 굵은 줄과 같은 함수) · 기준 줄 `consumer-loan-target` · 전제 `consumer-loan-basis`·2주택 줄 · 고지 `consumer-loan-notice` · 남색 단추 「내 조건으로 계산하기」/「계산기 접기」. 계산기는 `hidden` 속성(조건부 렌더 아님 — 접힌 단추는 역할 조회에 안 잡혀 시험은 먼저 펼친다). 그래프 색(`MonthBands` #f59e0b·지역 선 #1d4ed8·#d97706·2년 막대 amber)은 비교 장과 같이 쓰므로 그대로

## 단지 비교 (CompareFloatingBar + CompareCharts)
- 검색 결과 테이블에 "+" 버튼 → useCompare로 localStorage 관리 (최대 4개)
- 단지 상세 헤더(ComplexHeader)에 "+ 비교" pill 토글 — 진입점 2곳 (세션 296). /complex 플로팅 바는 printRef 내부라 no-print 래퍼 + 모달보다 DOM 앞 필수 · 소비자 화면은 같은 단추(`FavoriteCompareButtons tone="navy"`)가 남색 띠 안 「☆ 즐겨찾기」「+ 비교」 테두리 단추(44px)로 간다(세션 524)
- 하단 플로팅 바에 선택 단지 표시 + "비교하기" 버튼
- /compare 페이지: useQueries로 병렬 조회, 24행 비교 테이블 (평당가 포함) — 값만 나란히, 맨 아래 출처 각주(data-testid=compare-sources-footer). 우위 판정 ★·초록 강조·범례는 세션 472 PR 3 에 삭제(공인 기준 아님)
- 차트 3종: ComparePriceTrendChart, ComparePriceBarChart(매매/전세/월세 평균), CompareFloorChart — 판정 ★·"최고" 줄 없음. CompareRadarChart(신축도·종합 우위)는 세션 472 PR 3 에 삭제
- 상세 테이블 3종: 면적별 가격, 관리비, 세대구성
- 인쇄: @media print .no-print + expandAll(아코디언 전체 펼침) + rAF 2회
- 엑셀: xlsx dynamic import + safeCellValue 수식 인젝션 방어 (compare-export.ts)

## 미분양 비교 (MbCompareFloatingBar + /mibunyang/compare)
- 미분양 테이블에 "+" 버튼 → useMbCompare로 localStorage 관리 (최대 4개)
- 하단 MbCompareFloatingBar: 선택 단지 pill + "비교하기" (2개 이상) + "초기화"
- /mibunyang/compare?ids=id1,id2,... → useQueries 병렬 조회 + 17행 비교 테이블(값만, 우위★ 없음) + 맨 아래 MbSourcesFooter 출처 각주 (세션 472 PR 3)
- 차트 2종: MbComparePriceChart(min/max/pp 막대, 판정 ★ 없음), MbCompareUnsoldChart(다중아파트 추이, 기간필터 6M/1Y/2Y/ALL, "미분양 최소 ★" 줄 없음). MbCompareRadarChart(레이더·가중치·종합 우위)는 세션 472 PR 3 에 삭제
- 인쇄: window.print() + rAF 2회 + no-print 클래스
- URL 복사: navigator.clipboard.writeText + fallback alert
- 단지명→상세 링크: th onClick + router.push
- 엑셀: mb-compare-export.ts (safeCellValue 재사용)
- mb-compare-utils.ts: MB_COMPARE_ROWS(17행, label+getValue — direction·getBestIndices 는 세션 472 에 삭제) + formatCellValue. 소음 행은 "큰 도로 거리(추정)" = basis-text roadDistanceText

## 레이더 가중치 시스템 — 폐지 (세션 472 PR 3)
- 사장님 결정 ②A "★·종합 점수·가중치 프리셋 전부 제거, 값 + 출처 각주". useMbRadarSettings·MbCompareRadarChart·storage mb_radar_settings 함수 삭제
- 옛 사용자 브라우저에 남은 `mb_radar_settings` 키는 읽는 코드가 없어 무해(지우는 코드는 두지 않음)

## 미분양 비교 히스토리 + 북마크
- 비교 히스토리: useMbCompareHistory (localStorage, 최대 10개, 비교 진입 시 자동 저장)
- 비교 북마크: useMbCompareBookmarks (localStorage, 최대 20개, 수동 저장, 이름 지정, isBookmarked)
- MbCompareHistory: ComparePill variant(history=회색/bookmark=amber) + PILL_STYLES + title tooltip
- ids 정렬 중복 제거: compareSetKey() (storage.ts export, [...ids].sort().join(","))
- 비교 페이지: 자동 히스토리 저장(useRef guard + idsKey 리셋) + "☆ 저장" 북마크 버튼 + 양쪽 pill UI
- 미분양 메인: 최근 비교(히스토리) + 저장된 비교(북마크) pill 표시 (검색 히스토리 아래)
- 히스토리/북마크 각각 "전체 삭제" 버튼 (onClearBookmarks optional)

## 미분양 즐겨찾기 + 일괄 비교 + 엑셀 + 지도
- 즐겨찾기: useMbFavorites + useMbFavoriteStatus (localStorage, 최대 200개)
- 즐겨찾기 일괄 비교: FavoritesContent 체크박스 선택 (최대 4개) → "선택 비교" → /mibunyang/compare
- 즐겨찾기 정렬: FavSortBy 드롭다운 (추가일순↓/단지명순/지역순, useMemo 클라이언트 정렬)
- MbApartmentTable 액션 열: ★(즐겨찾기) + +(비교) 통합
- 엑셀: mb-export.ts 4개 함수 (apartments/regions/trades/unsoldHistory) + ExportButton (로딩+실패 피드백)
- 지도(단일): MbLocationMap (Naver Maps v3 vanilla SDK, dynamic import, 폴링 기반 SDK 대기, lat/lng null 시 미표시) — 단지 상세 1개 마커

## 미분양 지도뷰 — list↔map 토글 + 가격마커 + 인프라 툴바 (세션 315~319)
- **MbViewToggle**: 목록↔지도 보기 토글. localStorage `mb_view_mode` (useMbViewMode 훅). `MAP_ENABLED=false`(constants.ts) 시 토글 미노출 + list 강제 (저장값 map 갇힘 방지)
- **MbClusterMap**: 다중 마커 지도 (현재 페이지 단지 ~50개). 분양/미분양 탭에서 사용. dynamic import(ssr:false). MbLocationMap 패턴 답습(SDK 폴링·에러분기·cleanup) + 다중마커/fitBounds/InfoWindow 확장
  - 좌표 가드 `hasCoords`: lat·lng 둘 다 number + 0,0 제외 (좌표미상 0채움 = 아프리카 앞바다)
  - **가격 말풍선 마커 (세션 318)**: 기본 핀 대신 HTML `icon.content` 말풍선. `markerKind`(presale/competition/unsold) 별로 `markerLabel(apt, kind)`(`lib/mb-marker-label.ts`)이 핵심 지표 표시 — presale=분양가→평당가→단지명 / competition=경쟁률 / unsold=미분양N. 가격 있으면 파랑·없으면 회색. label·apt.name 전부 escapeHtml(XSS)
  - 카메라 우선순위: ① region 선택 → 그 지역 fitBounds(명시 우선) ② region 미선택+GPS → 내 위치 setCenter+zoom 12(`USER_LOCATION_ZOOM`, didCenterOnGpsRef 로 1회만 — 세션 317 점프 가드) ③ 전국 fitBounds 폴백
  - InfoWindow: HTML 문자열 기반이라 단지명 escapeHtml(XSS 회피) + 상세링크는 React 선택카드(MbSelectedCard)가 담당
  - 에러: SDK throw try/catch + `window.navermap_authFailure` 전역 콜백(NCP 인증실패 → 에러 UI, 세션 317)
  - **풀스크린 레이아웃 (세션 318~319)**: 지도탭+지도뷰 시 `page.tsx` `isFullscreenMap`(viewMode=map && MAP_TABS) → `h-[calc(100vh-56px)]`(헤더 h-14=56px) flex 컬럼. TabsContent·탭 root `flex flex-col flex-1 min-h-0`, 카운트행 `flex-none`, 지도 `h-full`로 stretch(고정 calc magic number 제거, 세션 319 B). `className` prop 으로 외부 높이 주입
- **MbMapToolbar (세션 318)**: 지도 우상단 세로 토글 5종(학군·교통·안전·대기질·어린이집, lucide 아이콘). `active: ToolbarLayer|null` + `onChange`(재클릭 시 null=해제). role=toolbar, aria-pressed
- **MbInfraOverlay (세션 318~319)**: 선택카드 children 슬롯에 활성 레이어 인프라 표시. 데이터 흐름 = **목록 API(apartment_to_dict)는 평탄 필드만 → 교통·대기질(3년 평균, 세션604)·어린이집(중첩 infra/school/transport)은 빈정보였음 → 세션 319 A 로 마커 클릭 시 `getMbApartmentDetail(id)` lazy fetch(`useQuery`, selected 있을 때만 enabled, 5분 캐시)해 중첩객체 채움.** 도착 전 평탄 폴백(학군 도보분·안전 등급) 즉시 표시, 로딩/에러 분기. 안전등급 "N등급 (1=안전)"(단지 등급만 — 우리 지역 범죄 등급 `infra.crime_grade` 는 세션 472 에 뺐다, 인구 없는 지역 중앙값 채움 · 행정안전부 지역안전지수 대체는 PR 4). dist 1000m↑ = km
- **미분양 상세 지표 = 값 + 기준·출처 한 줄 (세션 472)**: 옛 막대 14종(`MetricBar`·`metric-bar-configs.ts`·`Mb*Bar.tsx`, 2026-05 DB 분위수 문턱 + "적정/주의/위험" 라벨)은 삭제. `components/mb/basis-text.ts`(순수 함수·법령/통계 문구 상수) → `MbDetailSections`·`MbEnvironmentSection` 의 `InfoRow basis` 칸(값 아래 작은 회색 글, 값 없으면 안 보임). 대기질은 PM2.5 값 + 국가 기준 15㎍/㎥ 이하/초과 글자만(등급 뱃지 삭제 — 지도 오버레이 AirInfo 도 같음, PM2.5 없으면 정보 없음), 소음 dB 는 "큰 도로 거리(추정)" 구간으로, 우리 범죄 점수·지역 등급 칸 삭제. 페이지 맨 끝 `MbSourcesFooter`(출처 묶음 한 단락). 새 문구의 조항·수치는 `memory/reviews/review-s471-std-*.md` 에서만
- **MbSelectedCard**: 마커 클릭 시 선택 단지 요약+상세보기 (InfoWindow router.push 불가 회피용 React 카드). 부모가 `selected && items.some(id 일치)` 가드로 stale 선택 방지. 풀스크린 시 지도 위 absolute 좌하단 오버레이로 띄워 overflow-hidden 클립 회피(세션 319 B). 툴바 켰는데 selected 없으면 "단지를 선택하면 정보가 표시됩니다" 안내(세션 319 E)
- **useGeolocation**: 접속자 GPS 1회 조회 (getCurrentPosition, enabled 게이트, SSR·타임아웃·거부 안전, status 4종). region 미선택 시 지도 "내 위치" 줌 (지역선택 > GPS > 전국 폴백, Permissions-Policy geolocation=(self) 필요). 분양 탭만 전달(전국조회), 미분양·미분양단지 탭은 지역선택 전제라 미전달(의도된 설계)

## 헤더 메뉴 (Header.tsx `navLinks`)
- 순서 = 홈 · 미분양 · **중개 실무**(`/broker`, 세션 511) · 블로그 · 도움말 · [관리] + 계산기 ▾ 드롭다운. PC nav 와 휴대폰 드로어가 같은 `navLinks` 배열을 쓴다 — 회귀 = `components/__tests__/Header.test.tsx`(메뉴 경로 집합·「중개 실무」 순서) + e2e 헤더 좁은 스냅샷 `header-public-desktop.png`(메뉴를 바꾸면 CI 재촬영)
- **메뉴를 한 칸 더 늘리기 전에**: ① 768px 에서 관리자 로그인(관리 메뉴 + 뱃지 + 내 계정·로그아웃이 다 붙는 최악) 헤더 넘침을 playwright 로 먼저 잰다 — 세션 511 실측 여유 24px(중개사 계정 64px)라 한 칸이면 넘친다 ② PC 기준 그림은 헤더가 들어간 장이 전부 바뀐다(세션 511 = 15장 · 휴대폰 0장 — 닫힌 햄버거뿐) → CI dispatch 재촬영을 PR 일정에 넣는다

## 홈/검색 통합 (SearchExperience + ActiveFilterChips) — 세션 314
- **SearchExperience**: 검색 경험 공용 컴포넌트 (입력=매물유형/필터/검색창/지역 + 결과=단지목록/비교/정렬). 홈(`/`)과 옛 `/search` 가 공유 — `/search` 는 `/` 로 리다이렉트(쿼리 보존)
  - 매물유형 탭 기본 선택 = **아파트만**(`DEFAULT_ESTATE_TYPES`, 사장님 결정 2026-10-11) · 선택은 URL `types` 로만 전달(기기 기억 없음 · 기본값이면 URL·서버 모두 types 미전달, 6개 전부여도 URL 에 씀) · 보이는 결과 5개 미만이고 탭에 가려진 단지가 있으면 **HiddenTypesHint** 한 줄("숨긴 유형: 오피스텔 12 · … [모두 보기]")
- **ActiveFilterChips**: 적용 조건 한글 칩 요약 (결과 화면에서 "지금 무슨 조건인지"). urlFilters(ArticleFilters) + 매물유형 narrowing(estateTypeLabels) → 칩, ✕ 클릭 시 개별 해제. 핵심 조건만(YAGNI). verified_only 칩 라벨 "인증매물만"(FilterChips·FilterSections 와 통일, 세션 317)
- **검색 결과 새 틀(세션 525 · B40 PR 2a)**: 얇은 남색 띠 `components/search/SearchBand`(검색창 값 = 주소 `q` · 칩 줄 「지역으로 찾기 ▾」(흰 판 RegionSelector) · 유형 칩(흰 판 EstateTypeTabs · 글자 = 고른 유형 「·」 잇기) · 정렬 칩 `ComplexSortDropdown tone="navy"`) — 유형·정렬 칩은 모든 상태에서 누구나 → 제목 줄 h1 「래미안」 단지 N곳 / 지역 「서울특별시 강남구 단지 N곳」 / 받는 중·옛 결과 표시 중(`isPlaceholderData`) 「…검색 중」 / 오류 「…검색 결과」 + 비로그인 안내 한 줄 + 오른쪽 목록/지도 → 목록 `components/search/SearchResults`(20곳씩 「더 보기 · n / N」 · 펼친 수 = sessionStorage `search_shown_v1` 에 목록 이름(검색어·지역·유형·정렬)별 · 지도 보기 때도 목록은 붙여 둔 채 숨김). 매물수 칸·카드 셋째 줄은 **자료에 매물 수가 있을 때만**(비로그인은 칸째 없음 · 빈 값은 빈칸, 「-」 안 씀). 「조건 수정」·적용 조건 칩·즐겨찾기 매물 링크 = 로그인 확정(`isLoggedIn === true`)만 · 매물 필터 막대는 「조건 수정」을 눌렀을 때만(모든 상태). 검색어 없는 갈래(renderEmpty 없을 때 — 시험에서만)는 옛 탭·필터 그대로. 회귀 = `components/search/__tests__/{SearchResults,SearchExperience.b40}.test.tsx`·`app/__tests__/home-search-hero.test.tsx`
- **홈 칸 + 푸터 둘러보기 (세션 508 홈 개편 — 옛 세션 458 소개 섹션·「무료로 시작하기」는 없어짐)**: 남색 머리 `components/home/HomeHero`(h1·설명 — 세션 525 부터 `HomeSections` 맨 위, 검색 결과 화면엔 없음) + `HomeSections`(검색창 → 대출 판 `HomeLoanPanel` → 지역 17곳 `HomeRegionLinks` → 지역 시세 흐름 `HomeRegionTrend` → 계산기 모음 `HomeToolCards` 6칸 → 즐겨찾기 `HomeFavorites` → 가이드 `HomeGuide` 3편). `HomeSections` 는 Suspense 대기 화면(정적 GET 검색창·즐겨찾기/차트 자리만 · `HomeFallback`)과 `SearchExperience renderEmpty` 가 같이 그린다. 색은 globals.css `brand-*` 토큰만. 회귀 = `app/__tests__/home-intro-cta.test.tsx`·`components/home/__tests__/`. `Footer.tsx` 에 `<nav aria-label="둘러보기">`(계산기 6종 /tools · 블로그 /blog) — 공개 페이지 내부 링크 경로

### 검색 결과 지도뷰 (SearchClusterMap) — FEATURE_BACKLOG 항목1, 2026-08-02 (세션 351 클러스터링 엔진 교체로 mb 와 분기)

- **vanilla JS 지도 인스턴스 관리는 MbClusterMap 과 동일**: 최초(세션 348)에는
  `react-naver-maps` 패키지를 썼으나, 라이브 검증에서 언마운트 시 `instance.destroy()` 가
  SDK 내부 참조 비어 크래시(→ 검색 화면 전체가 500) 하는 것이 드러나 폐기. 지금은 mb 쪽과
  같은 vanilla JS(SDK 폴링·수동 마커) 패턴 — 지도 인스턴스를 **절대 destroy 하지 않고**
  언마운트 시 ref 만 비우고 마커만 `setMap(null)` 로 뗀다. `window.navermap_authFailure`
  는 직접 등록. **이 공통 패턴은 여기까지 — 클러스터링 엔진 자체는 세션 351 부터 갈린다
  (아래 ⚠ 참고).**
- ⚠ **클러스터링 엔진 비대칭 (세션 351)**: `SearchClusterMap` 은 `mapbox supercluster`
  (npm, ISC), `MbClusterMap` 은 네이버 SDK 기본 `Marker`(클러스터링 없음, 마커를 그냥
  개별로 얹음) — **두 컴포넌트는 이제 같은 클러스터링 버그를 공유하지 않는다.** "형제
  컴포넌트라 같은 패턴일 것"이라 가정하고 한쪽만 고치면 안 됨. 검색 지도뷰는 처음에 네이버
  공식 `MarkerClustering.js`(Apache 2.0)를 벤더링해 썼으나, ① 마커마다 기존 클러스터
  전체를 훑는 O(N×C) 최근접 탐색 ② idle 마다 전체 마커 DOM 재생성 구조라 단지 500개에서
  지도 탭 INP **3,212ms** 가 라이브로 실측됨(세션 350). `supercluster` 로 교체 — KD-tree
  인덱스라 같은 계산이 ms 단위이고, `getClusters(bbox, zoom)` 로 **화면에 보이는 것만**
  마커로 만들어 DOM 개수도 보통 10~30개로 유지된다. 벤더 파일(`lib/naver-marker-clustering.ts`,
  811줄)은 삭제. 클러스터 클릭 확대는 `getClusterExpansionZoom()`(정확한 분리 줌 계산).
  **잔여 병목**: supercluster 교체 후에도 지도 탭 INP 는 2,647ms 로만 줄어 라이브 트레이스를
  함수 단위로 추적한 결과 진범은 목록(500행) React 언마운트 비용(removeChild 1,477ms +
  커밋 트리 순회 1,147ms) — `SearchExperience.tsx` 에서 목록↔지도 전환 시 목록을 언마운트
  하지 않고 CSS `hidden`(display:none) 으로만 숨기도록 전환해 최종 **64~96ms** 로 소멸
  (세션 350 의 "클러스터링이 3.2초" 진단은 부분 오진이었다 — 목록 해체 2.6 + 클러스터링 0.6).
- **idle 이벤트 트리거 위치도 갈린다**: `SearchClusterMap` 은 최초 마운트 시 `idle` 트리거를
  **명시 호출로 대체**해 제거했다(supercluster 로 렌더를 직접 호출하므로 idle 발화 여부에
  더 이상 의존하지 않음 — 세션 349 의 우회 자체가 불필요해짐). 반대로 `MbClusterMap` 은
  세션 351 에서 **idle 트리거를 신규로 추가**했다(page.tsx 와 부모 컴포넌트가 지도 보기
  상태를 독립적으로 들고 있어, 부모의 풀스크린 높이 클래스가 실제 레이아웃에 반영되기 전에
  지도가 생성되면 컨테이너가 0~1px 로 굳는 결함 — `requestAnimationFrame` 으로 다음 프레임에
  `naver.maps.Event.trigger(map, "idle")`). **resize 트리거는 이 프로젝트에서 이미 실측으로
  무효로 확인됨** — resize·idle 둘 중 뭘 쓸지 헷갈리면 idle 만 유효.
- **완전 지연 로드**: `SearchClusterMap`은 `next/dynamic(() => import(...), {ssr:false})`
  로 `SearchExperience.tsx`에 통합 — 지도 뷰를 안 쓰는 사용자(대부분 목록만 사용)는 지도
  SDK·클러스터링 코드를 전혀 받지 않는다(사장님 "지도가 속도를 느리게 한다" 우려 반영).
  `search_view_mode`(localStorage, `useSearchViewMode` 훅)는 `mb_view_mode` 와 물리적으로
  분리된 키 — 미분양 탭에서 "지도"로 둬도 검색 결과가 강제로 지도로 안 열림.
- **비로그인/승인대기 노출**: 목록(`ComplexRow`/`ComplexCardMobile`)이 이미 비로그인·
  승인대기 사용자에게 보이므로(안내 문구만 위에 얹는 구조), 지도도 동일하게 노출 — 별도
  게이트 없음(막으면 오히려 목록/지도 간 일관성이 깨짐). 단, 마커→선택카드→상세페이지
  (`/complex/[no]`) 진입은 `proxy.ts` `AUTH_REQUIRED_PATHS` 로 로그인 필수 — 비로그인
  클릭 시 `/login` 리다이렉트는 의도된 설계(버그 아님, 세션 351 확인).
  ⚠ 2026-10-26 공개 전환(사장님 결정) — 비로그인은 공공 자료·우리 지표만, 네이버 매물·호가는 로그인 뒤. robots·noindex 차단은 서버 렌더 PR 까지 임시 — 단지 화면은 이제 비로그인도 열린다(`AUTH_REQUIRED_PATHS` = `/verify` 만), 네이버 매물 자리는 잠금 카드.
- **마커 클릭**: InfoWindow 는 여전히 HTML 문자열 기반이라 React 라우팅 불가(mb 와 동일
  제약) — 클릭 시 `onSelect(complex)` 콜백으로 부모(`SearchExperience`)가 지도 위 absolute
  오버레이로 `ComplexCardMobile`을 얹어 비교 담기 등 기존 기능 그대로 재사용.

> **미분양 중복 제거 (백엔드 로직)**: `backend/.claude/details.md` §미분양 중복 제거 참조 (extract_base_name / _deduplicate_apartments / get_apartments_page / apartment_to_dict).
