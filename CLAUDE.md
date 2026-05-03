# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-05-04 — 세션 104, **보유세 도구(/tools/property-tax) 화면 출시 100% — 도구 5종 라인업 완성**. 7 커밋 push (a2f0ea9 B-1 page+Calc+Inputs / a3eb4ec B-2 ResultCard+Notices+단위 / 672e281 C-1 Header+sitemap+Header.test / 0974013 C-2 e2e 6케 / 3711e58 D-1 realestate-calculators 4종→5종+posts.ts+blog.test / 1158f9f D-2 property-tax-guide 단독 발표 / 84c433e R1 e2e strict mode fix). vitest **916 → 925** (+9). 사용자 가치 🟢 26~27건 → **27~28건째**. **Phase B-1**: page.tsx (54줄) + PropertyTaxCalculator.tsx (52줄) + PropertyTaxInputs.tsx (142줄) — 5 useState (publishedManwon/houses/isSingleHouseEligible/ageYears/holdYears) + 공시가 강조 박스(시세X) + 1세대1주택 체크박스 houses===1 가드 + 연령/보유 입력 singleActive 시만 표시. **Phase B-2**: PropertyTaxResultCard.tsx (96줄) + PropertyTaxNotices.tsx (121줄) + 단위 테스트 (101줄) — 4분기 BRANCH_TEXT 색상 + formatPropertyRateLabel 헬퍼(R12 답습 `|| 0` fallback) + 표 dynamic 행 (재산세 / 종부세 / 세액공제·credit>0 / 농특세·rural>0) + 황색 박스 "세부담 상한 150% 미반영" + 12 NoticeKey × Tone 정렬 + PDF 16개 권위 출처 인용. **Phase C-1**: Header.tsx +18 (데스크톱 5번째 + 모바일 5번째) + sitemap.ts +1 + Header.test.tsx 4→5 회귀 가드. **Phase C-2**: e2e/property-tax-flow.spec.ts (101줄) 6 케이스 (페이지 진입 + 헤더 메뉴 + 4 분기). **Phase D-1**: realestate-calculators.mdx 4곳 산발 정정(도입부 4종→5종 / 로드맵 표 5번째 행 / "5. 보유세" 신설 ~30줄 / 자료 출처 PDF 16개) + posts.ts realestate-calculators 갱신 + property-tax-guide entry + blog.test.tsx 6→7편. **Phase D-2**: property-tax-guide.mdx (80줄) 단독 발표 글 — 핵심 함정 3개(공시가≠시세 / 1세대1주택 자격 / 종부세 0원 분기) + 사용 흐름 3단계 + 분기 4종 표 + 세부담 150% 안내 + 면책 강화(공동명의·합산배제·임대등록·종교/사원용·법인 누진) + PDF 16개 권위 출처. **R1 사고**: e2e single-house 케이스 `/1세대1주택자.*공제 12억/` 정규식이 3 elements 매칭 strict mode violation → "분기:" prefix 한정으로 fix (세션 100 답습). **plan**: `C:\Users\user\.claude\plans\104-federated-wolf.md`. **plan 위반 1건**: D-1 → D-2 순서가 잘못됨 (posts.ts에 property-tax-guide entry 먼저 추가하고 mdx 파일은 D-2에서 만들어 D-1 CI 빌드가 prerender 실패) — 다음 세션부터 mdx 신규는 entry 등록 직전 또는 같은 커밋에 묶어야 함. CI 모두 success (R1 25275462406 7m50s).

