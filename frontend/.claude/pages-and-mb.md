# 페이지별 데이터 흐름 + 미분양 컴포넌트

> 본 파일은 명시 참조 자료. 진입점 = `frontend/CLAUDE.md` §토픽 인덱스.

## 페이지별 데이터 흐름 (28 페이지, 카테고리별)

### 매물 영역 (estate)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/` (홈=검색 통합, 세션 314 · 세션 508 개편 · 세션 525 결과 새 틀) | **SearchExperience**(빈 화면은 `renderEmpty` → `components/home/HomeSections`: 큰 띠 `HomeHero`(h1)·머리 검색창·「지역으로 찾기」 → 결과 = 얇은 띠 `SearchBand` + h1 「…」 단지 N곳 + `SearchResults` 20곳씩 「더 보기」) + `getRegionHubTrend()`(지역 시세 흐름) + localStorage(히스토리/즐겨찾기) | `/api/live/search`, `/api/live/region`, `/api/regions/{시군구}/hub` |
| `/search` → `/` 리다이렉트 | SearchExperience 공용 — 옛 `/search` 는 쿼리 보존하며 홈으로 redirect (직접 링크 6곳 잔존) | (동일) |
| `/complex/[no]` | 서버 = `loadSummary()`(공개 요약 → 남색 띠·'한눈에 보기'·가까운 단지 · ISR) / 클라이언트 비로그인·일반 회원 = 공개 자료(공시가격·지하철·동네·공개 가격 기록·지역 흐름)로 「최근 거래 → 2년 → 대출 판 → 주변」(세션 524 B40 PR 1 — 구조 = `ui-patterns.md` §단지 화면 새 틀) / 승인 중개사 = `startLiveCrawl()`, `getCrawlStatus()`, `getArticles()`, `getPyeongDetails()`, `getPriceHistory()`, `startPriceCollect()` + useFavoriteStatus + ComplexNoteButton | `/api/complexes/{no}/public-summary`, `/api/live/{no}/articles/*`, `/api/complexes/{no}/*`, `/api/live/{no}/price-history/*` |
| `/compare` | `getComplex()` x N + `getPriceStats()` x N (useQueries 병렬) + 인쇄/엑셀 | `/api/complexes/{no}`, `/api/complexes/{no}/price-stats` |

### 미분양 영역 (mibunyang)
| 페이지 | API 호출 | 백엔드 라우터 |
|--------|---------|-------------|
| `/mibunyang` | `getMbApartments()`, `getMbUnsold()`, `getMbRegions()`, `getMbTrades()`, `getMbGuList()` + **분양 3종** `getMbPresale()`·`getMbCompetition()`·분양결과 (탭: 미분양단지/미분양만/지역통계/실거래/즐겨찾기 + **분양**[민간분양·LH공공분양·분양결과], 세션 314) + **list↔map 토글**(세션 315) | `/api/mb/*`, `/api/mb/presale`, `/api/mb/competition` |
| `/mibunyang/[id]` | `getMbApartmentDetail()`, `getMbUnsoldHistory()` (5섹션+지도+추이차트) | `/api/mb/apartments/{id}`, `/api/mb/unsold/{id}/history` |
| `/mibunyang/compare` | `getMbApartmentDetail()` x N + `getMbUnsoldHistory()` x N (17행 비교+분양가 막대+추이+출처 각주 — 레이더는 세션 472 삭제) | 동일 |

### 도구 6종 (/tools/*) — 모두 클라이언트 산식, BE 호출 없음

> 상세 = `frontend/.claude/tools-lineup.md` §/tools 도구 6종 라인업 참조
> 화면 틀(세션 530 B40 PR 3a): `/tools`(모음)·`/tools/second-mortgage` 는 새 틀 `ToolPage`(서버 · `ui-patterns.md` §계산기 새 틀) · 세금·수수료·평㎡ 5장은 옛 틀(3b~3d 에서 바꿈)

