# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 진입점

| 자료 | 위치 | 용도 |
|---|---|---|
| **자산 인덱스** | `.claude/ASSETS.md` | 한국어 PDF 16장 / 계산기 라이브러리 14개 / 글로벌 자산 / 운영 부채 |
| **도메인 용어집** | `.claude/GLOSSARY.md` | 한국어 부동산 도메인 용어 30+ 개 |
| **세션 박제 메모리** | `C:\Users\user\.claude\projects\f--cursor-naver-estate-web\memory\` | 세션 43~112 일자별 정리 + 박제 룰 + 사고 회고 |
| **세션 79~112 archive** | 메모리 폴더 `sessions_79_112_archive.md` | 도구 5종 라인업 진화 + 박제 룰 진화 한 표 요약 |

## 비즈니스 모델

**공인중개사 B2B 구독** (세션 91~92 결정 박제). 단지 6만개 색인은 일반 사용자 유입용 ≠ 구독 매출. 가치 데이터 무료 공개 + 도구 100% 정확 산정 + /pricing 7일 무료 체험.

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
미분양 비교 → /mibunyang/compare?ids= (17행 우위 + 레이더9축 + 가중치 + 분양가/추이 차트)
미분양 즐겨찾기 → localStorage (최대 200개, 일괄 비교, FavSortBy)
미분양 히스토리/북마크 → localStorage (자동 저장 10개 / 수동 저장 20개)
레이더 설정 → localStorage (축 선택 + 가중치 1-5, 프리셋 3종)
```

### 환경 데이터 수집 (스케줄러 — 상세는 `.claude/rules/infra.md` 참조)
```
대기질 → 매일 02:00 (에어코리아 API → infra.air_*)
응급의료 → 매월 첫째 월 03:00 (NEMC → infra.emergency_*)
어린이집 → 매월 첫째 목 06:00 (CPMS cpmsapi030 → infra.childcare_*)
범죄통계 → 분기별 첫째 일 04:00 (경찰청 odcloud → infra.crime_*, CSV 폴백)
공공데이터 → 토요일 05:00 (국토교통부 실거래가, 10일 토요일 skip)
관리자 트리거 → POST /api/admin/collect/{name} (동기 120초)
```

## 주요 기능·구현 사항

### 인프라·운영 (상세 = `.claude/rules/infra.md`)
- 서버 자동 시작: `scripts/startup_orchestrator.py` → Named Tunnel + watchdog
- 인기 단지 크롤링: 매일 10:45/14:45/19:15, 개별 단지 try/except (기본 배치 50)
- 스케줄러 모니터링: GET /api/admin/scheduler-status (12개 작업, 60초 자동갱신)
- 관리자 대시보드: StatsCards + SchedulerMonitor + CollectorTrigger + QuotaStatus + FreshnessCard
- 공유 쿼터 DB 카운터: `RateLimitCounter` 테이블 기반 INSERT ON CONFLICT 원자적 (`backend/crawler/quota_db.py`). 상세는 `docs/quota_db_integration.md`
- DB: NullPool (Supabase Session Mode 대응)
- CSP: script-src/connect-src에 https://vercel.live 추가
- Hydration: html suppressHydrationWarning (Vercel Live 주입 대응)

### 공인중개사 검증
- /verify 신청 → 국세청 사업자등록 API 자동검증 → 성공 시 role=expert 자동 승인
- 실패 시: verification_status=pending → 관리자 /admin/users 수동 승인/거부
- 자격증: Supabase Storage 업로드 (5MB/JPG/PNG/PDF) + 관리자 수동 확인
- 이메일 알림: `services/email.py` (Gmail SMTP SSL 465, best-effort)
- Header 전문가 뱃지: role=expert 시 초록색 "전문가" 표시

### 매물 상세 모달
- 1열 스택 레이아웃 (max-w-4xl), 7개 하위 컴포넌트 (`components/article/`)
- 아코디언: 시세/경쟁매물/관리비 카드 3종 (접기 기본)
- 인쇄 최적화: @media print position:static, 아코디언 자동 펼침
- 메모/즐겨찾기: ArticleNoteButton + ArticleFavoriteButton (헤더 통합, no-print)