**과거 작업 (세션 103)**: ABC 트랙 풀세트 완수. 6 커밋 push (1a38698 R13+R15 / d776213 gitignore / 22ca04a C-1a storage+훅 / b72ca32 C-1b 컴포넌트+페이지 / 6d5470a A-1 brackets+types / dddf9ca A-2 진입점). vitest 868 → 916 (+48). 사용자 가치 🟢 23~24건 → 26~27건. 트랙 B(양도세 R13+R15 마감) + 트랙 C-1(단지 메모, 매물 영역 8세션 부재 후 자연 복귀) + 트랙 A(보유세 라이브러리 Phase A — PDF 16개 권위 출처 100% 정확값). 9 GATE v1→v2 재검증으로 GATE 8 권위출처 차단 🟡 → 🟢. **plan**: `C:\Users\user\.claude\plans\103-cryptic-zebra.md`. 6 커밋 push (1a38698 R13+R15 / d776213 gitignore / 22ca04a C-1a storage+훅 / b72ca32 C-1b 컴포넌트+페이지 / 6d5470a A-1 brackets+types / dddf9ca A-2 진입점). vitest 868 → **916** (+48). 사용자 가치 🟢 23~24건 → **26~27건**. **트랙 B**: TransferResultCard R13(단기+중과 동시 가산세 별도 행) + R15(비과세/양도차손 본세 라벨 명확화). **트랙 C-1 (매물 영역 8세션 부재 후 자연 복귀)**: storage.ts complex_notes 헬퍼 (단지당 500자 / 1000개 한도) + useComplexNote 훅 + ComplexNoteButton (📄/📝 아이콘 + 모달 role=dialog/aria-modal/ESC 닫기/maxLength 카운터) + complex/[no]/page.tsx 즐겨찾기★ 옆 통합. 회귀 가드 17 케이스. **트랙 A (보유세+재산세 통합 lib, 갈래 ㄴ 채택)**: 사용자 PDF 16개 직접 업로드로 권위 출처 차단 우회 → 정확값 100% 박제. property-tax-types.ts (12 NoticeKey + 4 분기) + property-tax-brackets.ts (재산세 1주택특례·일반 4구간 + 종부세 2주택이하·3주택이상 7구간 + 1세대1주택 세액공제 한도 80% + 농특세 20% + 공정시장가액비율 60%) + property-tax.ts 진입점 (validateAmount 답습 + 4단계). 권위 출처 = 국세청 종부세 PDF 16개 (지방세법 §111 + 종부세법 §8/§9 + 합산배제 + 1세대1주택 보유기간 특례 + 공동명의 + 세율표 + 세액계산 흐름도 + 가산세 + 납부기한 + 향교/종교 + 사원용 + 임대주택 + 주택신축용 + 법인 누진). **9 GATE v1→v2 재검증** (사용자 PDF 업로드 후 GATE 8 권위출처 차단 🟡 → 🟢 승급). **plan**: `C:\Users\user\.claude\plans\103-cryptic-zebra.md`. **남은 후속**: A Phase B (page+Calculator+Inputs) + Phase C (ResultCard+Notices) + Phase D (e2e+sitemap+Header+blog mdx 5종 라인업 갱신) — 세션 104 이월.

