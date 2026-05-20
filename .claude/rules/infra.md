# 인프라·운영 규칙

## 집 서버 재시작 후 복구 절차

### 자동 시작 (정상 경로)

Windows Startup 폴더의 BAT가 `scripts/startup_orchestrator.py`를 실행:
1. 기존 프로세스 정리 (port 8002 + cloudflared)
2. 백엔드 서버 시작 → health check 대기
3. Cloudflare Named Tunnel 시작 (api.2u.pe.kr)
4. Watchdog (30초 간격 생존 감시, 죽으면 재시작)

### 수동 복구 (자동 시작 실패 시)

```bash
# 1. 백엔드 서버 실행 (집 서버 cmd)
D:
cd naver-estate-web\backend
python -m uvicorn main:app --host 0.0.0.0 --port 8002

# 2. Named Tunnel 실행 (cmd 하나 더)
cloudflared tunnel run naver-estate-backend
```

URL이 고정(api.2u.pe.kr)이므로 Vercel 재배포 불필요.

### Named Tunnel 사전 작업 (1회성, 미완료)

```bash
cloudflared tunnel create naver-estate-backend
cloudflared tunnel route dns naver-estate-backend api.2u.pe.kr
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: naver-estate-backend
credentials-file: ~/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: api.2u.pe.kr
    service: http://localhost:8002
  - service: http_status:404
```

Vercel에 `NEXT_PUBLIC_API_URL=https://api.2u.pe.kr` 영구 설정.

### Vercel 프로젝트 정보

- 프로젝트: `naver-estate-web` (루트에서 배포, frontend/ 아님)
- 도메인: `2u.pe.kr`, `www.2u.pe.kr`
- 배포 명령은 **프로젝트 루트**(`d:/naver-estate-web`)에서 실행

## DB 커넥션 풀

- **NullPool** 사용 (요청마다 연결/해제) — Supabase Session Mode 동시 연결 한도 방지
- `db/database.py`에서 설정

## 스케줄러 (APScheduler)

