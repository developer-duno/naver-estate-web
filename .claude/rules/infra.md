# 인프라·운영 규칙

## 집 서버 재시작 후 복구 절차

### 자동 시작 (정상 경로 — 세션 363부터 nssm 서비스)

**nssm 서비스 `naver-orchestrator`**(부팅 시 지연 자동 시작, **로그인 불필요**, 실행 계정
`.\user`)가 `scripts/startup_orchestrator.py`를 실행:
1. 기존 프로세스 정리 (port 8002)
2. 백엔드 서버 시작 → health check 대기 (터널은 별도 nssm 서비스 `cloudflared-naver` 전담)
3. Watchdog (30초 간격 생존 감시, backend 죽으면 재시작)
4. orchestrator 프로세스 자체가 죽으면 **nssm 이 60초 후 자동 재기동** (AppRestartDelay=60000)

- 설치/재설치 = `scripts/install_orchestrator_service.ps1` (관리자 PowerShell 1회). 옛 로그인
  Startup BAT 는 `startup-server.bat.disabled` 로 보존 (서비스 제거 시 원복 폴백).
- 서비스 DACL 에 사용자 계정의 시작/중지 권한 등록됨 → **비관리자 세션도
  `Restart-Service naver-orchestrator` 로 재시작 가능** (재시작 절차 = release.md §3).
- ⚠ 서비스 프로세스는 session 0 + UAC 필터링 없는 전체 토큰: 비관리자 조회에서
  CommandLine=NULL(프로세스 grep 무동작), 비관리자 `Stop-Process` 는 액세스 거부(세션 363
  훈련 실측). 프로세스 탐색은 `scripts/orchestrator.pid`, 재시작은 Restart-Service 로.

> **사건 (2026-08-12~13, 세션 363 규명 — nssm 전환 계기)**: Windows Update(KB5120249)가
> 야간(18:56) 계획 재부팅 → 옛 Startup BAT 는 사용자 Startup 폴더 소재라 "로그인 시"에만
> 실행 → PC 는 켜져 있는데 로그인 화면에서 13시간 backend 다운(watchdog 도 같이 미기동,
> 03:30 정기 백필 등 스케줄 전체 미실행). 로그인만으로 복구되던 사각지대를 서비스 전환으로
> 근본 해소 (부팅만으로 기동 + orchestrator 급사 자동복구까지 확보).

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

### Named Tunnel 초기 셋업 절차 (1회성 — 완료·운영 중, 재설치 시 참고)

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

Vercel에 `NEXT_PUBLIC_API_URL=https://api.2u.pe.kr` 영구 설정 (설정 완료).

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

### Supabase DB 전면 다운 진단 런북 (세션 378 — 2026-08-22 29분 다운 실사고)

`/health/db` 가 `{"status":"degraded","db":"down"}` 이거나 statement timeout 이 연쇄로 터지면,
**층위 순서대로** 어느 층이 죽었는지 국소화한다 (어느 층이냐로 책임 소재·처방이 갈린다):

1. `curl https://api.2u.pe.kr/health` (정적 200) — 백엔드 프로세스·터널 생존 확인 (DB 무관)
2. `curl -m 30 https://api.2u.pe.kr/health/db` — 판정에 ~10초(pooler 2 IP × connect_timeout 5s) 걸리니 `-m 10` 이면 빈 응답으로 오판한다
3. 로컬 → pooler TCP 소켓 연결 (python socket, 5432·6543) — TCP 즉시 OK + pg 연결만 timeout 이면 네트워크 무혐의
4. pg 연결을 connect_timeout 25s 로 재시도해 **에러 문구** 확보 — `FATAL (ECHECKOUTTIMEOUT) unable to check out` = Supavisor(풀러)는 살아있고 뒤의 DB 컴퓨트가 응답불능(또는 풀 고갈)
5. REST(PostgREST) 교차 확인 (`{ref}.supabase.co/rest/v1/...` + anon key) — 이것도 timeout 이면 DB 컴퓨트 다운 확정 (별도 경로라 우리 백엔드 무혐의 입증)
6. `netstat` 으로 이 PC 가 쥔 pooler 연결 수 — 소수면 로컬 연결누수 무혐의
7. status.supabase.com 은 **공지가 늦을 수 있다** (실사고: 다운 중에도 서울 리전 "Operational")
8. **Database Logs 탭에서 OOM/PANIC/FATAL 원문 확인** — 대시보드 그래프(메모리·스왑 등)
   판독만으로 "OOM 이었다"고 단정하지 말 것(세션 381 사후검증에서 "유력 가설"로 격하된 전례,
   §DB 크래시 재발 항목 참조). 경로 = **대시보드 → Observability → Logs → Postgres Logs**.
   서버 로그 원문(`out of memory`/`terminated by signal`/`PANIC`/`FATAL`)을 직접 봐야 가설이
   확정으로 승격된다 — 급할 때 건너뛰기 쉬우니 진단 순서에서 스킵하지 말 것.

