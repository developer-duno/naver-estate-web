# naver-estate-web — 코드베이스 구조

> 공인중개사 B2B 구독 부동산 SaaS. Next.js 16 + FastAPI + Supabase + 실시간 네이버 크롤링.
> 자동 생성: 2026-05-25 (세션 232). 글로벌 §14 의무 답습.

## 디렉토리 트리 (depth 2)

```
naver-estate-web/
├── frontend/                    # Next.js 16 App Router (TypeScript + Tailwind CSS 4)
│   ├── src/
│   │   ├── app/                 # 31 페이지 (search, complex/[no], compare, mibunyang/*, tools/*5, blog, admin/*)
│   │   ├── components/          # 131 TSX (mb/35 + admin/21 + ui/13 + complex/7 + article/7 + filter/4 + search/2 + blog/2 + 루트 40, `__tests__/` 제외)
│   │   ├── content/blog/        # MDX 26편 (시세분석 5 / 세금 6 / 도구활용 9 / 미분양 6)
│   │   ├── hooks/               # 21 커스텀 훅 (useFavorites/useMbCompare/useCrawlProgress 등, `__tests__/` 제외)
│   │   ├── lib/                 # 47 파일 (최상위 37 + api/ 9 모듈 + admin/ 1, `__tests__/` 제외 — storage/format/query-keys 별도 폴더 아니라 최상위 통합)
│   │   ├── types/               # TypeScript 인터페이스 (estate + Mb* 10 + naver-maps.d.ts)
│   │   └── proxy.ts             # Supabase 세션 + /admin/* 라우트 보호 (Next 16 명칭)
│   ├── e2e/                     # Playwright 20 spec 파일 (--webpack 모드)
│   ├── scripts/                 # GATE 10 (check-mdx-jsx + check-ad-compliance)
│   └── .claude/                 # FE 깊이 토픽 4종 (hooks-and-state, ui-patterns, pages-and-mb, tools-lineup)
│
├── backend/                     # FastAPI + SQLAlchemy 2.0 + curl_cffi
│   ├── routers/                 # 라우터 (articles·complexes·live/·mb·regions·stats·users·verify + admin/) + 헬퍼 (serializers·estate_serializers·mb_serializers·filter_builder) = 12 .py + 2 폴더 (admin/, live/)
│   ├── services/                # 비즈니스 로직 (upsert, cache, enricher, storage, email, naver_call_counter)
│   ├── crawler/                 # 크롤링 + APScheduler (service.py + service_*.py 4분할 + scheduler.py)
│   ├── db/                      # 13 파일 (models, queries barrel + 5분할, mb_queries barrel + 3분할, query_helpers, database, migrations/)
│   ├── shared/                  # NaverEstateAPI + 상수 (수정 금지, 데스크톱 앱과 공유)
│   ├── formatters/              # 가격 HTML 포맷 (5 파일 분할)
│   ├── auth/                    # 인증·권한 (permissions, rate_limiter, audit)
│   ├── tests/                   # pytest 715 (59 파일, pytest-xdist `-n auto` 병렬)
│   ├── .claude/details.md       # BE 깊이 토픽 (실거래가·mibunyang·검증·중복제거)
│   ├── main.py                  # FastAPI 진입점, CORS, 라우터 등록
│   └── deps.py                  # 인증 의존성 (get_current_user, get_admin_user)
│
├── .claude/                     # 프로젝트 가이드 (자동 로드 5 + 명시 참조 3)
│   ├── rules/                   # 자동 로드 6 (web-rules, testing, infra, codes, planning, domain-mapping-ssot)
│   ├── ASSETS.md                # 자산 인덱스 (PDF 16 / 도구 14 / 글로벌 / 운영 부채)
│   ├── GLOSSARY.md              # 한국어 도메인 용어 30+
│   ├── BLOG.md                  # /blog 운영 가이드 (MDX 26편 + 4단 발행 절차)
│   └── STRUCTURE.md             # 이 파일 (코드베이스 구조)
│
├── docs/                        # 작업·사고 기록
│   ├── superpowers/specs/       # 디자인 리뉴얼 spec (2026-05-20, PR 0~7 로드맵)
│   ├── superpowers/plans/       # 크롤러 텔레그램 모니터링 plan
│   └── *cooldown*.md            # 2026-04-16 네이버 IP 쿨다운 사건 박물관
│
├── scripts/                     # 운영 자동화 (startup_orchestrator, start-server)
├── CLAUDE.md                    # 루트 가이드 (진입점, 비즈니스 모델, 기술스택, 데이터흐름)
└── CONTRIBUTING.md              # pre-commit hook (GATE 10 mdx-jsx + 광고법)
```

## 핵심 모듈 역할 (~24 행)

