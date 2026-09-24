# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 진입점

새 컨텍스트 읽기 순서 = ① `.claude/rules/` 11종 (자동 로드) → ② `.claude/ASSETS.md` · `.claude/GLOSSARY.md` · `.claude/BLOG.md` (필요 시 참조) → ③ FE/BE 깊이 토픽 5종 (FE/BE 작업 시 명시 참조) → ④ `memory/MEMORY.md` (세션 누적 박제).

| 자료 | 위치 | 용도 |
|---|---|---|
| **자산 인덱스** | `.claude/ASSETS.md` | 한국어 PDF 16장 / 계산기 라이브러리 14개 / 글로벌 자산 / 운영 부채 |
| **도메인 용어집** | `.claude/GLOSSARY.md` | 한국어 부동산 도메인 용어 30+ 개 |
| **블로그 라인업** | `.claude/BLOG.md` | /blog MDX 26편 (시세 분석 5 / 세금 6 / 도구 활용 9 / 미분양 6) + 새 글 발행 4단 절차 |
| **FE 깊이 토픽 4종** | `frontend/.claude/{hooks-and-state,ui-patterns,pages-and-mb,tools-lineup}.md` | FE 작업 시 명시 참조 (자동 로드 안 됨) — 훅·UI 패턴·페이지 흐름·도구 5종. **E2E·시각회귀 정본 = `frontend/e2e/README.md`**(세션 412 이동 — spec·baseline 수정 전 필독) |
| **BE 깊이 토픽 1종** | `backend/.claude/details.md` | BE 작업 시 명시 참조 (자동 로드 안 됨) — 실거래가·mibunyang·검증·중복 제거·**스케줄러 잡 상세 6절**(infra.md 표에서 이동, 세션 411)·**Supabase 다운 런북·스케줄러 운영 배경 3절·release 레거시/사건표**(세션 412 이동) |
| **세션 박제 메모리** | `C:\Users\user\.claude\projects\d--naver-estate-web\memory\` | 세션 43~231 일자별 정리 + 박제 룰 + 사고 회고 (세션 212 D: 이사 PR #35 답습) |
| **세션 79~112 archive** | 메모리 폴더 `sessions_79_112_archive.md` | 도구 5종 라인업 진화 + 박제 룰 진화 한 표 요약 |

## 비즈니스 모델

**공인중개사 B2B 구독 단독** (세션 91~92 결정 박제 + 세션 209 재확인 박제: "B2B 단독은 맞다, 단 사용자가 쓰기 편해야"). 단지 6만개 색인 = **SEO 자산 + 구독자가 보는 핵심 데이터** (B2C 확대 아님). 가치 데이터 무료 공개 + 도구 100% 정확 산정 + /pricing 7일 무료 체험.

## 디자인·UX 리뉴얼 (완료 — 세션 188~244, PR 0~7 전량 머지)

**진실의 원천**: [docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md](docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md) (역사 기록·디자인 원칙 참조용).

PR 0~7 전부 머지 (#28~#94). 후속 UI 작업은 spec 의 디자인 원칙을 따른다 = Claude 디자인 5색 + Pretendard 단일 + shadcn/Radix (모방 전략) + 사용자 명시 잣대 "사용자가 쓰기 쉽게"·"기능 다 만들지 말고 GitHub 가져다 쓴다" + 네이버 크롤링 IP 차단 방지.

`frontend/.claude/{ui-patterns,hooks-and-state,pages-and-mb,tools-lineup}.md` 의 UI 컴포넌트·페이지 박제는 **UI 변경 시 함께 갱신**. spec 와 drift 시 spec 우선.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query (TanStack Query v5) + Recharts 3 + MDX
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi + requests + APScheduler
- **DB**: Supabase (PostgreSQL) + Supabase Auth
- **배포**: Vercel (frontend, 2u.pe.kr) + 집 서버 (backend, Cloudflare Named Tunnel api.2u.pe.kr)

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
검색 → 홈(/)에서 직접 (SearchExperience 공용, /search→/ 리다이렉트 — 세션 314 홈/검색 통합)
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 클릭 → DB 즉시 표시 + 자동 매물 크롤링 (start-crawl → 10/20/30초 refetch)
필터 변경 → /api/complexes/{no}/articles (SQL WHERE) + URL 파라미터 동기화
실거래가 → /api/live/{no}/price-history/start-collect (24시간 TTL, 자동 트리거)
가까운 지하철 → /api/complexes/{no}/subway (subway_stations 전국 1,099역, 3km 최대 3역·환승 그룹핑·12h 캐시, 연 1회 수동 재적재 — 세션 367)
관리비·복도유형 → /api/complexes/{no}/kapt (K-apt 단지 매칭 월 1회 + 관리비 매일 500단지 회전 — **매월 최신 공개월로 갱신**(보유한 가장 최신 달보다 새 달만 시도, 달마다 행이 쌓이고 화면은 최신월 1건 표시)·화면에 기준월 표시, 12h 캐시, 매칭만 있으면 200+금액 null, 미매칭 404 — 세션 388)
단지 비교 → /compare?ids=no1,no2,... (useQueries 병렬 + 평당가 + 인쇄/엑셀)
엑셀(매물) → /api/articles/export (xlsxwriter)
엑셀(비교) → 클라이언트 xlsx (safeCellValue 수식 인젝션 방어)
```

