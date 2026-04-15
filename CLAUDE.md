# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-04-15 — 세션 46 **AdminCard 공통 컴포넌트 추출** ✅ — `/admin` 영역의 `bg-white border rounded-lg p-4` + `<h3 mb-3>` 헤더 카드 반복 패턴을 공통 `AdminCard` 컴포넌트로 추출, **8곳 치환**. 커밋 **5건** (967a462 / e48add1 / 4b44e34 / 63358dc / 3ddd7f6). 하네스 9 GATE 실측 재검증 후 5 Step 분할 (단계당 ≤2파일). 전체 테스트 568/568 통과.

**세션 46 성과** (naver-estate-web FE 10파일, 5커밋):

- Step 1 (967a462) `AdminCard.tsx` + 단위 테스트 신규 — title/children/action? 3 prop, `memo()`/className 과잉 제거. 테스트 3개(기본 렌더/action 헤더/action 미제공)
- Step 2A (e48add1) `SingleRecrawlCard` + `CollectorTrigger` 단순 치환 (action 없음)
- Step 2B (4b44e34) `BulkRecrawlCard` level 뱃지 action 추출 + `VerificationReview` 동적 title (`검증 심사 대기 (${total}건)`)
- Step 3 (63358dc) `ErrorRateChart` 7/14/30일 토글을 action 으로 + `SchedulerMonitor` isLoading/정상 2분기 치환. **L59 skeleton 헤더 블록 `<div className="h-5 bg-gray-200 rounded w-40 mb-3 animate-pulse" />` 제거** — AdminCard 의 실제 `<h3>` 가 헤더 담당, 이중 렌더 방지. error 분기(bg-red-50)는 카드 래퍼 아님이라 그대로 유지
- Step 4 (3ddd7f6) `admin/page.tsx` 2카드(실행중 크롤링/최근 활동) + `admin/data/page.tsx` 1카드(오래된 데이터 정리, 외부 `<div className="mt-6">` 래퍼 + AdminCard) + `SchedulerMonitor.test.tsx` race fix (waitFor 기준을 job name 으로 변경)

**제외 3곳** (의도적):
- `StatsCards.tsx` — 타이틀 없는 stat 박스 4개 grid, `<p>{label}</p>` 구조가 AdminCard 의 `<h3>` 템플릿과 불일치
- `admin/settings/page.tsx:76` — 헤더 action 이 `<span>{key}</span>` + timestamp + 편집 버튼 2요소 + 편집모드 textarea 분기로 복잡도 높음
- `/admin/users` isLoading — 세션 44 백로그에 적혀 있었으나 사전 조사 결과 L102 에 이미 `isLoading ? <div role="status">로딩 중...</div>` 존재. 스테일 판정

**치환 누락 grep 검증**: `bg-white border rounded-lg p-4` 잔재 = StatsCards ×2 + settings/page ×1 + AdminCard 본체 ×2 = 5 매칭 (기대값 일치)

**검증 결과**:
- tsc exit 0 (5단계 전부)
- ESLint 0 errors, 10 warnings (전부 기존 `react-hooks/set-state-in-effect` 경고, AdminCard 무관)
- vitest 568/568 통과 (기존 565 + AdminCard 3 신규)
- 시각 검증: Playwright 로 /, /admin, /admin/data, /login 스크린샷 4장. 홈 정상 렌더 + /admin·/admin/data 는 미들웨어 로그인 리다이렉트 정상. 내부 대시보드는 인증 게이트로 자동화 불가 → **사용자 수동 확인** 필요
- `npm run build` 는 세션 45 와 동일 Windows junction 이슈로 로컬 실패, Vercel 리눅스 빌드 무관

### 세션 46 사고 기록 (다음 세션 필독)