| 작업 | 주기 | 설명 |
|------|------|------|
| 전국 단지 발견 | 일요일 3시 | 네이버 키워드 검색으로 신규 단지 수집 |
| 매물 수집 배치 | 12시간 interval | 최근 조회 단지 매물 크롤링 |
| 매물 상세 보강 | 30분 interval | 매물 상세 정보 크롤링 (배치 500, 약 27일 내 미처리 63.8만 건 처리 — 약 85%는 dead 매물 청소) |
| 시세 이력 수집 | 수요일 4시 | 단지별 시세(매매/전세) 주간 수집 |
| 단지 가치지표 수집 | 금요일 8:30 | complex_price_history 집계 → complexes 가치 3필드 (네이버 API 0, 기본 배치 200) |
| 인기 단지 크롤링 | 매일 10:45/14:45/19:15 | 자주 조회되는 단지 선제적 크롤링, 개별 try/except (기본 배치 50) |
| 공공데이터 수집 | 토요일 5시 | 국토교통부 실거래가 (10일 토요일 skip) |
| 대기질 수집 | 매일 2시 | 에어코리아 API |
| 응급의료 수집 | 매월 첫째 월 3시 | NEMC 응급의료기관 API |
| 어린이집 수집 | 매월 첫째 목 6시 | CPMS cpmsapi030 API |
| 범죄통계 수집 | 분기별 첫째 일 4시 | 경찰청 odcloud API (CSV 폴백) |
| 단지 상세 backfill | APT/OPST 6시간 interval 매일 / JGC·ABYG·OBYG 주1회 7시 | 매물유형별 독립 job, detail_crawled_at NULL 단지 보강 (APT/OPST 배치 1000 가속 — PR #19 답습, 소수 유형 배치 1000 cron 유지) |

## 공유 인프라 규칙 (mibunyang 프로젝트와 공유)

### data.go.kr API 쿼터 (일일 10,000회, 동일 키 공유)

| 일자 | 프로젝트 | 워크플로우 | 추정 호출수 |
|------|----------|-----------|------------|
| 매월 1일 | mibunyang | collect-unsold-kosis | ~1 |
| 매월 5일 | mibunyang | collect-population, market-stats | ~100 |
| 매월 6일 | mibunyang | collect-trades + molit-units | ~1,500~3,800 |
| 매월 10일 | mibunyang | **collect-building-info** | **~8,500** |
| 토요일 | naver-estate-web | collect_public_trades | ~3,600 |

- **위험일**: 매월 10일이 토요일 → 8,500 + 3,600 = 12,100 > 10,000
- **대응**: collect_public_trade_data()에서 매월 10일 토요일이면 skip

### 네이버 크롤링 시간 분리 (같은 집 서버 IP)

| 시간 | 프로젝트 | 작업 | 실행일 |
|------|----------|------|--------|
| 02:00 | naver-estate-web | collect_air_quality | 매일 |
| 03:00 (첫째 월) | naver-estate-web | collect_emergency | 매월 첫째 월 |
| 03:00 | naver-estate-web | discover_regions | 일요일 |
| 04:00 | naver-estate-web | collect_prices | 수요일 |
| 6h interval | naver-estate-web | 단지 상세 backfill APT/OPST | 매일 |
| 07:00 | naver-estate-web | 단지 상세 backfill JGC·ABYG·OBYG | 화·수·목 |
| 08:00 | mibunyang | 로컬 naver-collect.py | 월/목 |
| 10:45/14:45/19:15 | naver-estate-web | popular 크롤링 | 매일 |
| 12h interval | naver-estate-web | crawl_articles | 매일 |
| 30m interval | naver-estate-web | crawl_details | 매일 |

### IP 차단 방지 (절대 규칙)

같은 집 서버 IP 로 네이버를 크롤링하므로, 짧은 시간에 대량 요청하면 IP 가 차단된다.

1. **모든 네이버 수집 코드는 `AdaptiveThrottle` 경유 필수.** `crawler/utils.py` 의 `get_shared_throttle(name, ...)` 로 인스턴스를 받아 단지·페이지 루프마다 `.wait()` 호출. 429 응답 시 자동 감속(`on_rate_limit`). throttle 우회한 직접 반복 호출 금지.
2. **크롤 지표 컬럼을 SQL 직접 일괄 UPDATE 로 찍지 말 것.** `complexes.last_crawled_at`·`complexes.detail_crawled_at`·`articles.detail_crawled` 는 실제 크롤 코드(`CrawlJob` 생성 경유)만 갱신한다. SQL 로 일괄 UPDATE 하면 "크롤된 것처럼" 보이지만 실제 데이터는 없어 진단을 망친다.

> **사건**: 2026-04-13 — `last_crawled_at` 이 하루에 29,944개(전체 75%) 동일 날짜로 찍힘. 그날 `crawl_jobs` 0건 → 크롤이 아니라 SQL 직접 일괄 UPDATE. 그 단지들의 단지상세 채움률은 2.6%뿐 — `last_crawled_at` 이 허수가 되어 데이터 진단을 장기간 어지럽힘.

### 공용 테이블 규칙 (같은 Supabase DB)

- 공용: `complexes`, `articles`, `complex_price_history`, `trades` (양쪽 upsert)
- mibunyang 전용: `apartments`, `unsold_history`, `regions`, `prices`, `trade_stats`, `builders`, `infra`, `schools`, `transport`, `air_quality_stations`
- **기존 컬럼 타입 변경/삭제 금지** — 컬럼 추가만 허용
- ALTER/DROP 전 상대 프로젝트의 SELECT 쿼리/ORM 모델 검색 필수
- 컬럼명 불일치 주의: naver-estate-web은 `latitude`/`longitude`, mibunyang은 `lat`/`lng` (mb_models.py alias)
