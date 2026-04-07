# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-04-08 — 세션 23 완료 (모바일 UI 개선 + Gmail SMTP + 공인중개사 검증 시스템)

**다음 우선순위**:

1. 어린이집 API 운영키 전환 (info.childcare.go.kr → 개발키→운영키 신청 필요)
2. 4/12 공공데이터 수집 결과 확인 (토요일 05:00 스케줄러)
3. 한국산업인력공단 자격증 진위확인 API 연동 (2차 — data.go.kr 키 신청 필요)

**주의사항**:

- ADMIN_EMAIL 환경변수: Vercel + backend/.env + frontend/.env.local 3곳 모두 설정 필수
- 테스트 현황: FE 518개 (57파일), BE 396개, E2E 44개 (8파일) — 전체 통과
- Vercel 배포는 프로젝트 루트(`z:/cursor/naver-estate-web`)에서 실행
- 환경변수 추가됨: AIR_QUALITY_ENABLED, EMERGENCY_ENABLED, CHILDCARE_ENABLED, CRIME_STATS_ENABLED (backend/.env)
- V014 마이그레이션 실행 완료 (Supabase SQL Editor, 2026-04-03): crawl_jobs.scheduler_job_id
- V015/V016 마이그레이션 실행 완료 (2026-04-07): apartments/trades 인덱스 7개 + trigram
- mb_queries.py SQL 중복 제거: PostgreSQL regexp_replace+ROW_NUMBER, SQLite는 Python fallback (dialect 분기)
- 범죄통계 수집 완료: 1928/1928 (100%), crime_score/crime_grade 반영됨
- 어린이집 API: data.go.kr → api.childcare.go.kr(cpmsapi021) 전환 완료, CHILDCARE_API_KEY 별도 필요, CHILDCARE_ENABLED=false 유지
- 관리자 수집 API: `POST /api/admin/collect/{name}` (crime-stats/air-quality/emergency/childcare)
- 관리자 소급 수집 API: `POST /api/admin/backfill-price/{complex_no}?months_back=60` (국토교통부 실거래가 5년)
- 공공데이터 resultCode 버그 수정 완료: "000" → "0" 정규화 (public_data_api.py)
- 단지 상세 페이지: 자동 크롤링 후 10/20/30초 뒤 UI 자동 갱신 (쿼리 무효화)
- startup_orchestrator.py: Watchdog 포트 충돌 수정 (_kill_port + 연속 5회 실패 방어)
- 매물 상세 모달 리디자인: max-w-6xl 확장, 2열 그리드(지도+이력 | 가격+정보+설명), 8개 하위 컴포넌트(article/)
- 매물 상세에 단지정보 통합: complex prop 전달 (건설사/용적률/전세가율/주변시세 등)
- 매물 상세 중개 강화: MarketPosition(시세)+CompetingListings(경쟁매물)+MaintenanceCost(관리비) 카드 3종
- 매물 상세 사진 섹션 제거 + 특징/상세설명 중복 자동 제거
- InfoCard/InfoRow export (article/ 하위 컴포넌트 공통 재사용)
- 매물 가격이력 API 연결: GET /api/articles/{no}/price-history (프론트 신규 연결)
- 단지 상세 레이아웃에 Naver Maps SDK Script 추가 (complex/[no]/layout.tsx)
- formatWon 함수 lib/format.ts로 이동 (ArticleDetail 로컬 → 공통 유틸)
- 관리자 대시보드: StatsCards + SchedulerMonitor + CollectorTrigger (수집 트리거 + 모니터링)
- 스케줄러 모니터링: `GET /api/admin/scheduler-status` (12개 작업 이력/통계/다음실행, 60초 자동갱신)
- env_service 4개 수집 함수에 CrawlJob 기록 추가 (air/emergency/childcare/crime)
- PendingRollbackError 방지: service.py 6곳 + env_service.py 1곳 db.rollback() 추가
- E2E Playwright: Turbopack dev 시작은 성공하나 안정성 위해 `--webpack` 모드 유지 (playwright.config.ts)
- 홈 페이지 키워드 검색 UI 제거됨 (지역 선택만 남음, /search?q= URL은 유지)
- 서버 자동 시작: scripts/startup_orchestrator.py (Windows Startup 폴더 BAT → pythonw.exe 백그라운드)
- 자동 시작 흐름: uvicorn → health check → cloudflared tunnel → URL 추출 → Vercel env 업데이트 → 배포 → watchdog
- Next.js 16.2.2로 업그레이드됨 (보안 패치: HTTP smuggling, CSRF)
- 차트 유틸 통합: formatChartMonth, getCutoffMonth, CHART_PERIODS → lib/format.ts
- FilterSections aria-label 17개 추가 (접근성 WCAG 2.1 AA)
- api.ts 도메인 분리: lib/api/ (core/complex/articles/crawl/analytics/admin/mibunyang), barrel re-export 호환
- 거대 파일 분리 완료 (세션 15): CompareCharts 438→170, mibunyang/page 393→258, ComplexInfo 391→187, MbDetailSections 319→138
- 거대 파일 추가 분리 완료 (세션 17): price_school_formatter 715→5모듈(formatters/), queries 566→5모듈(db/), serializers 393→3모듈(routers/), barrel re-export 호환
- ArticleDetail 분리 (세션 19→20): 234→110줄 + 하위 8개(article/PriceHeader, MarketPosition, CompetingListings, InfoCards, MaintenanceCost, ArticleDescription, PriceHistoryTable, ArticleMap)
- 매물 상세 아코디언: 시세/경쟁매물/관리비 카드 3종을 ChartAccordion으로 감싸 접기 기본 (모바일 스크롤 감소)
- 검색 결과 모바일 카드뷰: ComplexCardMobile 추가 (md:hidden), 데스크톱 테이블은 hidden md:block 유지
- 홈 페이지 통계: 인라인 텍스트 → 단지/매물 2개 소형 카드 (파란색/초록색)
- 단지 상세 매물 목록 모바일: ArticleCardMobile (md:hidden 카드뷰) + ArticleTable (hidden md:block)
- 단지 상세 헤더/액션바: text-lg md:text-2xl, flex-wrap, 버튼 text-xs md:text-sm
- FilterDropdown: max-w-[calc(100vw-2rem)] + max-h-[70vh] overflow-y-auto (모바일 오버플로 방지)
- ComplexInfo 탭: px-3 md:px-4, text-xs md:text-sm (모바일 탭 최적화)
- Pagination 모바일 반응형: px-2 py-1 md:px-3 md:py-1.5, text-xs md:text-sm, gap-0.5 md:gap-1
- FilterChips 모바일: max-h-16 md:max-h-none overflow-y-auto (칩 영역 제한)
- FilterBar 모바일: flex-nowrap overflow-x-auto md:flex-wrap (가로 스크롤)
- Gmail SMTP 설정 완료: supabase config push (smtp.gmail.com, 발신자: 네이버부동산)
- 비밀번호 재설정 이메일 템플릿: supabase/templates/recovery.html (1시간 만료 안내 포함)
- 비밀번호 재설정 페이지: forgot-password/page.tsx (링크 만료 1시간 문구 추가)
- 공인중개사 검증 시스템: agent_verifications 테이블 (V017), 자동+수동 검증
- 검증 흐름: /verify 신청 → 국세청 사업자등록 API 자동 검증 → 성공 시 role=expert 자동 승인
- 검증 실패 시: verification_status=pending → 관리자 /admin/users에서 수동 승인/거부
- 검증 API: POST /api/verify/submit, GET /api/verify/status
- 관리자 검증 API: GET /api/admin/verifications, PATCH .../approve, PATCH .../reject
- Header 전문가 뱃지: role=expert 시 초록색 "전문가" 표시
- 테스트 현황: FE 518개 (57파일), BE 396개, E2E 44개 (8파일) — 전체 통과

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query (TanStack Query v5) + Recharts 3
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi + requests + APScheduler
- **DB**: Supabase (PostgreSQL) + Supabase Auth
- **배포**: Vercel (frontend) + 집 서버 (backend, Cloudflare Tunnel)