**첫 커밋 오염 사고**: Step 1 첫 커밋 `3d20eb0` 가 의도한 2파일(AdminCard + 테스트)이 아니라 **44파일 4539+/647- 줄**로 찍힘. unstaged 상태이던 `.claude/commands/`, `.playwright-mcp/` 40파일, 스크린샷 6장, `orchestrator.pid`, `uvicorn.log`, settings 백업 2개가 전부 흡수됨. 원인은 `git add <특정파일>` 뒤 `git commit` 실행 시 Git 이 의도대로 2파일만 잡아야 했는데, 왜 44파일이 딸려갔는지 정확 원인 미규명. 의심: Windows 환경의 일부 Git hook 또는 harness 의 pre-commit 단계. **로컬 only 커밋이라 `git reset --soft HEAD~1 && git reset HEAD .` 로 완전 복구** → AdminCard 2파일만 재add/재commit 해서 `967a462` 깨끗한 버전으로 교체. 이후 4커밋은 **매번 `git diff --cached --stat` 로 선검증** 해서 재발 방지. 다음 세션부터는 **staging 후 반드시 `git diff --cached --stat` 확인**을 의식적으로 수행할 것.

**SchedulerMonitor 테스트 race**: Step 3 에서 "로딩 중에도 제목 보이는 UX 개선" 으로 isLoading 분기에도 AdminCard `<h3>스케줄러 모니터링</h3>` 을 렌더하게 됨. 그런데 기존 테스트 `waitFor(() => screen.getByText("스케줄러 모니터링"))` 가 이전엔 정상 분기 도달까지 기다려줬는데(원본 isLoading 분기는 `h-5 w-40 pulse` skeleton 이라 해당 텍스트 없음), 이제 isLoading 에서 즉시 해소돼 jobs 데이터 로드 전에 다음 assertion 이 실행돼 실패. 해결: waitFor 기준을 `"에어코리아 대기질"` (정상 분기 job name)로 변경. summary 텍스트는 중첩 `<span>` 이라 `getByText` 불가 → `container.textContent.toContain` 으로 전환. 이 fix 는 플랜 범위 외 파일(`SchedulerMonitor.test.tsx`) 수정이었지만 내 변경이 유발한 regression 이라 Step 4 에 포함.

### 세션 46 하네스 교훈 (다음 세션 필독)

1. **`git add` 후 `git diff --cached --stat` 선검증**: 세션 45 에 이어 또 한 번 확인됐듯, Windows 환경에서 staging 이 의도대로 안 될 수 있음. 커밋 전에 **반드시** staged diff 를 보고 파일 수/라인 수가 예상과 맞는지 확인. 계획대로 "2파일 ±30줄" 예상인데 staged 에 "44파일 4000+ 줄" 이면 즉시 `git reset HEAD .` 로 돌리고 재시도
2. **UX "개선" 이 테스트 regression 을 만들 수 있음**: skeleton 헤더 블록 제거가 "로딩 중에도 제목 보임" 이라는 긍정적 변화지만, 기존 테스트의 `waitFor(getByText("..."))` 동기화 기준이 그 "숨겨진 텍스트 부재" 에 암묵적으로 의존했기 때문에 race 발생. **컴포넌트 리팩터 시 `waitFor(getByText(...))` 기준이 해당 컴포넌트 다른 분기에도 존재하는지 grep 으로 미리 확인** 필요
3. **Explore grep 범위 누락**: Phase 1 에서 `src/components/admin/__tests__` 만 검색하고 `src/components/__tests__` (admin 외부지만 SchedulerMonitor 테스트가 거기 있음)는 빠뜨림. 다음 세션부터 **테스트 파일 grep 범위는 `src/**/__tests__` 로 확대**
4. **`className` prop 도입은 1곳만 사용이면 과잉**: GATE 4 검증에서 확인. 외부 래퍼 `<div className="...">` 가 더 깔끔. presentational 컴포넌트에 prop 추가할 때 "실제 사용처가 2곳 이상인지" 기준 적용

**상세**: `memory/session46_summary.md` (세션 종료 시 생성)

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

