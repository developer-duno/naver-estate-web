# 네이버 아파트·오피스텔 매물 조회 — 웹 버전

Next.js + FastAPI + Supabase 기반 웹 서비스. 실시간 네이버 부동산 크롤링.

## 기술 스택

- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + React Query (TanStack Query v5) + Recharts 3
- **Backend**: FastAPI + SQLAlchemy 2.0 + curl_cffi + APScheduler
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
```

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 데이터 흐름

```
검색 → /api/live/search (네이버 API → DB upsert → 반환)
단지 클릭 → DB 데이터 즉시 표시 + 자동 매물 크롤링 (start-crawl)
"데이터 갱신" 버튼 → /api/live/{no}/articles/start-crawl (백그라운드 크롤링 → 폴링)
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
미분양 비교 → /mibunyang/compare?ids=id1,id2,... (useQueries 병렬 조회 + 17행 우위 판정 + 레이더차트 9축 동적선택(칩토글,최소3개) + 분양가 막대차트 + 미분양추이 비교차트 + 인쇄 + URL복사 + 엑셀)
미분양 엑셀 → 클라이언트 xlsx (mb-export.ts, safeCellValue 재사용, 4개 탭+추이)
미분양 지도 → Naver Maps v3 SDK (CDN, lat/lng null 시 미표시)
미분양 즐겨찾기 탭 → localStorage 메타데이터 경량 테이블 (API 0회, 탭바 hasRegion 바이패스, 체크박스 일괄 비교, FavSortBy 정렬 드롭다운)
미분양 검색 히스토리 → localStorage (mb_search_history, 최대 10개, pill 뱃지 클릭→재검색)
미분양 중복 제거 → extract_base_name()으로 차수 접미사 제거, _deduplicate_apartments()로 마지막 차수만 유지
미분양 시/군/구 목록 → /api/mb/gu-list?region= (DISTINCT gu, 시도별 구 목록)
홈 → 미분양 바로가기 카드 (/mibunyang 링크)
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
| `.claude/rules/testing.md` | 테스트 작성·실행 규칙, 구조표 (FE 372개, BE 276개) |
| `.claude/rules/planning.md` | /plan 모드 규칙, 교차검증 에이전트 5종 |
| `.claude/rules/infra.md` | 서버 복구 절차, 스케줄러, 공유 인프라, DB 풀 |
| `.claude/rules/codes.md` | 거래/매물유형 코드, 핵심 상수, localStorage 키 |