### 중개 실무 (/broker) — 세션 511 PR 1, 서버 렌더 정적 장(로그인 없이 · BE 호출 없음)
| 페이지 | 자료 | 비고 |
|--------|------|------|
| `/broker` | `lib/broker/upcoming-dates.ts`(손으로 관리 · 원문 확인 뒤에만 추가 · 지난 항목 삭제) + 서식 원문 링크(법제처·법무부, 사본 없음) + 계산기 4장·`/verify` 링크 | 사이트맵·`public/llms.txt` 등록 · 광고법 게이트 TARGETS 에 `src/lib/broker` · 「중개사 인증하면 되는 것」 문구는 비인증 화면과 대조한 뒤에만 쓴다(인증 전용 = 엑셀·데이터 갱신·인쇄 — 실거래·면적별 시세·매물표는 인증 없이도 보인다, 세션 511 검사 🟠) · 자료 파일에 적는 출처 주소는 열어서 그 공고가 맞는지 본 뒤에만(세션 511: 다른 공고 주소였다) |
| `/broker/[type]` | `lib/broker/checklists.ts`(손으로 관리 · 조문 주소는 열어 본 뒤에만 · 항목 id 는 체크 저장 키라 바꾸지 않는다) | 서버 정적 장(`generateStaticParams` = `BROKER_TYPES`(audience broker) · `dynamicParams = false` → 없는 유형·당사자용 유형 404) · 허브 버튼·사이트맵 행도 같은 목록에서 생성(lastmod = `checkedAt`) · 세션 513 PR 2a = `jeonse` 17항목 · 세션 513 PR 2b = 18항목(`jeonse.refused-docs`) · 체크 = 내 기기 저장(`broker_deals_v1` · `lib/broker/deals-storage.ts` · 부품 `components/broker/DealChecklist.tsx` · 이 판이 모르는 유형·항목 체크는 읽을 때 숨기고 쓸 때 보존 — 세션 515) · 세션 514: 머리에 「손님에게 보낼 목록: 세입자용 · 집주인용」(자료 `partyTypes`) · 세션 516: `sale` 15항목(자료 `lib/broker/sale-checklists.ts` · 손님 목록 = 매수인용·매도인용) · 세션 517: `wolse` 20항목(자료 `lib/broker/wolse-checklists.ts` · 18항목은 전세 글자 그대로 + 밀린 월세·인상/전환 상한 안내 2 · 손님 목록 = 세입자용·집주인용 · 버튼 순서 전세·월세·매매) · h1 꼴 「○○ 중개 체크 목록 — 공인중개사용」 |
| `/broker/jeonse-guarantee` | `lib/broker/hug-guarantee.ts`(손으로 관리 · HUG 누리집 상품 안내 + 공지 37801 · 원문 확인일 `HUG_CHECKED_AT` · HUG 가 비율·전월세전환율을 바꾸면 상수와 확인일 함께) + 부품 `components/broker/HugLimitCalculator.tsx` | 세션 520 PR 5 · 전세보증 한도 계산(서버 정적 장 + 클라이언트 계산기 · 저장 0 · BE 호출 0) · 정적 폴더라 `/broker/[type]` 보다 먼저 잡힌다 · 결과는 원문의 숫자 조건 세 가지에 「들어감/넘음」만(「가입 가능/불가」 단정 0) · 적용 기준 줄은 상수에서 생성 · 허브 「자주 쓰는 계산」 맨 위 넓은 단추 · 「넣지 않은 것」에 HUG 항목이 있는 체크 목록 장(전세·월세 6장)에 「한도 계산 →」 |
| `/checklist` | `PARTY_TYPES`(audience party) 로 카드 생성 | 계약 체크 목록 모음 장(세션 514) · 서버 정적 · 카드 4장(세션 516: 세입자·집주인·매수인·매도인) · 맨 아래 중개사용 `/broker` 줄(세션 516 — 매매가 생겨 허브로) · 들어오는 문 = 홈 「계산기 모음」 카드(`HomeToolCards`) · `/broker/jeonse` 머리 링크 · 사이트맵·llms.txt (헤더 메뉴 없음) |
| `/checklist/[type]` | `lib/broker/party-checklists.ts`(세입자 `jeonse-tenant` 15 · 집주인 `jeonse-landlord` 10) + `lib/broker/sale-checklists.ts`(세션 516: 매수인 `sale-buyer` 13 · 매도인 `sale-seller` 9 · 매수인 `sale-buyer.loan-calc` 은 근거 없이 단지 찾기 링크만 — 근거 줄을 그리지 않음 · 대출 비율·금리·상담 문구 0) + `lib/broker/wolse-checklists.ts`(세션 517: 세입자 `wolse-tenant` 19 · 집주인 `wolse-landlord` 12 · 전세와 같은 항목은 글자 그대로 복사하고 시험이 짝을 대조 · 「사는 동안 — 월세」 단계 · 전환 상한은 법 글자 그대로 · 세액공제 항목 숫자 0) · h1 꼴 「… 체크리스트 — ○○용」(세션 516 · 레지스트리는 `checklists.ts` · 조문 주소 = `lib/broker/law-urls.ts`) | `/broker/[type]` 와 같은 꼴(`generateStaticParams` = `PARTY_TYPES` · `dynamicParams = false` · `getChecklist(type, "party")`) · 체크 = 같은 `broker_deals_v1` · 부품 `DealChecklist single`(거래 고르기·새 거래·계약일 없이 비우기만 · 알림 「체크 M개를 지웠습니다.」) |

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
> **외부 자료 버튼(2026-09-26 사장님 결정)**: `CollectorTrigger`("외부 자료 지금 받아오기")는 대시보드가 아니라 **`/admin/crawl` 요약 아래·실패 분포 위**에 있다. 버튼 **8종** = BE `routers/admin/collect.py` `CollectorName` 전부(정본 `lib/admin/collectors.ts`, 집합 일치 가드 `lib/admin/__tests__/collectors.test.ts`), 이름은 `crawl-job-labels`(=JOB_WORDS). 버튼마다 scheduler-status 의 마지막 실행 한 줄(backfill-price·metrics 는 수동 실행에 잡 id 가 안 붙어 "마지막 자동 실행"), 도는 중이면 잠금. 오래 걸리는 4종(관리비 2·어린이집·옛 시세)은 확인창. 누르면 BE 가 백그라운드로 시작하고 곧바로 답해(세션 420) 화면은 "시작했어요 — 진행 상황은 아래 '수집 작업 목록'에서…" + crawlJobs·schedulerStatus 쿼리 무효화, 같은 수집기가 이미 돌면(수동·자동) 409 우리말 문구. 결과(완료·실패·한도로 멈춘 사유)는 그 잡의 crawl_jobs 행으로만 본다.
| `/pricing` | 정적 (B2B 구독 안내) | — |
| `/blog` + `/blog/[slug]` | 라인업 = `.claude/BLOG.md` (단일 진실 공급원) | — |

