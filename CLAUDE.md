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

## 집 서버 재시작 후 복구 절차

컴퓨터를 껐다 켜면 백엔드 + 터널이 꺼지므로 아래 순서대로 실행:

### 1. 백엔드 서버 실행 (집 서버에서 cmd 열고)

```
D:
cd cursor\naver-estate-web\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8002
```

### 2. Cloudflare Tunnel 실행 (cmd 하나 더 열고)

```
cloudflared tunnel --url http://localhost:8002
```

→ `https://xxxx.trycloudflare.com` 새 URL 생성됨 (매번 바뀜)

### 3. Vercel 환경변수 업데이트 + 재배포 (개발 PC에서)

```bash
cd z:/cursor/naver-estate-web
npx vercel env rm NEXT_PUBLIC_API_URL production -y
printf "새URL" | npx vercel env add NEXT_PUBLIC_API_URL production
npx vercel --prod
```

### Vercel 프로젝트 정보

- 프로젝트: `naver-estate-web` (루트에서 배포, frontend/ 아님)
- 도메인: `2u.pe.kr`, `www.2u.pe.kr`
- 배포 명령은 **프로젝트 루트**(`z:/cursor/naver-estate-web`)에서 실행

**핵심**: 사전 크롤링이 아닌 **실시간 크롤링** — 사용자 검색 시 네이버 API 호출 → DB upsert → 결과 반환

## 핵심 상수

- `M2_TO_PYEONG = 3.3058` (프론트/백엔드 동일)
- `LIVE_TIMEOUT_MS = 120_000` (실시간 크롤링 타임아웃)
- `get_dynamic_ttl()` (live 엔드포인트 시간대별 동적 캐시: 새벽 2시간 / 오전 15분 / 오후 30분 / 저녁 1시간)
- `_PRICE_COLLECT_TTL = 86400` (실거래가 수집 24시간 TTL)
- `PRICE_COLLECT_POLL_MS = 3_000` (실거래가 수집 폴링 간격 3초)
- `MAX_PRICE_COLLECT_POLLS = 60` (폴링 최대 60회 = 3분 타임아웃)

## 거래유형 코드

| 코드 | 이름     | 설명                   |
| ---- | -------- | ---------------------- |
| A1   | 매매     | 매매 거래              |
| B1   | 전세     | 전세 거래              |
| B2   | 월세     | 월세 (보증금/월세)     |
| B3   | 단기임대 | 단기임대 (보증금/월세) |

## 매물유형 코드

| 코드 | 이름           | 설명            |
| ---- | -------------- | --------------- |
| APT  | 아파트         | 일반 아파트     |
| ABYG | 아파트분양권   | 아파트 분양권   |
| JGC  | 재건축         | 재건축 단지     |
| PRE  | 분양권         | 분양권 (레거시) |
| OPST | 오피스텔       | 오피스텔        |
| OBYG | 오피스텔분양권 | 오피스텔 분양권 |
| RDV  | 재개발         | 재개발 단지     |

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

## 클라이언트 저장소 (localStorage)

| 키                   | 용도                    | 제한                  |
| -------------------- | ----------------------- | --------------------- |
| `search_history`     | 최근 검색 (키워드/지역) | 최대 10개, 중복 제거  |
| `favorite_complexes` | 즐겨찾기 단지           | 무제한, 토글 방식     |
| `compare_complexes`  | 비교 대상 단지          | 최대 4개              |
| `mb_favorites`       | 미분양 즐겨찾기         | 최대 200개, 토글 방식 |
| `mb_compare`         | 미분양 비교 대상        | 최대 4개              |
| `mb_search_history`  | 미분양 검색 히스토리    | 최대 10개, 중복 제거  |

## DB 커넥션 풀

- **NullPool** 사용 (요청마다 연결/해제) — Supabase Session Mode 동시 연결 한도 방지
- `db/database.py`에서 설정

## 스케줄러 (APScheduler)

| 작업             | 주기                   | 설명                                                                   |
| ---------------- | ---------------------- | ---------------------------------------------------------------------- |
| 전국 단지 발견   | 일요일 3시             | 네이버 키워드 검색으로 신규 단지 수집                                  |
| 매물 수집 배치   | 12시간 interval        | 최근 조회 단지 매물 크롤링 (CRAWL_INTERVAL_HOURS)                      |
| 매물 상세 보강   | 4시간 interval         | 매물 상세 정보 크롤링 (CRAWL_DETAIL_INTERVAL_MIN)                      |
| 시세 이력 수집   | 수요일 4시             | 단지별 시세(매매/전세) 주간 수집                                       |
| 인기 단지 크롤링 | 매일 10:30/14:30/19:00 | 자주 조회되는 단지 선제적 크롤링 (POPULAR_CRAWL_ENABLED)               |
| 공공데이터 수집  | 토요일 5시             | 국토교통부 실거래가 API (PUBLIC_DATA_ENABLED, 매월 10일 토요일은 skip) |

