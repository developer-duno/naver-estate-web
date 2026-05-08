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
- usePriceCollect: useMutation(시작) + useQuery(refetchInterval: 3초) → 완료 시 invalidateQueries(priceHistory)

## RegionSelector (네이버 스타일 3컬럼 팝업)
- 트리거 버튼 hover → fixed 팝업 패널 (시/도 | 시/군/구 | 읍/면/동)
- hover로 하위 목록 미리보기, 읍/면/동 선택 시 검색 실행

## 단지 비교 (CompareFloatingBar + CompareCharts)
- 검색 결과 테이블에 "+" 버튼 → useCompare로 localStorage 관리 (최대 4개)
- 하단 플로팅 바에 선택 단지 표시 + "비교하기" 버튼
- /compare 페이지: useQueries로 병렬 조회, 24행 비교 테이블 (평당가 포함) + 우위 판정(★)
- 차트 5종: CompareRadarChart(9축, 평당가 invert), ComparePriceTrendChart, ComparePriceBarChart(매매/전세/월세 ★), CompareFloorChart
- 상세 테이블 3종: 면적별 가격, 관리비, 세대구성
- 인쇄: @media print .no-print + expandAll(아코디언 전체 펼침) + rAF 2회
- 엑셀: xlsx dynamic import + safeCellValue 수식 인젝션 방어 (compare-export.ts)

## 미분양 비교 (MbCompareFloatingBar + /mibunyang/compare)
- 미분양 테이블에 "+" 버튼 → useMbCompare로 localStorage 관리 (최대 4개)
- 하단 MbCompareFloatingBar: 선택 단지 pill + "비교하기" (2개 이상) + "초기화"
- /mibunyang/compare?ids=id1,id2,... → useQueries 병렬 조회 + 17행 비교 테이블 + 우위★
- 차트 3종: MbCompareRadarChart(13축 정규화 = 기본 9축 + 인프라 4축, 동적 축 선택 칩 최소3개, getAxisChipClass헬퍼, activeAxes useMemo, 종합우위★), MbComparePriceChart(min/max/pp 막대, 최저가★), MbCompareUnsoldChart(다중아파트 추이, 기간필터 6M/1Y/2Y/ALL)
- 인쇄: window.print() + rAF 2회 + no-print 클래스
- URL 복사: navigator.clipboard.writeText + fallback alert
- 단지명→상세 링크: th onClick + router.push
- 엑셀: mb-compare-export.ts (safeCellValue 재사용)
- mb-compare-utils.ts: MB_COMPARE_ROWS(17행), getBestIndices(higher/lower 우위 판정)

## 레이더 가중치 시스템
- useMbRadarSettings: 축 선택 + 가중치(1-5) localStorage 영속화 (mb_radar_settings)
- 프리셋 3종: 균등(모두3)/투자형(전세가율5,주변시세5,할인율5)/실거주형(주차5,세대수4,용적률4)
- 가중 점수: Σ(normalized×weight)/Σ(weight) → 0-100 스케일, "★ 종합 우위: 단지A (78점)"
- 슬라이더: details 접이식 (기본 닫힘, 반응형 grid-cols-1/2/3)
- 축 추가 대응: getMbRadarSettings에서 DEFAULT와 merge → 새 키 자동 기본값

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
- 지도: MbLocationMap (Naver Maps v3 vanilla SDK, dynamic import, 폴링 기반 SDK 대기, lat/lng null 시 미표시)

> **미분양 중복 제거 (백엔드 로직)**: `backend/.claude/details.md` §미분양 중복 제거 참조 (extract_base_name / _deduplicate_apartments / get_apartments_page / apartment_to_dict).
