# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-04-15 — 세션 45 **types 도메인 분리 + 백로그 재판정** ✅ — `frontend/src/types/index.ts` 447줄·27개 타입 → `estate.ts`(167줄·7) + `analytics.ts`(60줄·8) + `progress.ts`(25줄·2) + `mibunyang.ts`(191줄·10) 4파일 분리, `index.ts` 는 7줄 순수 barrel (`export * from "./..."`) 로 축약. 외부 import 경로 `from "@/types"` 69파일 무변경. 커밋 **5건** (53772a5 / aff3a4f / c9df47a / 650fadc / 본 커밋). 하네스 9 GATE 통과 후 실행. 저위험 백로그 3건 중 2건(CORS env / parseApprovalDate 제거)은 사전 조사로 **스테일 판정** — 상세는 하단 "다음 우선순위" 3번 참조.

**세션 45 성과** (naver-estate-web FE 6파일, 5커밋):

- Step 1 (53772a5) `estate.ts` 신규 167줄 — Complex/Article/ArticlePriceHistoryItem/PyeongDetail/SortBy/ArticleFilters/FilterOptions (tsc + 565 테스트 통과)
- Step 2 (aff3a4f) `analytics.ts` 신규 60줄 — DbStats/Regions/AreaPriceStat/FloorPriceStat/PriceStat/PriceStats/PriceHistoryItem/PriceHistoryResponse
- Step 3 (c9df47a) `progress.ts` 신규 25줄 — PriceCollectProgress/CrawlProgress
- Step 4+5 (650fadc) `mibunyang.ts` 신규 191줄 — MbApartment/MbUnsoldHistory/MbRegion/MbTrade/MbPrice/MbTradeStats/MbBuilder/MbInfra/MbSchool/MbTransport. **Step 4와 5를 통합**한 이유: MbApartment 가 Mb\* 하위 타입을 참조하므로 part1 만 이동하면 중간 커밋에서 mibunyang.ts 내부 미정의로 tsc 깨짐. 원자적 이동이 안전하다고 판단.
- Step 6 (본 커밋) `CLAUDE.md` 백로그 정정 — CORS env / parseApprovalDate 스테일 표기 + 세션 45 성과 기록
- 검증: 각 단계마다 `npx tsc --noEmit` exit 0, vitest 565/565 통과. `npm run build` 는 Windows junction point 환경 이슈(Turbopack → `failed to create junction point`, webpack → `favicon.ico` readlink EISDIR)로 로컬 실패하나 타입 리팩터와 무관(next.config/webpack 설정 미변경) — Vercel 리눅스 빌드 정상.

### 세션 45 하네스 교훈
- **CLAUDE.md 백로그 신뢰도 감사 필요**: 세션 44 종료 시 적어놓은 저위험 백로그 3건 중 2건이 사전 조사 단계에서 무효로 판명. CLAUDE.md 의 "다음 우선순위" 섹션은 작성 시점의 가정이므로 다음 세션 시작 시 **실제 코드/env 와 대조 검증** 없이 그대로 실행하면 헛걸음. 규칙: 백로그 항목은 Explore 3개 병렬 사전조사 후에만 실행 계획 확정.
- **원자적 리팩터 단위 판단**: 원래 6단계 플랜에서 Step 4 를 "part1 5개 이동" 으로 쪼개려 했으나 타입 의존 그래프를 다시 읽고 Step 4+5 통합으로 현장 수정. **플랜 검증 → 실행 직전 재확인** 루프가 플랜보다 중요한 경우 있음.
- **이전 커밋 비교 빌드는 리스크**: 빌드 환경 이슈를 "커밋 무관" 증명하려고 `git checkout 993f74f -- .` 로 돌아가려 했다가 워킹트리 혼란 유발, `git reset --hard HEAD` 로 복구. **리팩터 중에 과거 커밋 체크아웃 금지 — 환경 이슈는 증거(에러 메시지) 로만 판단**.

**상세**: `memory/session45_summary.md` (차후 세션 종료 시 생성)

**세션 44 성과** (naver-estate-web FE+BE, 총 ~30파일):