### 미분양 (mibunyang)
```
미분양 조회 → /api/mb/apartments?sort_by=&keyword= (정렬+검색+중복제거)
분양 조회 → /api/mb/presale, /api/mb/competition (분양 탭: 민간분양/LH공공분양/분양결과 — 세션 314) · /api/mb/presale/officetel-rental (오피스텔·민간임대 목록, 둘 다 주소 포함 — 오피스텔 주소는 V066 세션 417)
분양 상세 → 청약 일정·평형별 공급·D-day (getMbPresaleDetail, 세션 314)
지도 뷰 → list↔map 토글 (MbClusterMap 다중마커, 접속자 GPS 위치 기준, mb_view_mode — 세션 315~316)
미분양 비교 → /mibunyang/compare?ids= (17행 우위 + 레이더13축 + 가중치 + 분양가/추이 차트)
미분양 즐겨찾기 → localStorage (최대 200개, 일괄 비교, FavSortBy)
미분양 히스토리/북마크 → localStorage (자동 저장 10개 / 수동 저장 20개)
레이더 설정 → localStorage (축 선택 + 가중치 1-5, 프리셋 3종)
```

### 환경 데이터 수집 (스케줄러 — 상세는 `.claude/rules/infra.md` 참조)
```
대기질 → 매일 02:00 (에어코리아 API → infra.air_*)
응급의료 → 매월 첫째 월 03:00 (NEMC → infra.emergency_*)
어린이집 → 매월 첫째 목 01:00 (CPMS cpmsapi030 → infra.childcare_*, mibunyang 과 키 공유라 01:00 고정 — infra.md §CPMS 키 공유)
범죄통계 → 분기별 첫째 일 04:00 (경찰청 odcloud → infra.crime_*, CSV 폴백)
공공데이터 → 토요일 05:00 (국토교통부 실거래가, 10일 토요일 skip)
관리자 트리거 → POST /api/admin/collect/{name} (동기 120초)
```

## 주요 기능·구현 사항

> **인프라·운영**: 상세 = `.claude/rules/infra.md` §스케줄러 (APScheduler) + 서버 자동 시작 / Named Tunnel / 공유 쿼터 / NullPool / CSP·Hydration.
>
> **공인중개사 검증 (B2B 구독 모델)**: FE = `/verify` + `/admin/users` + Header 전문가 뱃지 (role=expert). BE 워크플로 상세 = `backend/.claude/details.md` §공인중개사 검증 워크플로 참조.

## 환경변수

