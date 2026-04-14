# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-04-15 — 세션 42 **어린이집 서사 완전 종결 (22 → 0) + 오피스텔 면적 프리셋** ✅. DB 2000/2001 (세종 좌표 None 1건만 제외).

**세션 42 성과** (커밋 `a9dabc9` 어린이집 22구제 + `2329e17` 오피스텔 프리셋, main push 완료):

- **[1] 어린이집 22 실패 완전 구제** (`a9dabc9`):
  - 원인 전수조사: 전부 mibunyang 원본이 "경기 고양시 덕양구"를 `region="경기"/gu="덕양구"`로 시 정보 누락 저장한 **일반구 단독 케이스**. 세션 41의 "23건 중 세종 1건"은 `lat/lng=None`이라 `env_childcare.py:41` WHERE 조건에서 배치 제외(=22와 별개 이슈)
  - `_GU_TO_PARENT_CITY: dict[tuple[str, str], str]` 32 엔트리 별칭 테이블을 `resolve_sigungu_code` 폴백 단계에 추가. region 튜플 키로 중복 구명 모호성 회피(경북 북구=47110, 부산 북구=26320 기존 직매핑 regression 방어)
  - CPMS cpmsapi030이 시 단위 법정코드로도 시 전체 어린이집 반환 → 덕양구 단지는 고양시(41280) 조회 결과에서 반경 1km 매칭 정상
  - **라이브 batch_size=2000**: 2000 수집 (매칭 1899) / **0 실패** / 205.4초
  - **DB 실측**: `has_childcare=2000 / total_infra=2001 / zero=101 / with_matches=1899`
  - 테스트: BE 490 passed / 1 skipped (484 + 6 regression 포함). Plan 에이전트 1회 교차검토 완료
  - 파일: `backend/crawler/childcare_api.py` +50/-1, `backend/tests/test_childcare_api.py` +29 (2파일 / 78줄)

- **[2] 오피스텔 면적 프리셋** (`2329e17`):
  - FilterBar 전용면적 프리셋이 아파트 기준(59/84/114/135m²)만 제공 → 오피스텔 검색 시 실사용 면적대 불일치
  - `AREA_PRESETS_OFFICETEL` / `AREA_PRESETS_OFFICETEL_PYEONG` 신규: 원룸(~26m²=8평) / 1.5룸(26~40=8~12평) / 투룸(40~60=12~18평) / 쓰리룸+(60~)
  - `AreaSection`에서 `estateType === "opst" | "obyg"` 분기로 자동 전환, 라벨에 "(오피스텔)" 표기
  - 테스트: FE 545 passed (539 + 6), tsc clean, lint 0 errors
  - 파일: `frontend/src/lib/constants.ts` +20, `frontend/src/components/filter/FilterSections.tsx` +10/-2, `constants.test.ts` +49 (3파일 / 79줄)

- **어린이집 서사 완결**: 38(진단) → 39(가드) → 40(CPMS 버그) → 41(bulk prefetch + 152→22) → **42(일반구 별칭 22→0)**. DB 2000/2001 커버 (99.95%).

**상세**: `memory/project_childcare_trigger_bug.md`, `memory/session42_summary.md`

**다음 우선순위 (세션 43)**:

1. 🟡 **세종 좌표 1건 보강** (`ah-2022910239`) — kakao geocoding으로 lat/lng 채워 DB 2001/2001 완결 (ROI 낮지만 상징적)
2. mibunyang 쪽 quota_db 연동 가이드 공유 (본 프로젝트 코드 변경 없음)
3. Supabase MCP 2개 해제 안내 (`/mcp` UI 또는 claude.ai Connectors)
4. 새 작업 탐색 — 어린이집 큰 숙제 종료로 `/admin` UX / 비교 페이지 / 매물 필터 고도화 등 사용자 요청 대기

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