### [1] xlsx → exceljs 교체 (npm audit high 2건 제거)
- 배경: xlsx 0.18.5 는 Prototype Pollution + ReDoS 2종 high 취약점, "No fix available". 유지보수 중단.
- 3커밋 분할 (8fb7cce/5d2abdf/37fa88f):
  - `compare-export.ts`: `downloadXlsxBuffer()` 공통 헬퍼 추출 (Blob → a.click → revokeObjectURL)
  - `mb-export.ts` 4함수 + `mb-compare-export.ts`: Workbook → worksheet.columns → addRow → writeBuffer() 패턴
  - `mb-export.test.ts`: `vi.mock("exceljs")` 로 Workbook 클래스 스텁
- `safeCellValue()` 수식 인젝션 방어는 그대로 유지
- 결과: npm audit xlsx 2건 high → 0건, 남은 next/vite 2건은 범위 밖

### [2] /admin 운영 개선 완성 (unstaged 마무리 + FE UI)
- 세션 43 이전 시작된 unstaged 작업(BE API 3종 + FE 컴포넌트 2종 + 테스트 4파일)을 하네스 검증 후 3커밋으로 완결:
  - `efbeffa` feat(admin): pause/resume + 에러율 추이 API + race guard
    - `POST /api/admin/crawl-jobs/{id}/pause` `resume` (running ↔ paused ↔ pending, 409 guard)
    - `GET /api/admin/error-stats?days=7|14|30` — KST 기준 일자별 status 집계, 빈 날 0 채움
    - **race guard**: `service_discover._finalize_job()` — 워커가 완료/실패 덮어쓰기 전 DB 재조회, running 일 때만 전환. 관리자 pause/cancel 승리 보장
    - 테스트: `test_admin_jobs` 8 + `test_service_discover_race` 3
  - `73b6229` feat(admin): 단건 강제 재크롤 API
    - `POST /api/admin/recrawl/single` — 숫자 1~20자리 검증 + Complex 존재 확인 + 1시간 중복 차단(force 우회) + threading.Thread 백그라운드
    - `test_admin_recrawl` +109줄
  - `83dd9b3` feat(fe): /admin 운영 개선 UI
    - `SingleRecrawlCard`: 단지번호 입력 + force 체크박스 + 성공/실패 피드백
    - `ErrorRateChart`: Recharts dynamic import, stacked bar, 7/14/30일 토글
    - `CrawlJobTable`: 일시정지/재개 버튼 + paused status 색상(amber) + target_id select-text
    - 테스트 9개 (SingleRecrawlCard 5 + ErrorRateChart 4)
- BE 533 + FE 554 전체 회귀 통과

### [3] 에러 페이지 UX 강화 + 미분양 테이블 모바일 카드뷰
- Context7 `/vercel/next.js/v16.2.2` 로 공식 문서 확인 → **`reset` → `unstable_retry` 리네임 발견**. `props.unstable_retry ?? props.reset` fallback 패턴으로 Next 15/16 양방향 호환
- Explore 에이전트 3개 병렬로 9 GATE 검증 (초기 🟢4/🟡4/🔴1 → 수정 후 🟢9/🟡0/🔴0)
- 5커밋 분할:
  - `0aab791` `ErrorActions` 공통 컴포넌트 — variant("notfound"/"error") + `useSmartBack` 훅 재사용
  - `2e93147` `not-found.tsx` + `error.tsx` + `mibunyang/error.tsx` 일괄 교체 (`unstable_retry` 시그너처 통일)
  - `3b93be0` `/admin/error.tsx` 신규 + 에러 페이지 테스트 9개 (not-found/error/ErrorActions)
  - `b675943` `MbApartmentTable` 모바일 카드뷰 (md:hidden) — 4행 구조, tabIndex + onKeyDown + stopPropagation, data-testid 부여. 기존 테스트 6개 수정(`getAllByText` + `.closest("tr") !== null` 필터) + 신규 2개
  - `2d6e7aa` `MbTradeTable` + `MbRegionStatsTable` 모바일 카드뷰 + `mibunyang.test.tsx` 2곳 수정
