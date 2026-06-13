# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 진입점

새 컨텍스트 읽기 순서 = ① `.claude/rules/` 5종 (자동 로드) → ② `.claude/ASSETS.md` · `.claude/GLOSSARY.md` · `.claude/BLOG.md` (필요 시 참조) → ③ FE/BE 깊이 토픽 5종 (FE/BE 작업 시 명시 참조) → ④ `memory/MEMORY.md` (세션 누적 박제).

| 자료 | 위치 | 용도 |
|---|---|---|
| **자산 인덱스** | `.claude/ASSETS.md` | 한국어 PDF 16장 / 계산기 라이브러리 14개 / 글로벌 자산 / 운영 부채 |
| **도메인 용어집** | `.claude/GLOSSARY.md` | 한국어 부동산 도메인 용어 30+ 개 |
| **블로그 라인업** | `.claude/BLOG.md` | /blog MDX 26편 (시세 분석 5 / 세금 6 / 도구 활용 9 / 미분양 6) + 새 글 발행 4단 절차 |
| **FE 깊이 토픽 4종** | `frontend/.claude/{hooks-and-state,ui-patterns,pages-and-mb,tools-lineup}.md` | FE 작업 시 명시 참조 (자동 로드 안 됨) — 훅·UI 패턴·페이지 흐름·도구 5종 |
| **BE 깊이 토픽 1종** | `backend/.claude/details.md` | BE 작업 시 명시 참조 (자동 로드 안 됨) — 실거래가·mibunyang·검증·중복 제거 |
| **세션 박제 메모리** | `C:\Users\user\.claude\projects\d--naver-estate-web\memory\` | 세션 43~231 일자별 정리 + 박제 룰 + 사고 회고 (세션 212 D: 이사 PR #35 답습) |
| **세션 79~112 archive** | 메모리 폴더 `sessions_79_112_archive.md` | 도구 5종 라인업 진화 + 박제 룰 진화 한 표 요약 |

## 비즈니스 모델

**공인중개사 B2B 구독 단독** (세션 91~92 결정 박제 + 세션 209 재확인 박제: "B2B 단독은 맞다, 단 사용자가 쓰기 편해야"). 단지 6만개 색인 = **SEO 자산 + 구독자가 보는 핵심 데이터** (B2C 확대 아님). 가치 데이터 무료 공개 + 도구 100% 정확 산정 + /pricing 7일 무료 체험.

## 디자인·UX 리뉴얼 (진행 예정 — 진실의 원천 1곳)

**진실의 원천**: [docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md](docs/superpowers/specs/2026-05-20-2upekr-redesign-design.md).

핵심: Claude 디자인 5색 + Pretendard 단일 + shadcn/Radix 도입 (모방 전략). PR 0~7 단계 로드맵. 사용자 명시 잣대 = "사용자가 쓰기 쉽게" + "기능 다 만들지 말고 GitHub 가져다 쓴다" + 네이버 크롤링 IP 차단 방지.

`frontend/.claude/{ui-patterns,hooks-and-state,pages-and-mb,tools-lineup}.md` 의 UI 컴포넌트·페이지 박제는 **각 PR 진행하며 함께 갱신**. spec 와 drift 시 spec 우선.

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
미분양 비교 → /mibunyang/compare?ids= (17행 우위 + 레이더13축 + 가중치 + 분양가/추이 차트)
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

> **인프라·운영**: 상세 = `.claude/rules/infra.md` §스케줄러 (APScheduler) + 서버 자동 시작 / Named Tunnel / 공유 쿼터 / NullPool / CSP·Hydration.
>
> **공인중개사 검증 (B2B 구독 모델)**: FE = `/verify` + `/admin/users` + Header 전문가 뱃지 (role=expert). BE 워크플로 상세 = `backend/.claude/details.md` §공인중개사 검증 워크플로 참조.

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

## 테스트 현황 (2026-06-12 실측, 세션 298 — BE 는 세션 289 실측 유지)

| 영역 | 도구 | 테스트 수 |
|------|------|----------|
| FE Vitest | `frontend/src/**/__tests__/` + `frontend/scripts/__tests__/` | **1691개** (189 파일) |
| FE E2E | `frontend/e2e/*.spec.ts` | **20 파일** (Playwright, --webpack 모드) |
| BE pytest | `backend/tests/` | **851개** (75 파일, pytest-xdist `-n auto` 병렬) |

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
| `domain-mapping-ssot.md` | BE-FE 매핑 SSOT + SQL 집계 N→1 가중평균 + dialect 분기 (세션 226 신설) |
| `derived-display-ssot.md` | 파생 표시값(시각·주기 문구)은 source(trigger)에서 자동생성, 손글씨 중복 금지 (세션 256 신설, PR #102) |
| `error-propagation.md` | FE 데이터 래퍼 에러 삼킴 금지 + 래퍼 레벨 MSW 가드 의무 (폴백 삼킴 3사고, 세션 298 신설) |
| `release.md` | PR 머지 후 backend 가동 검증 4중 cross-check (세션 230~231 zombie 답습 신설, 세션 257 라이브 표시값 지표 추가) |

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
