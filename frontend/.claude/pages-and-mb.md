# 페이지별 데이터 흐름 + 미분양 컴포넌트

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

## 페이지별 데이터 흐름 (28 페이지, 카테고리별)

### 매물 영역 (estate)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/` (홈=검색 통합, 세션 314) | `getStats()` + **SearchExperience**(검색창/매물유형/필터/지역 → 결과) + localStorage(히스토리/즐겨찾기) | `/api/stats`, `/api/live/search`, `/api/live/region` |
| `/search` → `/` 리다이렉트 | SearchExperience 공용 — 옛 `/search` 는 쿼리 보존하며 홈으로 redirect (직접 링크 6곳 잔존) | (동일) |
| `/complex/[no]` | `startLiveCrawl()`, `getCrawlStatus()`, `getArticles()`, `getPyeongDetails()`, `getPriceHistory()`, `startPriceCollect()` + useFavoriteStatus + ComplexNoteButton | `/api/live/{no}/articles/*`, `/api/complexes/{no}/*`, `/api/live/{no}/price-history/*` |
| `/compare` | `getComplex()` x N + `getPriceStats()` x N (useQueries 병렬) + 인쇄/엑셀 | `/api/complexes/{no}`, `/api/complexes/{no}/price-stats` |

### 미분양 영역 (mibunyang)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/mibunyang` | `getMbApartments()`, `getMbUnsold()`, `getMbRegions()`, `getMbTrades()`, `getMbGuList()` + **분양 3종** `getMbPresale()`·`getMbCompetition()`·분양결과 (탭: 미분양단지/미분양만/지역통계/실거래/즐겨찾기 + **분양**[민간분양·LH공공분양·분양결과], 세션 314) + **list↔map 토글**(세션 315) | `/api/mb/*`, `/api/mb/presale`, `/api/mb/competition` |
| `/mibunyang/[id]` | `getMbApartmentDetail()`, `getMbUnsoldHistory()` (5섹션+지도+추이차트) | `/api/mb/apartments/{id}`, `/api/mb/unsold/{id}/history` |
| `/mibunyang/compare` | `getMbApartmentDetail()` x N + `getMbUnsoldHistory()` x N (17행 비교+레이더+막대+추이) | 동일 |

### 도구 5종 (/tools/*) — 모두 클라이언트 산식, BE 호출 없음

> 상세 = `frontend/.claude/tools-lineup.md` §/tools 도구 5종 라인업 참조