**처방**: 자가회복 대기 우선 (실사고 29분 자가회복). ⛔ 성급한 backend 재시작 금지 — 재시작은
DB 를 못 살리고, 부팅 스윕(main.py, **시작 5분 경과한 running 잡** 대상)이 외부 프로세스의 잡
(수동 재수집 등 — 수 시간 돌므로 항상 해당)까지 cancelled 로 오염시킨다. 근본원인(DB 컴퓨트
CPU/RAM/IO)은 Supabase 대시보드 그래프로만 확인 가능(사장님 로그인), 단 위 8번(서버 로그
원문)까지 함께 봐야 가설이 아니라 확정 진단이 된다.

**연쇄 함정 2건** (실사고에서 실증, #411 로 폴백 견고화):
- 잡 실패 마킹 중 DB 가 죽으면 `_fail_job` 폴백까지 동반 사망해 CrawlJob 이 'running' 유령으로
  잔존할 수 있다 → official_price **체크포인트 재개는 status IN ('failed','cancelled') 만 훑으므로
  재개가 차단**된다. 프로세스 사망을 실측 확인한 뒤 그 잡을 수동 UPDATE(`AND status='running'` 가드)로
  failed 정정해야 재기동이 이어받는다 (또는 backend 재시작 시 부팅 스윕의 cancelled 로도 해소).

### 재발 (세션 381 — 2026-08-24 03:22~03:56 34분 다운, 2회째) + 근본원인·처방

같은 런북으로 34분 만에 자가회복. 사장님이 대시보드 Database Health 그래프(스크린샷)를 제공해
원인을 추적: **Micro(RAM 1GB) 인스턴스가 스왑 1GB 상시 포화·메모리 커밋이 한도의 약 2배로 만성
압박 상태**였고, 거기에 PostgREST 경유 대량 요청(연결 급증, Logs Explorer 로 재구성 —
`/rest/v1/apartments` 03:03=1,901건)이 시간상 겹쳤다. 디스크 IOPS 는 거의 0 이라 "IO 예산 소진"
단독 가설은 기각(단 주간 누적 통계는 82%로 근접 — 10분 풀스캔이 누적 원인, 아래 처방 (b)로 제거).

⚠ **사후 적대검증(세션 381) 결과 — "OOM 크래시"는 확정이 아니라 유력한 가설로 격하한다.**
Postgres 서버 로그(Database Logs 탭)의 `out of memory`/`terminated by signal`/`PANIC`/`FATAL` 원문은
한 번도 직접 확인하지 못한 채, 대시보드 그래프(스크린샷) 판독만으로 "OOM"이라 단정했었다.
Linux 메모리 오버커밋 모델상 "커밋이 물리 한도의 2배"라는 관찰 자체가 자동으로 OOM 을 뜻하지는
않는다(실제 그 커밋을 프로세스가 소비했는지가 중요 — WebSearch 로 확인). 마찬가지로 "PostgREST
버스트가 크래시의 마지막 지푸라기였다"는 인과관계도, 버스트(03:03)와 크래시(03:21~03:22) 사이
19분 공백을 검증 없이 은유로 얼버무린 것으로 확인 — 시간상 근접(상관관계)만 확인됐을 뿐 인과관계는
미확정. **다음 재발 시 최우선으로 Database Logs 탭에서 OOM/PANIC/FATAL 원문을 확인해 가설을
확정으로 승격할 것.**

**처방(세션 381 실행 완료)**:
- 컴퓨트 **Micro → Small** 업그레이드(대시보드 Project Settings → Infrastructure, 다운타임 <2분,
  자동 재시작 동반, +$5.15/월). RAM 1→2GB·연결한도 60→90·shared_buffers 256MB→512MB(SQL SHOW 로
  prod 실측 확인).
- `V048__freshness_max_indexes.sql` — monitor(10분 interval) 의 `compute_freshness` 가 캐시를
  우회해 매번 스캔하던 trades(347MB)·complex_price_history(72MB)·complexes(44MB) 의 max() 컬럼에
  인덱스 3개 추가. CIC 로 prod 적용, `pg_index.indisvalid` 3개 전부 True 재확인, `EXPLAIN (ANALYZE,
  BUFFERS)` 이 Index Only Scan **0.05~0.06ms**로 전환됨을 실측(기존 2~4.6초 Seq Scan). freshness
  최적화는 과거 `project_freshness_do_not_optimize.md`(세션 262)가 "실익 없음"으로 막았던 항목인데,
  그 결론의 전제(max+count 미분리)가 세션 342·381 에서 깨져 무효화됨 — 상세는 그 메모리 파일의
  2026-08-24 갱신분 참조. ⚠ 이 PR(#416)의 신규 테스트는 BE 테스트 환경이 SQLite 고정이라 V048
  인덱스 사용 경로 자체는 검증하지 못한다(리팩터링 안전성만 검증) — 인덱스 효과는 위처럼 prod
  EXPLAIN 으로만 확인 가능하다는 걸 유사 PR 작성 시 유념할 것.
- 외부 uptime 감시(UptimeRobot, 무료, `api.2u.pe.kr/health/db` 5분 간격 + 이메일 알림) 신설 —
  기존 GitHub Actions 일일 1회 healthcheck 를 보완, 장애 통지까지 5분 내로 단축.

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
| 청약홈 오피스텔 수집 | 월요일 05:00 | 오피스텔/도시형 청약 공고+평형(getUrbtyOfctlLttotPblancDetail/Mdl), 독립 테이블 officetel_presale_schedule·officetel_unit_supply 저장 (V045 재설계 — apartments 무관, 옛 "로스터 매칭분만 upsert" 방식 폐기. 네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 청약홈 민간임대 수집 | 월요일 05:30 | 공공지원 민간임대 공고+평형(getPblPvtRentLttotPblancDetail/Mdl), 신규 독립 테이블 (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 공동주택 공시가격 수집 | 매월 15일 06:30 | V-WORLD getApartHousingPriceAttr 법정동 전량 수집 → 단지(APT·JGC) 세대수 게이트 매칭 → 평형별 중위 공시가격 저장 (네이버 0, VWORLD_API_KEY 공유, 토글 OFFICIAL_PRICE_ENABLED — PR-A3). ⚠ 정상 소요 3.6~7h — 실행 중(15일 06:30~오후) 재시작 회피(잡이 프로세스 내 상주라 재시작=중단). 체크포인트 재개는 중단 후 **72h 이내 재실행(수동 재트리거)만** 유효(#387 신선도 바운드, 3개 수집기 공통) — 놓치면 익월 정기 실행이 처음부터 전량 재수집(데이터 무손실, 시간 낭비만) (세션 369·370). V-WORLD 페이지네이션 드리프트(총행수 일치·행 구성 상이)로 대형 단지가 세대수 게이트에서 비결정 탈락 → 본 루프 종료 후 **매칭 소실 재수집 패스**가 새 표본으로 구제, 잔여는 completed 잡의 error_message 에 기록 + **잔여·붕괴(소실 200단지 초과)는 텔레그램 알림**(세션 370). 재수집 패스는 벽시계 1h 캡(`_REPASS_MAX_SECONDS`, 초과분은 잔여 보고 합류) — 재수집 구간에서 강제종료되면 체크포인트가 이미 지워진 뒤라 재실행이 전량 재수집이 되나 데이터 무손실이라 수용(세션 371). **읍/면 리(里) 확장 패스**(재수집 패스 뒤, PR-E2 세션 373) — 읍/면 코드는 공시가격이 전국 공통으로 리 단위 코드에 붙어 있어 애초에 0건인 561개 읍/면(5,808단지)을, `cortar_ri_map.py`(정적 dict, 수동 재생성)로 얻은 리 코드 6,627개로 개별 조회해 회수. 리 하나하나가 독립 단위라 부분 실패가 서로 영향 없음, best-effort. **이름 2차 매칭 패스**(각 fetch 단위 안에서 1차 전량 후, PR-E3 세션 374) — 1차 완전일치가 표기 차이(괄호 차수 `성서주공(2단지)`↔`성서주공2차`·상가 접미사·동명 프리픽스)로 놓친 ~413단지+α 를 회수. 세대수 ±5% 게이트 + 후보 유일성 + claimed(선점 그룹 재사용 금지) 3중 안전장치 + 형제 단지 신호(잉여 숫자) 배제로 보수 원칙 유지, 완료 로그 `이름 2차 매칭 N개` 로 관찰. **신코드 이관 heartbeat**(수집 시작 시 보초 4곳 — 옛 중구·동구·서구·화성 데이터셋 대표 1곳씩 — 신코드 1페이지 프로브, 행>0 시 텔레그램 경보 1회. 이관되면 개편맵 번역이 역효과라 사람 판단으로 전환. 감지 후 맵 변경 전까진 매 실행 재경보(월 1회라 수용). 감시 범위=2026 개편맵만, 12-프리픽스 광주·전남 맵 미감시. 세션 375). **ho_count 는 유니크 호(dongNm,hoNm) 기준**(세션 376) — V-WORLD 가 호마다 완전 동일 행을 2회 반환(2026-08-22 실측: 2826011800 2,622행=1,311호×2, API totalCount 도 2배, 페이지 안에 섞여 등장, 드리프트로 1·3회도 섞임)해 원본 행 수로 세면 세대수의 2배가 저장됐었다(은마 8,848). fetch 의 `len(rows)==totalCount` 가드는 raw 기준이라 그대로 두고 집계(`aggregate_area_medians`)에서만 dedupe. 게이트와 같은 키라 `SUM(ho_count)≈세대수` 가 정상 지표(9/15 재수집 후 확인). **재수집 패스 소실 판정 2건 보강**(세션 380) — ① 리 확장 대상 읍/면 소속 단지는 소실 판정 **제외**(본루프 읍/면 조회=0건이 정상, 리 확장 패스 관할. 안 빼면 8/22 리 확장으로 올해 행을 받은 3,930단지가 9/15 에 통째로 소실 판정 → 임계 200 초과 "시스템 이상" 오탐 + 진짜 드리프트 구제 전면 생략) ② **재개(resume) 실행은 이어받은 동도 구제** — 이어받은 동(체크포인트 done) 소속 단지 중 "올해 행 보유 AND 마지막 저장 시각 < **그 동을 처음 완료한 사슬 잡의 started_at**(동별 컷오프 — 72h 내 체크포인트 보유 실패잡을 started_at 오름차순으로 훑어 체크포인트 누적 차집합으로 소유 잡 결정, 형식 변경 0)" 인 것을 소실로 합류, 사슬이 그 동에 이미 배정한 aphusCode 는 DB 에서 복원해 이중 배정 차단. 단일 "사슬 시작 min" 컷오프는 "실패 O → 완료 C 가 저장 → 실패 R 이 옛 체크포인트 상속 후 그 동을 새로 처리하다 소실 → 재개" 조합에서 C 의 저장을 "사슬이 매칭함"으로 오판해 못 줍는다(적대검증 MEDIUM 재반박 결과 동별로 정밀화). 8/22 "1차 사망 × 2차 재개" 조합에서 은마가 아무 관할에도 안 들어가 미갱신된 사각(세션 379) 해소. 리 확장 패스 자체의 드리프트 구제는 없음(리=1페이지 소규모, 완료 로그 "읍/면 리 확장 완료 N개" 월별 비교로 관찰) |
| 대기질 수집 | 매일 2시 | 에어코리아 API |
| 응급의료 수집 | 매월 첫째 월 3시 | NEMC 응급의료기관 API |
| 어린이집 수집 | 매월 첫째 목 1시 | CPMS cpmsapi030 API (01:00 고정 — 아래 §CPMS 키 공유 참조, 04:30 이후 금지) |
| 범죄통계 수집 | 분기별 첫째 일 4시 | 경찰청 odcloud API (CSV 폴백) |
| 단지 상세 backfill | APT/OPST 4시간 interval 매일 / JGC·ABYG·OBYG 주1회 7시 | 매물유형별 독립 job, detail_crawled_at NULL 단지 보강 (APT/OPST 배치 1000 가속 — PR #19 답습, 소수 유형 배치 1000 cron 유지. 2026-05-27 PR 6a 답습 6h→4h 33% 가속) |
| K-apt 단지 매칭 | 매월 21일 06:10 | 국토부 K-apt(AptListService4 getTotalAptList4, 운영계정 일 10만) 전국 목록 ~2.2만 단지 → 우리 APT·JGC 단지와 3중 게이트 매칭(법정동 cortar_no=bjdCode + 이름 유사도 ≥0.6/세대수 대조불가 시 0.75 + basis 수신 후 세대수 ±15%, 최고점 동률 탈락) → kapt_complex_map upsert + 복도유형·세대수(AptBasisInfoServiceV5). 매칭분마다 basis 1콜(0.3s throttle)이라 1h 초과 상시 → _STALE_HOURS_BY_TYPE 4h 등록. 네이버 0, 토글 KAPT_ENABLED(기본 false — 세션 388 첫 배포는 꺼서, 수동 트리거 라이브 검증 후 ON). 쿼터 버킷은 kapt 전용(전역 9,000 과 격리, 세션 388) |
| K-apt 관리비 수집 | 매일 06:20 | kapt_complex_map 중 이번 수집월 행 없는 단지 오래된 순 500개 × 22항목(공용 V3 17 + 개별 V2 5, 개발계정 op당 일 1,000 추정 → 500/op ✓) 합산 → kapt_management_costs 월별 upsert(공개 지연 3개월 실측, target_month 기준으로 폴백월 무한 재조회 차단). 500×22×0.3s≈55min+지연이라 1h 경계 → _STALE_HOURS_BY_TYPE 3h. 단지 상세 GET /api/complexes/{no}/kapt(12h 캐시)·기본정보 "월 관리비(세대당)·복도유형" 표시 원천. 하루 11,000콜 — 전역 쿼터가 아닌 kapt 버킷(6만 상한) 소모. 네이버 0, 토글 KAPT_ENABLED 공유 |
| data.go.kr API 버전 감시 | 일요일 06:40 | 코드가 쓰는 data.go.kr 엔드포인트 8종(실거래가·응급의료·대기질 2종·K-apt 4종)을 serviceKey 만 넣고 최소 호출로 찔러 폐기 감지 → dead 있으면 텔레그램 1건으로 묶어 알림. 판정 = `NO_OPENAPI_SERVICE_ERROR`/returnReasonCode "12" 만 dead, 코드 11(파라미터 부족)·정상응답은 alive, 코드 30(키 미등록)·05(타임아웃)·네트워크 예외는 **degraded(로그만, 알림 0)** — 간헐 오류 오탐 방지. dead 발견은 잡 실패가 아니라 "완료 + 알림"(CrawlJob completed). 네이버 0, data.go.kr 쿼터 8회라 영향 무시, 토글 API_VERSION_MONITOR_ENABLED(기본 true). ⚠ **새 data.go.kr API 도입 시 `crawler/api_version_monitor.py` PROBE_REGISTRY 에 1줄 추가 의무** — 빠지면 그 API 만 감시 사각지대 (2026-08-19 사고: data.go.kr 이 인증 예외 처리 종료로 구버전 엔드포인트(AptListService3·AptBasisInfoServiceV4 등)를 공지 체감 없이 폐기 → 이 프로젝트·mibunyang 동시 수집기 장애) |
| 크롤링 모니터 | 10분 interval | crawl_jobs 정합성 점검 후 텔레그램 알림 (운영 토글 MONITOR_ENABLED, 2026-05-25 세션 229 30→10→20 답습 후 현 .env MONITOR_INTERVAL_MIN=10 운영. 기본 _STALE_HOURS=1h — 정상적으로 오래 도는 잡은 _STALE_HOURS_BY_TYPE 예외 의무: public_trade_data 3h(세션 266)·official_price 16h(세션 369 오탐 sweep 실사고 — 새 장시간 잡 추가 시 이 표 동반 등록)·kapt_match 4h·kapt_costs 3h(세션 388 — 배포 전 사전 등록). _FAILED_WINDOW_HOURS=24. 전부 monitor.py 상단 상수, 인터벌 격하 무관) |

⚠ **위 표의 "잡 이름"은 스케줄러 등록 id(`scheduler.py`의 `id="..."`)이고, DB
`crawl_jobs.job_type` 컬럼에 실제로 저장되는 값은 이와 다를 수 있다** — 이 프로젝트
전반의 기존 관례이지 버그가 아니다. 예: 스케줄러 id `collect_officetel_presale` →
job_type `officetel_presale`(접두어 없음), id `collect_rental_presale` → job_type
`rental_presale`, id `crawl_details` → job_type `article_detail`(이름 자체가 다름).
**DB로 "이 잡이 실행됐나" 조회할 때는 반드시 각 서비스 모듈(`crawler/service_*.py`)의
`CrawlJob(job_type="...")` 호출부를 먼저 grep 해 정확한 job_type 문자열을 확인**한다 —
스케줄러 id를 그대로 조회하면 0건이 나와 "실행 안 됐다"고 오판하기 쉽다(세션 372
실사고: 이 함정에 두 번 걸림). 컬럼명도 `finished_at`이 아니라 `completed_at`이니
`db/models.py`의 `CrawlJob` 정의를 함께 확인할 것.

### 짧은 주기 크론과 재시작 겹침 — 반복 재시작은 몰아서 하지 말 것 (세션 372 실측)

`official_price`(매월 15일, 몇 시간짜리)처럼 **긴** 잡은 위 표에 "실행 중 재시작 회피"로 이미
박혀 있다. 이 절은 그 반대 — **짧은 주기(10분·30분 interval) 크론이라도, 재시작이 짧은
시간에 몰리면 도중 작업이 끊기거나 그 순간 DB 부하가 겹쳐 흔들릴 수 있다**는 일반 원칙.

- 서버 재시작 시 `main.py`의 부팅 스윕(SQL, `tests/test_stale_running_sweep.py` 회귀 가드)이
  재시작 직전에 실행 중이던 잡을 `cancelled`(`error_message="stale running — swept on
  startup"`)로 정리한다 — 이건 의도된 안전장치라 그 자체는 정상이다. 문제는 **재시작이
  짧은 간격으로 여러 번 몰리면** 이 정리가 반복되고, 마침 재시작 순간이 크론 실행 시각과
  겹치면 그 주기의 작업이 스킵되거나 중간에 끊긴 것처럼 보인다.
- 재시작 순간 DB 커넥션이 새로 맺어지는 타이밍에 다른 크론(예: `complex_articles`)이 마침
  대량 upsert 중이면 `statement_timeout`(8초, 위 §DB 커넥션 풀)에 걸려 실패할 수도 있다 —
  DB 자체 장애가 아니라 재시작 타이밍이 만드는 일시적 혼잡.
- **처방**: 여러 PR을 연속 배포할 때 매 PR마다 재시작하지 말고, 가능하면 **묶어서 한 번에
  재시작**한다(release.md §2 cross-check 는 PR 단위가 아니라 "이번에 반영할 변경 묶음"
  단위로 해도 된다). 부득이 짧은 간격으로 여러 번 재시작해야 하면, 크롤링 모니터 텔레그램에
  "마비→복구" 알림이 여러 건 몰려도 **재시작 시각과 겹치는지부터 대조** — 진짜 장애인지
  재시작 부작용인지 구분한다(구분법: 아래 사건의 `backend_<mtime>.log` 회전 로그 대조 실측
  참조).

> **사건**: 2026-08-14 — 세션 369가 PR #381~#385를 순차 배포하며 하루 8회 재시작
> (00:11·00:19·01:59·03:22·05:57·07:53·11:32·14:56). 01:59:48 재시작이 02:00:00 대기질
> 크론을 정확히 덮침 + 05:52 무렵 재시작 스윕이 `article_detail`을 cancelled 처리하고
> 직후 `complex_articles`가 statement_timeout으로 failed → 텔레그램에 "article_detail
> 마비→복구"·"매물 상세 보강 실패(DB connection timeout)" 알림 4건 발생. 세션 372에서
> 회전 로그(`backend_2026081*.log`)·`crawl_jobs`·`monitor_alerts`(전부 `status=resolved`)
> 3중 대조로 "진짜 장애가 아니라 재시작 몰림의 부작용이었고 이후 재발 없음"을 확정.
> `official_price` 16h 예외(세션 369, #382)가 "긴 잡" 케이스를 이미 막았듯, 이 사건은
> "짧은 잡 다건"이 재시작과 겹치는 반대 케이스라 본 절로 별도 문서화.

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

- **외부 uptime 감시** = `.github/workflows/healthcheck.yml` (매일 05:30 KST cron 1회 + workflow_dispatch. ⚠ 2026-08-02 10분→일1회 격하, 사장님 결정 — 10분 간격이 월 4,300분+로 Actions 무료한도 2,000분을 태워 7/13경 소진 → 모든 CI·감시 월말까지 마비, 7/18 터널 사망을 아무도 못 본 사고. 05:30 = 새벽 재부팅 직후. 주기 되올리려면 한도 계산 먼저). GitHub Actions(집서버 무관)가 `curl https://api.2u.pe.kr/health/db` → 실패 시 텔레그램(secrets `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, 미설정 시 안전 스킵). **집서버가 통째로 죽으면 내부 watchdog 도 함께 죽어 무통지**이던 사각지대를 외부에서 메움. ⚠ GitHub Actions `if:` 에 `secrets` context 사용 불가(공식) → secrets 는 `env:` 로 주입해 shell 판정(PR #276 hotfix). CI 문법은 `gh workflow run` 라이브 실행만 ground truth. ⚠ **Cloudflare Bot Fight 모드를 켜면 이 외부감시가 오탐으로 전멸** — GH runner(미국 데이터센터 IP + curl)가 "관리 챌린지"를 못 풀어 403 을 받고, origin 로그엔 요청 자체가 안 남는다(2026-08-09 실사고: 8/8~8/9 이틀 연속 오탐, 서버는 정상. 공인 감시봇은 면제라 통과). 무료 플랜 BFM 은 경로 예외를 못 걸어 `/health/db` 만 빼는 것도 불가 → **켜기 전 healthcheck 영향 검토 의무**. 403 을 받으면 집서버가 아니라 CF 보안설정부터 의심 (워크플로가 HTTP 코드를 캡처해 403 을 별도 문구로 구분 알림).
- **심층 헬스체크** = `backend/routers/health.py` `/health/db` (DB `SELECT 1`, 성공 200 / DB장애 503 클린 JSON, **GET/HEAD 허용** — 외부 감시 HEAD 프로브 405 방지, 세션 353). 외부 모니터 전용. ⚠ 기존 `/health`(정적 200, main.py:208)는 **일부러 얕게 유지** — watchdog 이 폴링하는데 DB 장애 시 503 주면 "backend 죽음" 오판 → 무한 재시작 루프(재시작으로 DB 안 살아남). watchdog=프로세스 생존만, /health/db=DB 포함.
- **backend.log 회전 보존** = `scripts/log_rotation.py` `rotate_backend_log()`. `start_backend()` 가 매 재시작 backend.log 를 `"w"` 로 truncate 해 어제 크래시 로그 소실되던 것 → 재시작 직전 `backend_<mtime>.log` 로 회전 보존 + 7일 초과분 정리. 안정 경로 backend.log 유지(release.md §2 `head -1 scripts/backend.log` 불변). ⚠ orchestrator 상주 프로세스라 **재부팅(또는 release.md §3 `Restart-Service naver-orchestrator`)이 있어야 회전 코드 적용**(startup_orchestrator.py 수정 = orchestrator zombie 대상). 프로세스명은 현행(nssm 서비스, 세션 363+) 항상 pythonw — 옛 "경로 따라 python/pythonw 갈림"(세션 353)은 레거시 수동 기동 시에만.
- **결제·크롤 알림 삼킴 로그화** = billing_charge.py·payment.py·service_discover.py 의 `except: pass`(알림 발송 실패) → `logger.warning`(best-effort 유지). 결제 로직은 안 깨지되 알림 실패가 관찰 가능.

> 상세 = 글로벌 메모리 `[[session340-summary]]`·`[[project-observability-backlog-s340]]`. 백로그 2건(connect_timeout 공용엔진·open(w) 파일락)은 PR #278(09b61e4, 2026-07-04)에서 완료 — `db/database.py` connect_args connect_timeout=5, `startup_orchestrator.py` open() try/except 가드로 코드 직독 재확인 완료(세션 352).

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

### CPMS cpmsapi030 키 공유 (어린이집 API — 일일 1,000건, 동일 키 공유, 세션 366)

naver 의 `CHILDCARE_DETAIL_API_KEY` == mibunyang 의 `CHILDCARE_BASIC_API_KEY` (같은 키).
**mibunyang childcare-detail 이 매일 04:30 에 쿼터 1,000건을 설계상 전량 소진**한다
(전국 시설 23,122곳 70필드 순환 갱신, ~23일 주기 — 의도된 설계, 멈추면 손해).

- naver `collect_childcare` 는 **첫째 목 01:00 고정** (자정 리셋 직후 ~40콜 선사용). 06:00
  시절 2026-07·08 두 달 연속 INFO-300 즉사가 신설 계기. **04:30 이후로 이동 금지.**
- 별도 키 발급은 불가 실측(2026-08-14): 포털은 1계정 1API 1키(재신청 버튼 숨김) + 일 한도
  1,000 하드캡(증량 불가) + 새 키는 신규 회원가입 필요. 상세 = 글로벌 메모리 `[[session366-summary]]`.
- 이 키의 운영계정 만료 = **2027-04-07** (만료 30일 전부터 포털에서 기간연장 신청 — 놓치면
  naver·mibunyang 어린이집 수집 동시 정지).

### 네이버 크롤링 시간 분리 (같은 집 서버 IP)

| 시간 | 프로젝트 | 작업 | 실행일 |
|------|----------|------|--------|
| 02:00 | naver-estate-web | collect_air_quality | 매일 |
| 03:00 (첫째 월) | naver-estate-web | collect_emergency | 매월 첫째 월 |
| 03:00 | naver-estate-web | discover_regions | 일요일 |
| 03:30 | naver-estate-web | backfill_price (data.go.kr, 네이버 0) | 매일 (PUBLIC_DATA_ENABLED) |
| 04:00 | naver-estate-web | collect_prices | 수요일 |
| 06:30 (15일) | naver-estate-web | official_price (V-WORLD, 네이버 0) | 매월 15일 (OFFICIAL_PRICE_ENABLED) |
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

## DB 백업·DR — 마이그레이션 전 수동 스냅샷 (세션 367 신설)

**실태 (2026-08-14 실측)**: **Pro 플랜 확정** — 사장님 대시보드 스크린샷 실측(developer-duno's Org **PRO** 뱃지, 프로젝트 naver-estate, main PRODUCTION). Supabase 공식 정책상 Pro = **일일 자동 백업·7일 보존**(PITR 은 별도 유료 애드온 — 가입 여부는 대시보드 Database > Backups 탭 소관). 같은 프로젝트를 쓰는 mibunyang 데이터도 동일 백업에 함께 담긴다. 이 절 신설 전까지 레포에 백업 스크립트·문서 0건. (참고: Free 였다면 자동 백업 0 — 플랜 다운그레이드 시 이 절의 수동 덤프가 유일 안전망으로 승격됨을 유의.)

**도구 (이 PC 실측)**: supabase CLI 2.84.2(scoop shims) + pg_dump 18.4 설치됨. ⚠ 이 PC 의 supabase CLI 활성 로그인은 **플라워 그룹 계정**이라 naver-estate 프로젝트가 `projects list` 에 안 뜬다(gh 계정 전역 스위치와 같은 함정). 단 `supabase db dump --db-url` 방식은 **로그인·link 불필요** — 백업 실행엔 지장 0.

**절차 (마이그레이션 SQL Editor 실행 전 의무)**:

- 컬럼/테이블 **추가만**(CREATE·ADD COLUMN): 스키마 덤프 1회.
- **DROP·ALTER·대량 UPDATE 동반**: 스키마 + 데이터 덤프까지.
- 공유 DB 주의: mibunyang 테이블도 같은 DB 라 덤프에 함께 담기는 게 정상(복구 시 양쪽 영향 검토 — 위 §공용 테이블 규칙).

```bash
# backend cwd. DATABASE_URL 은 dotenv 로드로만 사용 — 값 echo·화면 출력 절대 금지
# (~/.claude/rules/secret-output-commands.md 답습. .env 직접 read 는 deny 라 python 경유가 표준)
cd backend && python -c "
from dotenv import load_dotenv; load_dotenv('.env')
import os, subprocess, datetime
os.makedirs('D:/db-backups/naver-estate', exist_ok=True)
ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
subprocess.run(['pg_dump','--schema-only','--no-owner','--no-privileges','--schema','public',
                '-f', f'D:/db-backups/naver-estate/schema_{ts}.sql', os.environ['DATABASE_URL']], check=True)
# DROP/ALTER/대량 UPDATE 동반 마이그레이션이면 '--schema-only' 대신 '--data-only' 로 한 번 더 (data_<ts>.sql)
"
```

- **표준 도구 = 로컬 `pg_dump`** (18.4, scoop — 서버 PG 17.6 하위호환 확인). ⚠ `supabase db dump` 는
  pg_dump 를 **Docker 컨테이너로** 돌려서 Docker Desktop 미실행 시 실패한다 (2026-08-14 V047 사전덤프 실측
  — "failed to inspect docker image"). 이 PC 평상시엔 Docker 꺼져 있으므로 pg_dump 직행이 표준.
- 덤프 저장 = 레포 밖 `D:\db-backups\naver-estate\` (git 추적 위험 원천 차단, D=내장 NVMe).
- `--schema public` 이라 Supabase 관리 스키마(auth·storage 등) 자연 제외 — 앱 스키마만 담긴다.
- 첫 실전 = 2026-08-14 V047 사전덤프 `schema_20260814_072529.sql` (141KB, 정상).
- **Pro 확정(현행) 운용**: 일일 자동 백업이 1차 안전망 — 단 백업 시점 이후 그날 유입분은 미보호이므로, **DROP·ALTER·대량 UPDATE 동반 마이그레이션은 실행 직전 수동 덤프 필수** 유지(컬럼 추가만인 건은 권장). 복구가 필요하면 대시보드 Database > Backups 에서 복원 시점 선택 — 복원은 프로젝트 전체 롤백이라 mibunyang 데이터도 함께 되돌아감(양쪽 세션 합의 후 실행).