## 공유 인프라 규칙 (mibunyang 프로젝트와 공유)

### data.go.kr API 쿼터 (일일 10,000회, 동일 키 공유)

| 일자      | 프로젝트         | 워크플로우                       | 추정 호출수  |
| --------- | ---------------- | -------------------------------- | ------------ |
| 매월 1일  | mibunyang        | collect-unsold-kosis             | ~1           |
| 매월 5일  | mibunyang        | collect-population, market-stats | ~100         |
| 매월 6일  | mibunyang        | collect-trades + molit-units     | ~1,500~3,800 |
| 매월 10일 | mibunyang        | **collect-building-info**        | **~8,500**   |
| 토요일    | naver-estate-web | collect_public_trades            | ~3,600       |

- **위험일**: 매월 10일이 토요일 → 8,500 + 3,600 = 12,100 > 10,000
- **대응**: `service.py`의 `collect_public_trade_data()`에서 매월 10일 토요일이면 skip
- 다른 날짜는 한도 이내: 5일(토)=3,700, 6일(토)=7,400

### 네이버 크롤링 시간 분리 (같은 집 서버 IP)

| 시간              | 프로젝트         | 작업                  | 실행일             |
| ----------------- | ---------------- | --------------------- | ------------------ |
| 03:00             | naver-estate-web | discover_regions      | 일요일             |
| 04:00             | naver-estate-web | collect_prices        | 수요일             |
| 08:00             | mibunyang        | 로컬 naver-collect.py | 월/목              |
| 10:30/14:30/19:00 | naver-estate-web | popular 크롤링        | 매일               |
| 12h interval      | naver-estate-web | crawl_articles        | 매일 (시간 불고정) |
| 4h interval       | naver-estate-web | crawl_details         | 매일 (시간 불고정) |

### 공용 테이블 규칙 (같은 Supabase DB)

- 공용: `complexes`, `articles`, `complex_price_history`, `trades` (양쪽 upsert)
- mibunyang 전용: `apartments`, `unsold_history`, `regions`, `prices`, `trade_stats`, `builders`, `infra`, `schools`, `transport` (ORM: `db/mb_models.py`)
- **기존 컬럼 타입 변경/삭제 금지** — 컬럼 추가만 허용
- ALTER/DROP 전 상대 프로젝트의 SELECT 쿼리/ORM 모델 검색 필수
- 컬럼명 불일치 주의: naver-estate-web ORM은 `latitude`/`longitude`/`total_household_count`, mibunyang은 `lat`/`lng`/`total_households` (mb_models.py에서 mapped_column alias로 해결)

## 코딩 규칙

`.claude/rules/web-rules.md` 참조.

### 커밋 전 필수 검증

```bash
# BE 변경 시 (ruff 빠뜨리면 CI 실패)
cd backend && ruff check . && python -m pytest --tb=short -q

# FE 변경 시
cd frontend && npx tsc --noEmit && npm run lint && npm test
```

# 플랜 모드 규칙 (모든 /plan에 자동 적용)

## 계획 작성 시 반드시 포함할 섹션:

1. **영향 범위** — 수정 파일 목록 + 해당 파일을 import하는 파일 목록
2. **실행 순서** — 의존 관계 기반 단계 구분
3. **위험 요소** — 사이드이펙트, 보안, 데이터 유실 가능성
4. **롤백 방법** — 문제 시 되돌리는 방법
5. **테스트 계획** — 완료 후 뭘 확인해야 하는지
6. 계획에 "영향받는 파일" 섹션을 반드시 포함할 것
7. 계획 제시 후 바로 실행하지 말 것

## 자동 검증 규칙:

- 5개 이상 파일 수정 시 → 단계를 나눠서 제시
- DB 변경 포함 시 → 마이그레이션 롤백 방법 명시
- API 변경 포함 시 → 영향받는 프론트 페이지 나열
- 새 기능 추가 시 → 에러 처리·빈 데이터·로딩 상태 포함 확인

## 작업 완료 후 필수 프로세스

### 커밋 전 교차검증 (병렬 에이전트)

작업 완료 후, **커밋 전** 5개 에이전트를 **동시에** 실행하여 교차검증:

| # | 에이전트 | 검증 항목 | 주요 체크 |
|---|----------|-----------|-----------|
| 1 | **빌드 검증** | `tsc --noEmit` + `npm run lint` | 타입 에러, import 누락 |
| 2 | **null 안전성** | null/undefined 가드 누락 | `?.`, `?? 0`, toLocaleString 등 |
| 3 | **Hook 규칙** | React Rules of Hooks 준수 | 호출 순서, 의존성 배열, 조건부 호출 없음 |
| 4 | **보안 점검** | XSS, CSP, 인젝션, 인증 우회 | dangerouslySetInnerHTML, env 키 노출 |
| 5 | **테스트** | `npm test` 전체 통과 | 기존 테스트 깨짐 없는지 |

검증 후 문제 발견 시 수정 → 재검증. 모두 통과하면 커밋+푸시.