### 인증·관리·마케팅·블로그
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/login`, `/signup`, `/verify` | Supabase Auth + `/api/users/login-record` | `/api/users/*` |
| `/admin` (+ /admin/users/scheduler/etc) | `getAdminDetailedStats()`, `getAdminUsers()`, FreshnessCard 등 | `/api/admin/*` |

> **관리자 화면 구조(세션 419, PR #584 — 리뉴얼 A2·A3·A4)**: `/admin` 대시보드는 세로 한 열 **4층**이다 —
> ① 지금 상태(`HealthSummary` 한 줄 + `RunningJobsLine` 실행 중 작업 15초 갱신) / 이번 주 챙길 일 ② 숫자(`StatsCards compact` 4칸 + `QuotaStatusCard`)
> ③ 원인 5절(`AdminSection` = `<details>` 기반, 기본 접힘, **펼쳤을 때만 안쪽 렌더 = 접힌 동안 API 0**, `#id` 해시로 자동 열림: 자동 작업 현황·데이터 신선도·실패 자세히·네이버 호출·방문·요청 통계)
> ④ 작업(`BulkRecrawlCard` 전폭) + 최근 활동. 옛 3열(좌 `AdminLeftNav` 목차·우 `AdminLivePanel`)은 삭제됐다(경위 = `docs/archive/superpowers/2026-05-28-pr-6e-admin-dashboard-3column-design.md` 머리 주석).
> `AdminCard` 의 `help` 는 ⓘ 버튼(`aria-label="설명 보기"`) 토글로 기본 숨김 — 문구는 그대로 보존. 24시간 오류·채워진 비율·가치 점수는 `/admin/data` "숫자 자세히 보기" 로 이동.
> 하위 화면 규칙: 필터는 **목록 카드 헤더(`AdminCard action`)** 에 둔다(크롤·사용자·감사 로그·달력 통일) · 되돌릴 수 없는 조작(정지·거부·관리자 승격·크롤 취소)은 `window.confirm` + 무엇이 바뀌는지 한 줄 · 개발자 원문(job_type·영어 오류·ms·4xx)은 본문에 두지 않고 `title` 로만.
> 작업 이름 사전 `src/lib/crawl-job-labels.ts` 의 `label` 은 BE `crawler/plain_words.py JOB_WORDS` 와 **글자까지 동일**해야 한다(가드 `crawl-job-labels-sync.test.ts` 가 BE 파일을 읽어 대조). 시각 회귀 baseline 4장(dashboard·data·users·settings)은 이 배치 기준(CI run 36156873895) — settings 장은 아래 설정 삭제로 제거됐다.
> **탭 6개(세션 419, 2026-09-26 사장님 결정)**: 대시보드·사용자·**자료 수집**(옛 "크롤링", `/admin/crawl`)·**수집 일정**(옛 "캘린더", `/admin/scheduler-calendar`, 제목 "수집 일정표")·데이터·감사 로그. 옛 **"설정" 탭(`/admin/settings`)은 삭제됨** — `admin_settings` 값을 읽는 백엔드 코드가 없어 저장해도 아무것도 바뀌지 않는 화면이었다. API(`GET /api/admin/settings`·`PATCH /api/admin/settings/{key}`)도 함께 삭제, 표(`AdminSetting`)는 기록 보존용으로 남김, 감사 로그 `admin_setting_update` 라벨은 과거 기록 표시용으로 유지.
>
> **외부 자료 버튼(2026-09-26 사장님 결정)**: `CollectorTrigger`("외부 자료 지금 받아오기")는 대시보드가 아니라 **`/admin/crawl` 요약 아래·실패 분포 위**에 있다. 버튼 **8종** = BE `routers/admin/collect.py` `CollectorName` 전부(정본 `lib/admin/collectors.ts`, 집합 일치 가드 `lib/admin/__tests__/collectors.test.ts`), 이름은 `crawl-job-labels`(=JOB_WORDS). 버튼마다 scheduler-status 의 마지막 실행 한 줄(backfill-price·metrics 는 수동 실행에 잡 id 가 안 붙어 "마지막 자동 실행"), 도는 중이면 잠금. 오래 걸리는 4종(관리비 2·어린이집·옛 시세)은 확인창 + 10초 뒤 "시작했어요"(BE 가 동기라 화면 120초 한도 뒤엔 실패로 보이지만 서버는 계속 돈다).
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
├── MbCompareHistory.tsx        # 비교 히스토리+북마크 pill 뱃지 (ComparePill variant, 최근비교+저장된비교)
├── MbPresaleTab.tsx            # 분양 탭 (민간분양/LH공공분양/분양결과 세그먼트, list↔map 토글, 세션 314~315)
├── MbPresaleTable.tsx          # 분양 단지 목록 테이블 (시공사·분양일정·정렬)
├── MbCompetitionTable.tsx      # 청약 경쟁률 테이블 (분양결과 세그먼트)
├── MbScheduleTimeline.tsx      # 청약 일정 타임라인 (차수별, 상세 페이지)
└── MbUnitSupplyTable.tsx       # 평형별 공급+특공 세분화 (상세 페이지)
```

> 지도 3종(MbClusterMap·MbViewToggle·MbSelectedCard)·useGeolocation 상세 = `frontend/.claude/ui-patterns.md` §미분양 지도뷰 참조.

### 미분양 URL 상태 관리
- `useSearchParams` + `useRouter` 직접 사용 (useFilterParams 미사용 — ArticleFilters 전용)
- URL params: `?region=&gu=&tab=&page=&sort_by=&q=`
- 지역 변경 시 sort 유지, page=1 리셋
- 탭 전환 시 apartments/unsold 탭만 keyword 유지, regions/trades/favorites에서 제거
- 즐겨찾기 탭: hasRegion 바이패스 (탭바 항상 표시, 즐겨찾기만 지역 불필요)
- `MB_APT_SORT_OPTIONS` 7개 + `MB_TRADE_SORT_OPTIONS` 5개 (lib/mb-sort-options.ts, BE mb.py Literal verbatim 짝꿍): 모바일 MbSortSelect 옵션 + 탭 전환 whitelist derive 공용 (세션 296)