**과거 작업 (세션 102)**: blog mdx 4종 출시 본문 갱신 + transfer-tax R11+R12+R14 통합 fix + 한시배제 알람 routine 2건. 2커밋 push (2255dac docs blog 3파일 +51/-17 / ae5815e fix transfer-tax 5파일 +104/-4). **R11**: TransferResultCard 에 `formatBaseTaxLabel` 헬퍼 추가 → "본세 (70.0%)" → "본세 (미등기 70%)" / "본세 (단기 70%)" / "본세 (단기 60%)" / "본세 (중과 30%)" 사유 구분 (미등기 branch + short-term-70/-60 + multi-heavy-applied notes 분기). **R12 (9 GATE 2차 발견)**: `generalBranch.appliedRate` 가 단기·중과 둘 다 0 일 때 0 으로 박혀 누진 일반 케이스 (#5/#9/#13) 가 "본세 (0.0%)" 표시 → `||` fallback 으로 `progressiveRate` 추출 (singleHouseProrateBranch L51 패턴 답습). **R14 (9 GATE 3차 발견)**: `single-house-fail-hold/-live` 두 notes 키가 타입+UI 정의는 있지만 push 안 됨 = dead code → transfer-tax.ts GATE 3 폴백 시 immutable spread `[...result.notes, X]` 추가. blog mdx 도입부 시제 정정 + 평·㎡/양도세 섹션 2개 추가 + 자료 출처 5건 보강 (양도세 출처 2건). vitest **860→868** (+8 신규: 회귀 가드 강화 + 신규 R14 케이스 1 + 컴포넌트 테스트 7 factory 패턴). tsc 0, lint 0, CI 둘 다 success (2255dac 7m52s + ae5815e 7m31s). **9 GATE 무한검증 9차 답습** (사용자 "보강하고 검증 계속" 5회 지시) — R12·R14 sister 결함 1차 plan 에선 못 봤음, 2~3차에서 발견 → 통합 결정. **한시배제 종료 알람 2 routine 등록**: D-1 (2026-05-08 09:00 KST `trig_01QmGiXUYr4qYn7S5sLF7Lao`) + D-Day (2026-05-09 09:00 KST `trig_01SBmcuUPm75bk2PYGTst1MB`) — EXEMPTION_END_DATE 코드 상수 확인 + 정부 발표 검색 + 추가 연장 시 PR 자동 작성. **사용자 가치 🟢 23~24건**. **plan**: `C:\Users\user\.claude\plans\102-glittery-boot.md`. **남은 후속**: R13 (단기+중과 surchargeTax 별도 행 미표시) + R15 (비과세/양도차손 본세 0% 모호 → if 가드 확장 ~3줄), 둘 다 우선순위 낮음.

**과거 작업 (세션 101)**: transfer-tax R10 X3 코드 결함 fix + mdx 라인업 정정 1커밋 (f427dc4 3파일 +5/-2). singleHouseProrateBranch.appliedRate fix → "본세 (24.0%)" 정확화. vitest 860 유지. 양도세 100% 마무리.

**과거 작업 (세션 100)**: /tools/transfer-tax C-2 완료 → 양도세 계산기 100% 완성 (e2e + blog). 2커밋 push (2e36831 e2e 8케+ci.yml public 활성화 / 57b4114 blog 발표 글+posts+test). vitest 859→860, Playwright 56 passed. 9 GATE 9차 무한검증. R10 코드 결함 박제 (세션 101 에서 fix).

**과거 작업 (세션 99)**: /tools/transfer-tax X3 + B-2-b + C-1 (95% 완성). 3커밋 push (fd7e86b/ffbb4e3/db77c84). vitest 859 유지, 9 GATE 9차 무한검증 후 plan 승인. 케이스 #2 = 본세 12,456,000원 + Notices 3건.

**과거 작업 (세션 98)**: Phase A 코드 작성 (b1105aa Phase A-1/2 산식 라이브러리 3파일 / 85ce626 Phase A-3/4 진입점+51 테스트 2파일). vitest 808→859 (+51 통과), 9 권위 출처 교차검증 (법제처 §95② 본문 + 국세청 표 13컬럼 + 흠택스 + KB금융 + 한경 + 부동산뱅크 + 조세심판원 + 정부 한시배제 발표). plan v1.8: `C:\Users\user\.claude\plans\98-glowing-bubble.md`.

**과거 작업 (세션 95)**: /blog/realestate-calculators 본문 발행 (2커밋 9912cd0/2647470 push 완료, vitest 761→762, CI 둘 다 success) + **/tools/acquisition-tax 신설 plan 9 GATE 9차 무한검증** (코드 0 커밋, plan 파일만 v1.0~v1.8 8차 정정). **plan 진화**: v1.0(세금분기 3건) → v1.1(산술/안내/가드 4건) → v1.2(이름/EMPTY/100줄/ARIA 4건) → v1.3(validateAmount(0)/100줄/git revert 3건) → v1.4(area_m2 1건) → v1.5(bash arithmetic 1건) → v1.6(format/cascading/inline 4건) → v1.7(8차 노란 5건 보강) → v1.8(9차 빨간 3건 정정). **최종 plan v1.8**: `C:\Users\user\.claude\plans\95-acquisition-tax-v1.8.md`. 14파일 6 Phase. **무한검증 패턴**: 1~4차 14건 핵심결함 사전정정(가치 매우 높음) → 5차 첫 수렴 → 6/7차 정밀도 1건씩 → 8차 보강 5건 → 9차 보강이 신규 결함 3건 만듦("고치면 또 깨짐" 패턴 확정).

**과거 작업 (세션 95 전반)**: /blog/realestate-calculators 본문 발행. 2커밋 push (9912cd0 Phase A 본문 66줄 / 2647470 Phase B+C posts.ts draft 해제 + blog.test.tsx 동적화 + 신규 1케). vitest 761→762. CI 둘 다 success, baseline 깨짐 0 (3세션 연속 안전).

**과거 작업 (세션 94)**: 중개수수료 계산기 (/tools/brokerage-fee) 신설. 4커밋 push (3d64532/472ae9b/6f3d999/f627857). 시행규칙 별표1 4종 요율 + 월세환산 ×100→×70 + validateAmount + 부가세 일반/간이. 9 GATE 2회 풀 검증 → 🔴 0. brokerage.ts 단일 202줄 → 3파일 분할 사전 회피. vitest 728 → 761.

**과거 작업 (세션 93)**: /blog MDX 인프라 + 전세가율 1편 + placeholder 4편. 11커밋. MDX 5 deps + withMDX + mdx-components 14종(img next/Image 강제). /blog/[slug] generateStaticParams + dynamicParams=false + dynamic import 정석. draft 4편 robots noindex + sitemap 제외. CI #365 baseline 깨짐 없이 통과(Header "블로그" 추가는 contains 매처라 안전).

**Lock 파일 카운트 가이드**: 80줄/3파일 룰의 파일 카운트에서 `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` 등 자동 생성 lock 파일은 제외한다. (이번 세션 ad5ea61 = 4파일이지만 lock 제외 시 3파일로 룰 준수)

**환경변수 등록 안내 (사용자 후속, 세션 91-92 부터 미완료)**: Vercel 대시보드에 `NEXT_PUBLIC_SITE_URL=https://2u.pe.kr` + Google Search Console·네이버 웹마스터 가입 후 인증 코드 → `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` 등록 → 재배포 → sitemap.xml 제출.

**직전 작업 (세션 91-92)**: SEO 최소 패키지 + /pricing 마케팅 페이지. 13커밋. 비즈니스 모델 공인중개사 B2B 구독 명시. CI 사고 3건 모두 해결.

**과거 세션 (세션 89)**: /admin 데이터 신선도 카드 + 헛바퀴 감지 + 한 줄 건강 요약 + ⓘ 도움말. 13커밋. BE 573, FE 699. baseline 2회 갱신.

**직전 작업 (세션 88)**: /search 빈 결과·에러 UI 보강. 3커밋 push (1839dd4/70f0736/229b880, 2파일 +250/-13). 사각지대 3건 보강: 서버 결과 0 + 최근 검색 칩 / 필터 통과 0건 신설 / 에러 시 필터 초기화 동시 노출. vitest 675 → 680.

**과거 세션 (세션 87)**: /search 단지 검색 결과 정렬 드롭다운 신설 (필터바 우측, 7종 클라이언트 정렬). 3커밋 push (5cf5c87/6f4a746/a84172e, 6파일 +243/-7). vitest 664 → 675.

**과거 세션 (세션 86)**: 단지 상세 페이지 매물 표 위에 "적용된 필터" 한 줄 요약 칩 신설. 3커밋 push (7720ef7/72be290/88b2fc5, 4파일 +137/-2). `FilterChipsSummary.tsx` 신규 (59줄, buildChipList 재사용 + noop reset 주입 + 읽기 전용). vitest 659 → 664.

**과거 세션 (세션 84)**: 면적 빠른선택 active(파랑) 표시 버그 수정 (세션 83 격리 부채). 3커밋 push (94d4be1/edfc75d/c724867, 3파일 +116/-6). PresetButtons.tsx에 `unit?` `presetUnit?` optional prop + `matches` 헬퍼. FilterBar.test.tsx 9케이스 추가. vitest 645 → 654.

**과거 세션 (세션 83)**: 면적 빠른선택 클릭 시 현재 단위로 자동 변환. 2커밋 push (82330ce/ec7cfec, 2파일 +101/-3). FilterBar.tsx applyPreset 본문에 `minKey === "minArea" && areaUnit === "평"` 분기 추가, m² 기준 preset.min/max를 convertArea로 평 변환 후 dispatch. vitest 638 → 645.

**과거 세션 (세션 82)**: 면적 m²↔평 토글 자동 변환. 3커밋 push (1e9c64e/47b0ec2/d380e1f, 4파일 +113/-4). `convertArea(value, from, to)` 헬퍼 + reducer `SET_AREA_UNIT` 액션 + FilterSections 토글 onClick(emitChange 3키 단일 호출로 URL 동기화 race 방지) + 7 케이스. vitest 631 → 638.

**과거 세션 (세션 80~81)**: 가격 드롭다운 거래유형별 라벨·노출 동적화 + 월세 빠른 선택 신설. 4커밋 push (423278b/ef26ca6/4c886cb/f5ca073, 4파일 +147/-27). priceLabels(tradeType) 헬퍼 + 안내박스 + 매매·월세 분기 + 월세 보증금/월세 5단계 PresetButtons 신설.

**과거 세션 기록**: `C:\Users\user\.claude\projects\f--cursor-naver-estate-web\memory\session{N}_summary.md` (세션 43~78 일자별 정리). 사고·교훈·결정을 찾으려면 해당 파일 직접 조회.


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
           [FastAPI (집 서버 DESKTOP-Q5999EI, localhost:8002)]
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
- 인기 단지 크롤링: 매일 10:45/14:45/19:15, 개별 단지 try/except (부분 실패 허용, 기본 배치 50)
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
- 필터: FilterBar flex flex-wrap items-center gap-1.5, FilterDropdown max-w-[calc(100vw-2rem)]
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
| FE 단위/컴포넌트/훅/페이지 | Vitest | 612개 (71파일) |
| E2E | Playwright | 16파일 (--webpack 모드) |
| BE 단위/통합/API | pytest | 563개 (46파일) |

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