**마지막 작업 (세션 47, 2026-04-16)**: **ComplexRow/ComplexCardMobile memo props 안정화** — 세션 46 에서 넘긴 "React.memo 확대" 백로그가 스테일 판정. 실제 확인해보니 ArticleTable/ArticleCardMobile/ComplexRow/FilterDropdown 전부 이미 `memo()` 적용됨. 진짜 문제는 **ComplexRow/ComplexCardMobile 의 호출부가 인라인 화살표 `onToggleCompare={() => toggleCompare({...})}` 와 매 렌더 새 문자열 `filterURL={buildURL(...)}` 로 memo 얕은비교를 무력화**하고 있던 것. 수리:
- `onToggleCompare` 시그너처를 `() => void` → `(item: CompareItem) => void` 로 변경, 부모는 `toggleCompare` 참조만 그대로 전달 (useLocalStorageList 의 useCallback 으로 안정된 참조)
- `filterURL` prop 제거, 대신 자식이 `urlFilters` 만 받아서 내부에서 `buildFilterURL(...)` 로 직접 계산 (urlFilters 는 `useFilterParams` 의 `useMemo` 로 searchParams 의존성만 있어 안정)
- `useFilterParams` 에서 `buildURL` 구조분해 제거, `buildFilterURL` 을 named export 로 직접 import
- 파일 1개 (`search/page.tsx`) 12+/9-, tsc/lint/vitest 568 통과

**다음 우선순위 (세션 48)**:

1. **Playwright 시각 회귀 + 인증 fixture 설계** — 세션 44/45/46/47 연속 skip. /admin 은 Supabase httpOnly 쿠키 기반이라 JWT 직접 생성 불가 — storageState 에 실제 로그인 세션을 한 번 기록해두는 fixture 필요. `.env.test` 에 테스트용 관리자 계정 분리 선행. Playwright CI job 도 같이 추가 (현재 CI 에 없음)
2. 🟡 **AdminCard 추가 검토** — 세션 46 에서 제외한 `admin/settings/page.tsx:76` 편집 모드 카드. title + action(timestamp + 편집 버튼) + 편집모드 분기 처리 가능한지 재판정
3. mibunyang 쪽에서 `quota_db_integration.md` 적용 (mibunyang 세션, 본 프로젝트 변경 없음)
4. Supabase MCP 2개 해제 안내 (사용자 수동, /mcp UI)

### 세션 47 하네스 교훈
- **백로그 "스테일" 2세션 연속 재발**: 세션 45 에서 "CLAUDE.md 백로그는 실제 코드와 대조 검증 없이 그대로 실행하면 헛걸음" 교훈을 적었는데 세션 46 에 백로그를 쓸 때 같은 오류를 반복 — "React.memo 확대 — FilterDropdown 만 적용 상태" 라고 적었으나 실제로는 4개 컴포넌트 전부 적용돼 있었음. **규칙**: CLAUDE.md 의 "다음 우선순위" 섹션에 항목을 추가할 때는 해당 시점에 **실제 grep 으로 현 상태 실측** 후에만 기록. "아마 그럴 것" 금지
- **스테일 백로그에서도 Explore 사전조사의 가치**: 헛걸음처럼 보였지만 Explore 중에 "memo 는 있는데 호출부 인라인 콜백으로 무력화" 라는 진짜 버그 발견. 백로그가 틀렸어도 사전조사가 실제 이슈를 드러내는 통로가 됨. 세션 45 결론 "Explore 3개 병렬 습관 유지" 재확인
- **Playwright /admin 시각 회귀는 단독 세션 필요**: 인증 fixture + CI 통합 + 테스트 계정 분리 + storageState 캐싱까지 한 세션에 전부 들어가야 가치 있음. 공개 페이지만 찍는 반쪽짜리는 실익 낮음. 세션 48 에서 정식 진행
- **3번째 Explore 에이전트 로그인 실패 발생**: Phase 1 에서 병렬 3개 Explore 중 하나가 "Not logged in · Please run /login" 으로 죽음. 2개 결과만으로 충분해서 재시도 없이 진행. 교훈: 병렬 Explore 는 N-1 결과로도 진행 가능하도록 "한 에이전트 실패해도 다른 2개 커버" 분담 설계

<!-- 보류 (사용자 미요청): 미분양 지도 뷰 (FE 2파일, Naver Maps 오버레이), 비교 페이지 4→6~8 확장 (세션 46 스킵 결정) -->

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