## 미분양 (mibunyang) 컴포넌트

```
components/mb/
├── MbRegionSelector.tsx        # 시도/시군구 2단계 셀렉터 + 키워드 검색 입력
├── MbApartmentTable.tsx        # 아파트 목록 테이블 (정렬+즐겨찾기★+비교+)
├── MbTradeTable.tsx            # 실거래 테이블 (정렬 가능 헤더: 가격/거래월/면적)
├── MbRegionStatsTable.tsx      # 지역 통계 테이블
├── MbDetailSections.tsx        # 상세 5개 섹션 (개요/분양/주변환경/거래통계/미분양추이) — 지표 = 값 + 기준·출처 한 줄(세션 472, 옛 막대 14종 삭제)
├── basis-text.ts               # 상세 지표의 법령·공공 통계 기준·출처 문구 순수 함수 (세션 472)
├── MbSourcesFooter.tsx         # 상세·비교 페이지 맨 끝 출처 묶음 한 단락 (세션 472)
├── MbUnsoldTrendChart.tsx      # Recharts 미분양 추이 차트 (dynamic import)
├── MbCompareFloatingBar.tsx    # 비교 하단 플로팅 바 (최대 4개, 비교하기 버튼)
├── MbComparePriceChart.tsx    # 분양가 막대 차트 (min/max/pp, 판정 ★ 없음 — 세션 472, dynamic import)
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