| 모듈 / 파일 | 책임 (1줄) |
|---|---|
| **backend/main.py** | FastAPI 진입점, 라우터 등록, CORS, stale crawl_jobs 정리 |
| **backend/routers/live.py** | 실시간 크롤링 (검색·매물·실거래가) + 24h TTL + Semaphore 3 |
| **backend/routers/complexes.py** | 단지 검색·조회·매물 카운트·가격 통계 (SQL WHERE 필터) |
| **backend/routers/articles.py** | 매물 조회·엑셀 내보내기 (xlsxwriter, safeCellValue 수식 인젝션 방어) |
| **backend/routers/mb.py** | 미분양 조회 (apartments/unsold/trades) + 차수 자동 제거 |
| **backend/routers/admin/** | 관리자 API (collect, scheduler, users, jobs, naver_calls, freshness_meta) |
| **backend/routers/verify.py** | 공인중개사 검증 (odcloud API → agent_verifications) |
| **backend/services/upsert.py** | `_do_upsert(db, Model, dict)` = PostgreSQL/SQLite dialect-aware 자동 분기 |
| **backend/services/cache.py** | 동적 TTL 캐시 + delete_by_prefix (가격 수집 완료 시 무효화) |
| **backend/crawler/scheduler.py** | APScheduler 13 잡 (단지 발견·매물·시세·환경·가치지표·인기·모니터) |
| **backend/crawler/service_metrics.py** | 단지 가치 3필드 수집 (nearby_median_price/jeonse_rate/recent_trades_6m) |
| **backend/crawler/monitor.py** | crawl_jobs 정합성 점검 + 텔레그램 알림 (운영 토글) |
| **backend/shared/naver_api.py** | NaverEstateAPI (curl_cffi `impersonate=chrome` + JWT 50분 + 429 백오프) |
| **backend/db/models.py** | 18 SQLAlchemy 모델 (Complex, Article, ArticlePriceHistory, AgentVerification, CrawlJob 등) |
| **backend/db/price_queries.py** | `get_price_stats_aggregated()` = N→1 매핑 가중평균 합산 (세션 225 답습) |
| **backend/db/migrations/** | V000~V027 (V024 가치 12필드 / V025 상세 4필드 / V026 monitor_alerts / V027 인덱스) |
| **frontend/src/app/** | 31 페이지 (search·complex/[no]·compare·mibunyang/*·tools/*5·blog·admin/*·login·verify) |
| **frontend/src/lib/api/** | 9 모듈 (admin, analytics, articles, complex, core, crawl, mibunyang, verify, index barrel) |
| **frontend/src/lib/** 도구 14 | brokerage·acquisition·transfer-tax·property-tax·area (110 케이스 / NoticeKey 60+ / PDF 16장 권위) |
| **frontend/src/components/** | 131 TSX (mb·admin·ui·complex·article·filter·search·blog 8 폴더, `__tests__/` 제외) |
| **frontend/src/hooks/** | 21 훅 (useFavorites/useMbCompare/useCrawlProgress/useFilterParams 등 localStorage·React Query) |
| **frontend/src/content/blog/** | MDX 26편 (시세 5·세금 6·도구활용 9·미분양 6, GATE 10 mdx-jsx + 광고법 가드) |
| **CLAUDE.md** | 진입점 (비즈니스 모델·기술 스택·아키텍처·데이터흐름·환경변수·테스트 현황·항상 로드 6) |
| **CONTRIBUTING.md** | pre-commit hook (GATE 10 mdx-jsx + 광고법, husky v9, --no-verify 금지) |

## 대표 데이터 흐름 (사용자 검색 → 단지 클릭 → 실거래가 수집)

```
[브라우저] /search?q=강남구
  ↓ React Query useQuery
FE searchComplexes() [lib/api/complex.ts]
  ↓ GET /api/live/search?q=강남구
BE routers/live.py search_endpoint
  ↓
shared/naver_api.py NaverEstateAPI.search()
  ↓ curl_cffi (Chrome TLS) → 네이버 부동산 API
네이버 API 응답
  ↓
services/upsert.py _do_upsert(db, Complex, dict) — PG/SQLite 자동 분기
  ↓ INSERT ON CONFLICT DO UPDATE
DB upsert (Supabase PostgreSQL, NullPool)
  ↓ TTL 캐시 적중률 (services/cache.py 동적 TTL)
FE 응답 + React Query 캐시
  ↓
[브라우저] 12 단지 결과 표시
  ↓ 사용자 단지 클릭 → /complex/120123456
FE startLiveCrawl() + getArticles() + useQueries 병렬
  ↓ POST /api/live/{no}/articles/start + GET /api/complexes/{no}/articles
BE 실시간 매물 크롤 (10/20/30초 refetch) + DB articles 페이지네이션
  ↓ 사용자 "실거래가 수집" 클릭
FE usePriceCollect (5초 폴링, 3분 타임아웃 = 36회, IP 차단 방지)
  ↓ POST /api/live/{no}/price-history/start-collect (24h TTL)
BE crawler/service_price.py — Semaphore 3, on_demand throttle 2.0s
  ↓ 네이버 API → ArticlePriceHistory upsert
완료 시 cache.delete_by_prefix(price_history)
  ↓ FE useQuery invalidate
[브라우저] 추이 차트 + 가격 범위 표시
```

핵심 데이터 정합성 가드:
- **race guard**: `try_acquire_complex()` / `release_complex()` 로 live + 배치 중복 크롤 방지
- **dialect 분기**: `_do_upsert()` + `_search_all_types()` + `_record_call()` + `get_price_stats_aggregated()` (CI SQLite vs 운영 PG 호환)
- **AdaptiveThrottle**: min 2s / max 10s, 429 자동 감속 (`crawler/utils.py`)

## 진입점

- **빌드**: 루트 `CLAUDE.md` §커밋 전 필수 검증 SSOT
- **실행**: `python -m uvicorn main:app --host 0.0.0.0 --port 8002` (backend) / `npm run dev` (frontend, localhost:8090 — naver 포트, 세션 114 박제)
- **테스트**: 루트 `CLAUDE.md` §테스트 현황 SSOT (vitest 1458 / e2e 20 / pytest 715)
- **이 파일 갱신**: 코드가 크게 바뀌어 STRUCTURE.md 가 명백히 낡으면 사용자에게 갱신 제안 → 동의 시 덮어쓰기 (글로벌 §14 답습)