- **jsdom 이슈 발견**: CSS `hidden md:block` / `md:hidden` 은 jsdom 에서 **둘 다 DOM 에 렌더**. `getByText` 는 중복으로 실패 → `getAllByText[0]` 또는 `data-testid` 로 이전
- **키보드 접근성**: 카드 `tabIndex=0` + `onKeyDown` Enter/Space (기존 `MbApartmentTable:107-108` 패턴 복제)
- **stopPropagation**: ★즐겨찾기 / + 비교 버튼에 이벤트 전파 차단 (기존 `:113-127` 선례)
- FE 회귀: 66파일 / 565 테스트 통과 (554 → 565 = +11 신규), tsc/lint 에러 0

### 세션 44 하네스 교훈 (다음 세션용)
- **MCP 실측 우선**: 사용자가 "일 잘하는 MCP" 요구 → Context7 로 `reset` 이 `unstable_retry` 로 바뀐 것 발견, 기억만으로 답변 금지
- **Explore 병렬 검증**: 9 GATE 를 에이전트 3개(GATE 1+6 / GATE 5+3 / GATE 0+2+4+7+8)로 병렬 검증 → 30분 절약
- **jsdom CSS hidden 모름**: 모바일 카드뷰 추가 시 기존 테스트의 `getByText` 가 전부 깨질 수 있음. 카드뷰 도입 전 반드시 테스트 파일 전체에서 `getByText\(` 를 grep 해서 `getAllByText[0]` 또는 testid 로 선제 수정
- **plan 수정 후 재승인**: 사용자가 "일 잘하는 MCP 데리고 한 거 맞아?" 라고 반려 → Context7 + 9 GATE 로 증거 추가 후 재승인. 재승인 루프는 품질에 크게 기여

**세션 43 성과** (naver-estate-web 코드 변경 0 / docs 1파일 신규, mibunyang 2파일 변경):

- **[1] 세종 린스트라우스 좌표 보강** (DB 2000/2001 → 2001/2001):
  - 대상: `apartments.id='ah-2022910239'` (세종 린스트라우스, 1세대 단지, 2022년 11월 준공). 이전에 `lat/lng=NULL`이라 `env_childcare.py:41-42` WHERE에서 배치 스코프 제외 → 어린이집 커버리지 마지막 1칸
  - Part A (mibunyang 쪽, `scripts/fix_sejong_coord.mjs` 신규 ~75줄): Kakao keyword search. "세종 나성동 린스트라우스" 쿼리로 실제 단지 **"한뜰마을5단지린스트라우스아파트"** 발견, `lat=36.4976, lng=127.2565`. bbox sanity check(`36.40 ≤ lat ≤ 36.75`) + dry-run + `--commit` 가드 경유
  - Part B (naver-estate-web): `collect_childcare_data(batch_size=2001)` 재실행. 세종 단건 `infra` 반영 — `childcare_count=31, nearest_dist=58.8m, nearest_type="국공립", capacity=38, teachers=7`. 코드 변경 0
  - **DB 최종 실측**: `with_coord=2001 / has_childcare=2001 / with_matches=1900 / zero=101 / total_infra=2001 / total_apt=2001` (2000→2001)
  - 4단 연결 검증: DB → serializer(`mb_serializers.py:169-174`) → API(`/api/mb/apartments/ah-2022910239` infra.childcare_* 6필드 정상 응답) → UI(`MbEnvironmentSection.tsx:146-156` "보육" 섹션, 기존 코드로 이미 렌더 중, air/emergency/crime과 대칭)
  - 9 GATE 하네스 전 통과 (🟢9, 🟡0, 🔴0), `fetchWithRetry`가 Response 객체 반환하는 것 몰라서 `.json()` 빠뜨린 디버깅 1회
  - 삽질: CLAUDE.md에는 `address_jibun/address_road` 필드로 가정했으나 실제 컬럼은 `address/road_address`. `Apartment.__table__.columns`로 조회 시 실제 컬럼명 `lat/lng` 반환(ORM 속성은 `latitude/longitude` alias), 이걸 `r.lat`으로 읽었다가 AttributeError 1회