## 아키텍처

```
[브라우저] → [Next.js (Vercel, 2u.pe.kr)]
                ↓ API 호출 (NEXT_PUBLIC_API_URL)
           [Cloudflare Tunnel (*.trycloudflare.com)]
                ↓
           [FastAPI (집 서버 192.168.219.101:8002)]
                ↓ 실시간 크롤링 + 스케줄러
           [네이버 부동산 API] → [PostgreSQL (Supabase)]
           [국토교통부 공공데이터 API] ↗
           [에어코리아 대기질 API] ↗
           [응급의료기관 API (NEMC)] ↗
           [어린이집 API (CPMS)] ↗
           [경찰청 범죄통계 API (odcloud)] ↗
```

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 데이터 흐름

```
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 클릭 → DB 데이터 즉시 표시 + 자동 매물 크롤링 (start-crawl)
"데이터 갱신" 버튼 → /api/live/{no}/articles/start-crawl (백그라운드 크롤링 → 10/20/30초 타이머 refetch)
필터 변경 → /api/complexes/{no}/articles (DB 쿼리, SQL WHERE절) + URL 쿼리 파라미터 동기화
실거래가 추이 탭 → 자동 수집 트리거 (/api/live/{no}/price-history/start-collect, 24시간 TTL)
가격 추이 조회 → /api/complexes/{no}/price-history?trade_type=&area_no= (DB 쿼리, 월별 집계)
엑셀(매물) → /api/articles/export (pandas DataFrame → xlsxwriter → xlsx)
엑셀(비교) → 클라이언트 xlsx 라이브러리 (compare-export.ts, safeCellValue 수식 인젝션 방어)
단지 비교 → /compare?ids=no1,no2,... (useQueries 병렬 조회 + 평당가 계산 + 인쇄/엑셀)
미분양 조회 → /api/mb/apartments?sort_by=&keyword= (같은 Supabase DB, 정렬+검색)
미분양 상세 → /api/mb/apartments/{id} (인프라/학군/교통/분양가/시공사 병합)
미분양만 → /api/mb/unsold?sort_by=&keyword= (unsold > 0 필터)
미분양 추이 → /api/mb/unsold/{id}/history (월별 미분양 추이)
실거래 조회 → /api/mb/trades?sort_by= (지역별 실거래 내역, 정렬)
지역 통계 → /api/mb/regions (인구/세대/미분양/시세)
미분양 즐겨찾기 → localStorage (mb_favorites, 최대 200개, 토글)
미분양 비교 → /mibunyang/compare?ids=id1,id2,... (useQueries 병렬 조회 + 17행 우위 판정 + 레이더차트 13축 동적선택(칩토글,최소3개) + 가중치프리셋3종(균등/투자형/실거주형)+슬라이더(1-5)+가중점수 + 분양가 막대차트 + 미분양추이 비교차트 + 인쇄 + URL복사 + 엑셀)
레이더 가중치 영속화 → localStorage (mb_radar_settings, 축선택+가중치, useMbRadarSettings 훅, 페이지 새로고침 시 유지)
미분양 엑셀 → 클라이언트 xlsx (mb-export.ts, safeCellValue 재사용, 4개 탭+추이)
미분양 지도 → Naver Maps v3 SDK (CDN, lat/lng null 시 미표시)
미분양 즐겨찾기 탭 → localStorage 메타데이터 경량 테이블 (API 0회, 탭바 hasRegion 바이패스, 체크박스 일괄 비교, FavSortBy 정렬 드롭다운)
미분양 검색 히스토리 → localStorage (mb_search_history, 최대 10개, pill 뱃지 클릭→재검색)
미분양 비교 히스토리 → localStorage (mb_compare_history, 최대 10개, 비교 진입 시 자동 저장, ids 정렬 중복 제거, pill 클릭→복원)
미분양 비교 북마크 → localStorage (mb_compare_bookmarks, 최대 20개, 수동 저장+이름 지정, amber pill, 메인+비교 양쪽 표시)
미분양 중복 제거 → extract_base_name()으로 차수 접미사 제거, _deduplicate_apartments()로 마지막 차수만 유지
미분양 시/군/구 목록 → /api/mb/gu-list?region= (DISTINCT gu, 시도별 구 목록)
홈 → 미분양 바로가기 카드 (/mibunyang 링크)
대기질 수집 → 스케줄러 매일 02:00 (에어코리아 API → infra 테이블 air_* 컬럼)
응급의료 수집 → 스케줄러 매월 첫째 월 03:00 (NEMC API → infra 테이블 emergency_* 컬럼)
어린이집 수집 → 스케줄러 매월 첫째 목 06:00 (CPMS API → infra 테이블 childcare_* 컬럼)
범죄통계 수집 → 스케줄러 분기별 첫째 일 04:00 (경찰청 odcloud API → infra 테이블 crime_* 컬럼, CSV 폴백)
관리자 수집 트리거 → /admin 대시보드 CollectorTrigger 버튼 → POST /api/admin/collect/{name} (동기 120초)
스케줄러 모니터링 → /admin 대시보드 SchedulerMonitor → GET /api/admin/scheduler-status (12개 작업, 60초 자동갱신)
레이더 차트 → 13축 (기존9 + airQuality + medical + childcare + safety), 프리셋3종 + 슬라이더(1-5)
```

