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

- 프로젝트: `naver-estate-web`. **Root Directory = `frontend`** (세션 323 라이브 `vercel project inspect` 실측 정정 — 옛 "루트에서 배포" 기술은 틀림. 루트엔 package.json·next.config 둘 다 없음, Vercel 이 frontend 를 빌드 루트로 잡음).
- 도메인: `2u.pe.kr`, `www.2u.pe.kr`
- `frontend/vercel.json` 의 `ignoreCommand`(`git diff --quiet HEAD^ HEAD -- .`)로 frontend 무관 커밋은 빌드 스킵 (세션 323). Root Directory(frontend) 안에서 실행되므로 경로 `-- .`. exit 0=스킵·exit 1=진행.
- ⚠ Hobby 무료는 약관상 비상업적 한정 — 유료 결제 서비스라 매출 시작 시 Pro 전환 (사장님 결정). 상세 = 글로벌 메모리 `[[project-vercel-github-freetier-infra]]`.

## DB 커넥션 풀

- **NullPool** 사용 (요청마다 연결/해제) — Supabase Session Mode 동시 연결 한도 방지
- `db/database.py`에서 설정

### statement_timeout 적용 방식 (세션 255 실측 — 함정 주의)

- **폭주 쿼리 안전망 = `connect` 이벤트의 `SET statement_timeout`** (env `STATEMENT_TIMEOUT_MS`, 기본 8000ms). NullPool 이라 매 요청 새 연결 → connect 이벤트가 매번 발동 → 모든 세션 보장.
- ⚠ **`connect_args={"options": "-c statement_timeout=..."}` 는 작동 안 한다.** Supabase Supavisor 풀러가 startup `options` 파라미터를 무시함 (`SHOW statement_timeout` 이 기본 2min 그대로). [Supabase Timeouts 공식문서](https://supabase.com/docs/guides/database/postgres/timeouts): transaction mode 에선 role-level `ALTER ROLE` 도 무효, 연결 직후 명시 `SET` 만 세션에 적용.
- 검증법 = prod 연결로 `SHOW statement_timeout` (8s 기대) + `SELECT pg_sleep(9)` (8.0초에 QueryCanceled 기대). 실제 앱·배치 쿼리는 0.03~0.05초라 false positive 없음 (인덱스 없는 풀스캔 GROUP BY 만 8초 초과 → 죽음).

### 슬로우 쿼리 로깅 (세션 255)

- `services/slow_query_log.py` — `before/after_cursor_execute` 이벤트로 `SLOW_QUERY_MS`(기본 1000) 초과 SQL 을 `logger.warning` (best-effort). prod `engine` 에만 attach, 테스트는 conftest SQLite 격리로 영향 0.

## 스케줄러 (APScheduler)

| 작업 | 주기 | 설명 |
|------|------|------|
| 전국 단지 발견 | 일요일 3시 | 네이버 키워드 검색으로 신규 단지 수집 |
| 매물 수집 배치 | 12시간 interval | 최근 조회 단지 매물 크롤링 |
| 매물 상세 보강 | 30분 interval | 매물 상세 정보 크롤링 (배치 500, PR #19 답습 ~27일 완주 일정. 2026-05-25 세션 229 실측 = 5일 진행 시 active 570,126건 중 23,019건(4.0%) detail_crawled. 배치당 dead 매물(404 빠른 응답) ~85% 답습 — "27일 완주 63.8만 건" 모집단과 "active 4.0%" 모집단은 다름) |
| 시세 이력 수집 | 수요일 4시 | 단지별 시세(매매/전세) 주간 수집 |
| 시세 이력 소급 수집 | 매일 03:30 | complex_price_history 6행 미만 단지 세대수 상위순 국토교통부 backfill (PUBLIC_DATA_ENABLED 토글, 네이버 0 — 세션 288 표 누락 정정) |
| 단지 가치지표 수집 | 매일 04:30 | complex_price_history 집계 → complexes 가치 3필드 (네이버 API 0, 기본 배치 1000) |
| 빌링키 자동결제 | 매일 04:50 | billing_keys 의 next_charge_at 도래분(status='active' AND is_default) PortOne 빌링키 결제 → paid_until 연장 + next_charge_at 갱신. 3일 연속 실패 시 status='failed' 중단+알림. PortOne 결제라 네이버 0, 토글 BILLING_AUTO_CHARGE_ENABLED (정기결제 PR3, 세션 330) |
| 정기 VACUUM 유지보수 | 매일 03:50 | articles/trades VACUUM (ANALYZE) — visibility map 재악화 차단. Supabase autovacuum 미동작 대비 안전망. DB 전용(네이버 0), 토글 VACUUM_MAINTENANCE_ENABLED (세션 260) |
| 인기 단지 크롤링 | 매일 10:45/14:45/19:15 | 자주 조회되는 단지 선제적 크롤링, 개별 try/except (기본 배치 50) |
| 공공데이터 수집 | 토요일 5시 | 국토교통부 실거래가 (10일 토요일 skip) |
| 청약홈 오피스텔 수집 | 월요일 05:00 | 오피스텔/도시형 청약 공고+평형(getUrbtyOfctlLttotPblancDetail/Mdl), apartments 로스터 매칭분만 upsert (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 청약홈 민간임대 수집 | 월요일 05:30 | 공공지원 민간임대 공고+평형(getPblPvtRentLttotPblancDetail/Mdl), 신규 독립 테이블 (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 대기질 수집 | 매일 2시 | 에어코리아 API |
| 응급의료 수집 | 매월 첫째 월 3시 | NEMC 응급의료기관 API |
| 어린이집 수집 | 매월 첫째 목 6시 | CPMS cpmsapi030 API |
| 범죄통계 수집 | 분기별 첫째 일 4시 | 경찰청 odcloud API (CSV 폴백) |
| 단지 상세 backfill | APT/OPST 4시간 interval 매일 / JGC·ABYG·OBYG 주1회 7시 | 매물유형별 독립 job, detail_crawled_at NULL 단지 보강 (APT/OPST 배치 1000 가속 — PR #19 답습, 소수 유형 배치 1000 cron 유지. 2026-05-27 PR 6a 답습 6h→4h 33% 가속) |
| 크롤링 모니터 | 10분 interval | crawl_jobs 정합성 점검 후 텔레그램 알림 (운영 토글 MONITOR_ENABLED, 2026-05-25 세션 229 30→10→20 답습 후 현 .env MONITOR_INTERVAL_MIN=10 운영. _STALE_HOURS=1·_FAILED_WINDOW_HOURS=24 는 monitor.py:23~25 고정 상수, 인터벌 격하 무관) |

### 스케줄러 잡 에러 최후 안전망 (세션 340, PR #273)

`crawler/job_error_listener.py` = `scheduler.add_listener(job_event_listener, EVENT_JOB_ERROR | EVENT_JOB_MISSED)` (main.py lifespan `register_job_listener` 배선). monitor.py 는 **CrawlJob row 가 이미 기록된** 실패만 감지 → 잡이 CrawlJob 기록 **전에** 예외로 죽거나 misfire(누락) 스킵되면 사각지대였음. 리스너가 스케줄러 이벤트 레벨에서 그 두 경우를 포착해 `logger.error/warning` + 텔레그램(`(kind, job_id)` 별 600초 쿨다운). event.code 로 ERROR/MISSED 분기(misfire 는 `.exception` 미접근 — AttributeError 회피). 텔레그램 실패는 best-effort 흡수(리스너 안 죽음). TELEGRAM_ENABLED 공유.

### monitor freshness 풀스캔 timeout 방지 (세션 342, PR #279·#281)

크롤링 monitor(10분 interval)가 `compute_freshness`(routers/admin/freshness.py)로 8종목
풀 테이블 집계를 하는데, **대형 테이블 풀스캔이 부하 시 8초 statement_timeout 을 넘겨
트랜잭션 aborted → 같은 세션의 monitor_alerts 쿼리가 InFailedSqlTransaction 으로 연쇄
실패**하며 매 10분 크래시했다(세션 342 실측, 텔레그램 진단 중 발견). 3겹 처방:

1. **트랜잭션 격리** (monitor.py, 축 A) — `compute_freshness` 를 **별도 `SessionLocal()`
   세션**으로 실행. timeout 나도 monitor 메인 트랜잭션 무손상(크래시 즉시 차단). 라이브
   실증: timeout 나도 InFailedSqlTransaction 0.
2. **max/count 분리 + 인덱스** — max+count 묶으면 count 풀스캔이 max 인덱스를 무효화
   (`[[feedback-combined-aggregate-index-void]]`). 물리 2쿼리로 분리 + **V038
   `ix_articles_updated_at`**(max 0.07초). 대형 count 는 **reltuples 근사**(`_approx_count`,
   articles·trades·complex_price_history 3종, 화면 표시용이라 근사 허용·오차 0%, SQLite
   폴백). new_rows(헛바퀴 감지 `created_at≥job_start` count)는 **V039 `ix_articles_created_at`**.
3. **결과**: compute_freshness **9.2초 → 0.6초**(부하 8배도 8초 여유). V038·V039 둘 다
   CONCURRENTLY prod 적용완료(락0). ⚠ freshness count 는 **순수 표시용**(status=시각 기반,
   spinning=crawl_jobs 기반) — 근사 오차가 알림 오판 유발 0.

> 교훈: 이 monitor 크래시는 **statement_timeout(8초 안전망)이 오히려 방아쇠**였다 — 폭주
> 쿼리를 죽이는 게 목적이나, 정상 집계 쿼리가 대형 테이블 성장으로 8초를 넘기면 monitor
> 자신을 죽인다. 신선도·집계 쿼리는 테이블 성장 대비 **인덱스 or 근사**로 상시 <1초 유지 의무.

## 관찰성 인프라 (세션 340 — 운영 중 문제를 볼 수 있게)

- **외부 uptime 감시** = `.github/workflows/healthcheck.yml` (매일 05:30 KST cron 1회 + workflow_dispatch. ⚠ 2026-08-02 10분→일1회 격하, 사장님 결정 — 10분 간격이 월 4,300분+로 Actions 무료한도 2,000분을 태워 7/13경 소진 → 모든 CI·감시 월말까지 마비, 7/18 터널 사망을 아무도 못 본 사고. 05:30 = 새벽 재부팅 직후. 주기 되올리려면 한도 계산 먼저). GitHub Actions(집서버 무관)가 `curl https://api.2u.pe.kr/health/db` → 실패 시 텔레그램(secrets `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, 미설정 시 안전 스킵). **집서버가 통째로 죽으면 내부 watchdog 도 함께 죽어 무통지**이던 사각지대를 외부에서 메움. ⚠ GitHub Actions `if:` 에 `secrets` context 사용 불가(공식) → secrets 는 `env:` 로 주입해 shell 판정(PR #276 hotfix). CI 문법은 `gh workflow run` 라이브 실행만 ground truth.
- **심층 헬스체크** = `backend/routers/health.py` `/health/db` (DB `SELECT 1`, 성공 200 / DB장애 503 클린 JSON). 외부 모니터 전용. ⚠ 기존 `/health`(정적 200, main.py:208)는 **일부러 얕게 유지** — watchdog 이 폴링하는데 DB 장애 시 503 주면 "backend 죽음" 오판 → 무한 재시작 루프(재시작으로 DB 안 살아남). watchdog=프로세스 생존만, /health/db=DB 포함.
- **backend.log 회전 보존** = `scripts/log_rotation.py` `rotate_backend_log()`. `start_backend()` 가 매 재시작 backend.log 를 `"w"` 로 truncate 해 어제 크래시 로그 소실되던 것 → 재시작 직전 `backend_<mtime>.log` 로 회전 보존 + 7일 초과분 정리. 안정 경로 backend.log 유지(release.md §2 `head -1 scripts/backend.log` 불변). ⚠ orchestrator(pythonw) 상주 프로세스라 **재부팅해야 회전 코드 적용**(startup_orchestrator.py 수정 = orchestrator zombie 대상).
- **결제·크롤 알림 삼킴 로그화** = billing_charge.py·payment.py·service_discover.py 의 `except: pass`(알림 발송 실패) → `logger.warning`(best-effort 유지). 결제 로직은 안 깨지되 알림 실패가 관찰 가능.

> 상세 = 글로벌 메모리 `[[session340-summary]]`·`[[project-observability-backlog-s340]]`. 잔여 백로그(connect_timeout 공용엔진·open(w) 파일락) 착수 전 직독.

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
| 03:30 | naver-estate-web | backfill_price (data.go.kr, 네이버 0) | 매일 (PUBLIC_DATA_ENABLED) |
| 04:00 | naver-estate-web | collect_prices | 수요일 |
| 05:30 | mibunyang | KOSIS 로컬 러너 10종 (kosis.kr, 네이버 0 — Windows 작업 MibunyangKosisLocal, 세션 289 GH→집서버 이전) | 매일 (일자 디스패치) |
| 4h interval | naver-estate-web | 단지 상세 backfill APT/OPST | 매일 |
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

- 공용 (양쪽 upsert): `complexes`, `articles`, `complex_price_history`
- `trades`: **mibunyang write 전용** (매월 6일 collect-trades), **naver-estate 는 read-only**. naver-estate 는 이 테이블에 절대 안 쓴다(신선도 카드가 읽기만 함 — 세션 343 실측 확정). 옛 "양쪽 upsert" 표기는 부정확.
- `infra` · `air_quality_stations`: **naver-estate 도 write** (환경 수집 스케줄러). 옛 "mibunyang 전용" 표기는 부정확 (세션 343 정밀분석 실측 확정). 컬럼 분담 =
  - `infra`: naver 가 `air_updated_at`(env_air.py:88) · `crime_updated_at`(env_crime.py:119·186) · `emergency_*`(env_emergency.py:53~56) · `childcare_*`(env_childcare.py:93~102, 신규 INSERT 포함) write. mibunyang 은 나머지 인프라 컬럼 write.
  - `air_quality_stations`: naver 가 에어코리아 측정소 캐시 `_do_upsert(AirQualityStation)` write (env_air.py:112~126).
  - ⚠ ALTER/DROP 시 **양쪽 영향 검토 필수** ("mibunyang 전용" 오판 금지).
- mibunyang 전용: `apartments`, `unsold_history`, `regions`, `prices`, `trade_stats`, `builders`, `schools`, `transport`
- **기존 컬럼 타입 변경/삭제 금지** — 컬럼 추가만 허용
- ALTER/DROP 전 상대 프로젝트의 SELECT 쿼리/ORM 모델 검색 필수
- 컬럼명 불일치 주의: naver-estate-web은 `latitude`/`longitude`, mibunyang은 `lat`/`lng` (mb_models.py alias)