- **[2] 세종 단지 이름 교정** (mibunyang `apartments.name` UPDATE):
  - 기존: `세종 린스트라우스（행정중심복합도시 １-5생활권 H6블록）` (풀각 괄호/숫자, "행정중심복합도시")
  - 신규: `세종 린스트라우스 (한뜰마을5단지, 행복도시 1-5생활권 H6블록)` (반각 정리 + 실제 단지명 병기 + "행복도시" 일반 표기)
  - 1회성 SQL UPDATE만, 스크립트 추가 없음

- **[3] quota_db 연동 가이드 문서화** (`docs/quota_db_integration.md` 신규):
  - 배경: data.go.kr 일일 쿼터 10,000회를 두 프로젝트(naver-estate-web, mibunyang)가 공유. 현재 naver-estate-web만 `RateLimitCounter` 테이블 기반 공유 카운터 적용, mibunyang은 미연동 → 매월 10일(건축물대장 8,500) × 토요일(실거래가 3,600) 겹치면 초과 위험
  - 문서 구성: 배경 / 진실의 원천(quota_db.py) / 옵션 A(Supabase RPC 직접 호출) + 옵션 B(in-memory 폴백) / 적용 지점 4개 collector / 동시성 주의 / 체크리스트 6단계 / 롤백
  - 신규 Postgres 함수 `increment_quota_counter(service, date, cost)` 스니펫 포함 (INSERT ON CONFLICT + 원자 증가)
  - mibunyang 쪽에서 그대로 복사·실행 가능한 형태

- **[4] 다음 세션 후보 탐색** (Explore 에이전트 1회):
  - 🔥 **1. /admin 운영 개선** — 단지 강제 재크롤, 잡 일시정지/중단, 에러율 차트 (FE 3~4 + BE 2파일, 운영 효율 대폭)
  - ⭐ 2. 비교 페이지 4→6~8개 확장 (FE 2파일)
  - ⭐ 3. 미분양 지도 뷰 (FE 2파일, Naver Maps)
  - 💤 4. 매물 필터 세부 확장 (반려동물/주차/즉시입주)
  - 🔥 **5. 에러 페이지 + 모바일 반응형 강화** (FE 4~5파일, 모바일 CVR 개선)

- **어린이집 서사 최종 종결**: 38(진단) → 39(가드) → 40(CPMS 버그) → 41(bulk prefetch + 152→22) → 42(일반구 별칭 22→0) → **43(세종 좌표 보강 2000→2001)** = 커버리지 **100% (2001/2001)** 달성

**상세**: `memory/project_childcare_trigger_bug.md`, `memory/session43_summary.md`, `docs/quota_db_integration.md`

**다음 우선순위 (세션 45)**:

1. ⭐ **미분양 지도 뷰** — 목록에 Naver Maps 오버레이, 마커 클릭→상세 이동. FE 2파일
2. ⭐ **비교 페이지 4→6~8개 확장** — CompareTable 스크롤 리팩토링. FE 2파일
3. ~~🟡 **저위험 백로그 묶음 3건**~~ — 세션 45 에서 재판정 완료. (a) backend CORS 는 이미 `main.py:105` 에서 `os.getenv("FRONTEND_URL")` 사용 중으로 완료, (b) `parseApprovalDate` 는 `lib/compare-utils.ts:26` 의 `ADVANTAGE_ROWS[4]` "준공일" 우위 판정에서 실제 사용 중으로 제거 불가 — 두 항목 모두 **스테일**. (c) `types/index.ts` 447줄 분리만 세션 45 에서 실행됨 (아래 성과 참조)
4. 🟡 **/admin/users isLoading UI** + AdminCard 공통 컴포넌트 추출(9곳 중복)
5. **Playwright 실측 follow-up** — 세션 44에서 단계 5 완료 후 `webapp-testing` 스킬로 375×812 뷰포트 스크린샷을 뜨지 않음. 다음 세션에 before/after 비교 캡처 (목록/상세/404/500, 7장)
6. 🟡 **React.memo 확대** — ArticleTable/ArticleCardMobile/ComplexRow (FilterDropdown만 적용 상태)
7. mibunyang 쪽에서 `quota_db_integration.md` 적용 (mibunyang 세션, 본 프로젝트 변경 없음)
8. Supabase MCP 2개 해제 안내 (사용자 수동, /mcp UI)

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query (TanStack Query v5) + Recharts 3
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi + requests + APScheduler
- **DB**: Supabase (PostgreSQL) + Supabase Auth
- **배포**: Vercel (frontend) + 집 서버 (backend, Cloudflare Named Tunnel)