## 코딩 규칙

`.claude/rules/web-rules.md` 참조.

### 커밋 전 필수 검증

```bash
# BE 변경 시 (ruff 빠뜨리면 CI 실패)
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

## 규칙 파일 안내

| 파일 | 내용 |
|------|------|
| `.claude/rules/web-rules.md` | React/Next.js + FastAPI 코딩 규칙, DON'T 목록 |
| `.claude/rules/testing.md` | 테스트 작성·실행 규칙, 구조표 (FE 511개, BE 374개) |
| `.claude/rules/planning.md` | /plan 모드 규칙, 교차검증 에이전트 5종 |
| `.claude/rules/infra.md` | 서버 복구 절차, 스케줄러, 공유 인프라, DB 풀 |
| `.claude/rules/codes.md` | 거래/매물유형 코드, 핵심 상수, localStorage 키 |

# 하네스 코드 리뷰 규칙 (모든 코드 수정 후 자동 적용)

## 수정 완료 시 자기 검증 (에이전트 스스로 실행):
1. npx tsc --noEmit → 타입 에러 0건 확인
2. 수정 파일의 참조처를 grep으로 확인 → 깨지는 연동 없는지
3. grep으로 console.log, TODO, 민감정보 잔재 확인

## 수정 코드 작성 규칙:
- 수정마다 파일명:줄번호 + before/after 명시
- 프론트 수정이 백엔드에 영향 → 백엔드도 같이 수정
- 추측으로 "문제없음" 판정 금지 → 도구 실행 결과 기반만 인정

## AI 안티패턴 방지:
- 1회용 유틸 함수 생성 금지 (2회 이상 사용 확인 후 추출)
- 과도한 추상화 금지 (현재 규모에 맞게)
- 주석과 코드 불일치 금지
- console.log 커밋 금지