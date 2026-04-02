# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 현재 진행 상황

**마지막 작업**: 2026-04-03 — Phase 2 후속: PendingRollbackError 방지 + 어린이집 sigungu 매핑 + 수집 트리거 UI

**다음 우선순위**:

1. data.go.kr "어린이집 정보 공개 포털" (B553260/CpmsService) 서비스 재신청 → 승인 후 CHILDCARE_ENABLED=true 전환
2. E2E Playwright 테스트 실서버 연동 확인
3. 프론트엔드 미분양 상세 페이지에 환경 데이터(대기질/응급의료/어린이집/범죄통계) 표시 UI 추가
4. 백엔드 스케줄러 실행 로그 모니터링 대시보드

**주의사항**:

- ADMIN_EMAIL 환경변수: Vercel + backend/.env + frontend/.env.local 3곳 모두 설정 필수
- 테스트 현황: FE 503개 (55파일), BE 365개 — 전체 통과
- Vercel 배포는 프로젝트 루트(`z:/cursor/naver-estate-web`)에서 실행
- 환경변수 추가됨: AIR_QUALITY_ENABLED, EMERGENCY_ENABLED, CHILDCARE_ENABLED, CRIME_STATS_ENABLED (backend/.env)
- V013 마이그레이션 실행 완료 (Supabase SQL Editor, 2026-04-03)
- 범죄통계 수집 완료: 1928/1928 (100%), crime_score/crime_grade 반영됨
- 어린이집 API: HTTP 500 (서비스 미승인), CHILDCARE_ENABLED=false 유지, sigungu_code 매핑 완성
- 관리자 수집 API: `POST /api/admin/collect/{name}` (crime-stats/air-quality/emergency/childcare)
- 관리자 대시보드 수집 트리거 UI 추가 완료 (CollectorTrigger 컴포넌트)
- PendingRollbackError 방지: service.py 6곳 + env_service.py 1곳 db.rollback() 추가

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
| `.claude/rules/testing.md` | 테스트 작성·실행 규칙, 구조표 (FE 503개, BE 365개) |
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