## 아키텍처

```
[브라우저] → [Next.js (Vercel, 2u.pe.kr)]
                ↓ API 호출 (NEXT_PUBLIC_API_URL)
           [Cloudflare Named Tunnel (api.2u.pe.kr)]
                ↓
           [FastAPI (집 서버 192.168.219.101:8002)]
                ↓ 실시간 크롤링 + 스케줄러
           [네이버 부동산 API] → [PostgreSQL (Supabase)]
           [국토교통부 공공데이터 API] ↗
           [에어코리아 대기질 API] ↗
           [응급의료기관 API (NEMC)] ↗
           [어린이집 API (CPMS, cpmsapi030)] ↗
           [경찰청 범죄통계 API (odcloud)] ↗
```

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 데이터 흐름

### 매물 (estate)
```
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 클릭 → DB 즉시 표시 + 자동 매물 크롤링 (start-crawl → 10/20/30초 refetch)
필터 변경 → /api/complexes/{no}/articles (SQL WHERE) + URL 파라미터 동기화
실거래가 → /api/live/{no}/price-history/start-collect (24시간 TTL, 자동 트리거)
단지 비교 → /compare?ids=no1,no2,... (useQueries 병렬 + 평당가 + 인쇄/엑셀)
엑셀(매물) → /api/articles/export (xlsxwriter)
엑셀(비교) → 클라이언트 xlsx (safeCellValue 수식 인젝션 방어)
```

### 미분양 (mibunyang)
```
미분양 조회 → /api/mb/apartments?sort_by=&keyword= (정렬+검색+중복제거)
미분양 비교 → /mibunyang/compare?ids= (17행 우위 + 레이더13축 + 가중치 + 분양가/추이 차트)
미분양 즐겨찾기 → localStorage (최대 200개, 일괄 비교, FavSortBy)
미분양 히스토리/북마크 → localStorage (자동 저장 10개 / 수동 저장 20개)
레이더 설정 → localStorage (축 선택 + 가중치 1-5, 프리셋 3종)
```

### 환경 데이터 수집 (스케줄러)
```
대기질 → 매일 02:00 (에어코리아 API → infra.air_*)
응급의료 → 매월 첫째 월 03:00 (NEMC → infra.emergency_*)
어린이집 → 매월 첫째 목 06:00 (CPMS cpmsapi030 → infra.childcare_*)
범죄통계 → 분기별 첫째 일 04:00 (경찰청 odcloud → infra.crime_*, CSV 폴백)
공공데이터 → 토요일 05:00 (국토교통부 실거래가, 10일 토요일 skip)
관리자 트리거 → POST /api/admin/collect/{name} (동기 120초)
```

## 주요 기능·구현 사항

### 인프라·운영
- 서버 자동 시작: startup_orchestrator.py → Named Tunnel (api.2u.pe.kr) + watchdog
- 인기 단지 크롤링: 매일 10:30/14:30/19:00, 개별 단지 try/except (부분 실패 허용)
- 스케줄러 모니터링: GET /api/admin/scheduler-status (12개 작업, 60초 자동갱신)
- 관리자 대시보드: StatsCards + SchedulerMonitor + CollectorTrigger + QuotaStatus
- 공유 쿼터 DB 카운터: RateLimitCounter 테이블 기반, INSERT ON CONFLICT 원자적 (quota_db.py)
  - GET /api/admin/quota-status: 오늘의 data.go.kr API 쿼터 현황
  - in-memory 폴백 유지 (DB 장애 시 안전장치)
- DB: NullPool (Supabase Session Mode 대응), PendingRollbackError 방지 (db.rollback())
- CSP: script-src/connect-src에 https://vercel.live 추가
- Hydration: html suppressHydrationWarning (Vercel Live 주입 대응)

