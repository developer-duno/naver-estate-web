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
>
> **재발·검증 (2026-09-09 22:07, 세션 395)**: 같은 종류의 계획 재부팅(이벤트 1074: 22:05 svchost → 22:07 TrustedInstaller
> "업그레이드(계획됨)", OS 부팅 22:07:33)이 다시 났고, nssm 서비스가 **로그인 없이 22:10:35 자동 기동·22:10:51 health 성공(3분)**
> — 끊긴 잡·부팅 스윕 cancelled·경보 전부 0. 이 PC 는 Windows Update Active Hours 미설정(레지스트리 `WindowsUpdate\UX\Settings`
> 부재 = 자동 감지 기본값)이라 **재부팅 시각은 예측 불가**가 정상 — 크론(02:00~04:50)과 겹치면 부팅 스윕이 그 회차를 cancelled
> 처리하고 다음 회차가 이어받는 게 설계 동작이다. 사유 판별은 `.ps1` 파일 경유 `Get-WinEvent`(Id 1074/41/6008) —
> 인라인 `-Command` 는 bash 가 `$_` 를 먹는다(release.md 함정).

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

### Supabase DB 전면 다운 — 런북·재발 이력은 `backend/.claude/details.md` (세션 412 이동)

`/health/db` 가 `degraded` 이거나 statement timeout 이 연쇄로 터지면 **[details.md §Supabase DB 전면 다운 런북과 재발 이력](../../backend/.claude/details.md#supabase-db-전면-다운-런북과-재발-이력)** 의
8단계(층위 순서로 국소화 → Postgres Logs 원문 확인)를 따른다. 여기 남기는 결론 두 줄:

- **처방 = 자가회복 대기 우선**(실사고 2건 29분·34분 자가회복). ⛔ 성급한 backend 재시작 금지 — 재시작은 DB 를 못 살리고, 부팅 스윕(시작 5분 경과 running 잡)이 외부 프로세스의 잡까지 cancelled 로 오염시킨다.
- 컴퓨트 Micro→Small·V048 freshness 인덱스·UptimeRobot 5분 감시는 세션 381 에 적용 완료. "OOM 크래시"는 확정이 아니라 **가설** — 재발 시 대시보드 → Observability → Logs → Postgres Logs 에서 `out of memory`/`PANIC`/`FATAL` 원문부터 확인해 승격한다.

## 텔레그램 알림 문구 — 전부 쉬운 우리말 (전 창구 공통, 예외 0)

> 사장님 지시(2026-09-15): *"텔레그램 알림은 일반인이 봐도 무엇이 어떻게 잘못되었는지
> 손쉽게 알 수 있어야 해. 그 부분을 절대로 간과하면 안 돼. 어려운 말은 금지야."*

⚠ **이 규칙은 특정 잡이 아니라 텔레그램을 쓰는 모든 코드에 적용된다.** 세션 408 까지는
`크롤링 모니터` 표 행 안에만 적혀 있어서, 새 알림을 만드는 사람이 못 보고 지나쳤다
(그 결과 8개 창구 중 4곳이 영문·개발자 용어인 채로 남았다) — 그래서 독립 절로 올린다.

### 금지 (알림 본문에 다시 넣지 말 것)

영문 job_type·DB 컬럼명(`total_floor_count`)·개발자 에러 원문(`psycopg2…`)·파일:줄
위치·`batch`/`running`/`red`·`엔드포인트`·`웹훅`·`락`·`임계`·env 변수명·`[BILLING]`·
`[PAYMENT]` 같은 영문 접두어. **접두어는 3채널 공통 `[서버 알림]`** 하나뿐이다.

### 사전 (한 곳에서 관리)

| 사전 | 위치 | 키 체계 |
|---|---|---|
| 작업 이름 30종 | `crawler/plain_words.py` `JOB_WORDS` | **DB `job_type`** |
| 매물 필드 15종 | `crawler/field_drift_monitor.py` `_FIELD_WORDS` | `articles` 컬럼명 |
| 잡 라벨 31종 | `crawler/job_error_listener.py` `_JOB_LABEL_FALLBACK` | **스케줄러 잡 id** |
| 에러 번역·행동 안내·조사 | `crawler/plain_words.py` `explain_error`·`action_words*`·`eul_reul` — ⚠ 못 알아본 에러는 **원문 없이 고정 문장**만 나간다(세션 410, 원문은 로그·`crawl_jobs.error_message` 에), 결제 사유는 PortOne 상태별 4규칙이 **목록 맨 앞** | — |

⚠ **잡 이름 체계가 둘이고 서로 다르다**(`crawl_details`(id) vs `article_detail`(job_type)).
한쪽 사전만 채우면 "고쳤는데 실제로는 그대로 나가는" 상태가 된다 — 세션 408 에 실제로
리스너 경로만 고치고 **주 발화 경로(monitor → `alert_format`)를 놓쳤다**.

### 의무

- 새 `job_type` → `JOB_WORDS` + FE `crawl-job-labels.ts` 양쪽 등록(`test_plain_words.py` 가 대조).
- 결제·정산 잡은 **"돈이 안 걷힌다"** 안내로 갈린다(`action_words_for_job*`) — 수집용
  "새 자료만 안 들어와요" 를 쓰면 심각도를 정반대로 알린다.
- `crawl_jobs.error_message` 도 관리자 화면에 보이므로 같은 기준을 적용한다. **단 알림과 화면은 함수가 다르다**(세션 411 PR #534):
  알림 = `explain_error`(아는 에러면 번역, 못 알아보면 고정 문장 + INFO 수집 로그) / 화면 = `explain_stored_error`
  (⓪붙은 스윕 마커 분리 → ②번역 → ③**이미 우리말이면 원문 유지** → ④고정 문장, **로그 없음** — 화면 폴링 60초·3~15초가
  P1-2 수집 로그를 오염시키므로). 그래서 `세션388 수동 중단 — kaptCode …` 같은 사람이 쓴 문장은 알림에선 "처음 보는 문제",
  화면에선 원문 그대로 보인다 — **화면이 더 자세한 것은 의도**(검사관 C A-2). 라우터는 `error_plain` 을 raw 옆에 실어 주고
  FE 는 `error_plain || error_message` + `title=raw`. 관리자 카드의 **버튼 조작 오류**(`detail`)도 창구다 —
  `routers/admin/collect.py` 가 `수집 실패: {e}` 로 raw 예외를 실어 보내던 것을 `explain_error` 로 감쌌다(세션 411 후속).
- 접두어 회귀는 `test_plain_words.py` 가 **`.py` 8모듈 + 워크플로 YAML** 을 전수 추출해 막는다.

### 적용 현황 — **모듈 8개 / 호출부 11곳 전부 완료** (세션 409)

⚠ **"창구 수"를 셀 때 모듈 수와 호출부 수를 구분하라.** `send_telegram` 을 부르는
**모듈은 8개**지만, 한 모듈이 여러 곳에서 알림을 쏜다(`service_official_price` 는 3곳).
세션 409 가 모듈만 세고 "8창구 전부"라 보고했다가, `service_official_price:451`
표준코드 이관 알림 **한 곳이 안 고쳐진 채** 남아 적대검증에 적발됐다.
→ 판정은 `scripts/verify_alert_wording.py` 로. 그 스크립트가 호출부를 **소스에서 추출**해
   전수 검사한다(⑧은 3곳으로 나뉘어 출력된다).

`monitor`(#524) · `field_drift_monitor`·`job_error_listener`·`healthcheck.yml`·
`service_official_price`(#526) · `api_version_monitor`·`scheduler_lock`·
`billing_charge`·`routers/payment`(세션 409).

잡 라벨(`_JOB_LABEL_FALLBACK`) 9개에 남아 있던 영문(`단지 상세 backfill APT`,
`정기 VACUUM 유지보수`, `K-apt 관리비 수집`, `data.go.kr API 버전 감시` 등)도 함께
우리말로 바꿨다 — 라벨은 알림 본문에 그대로 찍히므로 사전만 고쳐선 부족했다.

**재유입 차단**: `test_plain_words.py` 가 `send_telegram` 호출 모듈을 **소스에서 추출**해
전수 검사한다(`test_no_developer_jargon_in_any_alert_module`·접두어 가드 2종 + 워크플로
YAML). 새 창구가 생겨도 자동으로 검사 대상이 된다 — 손 목록이 아니다.
⚠ 이 가드는 **알림 문구만** 본다. `logger.*`(여러 줄 호출의 이어지는 줄 포함)·환경변수·
API 응답·데이터 사전은 제외한다 — 거짓 경보를 내는 가드는 결국 꺼지기 때문이다.
단 `_JOB_LABEL_FALLBACK` 은 사전이어도 **값이 알림 본문에 찍히므로** 검사 대상이다.

**라이브 확인 (재시작 후 한 줄)**:
```bash
cd backend && PYTHONPATH=. PYTHONUTF8=1 python scripts/verify_alert_wording.py
# 종료 0 = 전부 우리말 / 1 = 어려운 말이 남은 창구를 지목해 출력
# 세션 410 확장: ⓪ 못 알아본 에러 렌더(새 알림 + 해소 알림 — 내부 마침표 검사) ·
#   ⑨ 자동결제 중단 사유 6종(_mark_retry 실호출) · ⑩ 부분환불(이메일 마스킹 검사) · ⑪ 관리자 화면 `explain_stored_error`
#   (스윕 마커·psycopg2·붙는 형태 3입력, 세션 411 후속) 포함 = "11창구 + 미지 에러 렌더".
#   텔레그램·이메일·log_action 은 전부 patch — 실발송 0. 워크트리(.env 없음)에선 DATABASE_URL="sqlite:///:memory:" 를 앞에 붙인다
```

⚠ **잡 이름은 두 곳에 있고 라이브는 스케줄러 쪽을 쓴다** (세션 409 HIGH-1):
`job_error_listener._job_label()` 은 `scheduler.get_job(id).name` 을 **우선**하고
`_JOB_LABEL_FALLBACK` 은 그게 실패할 때만 본다. 라이브는 scheduler 가 주입되므로
**폴백 표만 고치면 알림에 안 반영된다** — `crawler/scheduler.py` 의 `add_job(name=...)`
을 함께 고쳐야 한다. 두 곳의 값은 `plain_words.JOB_WORDS` 와 같은 표현으로 맞춘다.

## 스케줄러 (APScheduler)

> **재시작 판정용 전수 시각표는 `release.md` §3-0 의 생성 표**다(`backend/scripts/gen_restart_schedule_table.py` 가 코드에서 생성 — 등록 잡 31행·⏰ 장시간 잡).
> 아래 표는 **설명 + 라이브 실값** 기준이라 interval 이 그 표와 다를 수 있다(크롤링 모니터 = 라이브 `.env` 10분, 코드 기본값·생성 표 30분).
> 잡을 추가·삭제하거나 시각을 바꾸면 이 표의 행을 고치고 `--write` 로 생성 표도 갱신한다(가드 = `tests/test_restart_schedule_table.py`).

| 작업 | 주기 | 설명 |
|------|------|------|
| 전국 단지 발견 | 일요일 3시 | 네이버 키워드 검색으로 신규 단지 수집 |
| 매물 수집 배치 | **매일 01:00 / 13:00** cron (±45분 jitter) | 활성 lane + 발굴 lane 두 몫으로 단지 선정해 매물 목록 크롤링 (배치 기본 **150**, 세션 402 PR #506). ⚠ 옛 "12시간 interval" 은 APScheduler `IntervalTrigger` 가 `start_date = now + interval` 이라 **재시작마다 다음 실행이 12h 밀렸다** — 최근 14일 중 9일이 하루 1회만 돌았다(crawl_jobs 실측). cron 은 벽시계 기준이라 재시작 무관. **선정 키**(`db/complex_queries.py get_complexes_for_article_crawl`, 세션 402 PR #507): 활성 lane 80% = 활성 매물 보유 단지를 `complexes.articles_crawled_at` 오래된 순(NULL 우선), 발굴 lane 20% = 활성 0 + `articles_crawled_at IS NULL` 단지. 한쪽이 모자라면 남는 몫을 다른 lane 이 흡수. 옛 1순위 `has_article.asc()`(매물 0건 우선)는 2026-04-13 엔 정당했으나 그 풀이 53,581 로 불어나 활성 10,567 단지의 76%가 30일+ 미방문이 됐다. **호출 총량 불변은 단지 수 기준**이지 콜 수 기준이 아니다(매물 보유 단지는 페이지네이션) — `record_call("crawl_articles_batch")` 로 1주 관찰. ⚠ 라이브 `.env` 에 `CRAWL_BATCH_SIZE` 가 있으면 코드 기본값 150 을 덮는다 |
| 매물 상세 보강 | 30분 interval (±15분 jitter) | 매물 상세 크롤링(배치 500). 매물오류 상한·부분 인덱스·순회마다 commit (상세: [§잡 상세 — 매물 상세 보강](../../backend/.claude/details.md#잡-상세--매물-상세-보강)) |
| 상세 백필 (새벽·낮) | 매일 00:20 / 12:20 | 스케줄러 id `backfill_detail_dawn`(배치 1500·약 38분)·`backfill_detail_noon`(배치 4000·실측 113~134분), job_type 은 둘 다 `article_detail_backfill`. 네이버가 상세 응답 키를 바꿔 빈 채 굴러간 필드(난방·사용승인일·지번주소·총층수)를 상세 API 로 사후 보강한다. 소요 = 배치 × 1.5초(throttle)라 다음 네이버 잡(01:00 매물 수집·14:45 인기 단지)과 안 겹치게 회차별 배치를 달리했다 — **낮 회차가 145분을 넘기면 14:45 와 겹친다**(2026-09-18 실측 133.9분 — 원인은 네이버 차단이 아니라 30분 주기 상세 보강과의 겹침, 세션 414). 스윕 임계 4h(⏰ 재시작 금지 구간). 토글 `BACKFILL_DETAIL_ENABLED`(코드 기본 false — 2026-09-14 라이브 `.env` 에서 ON), 배치 `BACKFILL_DETAIL_BATCH_SIZE`(덮으면 두 회차 모두 그 값) |
| 시세 이력 수집 | 수요일 4시 | 단지별 시세(매매/전세) 주간 수집 |
| 시세 이력 소급 수집 | 매일 03:30 | complex_price_history 6행 미만 단지 세대수 상위순 국토교통부 backfill (PUBLIC_DATA_ENABLED 토글, 네이버 0 — 세션 288 표 누락 정정) |
| 단지 가치지표 수집 | 매일 04:30 | complex_price_history 집계 → complexes 가치 3필드 (네이버 API 0, 기본 배치 1000) |
| 상세 필드 채움률 감시 | 매일 04:40 | 스케줄러 id `field_drift_monitor`(잡 이름 "정보 안 채워지면 알림"). 최근 48시간에 상세를 받은 활성 매물의 **필드별 채움률**을 DB 집계만으로 점검(네이버 0)해 임계 미달이면 텔레그램. 2026-09-13 실사고(네이버가 상세 응답 키를 바꿔 `heating_type` 등 4필드가 6개월 넘게 0% — HTTP 200 이라 에러·경보 0)의 조기 경보. 04:30 가치지표·04:50 자동결제 사이 빈 슬롯. 토글 `FIELD_DRIFT_MONITOR_ENABLED`(코드 기본 false — 라이브 ON) |
| 빌링키 자동결제 | 매일 04:50 | billing_keys 의 next_charge_at 도래분(status='active' AND is_default) PortOne 빌링키 결제 → paid_until 연장 + next_charge_at 갱신. 3일 연속 실패 시 status='failed' 중단+알림. PortOne 결제라 네이버 0, 토글 BILLING_AUTO_CHARGE_ENABLED (정기결제 PR3, 세션 330). ⚠ **`PAYMENT_ENABLED`(코드 기본값 false, 세션 400 무료 전환) 가 꺼짐이면 이 잡이 아예 등록되지 않는다** — 관리자 스케줄러 화면에는 **행이 남고 "비활성"으로 표시**된다(그 화면은 등록된 잡이 아니라 `SCHEDULER_JOB_META` 사전을 순회하므로 행 자체는 안 사라진다 — 활성 판정은 META 의 `env_extra` 로 두 토글의 AND 를 본다. 이 장치가 없던 초안은 꺼진 기간에도 "활성 · 매일 04:50"으로 거짓 표시했다 — 세션 400 적대검증 HIGH). 같은 토글로 결제 API 7종(`/api/payment/*`·`/api/payment/billing/*`)도 403 이 된다. 즉 `BILLING_AUTO_CHARGE_ENABLED=true` 만 보고 "자동결제가 돈다"고 판정하면 오판 — 두 토글의 **AND** 다(`crawler/scheduler.py` 등록 조건). 켜려면 `.env` 에 `PAYMENT_ENABLED=true` 추가 + 재시작. 게이트 = `config/payment_flags.py` |
| 정기 VACUUM 유지보수 | 매일 03:50 | articles/trades VACUUM (ANALYZE) — visibility map 재악화 차단. Supabase autovacuum 미동작 대비 안전망. **+ rate_limit_counters 만료 행 정리**(`quota_db.purge_expired_counters`, `expires_at < now()` 만 삭제·NULL 미대상. 날짜별 키가 쌓이는데 청소 주체가 없어 2026-04-15 이후 만료분 ~135행 잔존하던 것 — best-effort 라 실패해도 VACUUM 결과·잡 상태 영향 0, dialect 무관이라 VACUUM 의 PostgreSQL early-return **앞**에서 실행). **+ 상세 상한(detail_fail_count≥6) 매물 카운터를 5 로 되돌려 하루 1회 재시도 자격 부여** — 영구 방치 사각 차단, 세션 395(상한 매물이 네이버 쪽 오류가 풀려도 자동 복귀할 경로가 없어 수동 SQL 이 유일 탈출구이던 것. 되돌린 매물은 다음 배치에서 딱 1회 재시도되고 또 매물오류면 즉시 재제외 = 매물당 하루 1콜 유계. 쿼터 정리와 동일한 best-effort·early-return 앞). DB 전용(네이버 0), 토글 VACUUM_MAINTENANCE_ENABLED (세션 260) |
| 인기 단지 크롤링 | 매일 10:45/14:45/19:15 | 자주 조회되는 단지 선제적 크롤링, 개별 try/except (기본 배치 50) **부모 잡이 자식 실패를 집계**(세션 396 PR #487) — `crawl_complex_articles` 가 성공/실패 bool 을 돌려주고 부모가 "N/50개 단지 실패" 를 error_message 에 남긴다(옛 코드는 자식이 예외를 흡수해 항상 50/50 completed 로 보였다). **선정 키 = `complexes.last_viewed_at` 최근 7일**(사용자가 `start-crawl` 을 호출한 시각, V058·세션 402 PR #507), 부족분은 활성 lane(`articles_crawled_at` 오래된 순)으로 채운다. 옛 키 `last_crawled_at DESC` 는 배치·자매 일괄 스탬프에 오염돼 7일 1,050회 중 **846회(81%)** 가 직전 24h 내 배치가 이미 긁은 단지 재방문이었다. 세대수 상위 폴백은 제거(빈 DB 외 도달 불가). |
| 공공데이터 수집 | 토요일 5시 | 국토교통부 실거래가 (10일 토요일 skip) |
| 청약홈 오피스텔 수집 | 월요일 05:00 | 오피스텔/도시형 청약 공고+평형(getUrbtyOfctlLttotPblancDetail/Mdl), 독립 테이블 officetel_presale_schedule·officetel_unit_supply 저장 (V045 재설계 — apartments 무관, 옛 "로스터 매칭분만 upsert" 방식 폐기. 네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 청약홈 민간임대 수집 | 월요일 05:30 | 공공지원 민간임대 공고+평형(getPblPvtRentLttotPblancDetail/Mdl), 신규 독립 테이블 (네이버 0, PUBLIC_DATA_ENABLED 공유 — 이슈 #323) |
| 공동주택 공시가격 수집 | 매월 15일 06:30 | V-WORLD 공시가격 → 단지 매칭(세대수 게이트). 3~7시간 소요, 네이버 0 (상세: [§잡 상세 — 공동주택 공시가격 수집](../../backend/.claude/details.md#잡-상세--공동주택-공시가격-수집)) |
| 대기질 수집 | 매일 2시 | 에어코리아 API. **배치 100 은 `infra.air_attempted_at` 오래된 순(NULL 최우선) 순환**(V055·PR #459, 세션 394 — 옛 ORDER BY 부재로 매일 같은 앞쪽 100개만 재갱신되던 결함 수정. prod 실측 2026-09-05: 2,938단지 중 913개가 한 번도 수집된 적 없고 최근 30일 갱신은 977개뿐 — 매일 100×30일=3,000슬롯을 쓰고도). **전 단지 한 바퀴 ≈ 30일**(2,938 ÷ 100). ⚠ **배치 유지·전량 전환 금지** — 단지마다 `get_nearby_station` 1콜이 나가 전량이면 매일 ~3,000콜로 data.go.kr 공유 쿼터(일 10,000, mibunyang 과 공유)를 압박한다(응급의료 V054 는 전국 목록 1회 + 로컬 계산뿐이라 전량이 공짜였던 것과 다름). ⚠ **순환 키가 `air_updated_at` 이 아니라 신설 `air_attempted_at`("시도" 시각)인 이유**: `air_updated_at` 은 측정값(pm10/pm25/o3)이 하나라도 있을 때만 찍힌다(세션 280 — 전부 None 인데 찍으면 신선도 green 인데 화면은 빈값). 그 의미론은 보존해야 하는데, 그걸 순환 키로 쓰면 측정값이 안 나오는 단지가 영원히 NULL 로 남아 NULLS FIRST 앞자리를 매일 독점 → 순환이 그 자리에서 멈춘다. 그래서 측정소 미발견·측정값 전무여도 찍는 시도 마커를 분리 신설(`complexes.public_data_attempted_at`(V046) 선례와 같은 결) |
| 응급의료 수집 | 매월 첫째 월 3시 | NEMC 응급의료기관 → infra.emergency_*. 전량 갱신(전국 목록 1콜) (상세: [§잡 상세 — 응급의료 수집](../../backend/.claude/details.md#잡-상세--응급의료-수집)) |
| 어린이집 수집 | 매월 첫째 목 1시 | CPMS cpmsapi030 API (01:00 고정 — 아래 §CPMS 키 공유 참조, 04:30 이후 금지). **배치 = 전량**(`CHILDCARE_BATCH_SIZE=0`, 사장님 결정 2026-09-05 / 세션 393): 위경도 보유 2,938단지를 매월 전부 갱신한다. 전량이 가능한 근거 = 이 수집기는 **시군구당 1콜 + 런 내 캐시 재사용**이라 호출 상한 = 단지가 걸친 (region,gu) 조합 수 = **248콜**(2026-09-05 prod 실측)로, CPMS 일 1,000콜 공유 쿼터 안에서 여유. 옛 배치 100 은 한 바퀴 ≈ 30개월이라 실익이 없었다. `infra.childcare_updated_at` 오래된 순(NULL 최우선) 순환 키(V053·PR #451, 세션 392)는 **안전망으로 유지** — 부분 배치로 되돌릴 때의 폴백 + 전량 실행이 도중에 끊겨도 다음 회차가 미수집분부터 이어받게 한다(500단지마다 중간 저장). 첫 실전 = 2026-10-01 목, 이때 NULL 방치 901단지가 일괄 해소될 전망 |
| 범죄통계 수집 | 분기별 첫째 일 4시 | 경찰청 odcloud API (CSV 폴백) |
| 단지 상세 backfill | APT/OPST 4시간 interval 매일 / JGC·ABYG·OBYG 주1회 7시 | 매물유형별 독립 job, detail_crawled_at NULL 단지 보강 (APT/OPST 배치 1000 가속 — PR #19 답습, 소수 유형 배치 1000 cron 유지. 2026-05-27 PR 6a 답습 6h→4h 33% 가속) |
| K-apt 단지 매칭 | 매월 21일 06:10 | 국토부 K-apt 전국 목록 ↔ 우리 단지 4중 게이트 매칭. 네이버 0 (상세: [§잡 상세 — K-apt 단지 매칭](../../backend/.claude/details.md#잡-상세--k-apt-단지-매칭)) |
| K-apt 관리비 수집 | 매일 06:20 | kapt_complex_map 중 이번 수집월 행 없는 단지 오래된 순 500개 × 22항목(공용 V3 17 + 개별 V3 5, 관리비 두 서비스도 **운영계정(10만/일) 전환 완료** → `KAPT_COST_BATCH_SIZE` 기본 500 으로 운영 중(2026-08-31 첫 정기 실행 실측: 하루 kapt 32,035콜, 실패 0·쿼터 에러 0). 개발계정 시절엔 한도가 서비스당 5,000/일 오퍼레이션 합산이라(공개 페이지 실측 2026-08-29 — 옛 "op당 1,000" 추정은 틀림) 배치 500 이면 공용만 8,500콜로 초과해 250 으로 낮춰 돌렸었고, 그 .env 오버라이드는 제거됨) 합산 → kapt_management_costs 월별 upsert(공개 지연 3개월 실측, target_month 기준으로 폴백월 무한 재조회 차단). 실측 87~107분(2026-09, 조기 탈출 전 — 미공개 단지가 66콜씩 먹던 시기. 조기 탈출 후 기대 33~40분)이라 1h 경계를 넘는다 → _STALE_HOURS_BY_TYPE 3h. 단지 상세 GET /api/complexes/{no}/kapt(12h 캐시)·기본정보 "월 관리비(세대당)·복도유형" 표시 원천. 배치 500 기준 하루 11,000콜 — 전역 쿼터가 아닌 kapt 버킷(6만 상한) 소모. **호출 실패 단지는 저장 안 하고(반쪽 총액 방지) 다음 회차 재시도, 한도 초과(22)는 배치 조기 중단 + 잡 failed.** **미공개 단지는 첫 op 에서 끊어 66콜→3콜**(근거 = 저장 7,757행 전수 실측, 세션 414). 네이버 0, 토글 KAPT_ENABLED 공유 |
| data.go.kr API 버전 감시 | 일요일 06:40 | 코드가 쓰는 엔드포인트 12종 생사 확인 → dead 시 텔레그램 (상세: [§잡 상세 — data.go.kr API 버전 감시](../../backend/.claude/details.md#잡-상세--datagokr-api-버전-감시)) |
| 크롤링 모니터 | 10분 interval(라이브 `.env` `MONITOR_INTERVAL_MIN` — 코드 기본·release.md 생성 표는 30분) | crawl_jobs 정합성 점검 → 텔레그램. **알림은 전부 쉬운 우리말**(§텔레그램 알림 문구). **stale running 잡을 `_STALE_HOURS_BY_TYPE` 임계로 자동 cancelled(`swept by monitor`)** — 부팅 스윕(5분)이 못 잡은 "재시작 직전 시작 잡"도 1h 뒤 여기서 정리된다(세션 410 정정, release.md §3-0) (상세: [§잡 상세 — 크롤링 모니터](../../backend/.claude/details.md#잡-상세--크롤링-모니터)) |

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

### 재시작 겹침·잡 에러 리스너·monitor freshness — 원문은 `backend/.claude/details.md` (세션 412 이동)

세 절(짧은 주기 크론과 재시작 겹침 · 스케줄러 잡 에러 최후 안전망 · monitor freshness 풀스캔 timeout 방지 — 세션 340~372)의
원문은 **[details.md §스케줄러 운영 배경 3절](../../backend/.claude/details.md#스케줄러-운영-배경-3절)** 에 있다. 여기 남기는 규칙 세 줄:

- 여러 PR 을 연속 배포할 때 **매 PR 마다 재시작하지 말고 묶어서 한 번**. 텔레그램 "마비→복구" 알림이 몰리면 진짜 장애인지 재시작 부작용인지 **재시작 시각과 먼저 대조**한다(세션 372: 하루 8회 재시작이 만든 오탐 4건).
- CrawlJob 기록 **전에** 예외로 죽거나 misfire 로 스킵된 잡은 `crawler/job_error_listener.py`(EVENT_JOB_ERROR|MISSED, `(kind, job_id)` 별 600초 쿨다운, best-effort)가 잡는다 — monitor 의 사각을 메우는 최후 안전망(세션 340, PR #273).
- monitor 의 `compute_freshness` 는 별도 세션 격리 + max/count 분리 + reltuples 근사(V038·V039)로 **상시 1초 미만**을 유지한다(9.2초→0.6초). 신선도·집계 쿼리에 새 대형 테이블을 붙이면 인덱스 또는 근사가 의무 — 8초 statement_timeout 이 monitor 자신을 죽인다(세션 342).


### 잡 상세 (표에서 덜어낸 원문)

> 여섯 잡(매물 상세 보강·공동주택 공시가격·응급의료·K-apt 단지 매칭·data.go.kr API 버전 감시·크롤링 모니터)의
> 원문은 **`backend/.claude/details.md` §스케줄러 잡 상세** 에 있다(세션 411 이동 — 이 규칙 파일은 세션·서브에이전트마다
> 통째로 읽히므로, 파고들 때만 필요한 원문은 명시 참조 파일로 뺐다. 내용 무손실). 위 표의 `§잡 상세 — …` 링크가
> 그쪽을 가리킨다. **잡의 동작을 바꾸면 표와 그 절을 함께 갱신**한다.

## 관찰성 인프라 (세션 340 — 운영 중 문제를 볼 수 있게)

- **외부 uptime 감시** = `.github/workflows/healthcheck.yml` (매일 05:30 KST cron 1회 + workflow_dispatch. 2026-08-02 10분→일1회 격하, 사장님 결정. 05:30 = 새벽 재부팅 직후).
  ⚠ **격하 사유였던 "Actions 무료한도 소진"은 거짓 전제였다 — 세션 398(2026-09-11) 적대검증 실측으로 확정.**
  이 레포는 **public**(`gh api repos/developer-duno/naver-estate-web --jq .visibility` → `public`, 2026-03-12 생성 이래)이고,
  **public 레포의 GitHub-hosted runner 사용은 무료·무제한**이라 2,000분 쿼터 자체가 적용되지 않는다
  ([공식 문서](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions):
  "GitHub Actions usage is free ... for public repositories"). 실측으로도 최근 run 의 `/timing` `billable.UBUNTU.total_ms` 가 **전부 0**.
  또 "7/13 소진 → CI 월말까지 마비"도 사실이 아니다 — 7/13~7/20 창의 run 을 `gh api` 로 나열하면 CI·dependabot 이 정상 실행됐고,
  같은 창 Health Check 는 **306회 failure + 5회 success** 로 **실행 자체는 계속됐다**(= 쿼터 차단이 아니라 대상(터널)이 실제로 죽어 있었던 것).
  즉 그 시기 감시는 정상 작동해 터널 사망을 **정확히 포착하고 있었다**.
  → **비용 제약이 없으므로 일 1회 유지의 근거가 사라졌다.** 현재 최대 24시간 통지 지연은 근거 없는 손실이다.
  다만 UptimeRobot 5분 감시(`backend/.claude/details.md` §Supabase DB 전면 다운 런북과 재발 이력 의 처방)가 그 공백을 이미 메우고 있는지 먼저 확인해 **중복 여부를 판단한 뒤**
  주기 상향을 사장님께 재문의할 것(세션 398 백로그 §12). GitHub Actions(집서버 무관)가 `curl https://api.2u.pe.kr/health/db` → 실패 시 텔레그램(secrets `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`, 미설정 시 안전 스킵). **집서버가 통째로 죽으면 내부 watchdog 도 함께 죽어 무통지**이던 사각지대를 외부에서 메움. ⚠ GitHub Actions `if:` 에 `secrets` context 사용 불가(공식) → secrets 는 `env:` 로 주입해 shell 판정(PR #276 hotfix). CI 문법은 `gh workflow run` 라이브 실행만 ground truth. ⚠ **Cloudflare Bot Fight 모드를 켜면 이 외부감시가 오탐으로 전멸** — GH runner(미국 데이터센터 IP + curl)가 "관리 챌린지"를 못 풀어 403 을 받고, origin 로그엔 요청 자체가 안 남는다(2026-08-09 실사고: 8/8~8/9 이틀 연속 오탐, 서버는 정상. 공인 감시봇은 면제라 통과). 무료 플랜 BFM 은 경로 예외를 못 걸어 `/health/db` 만 빼는 것도 불가 → **켜기 전 healthcheck 영향 검토 의무**. 403 을 받으면 집서버가 아니라 CF 보안설정부터 의심 (워크플로가 HTTP 코드를 캡처해 403 을 별도 문구로 구분 알림).
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

- naver `collect_childcare` 는 **첫째 목 01:00 고정** (자정 리셋 직후 ~250콜 선사용 — 세션 393
  전량 전환 후 값. 전량이어도 시군구당 1콜 캐시 구조라 상한 248콜, 2026-09-05 실측). 06:00
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
| 01:00 / 13:00 | naver-estate-web | crawl_articles (cron, ±45분 jitter — 세션 402 에 12h interval 에서 전환) | 매일 |
| 00:20 / 12:20 | naver-estate-web | 상세 백필 — backfill_detail_dawn(배치 1500·약 38분) / backfill_detail_noon(배치 4000·실측 113~134분), 상세 API. 키 드리프트로 빈 채 굴러간 필드(난방·총층수 등)를 사후 보강한다. 토글 `BACKFILL_DETAIL_ENABLED`(코드 기본 false — 2026-09-14 라이브 .env 에서 ON). 배치 조절은 `BACKFILL_DETAIL_BATCH_SIZE` | 매일 |
| 30m interval | naver-estate-web | crawl_details | 매일 |

### IP 차단 방지 (절대 규칙)

같은 집 서버 IP 로 네이버를 크롤링하므로, 짧은 시간에 대량 요청하면 IP 가 차단된다.

1. **모든 네이버 수집 코드는 `AdaptiveThrottle` 경유 필수.** `crawler/utils.py` 의 `get_shared_throttle(name, ...)` 로 인스턴스를 받아 단지·페이지 루프마다 `.wait()` 호출. 429 응답 시 자동 감속(`on_rate_limit`). throttle 우회한 직접 반복 호출 금지.
2. **크롤 지표 컬럼을 SQL 직접 일괄 UPDATE 로 찍지 말 것.** `complexes.last_crawled_at`·`complexes.detail_crawled_at`·`articles.detail_crawled` 는 실제 크롤 코드(`CrawlJob` 생성 경유)만 갱신한다. SQL 로 일괄 UPDATE 하면 "크롤된 것처럼" 보이지만 실제 데이터는 없어 진단을 망친다.
3. **`articles.detail_fail_count` 일괄 리셋은 정비 잡 전용, 수동은 단건만.** 상한 매물 되살리기는 일일 정비 잡(정기 VACUUM 유지보수, 매일 03:50)이 CAP-1 부여로 이미 한다(매물당 하루 1콜 유계). 손으로 `WHERE detail_fail_count > 0` 같은 일괄 0 리셋을 박으면 그 매물들이 상한까지 N매물×6콜을 다시 태우며 한꺼번에 재유입돼 네이버 부하가 튄다. 수동 개입은 특정 매물 1건(`WHERE article_no = '...'`)만.

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