### 모바일 반응형
- 검색 결과: ComplexCardMobile (md:hidden 카드뷰)
- 단지 상세: ArticleCardMobile + 헤더/액션바 text-xs md:text-sm
- 필터: FilterBar flex flex-wrap items-center gap-1.5
- 페이지네이션: px-2 py-1 md:px-3 md:py-1.5

### 코드 구조 (분리 완료)
- FE api.ts → `lib/api/` 7모듈 (core/complex/articles/crawl/analytics/admin/mibunyang)
- BE service.py → 4모듈 (service_common/discover/price/public)
- BE formatters/ 5모듈, db/ 5모듈, serializers/ 3모듈 (barrel re-export 호환)
- ArticleDetail → 100줄 + 하위 7개 컴포넌트
- 도구 라이브러리 분할 (세션 94 답습): `brokerage.ts` 등 100줄 룰 회피 시 3분할

### /tools 도구 5종 라인업 (세션 104 완성)
| 도구 | 경로 | 핵심 |
|---|---|---|
| 중개수수료 | `/tools/brokerage-fee` | 시행규칙 별표1 4종 요율 + 월세환산 ×100→×70 + 부가세 |
| 취득세 | `/tools/acquisition-tax` | 일반/조정/감면 3종 + 면적·가격 누진 |
| 평·㎡ 변환 | `/tools/area-converter` | 단순 변환 |
| 양도소득세 | `/tools/transfer-tax` | 1주택 비과세·단기·중과·미등기 + 한시배제 |
| 보유세 | `/tools/property-tax` | 재산세 + 종부세 + 농특세 합산. 7 변종 (B-1 cap / B-2 합산배제 / B-3 공동명의 / B-4 법인 / B-5 부부공동 / 법인9종 / PDF #12 5종 / PDF #13 4종 세율 다운판정) |

## 환경변수

### 필수 (3곳 동기화: Vercel + backend/.env + frontend/.env.local)
- `ADMIN_EMAIL` — 관리자 이메일
- `NEXT_PUBLIC_API_URL` — 백엔드 API URL (Named Tunnel: https://api.2u.pe.kr)

### SEO (Vercel 등록 필요, 사용자 후속)
- `NEXT_PUBLIC_SITE_URL=https://2u.pe.kr`
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` / `NEXT_PUBLIC_NAVER_SITE_VERIFICATION` (서치 콘솔 인증)

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
| V020 | naver_call_counter Supabase 영속화 | 2026-04-22 (세션 54) |

## 테스트 현황 (2026-05-06 실측)

| 영역 | 도구 | 테스트 수 |
|------|------|----------|
| FE Vitest | `frontend/src/**/__tests__/` | **1032개** (106 파일) |
| FE E2E | `frontend/e2e/*.spec.ts` | **18 파일** (Playwright, --webpack 모드) |
| BE pytest | `backend/tests/` | **563개** (46 파일, 세션 74 기준) |

## 커밋 전 필수 검증

```bash
# BE 변경 시
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

## 규칙 & 커맨드

### 항상 로드 (`.claude/rules/`)
| 파일 | 내용 |
|------|------|
| `web-rules.md` | React/Next.js + FastAPI 코딩 규칙, DON'T 목록 |
| `testing.md` | 테스트 작성·실행 규칙, 구조표 |
| `infra.md` | 서버 복구 절차, 스케줄러, 공유 인프라, DB 풀 |
| `codes.md` | 거래/매물유형 코드, 핵심 상수, localStorage 키 |
| `planning.md` | /plan 모드 최소 규칙 + 세션 종료 시 메모리 활용 |

### 필요 시 호출 (`.claude/commands/`)
| 커맨드 | 내용 |
|--------|------|
| `/harness` | Plan→Guard→Work→Review 전체 워크플로우, Sonnet 분할, 코드 작성 규칙 |
| `/guard` | 9 GATE 검증 (크기/영향/순서/완전성/적정성/보안/연동/롤백/UX) |

## 세션 종료 시 마무리

**진실의 원천**: `.claude/rules/planning.md` "세션 종료 시 마무리" 섹션. 핵심 = 진행 박제는 글로벌 메모리에만 (`~/.claude/projects/.../memory/session{N}_summary.md`), CLAUDE.md 진행 박제 금지.