### 공인중개사 검증
- 흐름: /verify 신청 → 국세청 사업자등록 API 자동검증 → 성공 시 role=expert 자동 승인
- 실패 시: verification_status=pending → 관리자 /admin/users에서 수동 승인/거부
- 자격증: 서류 업로드 (Supabase Storage, 5MB/JPG/PNG/PDF) + 관리자 수동 확인
- 이메일 알림: services/email.py (Gmail SMTP SSL 465, best-effort)
- Header 전문가 뱃지: role=expert 시 초록색 "전문가" 표시

### 매물 상세 모달
- 1열 스택 레이아웃 (max-w-4xl), 7개 하위 컴포넌트 (article/)
- 아코디언: 시세/경쟁매물/관리비 카드 3종 (접기 기본)
- 인쇄 최적화: @media print position:static, 아코디언 자동 펼침
- 단지정보 통합: complex prop (건설사/용적률/전세가율/주변시세)

### 모바일 반응형
- 검색 결과: ComplexCardMobile (md:hidden 카드뷰)
- 단지 상세: ArticleCardMobile + 헤더/액션바 text-xs md:text-sm
- 필터: FilterBar flex-nowrap overflow-x-auto, FilterDropdown max-w-[calc(100vw-2rem)]
- 수익률 필터: 월세/전체/단기임대일 때만 표시, YIELD_PRESETS 6종 + 직접입력 (min_yield/max_yield float)
- 페이지네이션: px-2 py-1 md:px-3 md:py-1.5

### 코드 구조 (분리 완료)
- FE api.ts → lib/api/ 7모듈 (core/complex/articles/crawl/analytics/admin/mibunyang)
- BE service.py → 4모듈 (service_common/discover/price/public)
- BE formatters/ 5모듈, db/ 5모듈, serializers/ 3모듈 (barrel re-export 호환)
- ArticleDetail → 100줄 + 하위 7개 컴포넌트

## 환경변수

### 필수 (3곳 동기화: Vercel + backend/.env + frontend/.env.local)
- `ADMIN_EMAIL` — 관리자 이메일
- `NEXT_PUBLIC_API_URL` — 백엔드 API URL (Named Tunnel: https://api.2u.pe.kr)

### 백엔드 전용 (backend/.env)
- `AIR_QUALITY_ENABLED`, `EMERGENCY_ENABLED`, `CHILDCARE_ENABLED`, `CRIME_STATS_ENABLED` — 수집 토글
- `CHILDCARE_DETAIL_API_KEY` — cpmsapi030 운영키
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Gmail SMTP SSL 465

## DB 마이그레이션 (실행 완료)

| 버전 | 내용 | 실행일 |
|------|------|--------|
| V014 | crawl_jobs.scheduler_job_id | 2026-04-03 |
| V015/V016 | apartments/trades 인덱스 7개 + trigram | 2026-04-07 |
| V017 | agent_verifications 테이블 | — |
| V018 | agent_verifications.license_doc_path | — |
| V019 | infra.childcare_nearest_type/teachers | — |

## 테스트 현황

| 영역 | 도구 | 테스트 수 |
|------|------|----------|
| FE 단위/컴포넌트/훅/페이지 | Vitest | 539개 (61파일) |
| E2E | Playwright | 48개 (9파일, --webpack 모드) |
| BE 단위/통합/API | pytest | 476개 (39파일, 1 skipped) |

## 커밋 전 필수 검증

```bash
# BE 변경 시
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

## 규칙 & 커맨드

### 항상 로드 (rules/)
| 파일 | 내용 |
|------|------|
| `.claude/rules/web-rules.md` | React/Next.js + FastAPI 코딩 규칙, DON'T 목록 |
| `.claude/rules/testing.md` | 테스트 작성·실행 규칙, 구조표 |
| `.claude/rules/infra.md` | 서버 복구 절차, 스케줄러, 공유 인프라, DB 풀 |
| `.claude/rules/codes.md` | 거래/매물유형 코드, 핵심 상수, localStorage 키 |
| `.claude/rules/planning.md` | /plan 모드 최소 규칙 |

### 필요 시 호출 (commands/)
| 커맨드 | 내용 |
|--------|------|
| `/harness` | Plan→Guard→Work→Review 전체 워크플로우, Sonnet 분할, 코드 작성 규칙 |
| `/guard` | 9 GATE 검증 (크기/영향/순서/완전성/적정성/보안/연동/롤백/UX) |