### 필수 (3곳 동기화: Vercel + backend/.env + frontend/.env.local)
- `ADMIN_EMAIL` — 관리자 이메일
- `NEXT_PUBLIC_API_URL` — 백엔드 API URL (Named Tunnel: https://api.2u.pe.kr)

### SEO (Vercel 등록 완료, 세션 388 `vercel env ls` 실측 확인)
- `NEXT_PUBLIC_SITE_URL=https://2u.pe.kr`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` (서치 콘솔 인증)

### 백엔드 전용 (backend/.env)
- `AIR_QUALITY_ENABLED`, `EMERGENCY_ENABLED`, `CHILDCARE_ENABLED`, `CRIME_STATS_ENABLED` — 수집 토글
- `CHILDCARE_DETAIL_API_KEY` — cpmsapi030 운영키
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — Gmail SMTP SSL 465
- `PAYMENT_ENABLED` — 결제 기능 전역 스위치 (**코드 기본값 false = 꺼짐**, 세션 400 무료 전환). 꺼져 있으면 결제 API 7종(`/api/payment/{prepare,complete,webhook}`·`/api/payment/billing/{prepare,register,list,cancel}`)이 전부 **403**(`결제 기능이 비활성화되어 있습니다`)이고 04:50 빌링키 자동결제 잡도 미등록. 라이브 `.env` 에 항목이 없으므로 배포·재시작만으로 잠긴다(`.env` 편집 불필요). 매출 시작 시 `PAYMENT_ENABLED=true` 한 줄 추가 + 재시작으로 결제 코드 그대로 재개. 게이트 구현 = `config/payment_flags.py`, 회귀 = `tests/test_payment_disabled.py`
  - ⚠ **재개는 BE·FE 를 반드시 한 묶음으로** (세션 405 적대검증 HIGH). BE 는 집서버 `.env`+재시작, FE 는 Vercel 커밋+배포라 **배포 경로가 완전히 다르다.** BE 만 켜면 결제 API 는 열렸는데 `/terms`·`/refund`·`/privacy` 는 "지금은 무료로 운영 중입니다" 를 계속 띄운다 — **실제로는 과금되는데 화면은 안 된다고 고지**하는 상태라, 환불 분쟁 시 사업자에게 불리한 증거가 된다. 재개 체크리스트 = ①BE `.env` 에 `PAYMENT_ENABLED=true` + 재시작 ②FE `lib/locked-paths.ts` 의 `LOCKED_PATHS` 에서 `/pricing` 제거 + 헤더 메뉴·sitemap·robots 원복 ③`pricing/page.tsx:83` 등 "7일 무료 체험" 문구가 **그때 가격 정책과 맞는지** 재확인(잠긴 동안 방치돼 낡아 있다) ④라이브에서 세 문서의 배너 소멸 확인(`curl -s https://2u.pe.kr/terms | grep -c "무료로 운영 중"` = 0). 배너 판정 = `isPaidServicePaused()`(= `/pricing` 잠금 파생)

## 테스트 현황 (BE = 세션 416 직접 실측 2026-09-19 · FE = 세션 410 실측)

| 영역 | 도구 | 테스트 수 |
|------|------|----------|
| FE Vitest | `frontend/src/**/__tests__/` + `frontend/scripts/__tests__/` | **2213개** (세션 410 실측 — 2213 passed / 246 파일, 새 `it()` 0 인 PR #531 에서 잰 값이라 기준선 자체. 옛 2205(세션 401). ⚠ **옛 표기 "RegionSelector 는 단독 재실행하면 통과 = 결함 아님" 은 거짓**이었다(s399·s400 이 확인 없이 flaky 로 분류). 세션 401 에 유휴 상태 **단독 실행에서도 실패**(EXIT=1) 실측 — 사유는 단언 실패가 아니라 `Error: Hook timed out in 10000ms`(10,270ms). 원인 = `beforeEach` 가 매 테스트 `vi.resetModules()` + `@base-ui` 동적 재import 로 모듈 그래프를 6회 재구성. 전량 실행에선 통과하기도 해 회차마다 갈린다. 판정법도 정정: "단독 재실행"이 아니라 **`git diff origin/main` 으로 그 파일 무변경 확인 + 사유가 타임아웃인지 확인**. ✅ **구조 수정 완료(세션 416)** — `vi.resetModules()`·동적 재import 를 걷어내고 정적 import + `vi.hoisted` 로 바꿨다(컴포넌트에 모듈 단위 상태가 없고 `TestQueryProvider` 가 마운트마다 새 QueryClient 를 만들어 재적재가 애초에 불필요). 타임아웃이 걸리던 `beforeEach` 훅 자체가 없어졌으므로, 이후 이 파일이 타임아웃으로 실패하면 **새 원인**이다. 직전 기준선 2174 에 시각회귀 안전망 +31 신설(check-visual-guard 25 · Header 메뉴집합 5 · Footer LOCKED_PATHS 1). 옛 문서값 2148(s399)·2135(s396)) |
| FE E2E | `frontend/e2e/*.spec.ts` | **20 파일** (Playwright, --webpack 모드. 시각회귀 baseline PNG **20장**(세는 법 = `find frontend/e2e -name "*.png" | wc -l` — 헤더 전용 `header-public-desktop` baseline 은 PR #501 에서 생성·커밋됐다. 옛 "19장·생성되면 20장" 표기는 세션 412 검사관이 실측으로 정정). 재생성 순서·판정·함정 = `frontend/e2e/README.md` §baseline 재생성 절차(세션 412 에 testing.md 에서 이동 — 시각회귀 절차 정본). project 별 대응표도 같은 파일) |
| BE pytest | `backend/tests/` | **1946개** (세션 416 직접 실측 `--collect-only`, 2026-09-19 — #548 기준 1939 → 테스트 임시 DB 경로 가드(`test_conftest_temp_db.py`) +7. 임시 SQLite 파일명에 PID 가 붙어 **같은 PC 에서 pytest 두 개를 동시에 돌려도 서로 밟지 않는다**(옛 고정 이름은 `no such table`·`WinError 32` 거짓 실패를 냈다 — 세션 415). 옛 값 1896 = 세션 412 실측(2026-09-17) — #537 기준 1889 → #539·#540 시각표 가드(`test_restart_schedule_table.py`) +7. 옛 값 1869 = 세션 410 실측 — #530 기준 1867(+2: explain_error 결제 상태별·공백 입력) → 후속 PR(마침표·마스킹·포괄 규칙 회귀 3건) 1869. 세션 409 값 1865 는 `702b01d`(#527) 기준, 1845 대비 +20. 알림 8창구 우리말화 회귀: 필드 사전·문구 경계(`test_field_drift_monitor.py`)·결제/수집 안내 분기와 조사(`test_job_error_listener.py`)·개발자 어휘/접두어 **전수 추출 가드**(`test_plain_words.py`, **워크플로 YAML 포함**). ⚠ **`--collect-only`·pytest 는 `backend/` 안에서 실행하는 것이 표준**(pytest.ini·conftest 가 그 기준). 옛 함정 = 레포 루트에서 돌리면 `test_scheduler_monitoring_coverage.py` 가 상대경로 `open("crawler/scheduler.py")` 때문에 `FileNotFoundError` 로 수집 오류를 냈다(세션 407 실측) — **세션 412 에 `Path(__file__)` 절대경로로 수정**해 이제 루트에서도 수집된다. ⚠ 작업반 보고를 옮기지 말고 **매번 직접 재실측** — 세션 408 이 1848 로 잘못 보고했다(테스트 추가 후 미측정), [[feedback-baseline-number-needs-own-measure]]. 옛 문서값 1863·1845(s407~408)·1823(s406)·1804(s403)·1800(s402)) |

## 커밋 전 필수 검증

```bash
# BE 변경 시
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시 — ⚠ tsc·lint·test 만으로는 CI 를 통과 못 한다. 게이트 3종을 같이 돌릴 것
cd frontend && npx tsc --noEmit && npm run lint && npm test \
  && npm run check:ad-compliance && npm run check:mdx-jsx && npm run check:job-labels \
  && npm run check:visual-guard
```

> ⚠ **게이트 3종 누락이 CI 왕복을 만든다 (세션 401 실사고)**: `src/app`·`src/components`·
> `src/content/blog` 하위 텍스트는 `check:ad-compliance` 가 광고법 위험 단어(최고·유일한·100% 등,
> `scripts/check-ad-compliance.mjs` RISKY)를 검사한다. **코드 주석도 검사 대상**이다 — 세션 401 에
> 주석에 쓴 "유일한" 한 단어로 Frontend CI 가 실패했고, 그 여파로 e2e job 이 통째로 skip 돼
> baseline 재촬영 dispatch 까지 헛돌았다. 표현을 바꿔 해결할 것 — **WHITELIST 추가는 금지**
> (내 주석 하나 때문에 법령 준수 게이트를 느슨하게 만드는 잘못된 교환).
>
> **CI 보안 게이트 (세션 339)**: CI 는 BE `pip-audit -r requirements.txt --strict`(prod 취약점 자동 차단) + FE `npm audit --omit=dev --audit-level=high`(prod high/critical 자동 차단)를 상시 실행한다. 의존성 추가·bump PR 은 이 게이트를 통과해야 머지된다. 로컬 사전 확인 = `cd frontend && npm audit --omit=dev`. ⚠ 윈도우 로컬 `pip-audit` 은 requirements.txt UTF-8 한글 주석을 cp949 로 읽어 `UnicodeDecodeError` 로 죽으니 `PYTHONUTF8=1 pip-audit ...` 로 실행(CI 리눅스는 정상). dependabot PR 재생성·secrets 처리는 메모리 `[[dependabot-secrets-gate]]` 참조.

## 규칙 & 커맨드

### 항상 로드 (`.claude/rules/`)
| 파일 | 내용 |
|------|------|
| `web-rules.md` | React/Next.js + FastAPI 코딩 규칙, DON'T 목록 |
| `testing.md` | 테스트 작성·실행 규칙, 구조표 |
| `infra.md` | 서버 복구 절차, 스케줄러, 공유 인프라, DB 풀 |
| `codes.md` | 거래/매물유형 코드, 핵심 상수, localStorage 키 |
| `planning.md` | /plan 모드 최소 규칙 + 세션 종료 시 메모리 활용 |
| `domain-mapping-ssot.md` | BE-FE 매핑 SSOT + SQL 집계 N→1 가중평균 + dialect 분기 (세션 226 신설) |
| `derived-display-ssot.md` | 파생 표시값(시각·주기 문구)은 source(trigger)에서 자동생성, 손글씨 중복 금지 (세션 256 신설, PR #102) |
| `error-propagation.md` | FE 데이터 래퍼 에러 삼킴 금지 + 래퍼 레벨 MSW 가드 의무 (폴백 삼킴 3사고, 세션 298 신설) |
| `release.md` | PR 머지 후 backend 가동 검증 4중 cross-check (세션 230~231 zombie 답습 신설, 세션 257 라이브 표시값 지표 추가) |
| `seo-metadata.md` | og:image SVG 금지(PNG 필수)·openGraph 직접지정 시 root opengraph-image 상속 끊김·클라 본문 Suspense 함정·sitemap lastModified 고정일자 (세션 336 신설, PR #260) |
| `browser-automation-isolation.md` | 브라우저 자동화 라이브 조사 전 실계정 프로필 분리 확인 의무 — 자동화 브라우저 로그인 상태=레드 플래그, 토큰·쿠키 원문 dump 금지 (세션 351 실토큰 노출 사고, 세션 353 신설) |

### 프로젝트 자율자산 (`.claude/agents/` · `.claude/skills/` — 세션 309 신설)

repo 에 박혀 git 으로 전파되는 도메인 특화 자산. description 매칭으로 자동 발동 (글로벌 `~/.claude` 가 아니라 프로젝트 추적).

| 종류 | 이름 | 발동 시점 |
|------|------|----------|
| agent | `crawl-safety-reviewer` | `backend/crawler/`·`routers/live` 변경 시 — throttle 경유·IP차단 방지(infra.md §IP차단) 검증 |
| agent | `tax-law-verifier` | `frontend/src/lib/` 계산기(`*tax*.ts`·`brokerage*.ts`) 변경 시 — 법령 cross-check + 결함 박제 테스트 감지(testing.md) |
| agent | `migration-safety-reviewer` | `backend/db/migrations/V*.sql`·`db/models.py` 변경 시 — 공용 DB(mibunyang) 영향 + prod 컬럼 선행실행 게이트 |
| agent | `payment-safety-reviewer` | `routers/payment.py`·`routers/billing.py`·`crawler/billing_charge.py` 변경 시 — 서버측 금액재산정·PortOne 대조·웹훅 서명검증·3일 중단룰·TOCTOU 원자적 전환 검증 |
| skill | `release-verify` | backend PR 머지 직후 — zombie cross-check(release.md §2, PR 성격별 3중/4중) |
| skill | `live-verify` | "재시작 반영됐나"·정적분석으로 "재시작 불필요" 단정 시 — 라이브 실측 3대 방법 |

> 안전장치(세션 309): `.claude/settings.json` deny(force-push·rm -rf·.env 읽기) + PostToolUse hook(backend .py 저장 시 ruff 경고형).
>
> 안전장치 강화(세션 311, Claude Code 신기능 자동적용): ① **`gh pr merge` 직후 zombie 자동 리마인더** — PostToolUse(Bash) hook `.claude/hooks/post-merge-zombie-reminder.js` 가 머지 커밋이 backend 변경이면 release.md §2 cross-check(PID·부팅시각·라이브 GET) 자동 상기, FE/md 전용이면 면제 안내(세션 257~311 zombie 반복 사고 구조 차단). ② **deny .env 우회 읽기 차단 확대** — head/tail/less/more/od/xxd/printf/sort/strings 의 .env 대상 추가(세션 310 heredoc 우회 답습). ③ **글로벌 `fallbackModel: [sonnet, haiku]`** (글로벌 settings, repo 밖) — Opus 과부하 시 Claude 자동 폴백(워크플로 대량 서브에이전트 rate limit 전멸 완화).

### 플랜·검증 (글로벌 스킬 — 타이핑 0 자동 발동)

> 옛 `/harness`·`/guard` 커맨드는 글로벌 스킬로 이전됨 (`.claude/commands/` 없음). 기능은 아래 스킬이 대체.

| 스킬 | 내용 |
|--------|------|
| `plan-9gate` | 9 GATE 검증 (크기/영향/순서/완전성/적정성/보안/연동/롤백/UX) — ExitPlanMode·커밋 직전 자동 |
| `ulw-safe` | Plan→Work→Review 통제 ultrawork (체크포인트+자기정지) — 큰 작업 자동 |

## 자율 발동 도구 (타이핑 0 — Claude 스스로 판단해 발동)

**진실의 원천**: `~/.claude/rules/auto-tool-usage.md` (글로벌, 자동 로드). 사용자가 `/명령어` 를 타이핑하지 않아도 Claude 가 작업 성격을 보고 아래 스킬을 자동 발동한다. 메커니즘 = 스킬 `description` 매칭 (공식 model-invocation) + UserPromptSubmit 훅 매 턴 상기.

| 스킬 (글로벌) | 자동 발동 시점 | 역할 |
|---|---|---|
| `session-boot` | 새 세션 첫 작업 / "시작하자"·"이어서" | 부팅 체크리스트 (git·Actions·메모리) |
| `decision-session` | 작업 2개+ 순서 모호 / "뭐부터"·"순서" | 의존관계 실측 → 실행 순서 확정 |
| `plan-9gate` | ExitPlanMode·커밋 직전 / "검증해"·"맹점" | 9-GATE 플랜 검증 |
| `tool-discovery` | "도구 뭐 있어" / 새 외부 연동 직전 | MCP·플러그인 공식 소스 탐색 |
| `goal-setting` | 완료 조건 모호 / "알아서"·"완벽하게" | 단발 측정가능 `/goal` 한 줄 설계 |
| `loop-goal` | 여러 이슈 자율 루프 / "이슈 다 구현"·"끝까지 자율로" | DECISION_LOG·CORE/MINOR·STOP 박힌 `/goal` 루프 설계 |
| `ulw-safe` | 30분+·7파일+·풀스택·마이그 | 통제된 ultrawork (체크포인트+자기정지) |

**역할 분리 (충돌 방지)**: goal-setting=단발 목표 / loop-goal=여러 이슈 루프 / ulw-safe=실행 안전 엔진. 한 task 에 `/goal`·`ralph`·`ulw-safe` 중 1개만 (auto-tool-usage.md §충돌 회피).

**루프 산출물 데이터 관리**: loop-goal 루프는 `docs/loop/DECISION_LOG.md` (런타임 체크포인트, .gitignore) + `reports/` (이슈 구현 보고서, git 추적) 를 만든다. `/명령어` 타이핑도 여전히 동작 (하위호환).

## 양쪽 영향 체크리스트 (FE↔BE 동기화)

### FE → BE (frontend 변경 시 확인)

- [ ] 새 API 호출 추가? → `frontend/src/lib/api/` 9 모듈에 함수 추가 + 백엔드 라우터 존재 확인
- [ ] 새 타입 필드 사용? → `frontend/src/types/` + `backend/db/models.py` + `backend/routers/*serializers.py` 동기화
- [ ] 인증 필요 엔드포인트? → Authorization 헤더 전달 확인 (`session.access_token`)
- [ ] 관리자 전용? → `frontend/src/proxy.ts` 라우트 보호 확인 (Next 16: middleware → proxy)

### BE → FE (backend 변경 시 확인)

- [ ] BE 라우터 변경 시 → FE `lib/api/` 9 모듈 동기화 (새 함수·시그니처 갱신)
- [ ] serializers 변경 시 → FE `types/` 인터페이스 동기화 (필드 추가/삭제)
- [ ] `.env` 변경 시 → `.env.local` (FE) + Vercel 환경변수 동기화
- [ ] V021+ 마이그레이션 시 → FE 영향 검토 (테이블 컬럼 변경 시 타입·UI 영향)

## 세션 종료 시 마무리

**진실의 원천**: `.claude/rules/planning.md` "세션 종료 시 마무리" 섹션. 핵심 = 진행 박제는 글로벌 메모리에만 (`~/.claude/projects/.../memory/session{N}_summary.md`), CLAUDE.md 진행 박제 금지.
