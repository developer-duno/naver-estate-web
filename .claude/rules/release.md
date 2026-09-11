# PR 머지 후 backend 가동 검증 룰

세션 230~231 backend zombie 사고 2 세션 연속 발생을 git 추적 룰로 박제. 박제 근거 = 글로벌 메모리 `[[feedback-orchestrator-restart-zombie-risk]]` + `[[feedback-backend-process-zombie-grep]]` 은 git 추적 0 → 다른 컴퓨터·새 협업자 보호 불가.

## 룰 본문

### 1. 트리거 (의무 적용)

다음 PR 머지 시 본 룰 발동:

- backend 스케줄러 설정 변경 (`crawler/scheduler.py`, `crawler/monitor.py`, `crawler/service_metrics.py`)
- 환경변수 추가/변경 (`backend/.env.example`, 새 `os.getenv` 호출)
- backend 의존성 변경 (`backend/requirements.txt`)
- DB 마이그레이션 (`backend/db/migrations/V*.sql`)
- backend 모듈 import 흐름 변경 (`main.py`, `routers/*`, `crawler/*`)

FE 만 변경된 PR (frontend/*) 은 본 룰 면제.

⚠ **여러 PR을 짧은 간격으로 연속 머지할 때는 매번 재시작하지 말고 묶어서 한 번에
재시작해도 된다**(infra.md "짧은 주기 크론과 재시작 겹침" 답습 — 반복 재시작이 크론
실행 시각과 겹쳐 일시적 오탐을 낼 수 있다, 세션 372 실사고). 단 묶어서 재시작하면
**그 안의 어느 PR이 zombie였는지 개별 구분이 안 되는 대가**가 있다 — 재시작 후 4중
지표가 옛값이면, 묶음 안의 PR을 머지 순서 역순으로 하나씩 되짚어(이분 탐색 재시작)
원인 PR을 격리한다. 확실하게 개별 검증하고 싶으면 원칙(PR마다 재시작)을 유지해도 된다 —
묶음 재시작은 선택지이지 의무 완화가 아니다.

### 2. 머지 직후 4중 cross-check 의무

머지 직후 다음 4 지표를 동시 확인. 하나라도 옛 시각/옛값이면 zombie 의심. (4번째 = 표시값 PR 한정 필수, 세션 257 신설)

| 지표 | 확인 명령 | 기대 |
|---|---|---|
| **orchestrator.pid mtime** | `ls -la scripts/orchestrator.pid` 또는 `stat -c '%y' scripts/orchestrator.pid` | 머지 시각 이후 |
| **backend.log 첫 줄 시각** | `head -1 scripts/backend.log` (uvicorn 부팅 시각) | 머지 시각 이후 |
| **crawl_jobs 최신 row** | 해당 PR 변경한 잡의 최신 row 가 새 코드 기대 동작 일치 (예: PR #61 = `complex_metric` total=1000) | 새 코드 동작 |
| **관리자 화면 표시값(라이브 GET)** | `.env` SUPABASE_JWT_SECRET 로 admin 토큰 발급 후 `GET /api/admin/scheduler-status` → `jobs[].schedule` | 새 코드 표시값 (정적 분석·pytest 로 대체 불가 — 라이브만 ground truth, §5-1 답습) |

위 지표가 머지 시각 이후로 모두 갱신되어야 새 코드 반영 확정. ⚠ 표시값 변경 PR (예: SSOT 자동생성) 은 trigger 동작이 새값이어도 **화면 표시는 표시 모듈 본문이 옛 코드라 옛값 잔존** 가능 — 4번째 지표(라이브 GET) 필수 (세션 257 사고).

⚠ **"4중" 은 PR 성격에 따라 줄어든다** (세션 301 정정). 3번째(crawl_jobs)는 *스케줄러 잡 변경* PR 전용, 4번째(관리자 표시값)는 *표시값 변경* PR 전용. **정렬·쿼리 로직만 바꾼 PR (예: PR #167 mb 정렬)** 은 스케줄러 잡도 표시값도 아니라 3·4번째 부적용 → 적용 지표 = ①orchestrator.pid/PID ②backend.log 부팅시각 ③**해당 PR 이 바꾼 API 의 라이브 GET 동작** = 3중. crawl_jobs 새 row 가 안 생기는 게 정상이지 zombie 아님.

💡 **거짓양성 차단 — prod DB 직접 실측** (세션 301): 라이브 GET 정렬결과만으론 "새 코드 실행" 인지 "옛 코드 우연히 같은 결과" 인지 구분 못 할 수 있다 (예: SQL 경로 nullif vs Python fallback `or inf` 가 둘 다 0 맨뒤). `SessionLocal` 읽기전용 스크립트로 prod PG 에 **옛 ORDER BY / 새 ORDER BY 를 같은 데이터에 직접** 던져 비교하면, 라이브 프로세스 상태와 무관하게 디스크 코드 정합성을 결판 → "디스크는 새 코드 정상, 라이브만 옛 동작 = zombie" 를 확정. 실행 = `backend/` cwd + `PYTHONPATH=.` (임시 uvicorn 금지, §5-1 답습). 선례 = `memory/scripts/session301_verify_pp_nullif.py`.

### 3. zombie 발견 시 처리 절차

4 지표 중 하나라도 옛 시각/옛값이면:

**현행 (세션 363+ — nssm 서비스 `naver-orchestrator`, 2026-08-14 00:19 라이브 훈련 검증):**

**3-0. 재시작 직전 확인 (예외 0 — 세션 397 절차 누락)**

재시작은 **돌고 있는 잡을 끊는다**(부팅 스윕이 running 잡을 cancelled 처리). 명령을 치기 전에
① 지금 running 인 잡이 있는지 ② 앞으로 5분 안에 도래할 크론이 있는지 둘 다 본다.

```bash
# (1) running 잡 — 있으면 끝날 때까지 대기. 특히 official_price 는 3~7h 라 절대 중단 금지
cd /d/naver-estate-web/backend && PYTHONPATH=. PYTHONUTF8=1 python -c "
from sqlalchemy import text; from db.database import SessionLocal
with SessionLocal() as db:
    print(db.execute(text(\"SELECT job_type FROM crawl_jobs WHERE status='running'\")).fetchall())"
# (2) 5분 내 크론 — 현재 KST(요일·일자 포함)를 아래 전수 시각표와 대조
date "+%F(%a) %H:%M"
```

**스케줄 전수 (scheduler.py `id=` 기준 실측, 세션 398). ⏰ = 장시간 잡 = 재시작 절대 금지 구간:**

| 시각 | 잡 | 주기 | 소요 |
|---|---|---|---|
| 01:00 | collect_childcare | 매월 첫째 목 | ~20~30분 |
| 02:00 | collect_air_quality | 매일 | 짧음 |
| 03:00 | discover_regions(일) / collect_emergency(매월 첫째 월) | 주·월 | 중간 |
| 03:30 | backfill_price | 매일 | 중간 |
| 03:50 | vacuum_maintenance | 매일 | 중간 |
| 04:00 | collect_prices | 수 | 중간 |
| 04:30 | collect_metrics | 매일 | 짧음 |
| 04:50 | billing_charge | 매일 | 짧음 |
| 05:00 | collect_public_trades(토) ⏰3h / collect_officetel_presale(월) | 주 | ⏰ |
| 05:30 | collect_rental_presale | 월 | 중간 |
| **06:10** | **kapt_match** | **매월 21일** | **⏰ 최대 8h** |
| **06:20** | **kapt_costs** | **매일** | **⏰ ~1h(예외 3h)** |
| **06:30** | **official_price** | **매월 15일** | **⏰ 3~7h** |
| 06:40 | api_version_probe | 일 | 짧음 |
| 10:45·14:45·19:15 | popular_crawl | 매일 | 중간 |
| 매 12h | crawl_articles | interval | 중간 |
| 매 30분 ±15분 jitter | crawl_details | interval | 중간 |
| 매 4h | complex_detail_APT / OPST | interval | 중간 |
| 매 10분 | crawler_monitor | interval | 짧음 |

⏰ 판정 기준 = `crawler/monitor.py` `_STALE_HOURS_BY_TYPE` 에 예외 등록된 잡
(public_trade_data 3h · official_price 16h · **kapt_match 8h** · kapt_costs 3h · childcare).
**이 dict 에 새 잡이 추가되면 위 표도 함께 갱신한다** — 표가 낡으면 장시간 잡을 끊는다.

겹치면 **그 회차가 끝난 뒤로 미룬다.** 여러 PR 을 묶어 한 번에 재시작하는 것도 겹침을 줄인다(§1 말미).

⚠ **(1) 의 running 조회는 DB 에 접속한다.** DB 장애로 재시작하려는 상황이면 이 명령도 실패한다 —
그때는 **조회 실패 자체를 "확인 불가"로 받아들이고** `scripts/backend.log` 마지막 줄과 위 시각표만으로
판단한다(DB 가 죽었으면 크론도 대부분 실패 중이므로 끊을 작업이 없을 가능성이 높다).
DB 다운 진단·처방은 infra.md §Supabase DB 전면 다운 런북이 우선.

**3-1. 재시작 실행**

```powershell
# 비관리자 셸 그대로 실행 가능 — 서비스 DACL 에 사용자 시작/중지 권한 등록됨
#   (install_orchestrator_service.ps1 1-b 단계)
# 고정 Sleep 금지 — 포트가 뜰 때까지 폴링(최대 120초). 세션 397 실측: 서비스 "중지 대기"에만
#   약 1분, 기동까지 약 65초라 45초 시점의 빈 포트 출력을 "실패"로 오판해 재실행할 뻔했다.
#   즉 판정 기준은 "얼마나 기다렸나"가 아니라 "포트 소유 PID 가 바뀌었나"다.
$before = (Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue).OwningProcess
Restart-Service naver-orchestrator        # nssm 이 orchestrator+uvicorn 트리 통째 종료 후 재기동
$deadline = (Get-Date).AddSeconds(120)
do {
  Start-Sleep -Seconds 5
  $after = (Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue).OwningProcess
} while (-not $after -and (Get-Date) -lt $deadline)
"before=$before after=$after"                                 # 기대: 서로 다른 값 (같으면 재시작 미발생)
Get-Content D:\naver-estate-web\scripts\startup.log -Tail 8   # 기대: 새 "백엔드 정상 시작 완료"
Get-Content D:\naver-estate-web\scripts\orchestrator.pid      # 기대: 새 PID
curl.exe -s https://api.2u.pe.kr/health/db                    # 기대: {"status":"ok","db":"ok"}
```

**120초 안에 포트가 안 뜨면**(`$after` 가 빈값): 재실행하지 말고 **원인부터 본다.**
① `Get-Service naver-orchestrator` 상태 확인(Stopped 면 `Start-Service`) ②
`Get-Content scripts\startup.log -Tail 20` 으로 기동 실패 사유 확인 ③ `scripts\backend.log` 첫 줄
(uvicorn 부팅 로그)이 갱신됐는지 — 셋 다 이상 없는데 포트만 없으면 DB 연결 실패로 기동이 막힌 것일 수 있으니
infra.md §Supabase DB 전면 다운 런북으로 넘어간다. **무작정 Restart-Service 재실행은 상황을 악화시킨다.**

- ⚠ **`Restart-Service` 는 조용히 실패할 수 있다 — 실행 후 "포트 소유 PID 가 바뀌었는지"로 판정한다**
  (세션 396 실측: 첫 시도 후 45초를 기다렸는데 `startup.log` 시각·8002 포트 소유 PID 가 그대로였다. 같은 명령을
  `try/catch` + 전후 상태 출력으로 감싸 재실행하니 정상 동작). **판정 지표 = `(Get-NetTCPConnection -LocalPort 8002
  -State Listen).OwningProcess` 가 재시작 전과 다른 값**. 기다림만으로 성공을 단정하지 말 것 — bash 파이프에서
  PowerShell 출력이 "Binary file matches" 로 가려지는 경우도 있어(로그가 cp949) 출력 부재 = 성공 아님.
- ⚠ **`orchestrator.pid` 는 검증 지표로 쓰기 전에 "존재하는지"부터 본다** — 파일이 사라진 상태(세션 396 사고로
  삭제)에서는 4중 cross-check 의 한 축이 조용히 무력화된다. 없으면 재시작 후 orchestrator 가 새로 쓰므로,
  그 전까지는 포트 소유 PID·`startup.log` 시각·`backend.log` 첫 줄 PID 세 축으로 판정한다.
- ⛔ **비관리자 `Stop-Process` 로 서비스 프로세스(orchestrator·backend)를 직접 죽이는 것은
  액세스 거부로 불가** — 서비스는 UAC 필터링 없는 전체 토큰으로 돌아서다 (세션 363 훈련 1차
  실측). 아래 레거시의 "프로세스 kill 후 재기동" 흐름을 현행 환경에서 쓰지 말 것.
- ⚠ 서비스 orchestrator 는 session 0 이라 비관리자 조회에서 CommandLine=NULL — CommandLine
  grep 이 0건이어도 "orchestrator 없음" 단정 금지. 판정은 `orchestrator.pid` + `Get-Service
  naver-orchestrator` + startup.log 로.
- orchestrator 급사 시 nssm 이 60초 내 자동 재기동 — 개입 전 startup.log 최신 헤더부터 확인
  (이미 자가복구됐을 수 있다).

**레거시 (nssm 서비스 제거·수동 운용 폴백 시에만 유효 — 옛 Startup BAT 시절 절차):**

```powershell
# Step 1: orchestrator 종료 — python.exe·pythonw.exe 둘 다 잡는다
#   재부팅 경로(Startup BAT)·§3 schtasks 명령은 pythonw 로, 수동·세션 셸 재기동은 python 으로 뜰 수 있어
#   이름 하나만 필터하면 놓친다. ⚠ Get-Process 는 Windows PowerShell 5.1 에 CommandLine
#   속성이 없어 필터가 조용히 0건 — Get-CimInstance 필수 (세션 353 발견: 옛 명령은 무동작).
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Step 1-b: 사멸 확인 — 0건이어야 다음 단계 진행 (예외 0)
#   옛 orchestrator 가 살아 있으면 새 인스턴스가 _check_already_running() 에서 조용히
#   sys.exit(0) → "재시작했다고 믿었는데 안 된" 사고. 세션 352 의 성공은 옛 PID 가
#   이미 죽어 있던 우연이었다 (§4 세션 352~353 행).
(Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } | Measure-Object).Count  # 기대: 0

# Step 2: uvicorn 자식 좀비 정리 (port 8002 점유 프로세스 명시 종료)
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess
if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }

# Step 3: 3초 대기 (포트 해제 + 프로세스 graceful exit)
Start-Sleep -Seconds 3

# Step 4: 재시작 — 반드시 "세션 수명과 분리된" 방식으로
#   옵션 A (가장 안전): PC 재부팅 → Windows Startup BAT 가 orchestrator 자동 기동
#   옵션 B (재부팅 없이): schtasks 일회성 작업 경유 — 부모가 작업 스케줄러 서비스라
#     Claude 세션·터미널이 닫혀도 살아남는다 (세션 353 라이브 검증 완료)
schtasks /Create /TN naver-orch-restart /SC ONCE /ST 23:59 /F /TR "C:\Users\user\AppData\Local\Programs\Python\Python312\pythonw.exe D:\naver-estate-web\scripts\startup_orchestrator.py"
schtasks /Run /TN naver-orch-restart
schtasks /Delete /TN naver-orch-restart /F   # 정의만 삭제 — 실행 중 프로세스는 안 죽는다
#   ⛔ 금지: Claude 세션·터미널 셸에서 python 으로 직접 기동 — 그 창이 닫히는 순간
#     Windows 가 orchestrator+uvicorn 트리를 통째로 죽인다(무로그·무알림 급사,
#     watchdog 도 같이 죽어 자동복구 0 — §4 세션 352~353 실사고)
#   ⚠ 실행 방식: 위 PowerShell 명령들을 bash(Claude 셸)에서 -Command 인라인으로 돌리면
#     인용부호가 깨져 Get-CimInstance 쿼리가 실패하는데 카운트만 0 으로 찍힌다(가짜 0 —
#     종료가 실행된 적 없는데 성공처럼 보임, 세션 354 재현). 반드시 .ps1 파일로 저장 후
#     `powershell -NoProfile -File <경로>` 로 실행할 것. 패턴 필터가 헛돌면 전체 python
#     프로세스 나열 진단으로 정확한 PID 를 확인해 PID 지정 종료가 최선 — 같은 PC 에
#     타 프로젝트 python 프로세스가 다수 상주한다(오살 방지).

# Step 5: 부팅 검증 (셋 다 확인)
Start-Sleep -Seconds 45   # INITIAL_DELAY 10초 + 백엔드 기동 + health check 여유
Get-Content scripts\startup.log -Tail 8   # 기대: 새 "서버 자동 시작" 헤더 + "백엔드 정상 시작 완료"
Get-Content scripts\orchestrator.pid      # 기대: 새 PID (tasklist /FI "PID eq <값>" 생존 확인)
curl.exe -s https://api.2u.pe.kr/health/db   # 기대: {"status":"ok","db":"ok"} (외부 경로 ground truth)
```

**통상은 현행 `Restart-Service` 1줄로 충분** (훈련 실측 중단 ~15초). PC 재부팅도 여전히 안전한
최후 수단 — 세션 363부터는 서비스가 부팅 시 자동 기동하므로 **로그인 없이도** 복구된다(옛
Startup BAT 시절엔 로그인해야 기동 — infra.md §자동 시작 사건 참조). 세션 셸 직접 기동만은
여전히 절대 금지.

### 4. 사건 박제 (왜 이 룰?)

| 세션 | 사고 | 영향 |
|---|---|---|
| 229 (2026-05-24) | PR #61 (가치지표 배치 200→1000, 25일 완주) 머지 후 backend 재시작 안 됨 | 가속 효과 검증 시각 미도래로 다음 세션 이월 |
| 230 (2026-05-25) | 5/25 08:30 KST cron 도래했으나 total=200 옛 코드 가동 발견 | 사용자 watchdog 수동 재시작 + 5/26 cron 검증 이월 |
| 231 (2026-05-25) | backend 5/24 15:26 부팅 = PR #61 머지 (5/25 06:09) 보다 15시간 전. zombie 동일 패턴 지속 | 사용자 옵션 3 (재시작 보류) 선택. 본 세션 232 룰 git 박제로 재발방지 |
| 257 (2026-06-01) | PR #102 후 "재시작 불필요" 정적 결론 3회 → 라이브 GET 으로 화면 표시 옛값(08:30/20분/6시간) 확인 = 재시작 필요로 정정. trigger 동작은 새값이나 표시 모듈 본문이 옛 코드 | release.md §2 에 라이브 표시값 4번째 지표 + §5-1 정적분석 함정 추가. 사용자 PC 재부팅 선택 |
| 301 (2026-06-13) | PR #167 (mb 정렬 nullif) 머지 후 라이브 backend PID 20368 이 머지 19h 전 부팅 = zombie. 라이브 pp_asc 가 0 맨앞(옛 동작). 6렌즈 적대검증 + prod PG 직접 실측(OLD `[0,0,0,0,0]` vs NEW `[1122,...]`)으로 "디스크 정상·라이브만 옛코드" 확정 | §2 에 "4중→PR성격별 3중" + prod DB 직접실측 거짓양성 차단 노하우 추가. 사용자 PC 재부팅 선택 |
| 352~353 (2026-08-09) | 세션 352 가 zombie 해소를 위해 orchestrator 를 **자기 세션 셸에서 python 으로 직접 재기동**(02:55) → 그 세션 창이 닫히자 05:42 orchestrator+uvicorn 트리 동반 급사(무로그·무알림). watchdog 도 같이 죽어 자동복구 0, 다음 세션(353)이 발견할 때까지 backend 다운 방치. 부수 발견 2건 = ① 옛 §3 `Get-Process pythonw` 는 PS 5.1 CommandLine 속성 부재로 애초에 무동작 ② 수동 재기동 시 프로세스명이 python 이라 pythonw 단일 필터도 미스매치 | §3 전면 보강: Get-CimInstance 양이름 필터 + Step 1-b 사멸확인 + schtasks 세션독립 재기동(세션 353 라이브 검증) + 세션 셸 직접 기동 금지 명문화 |

| 363 (2026-08-14) | (사고 규명+구조 전환) Windows Update(KB5120249) 야간 계획 재부팅 → Startup BAT 가 로그인 의존이라 로그인 화면에서 **13시간 backend 다운**(watchdog·스케줄 전체 미기동, 상세 = infra.md §자동 시작 사건). orchestrator 를 nssm 서비스로 전환. 라이브 훈련 1차에서 비관리자 Stop-Process 액세스 거부 실측 → 서비스 DACL 시작/중지 권한 등록 후 훈련 2차 Restart-Service 15초 복구 검증 | §3 현행 절차를 Restart-Service 1줄로 교체, 옛 schtasks 절차는 레거시 폴백 격하. 부팅 자동 기동(로그인 불필요) + orchestrator 급사 60초 자동복구 확보 |
| 386 (2026-08-26) | (무피해, 절차 결함) PR #425(`crawler/service_applyhome_officetel.py`·`routers/mb_serializers.py` 주석 정정)를 "diff가 주석뿐이라 재시작 불필요"로 그 자리에서 판단 → §5 기존 3가지 면제 사유(FE전용/문서전용/테스트전용) 어디에도 안 맞는데도 재시작 생략. 사후검증에서 AST 비교로 실행 코드 무변경을 사후 확인해 결과는 안전했으나, 판단 당시엔 §5-1이 금지한 "정적분석만으로 단정"과 동일 패턴이었음 | §5 에 4번째 면제 조건(AST 비교로 실행 코드 구조 동일 확인된 텍스트 정정) 명문화 — 눈대중 판단과 기계적 확인을 구분 |
| 396 (2026-09-10) | (무피해, 절차 결함 2건) ① PR #486·#487 머지 후 `Restart-Service naver-orchestrator` 첫 시도가 **조용히 실패** — 45초 대기 후에도 8002 포트 소유 PID·startup.log 시각이 그대로였고, bash 파이프에서 PowerShell 출력이 "Binary file matches" 로 가려져 실패가 안 보였다. try/catch + 전후 상태 출력으로 재실행하니 정상 (orchestrator 6080→61116, backend 7500→62280, 07:56:40). ② 같은 세션의 레포 삭제 사고로 `orchestrator.pid` 가 사라져 4중 cross-check 의 한 축이 무력화된 채였다(재시작 후 자동 복구됨) | §3 에 "포트 소유 PID 변화로 판정"·"pid 파일 부재 시 3축 판정" 2줄 추가. 라이브 검증은 캐시 헤더 4종 HTTP 실측으로 대체 확인 |
| 397 (2026-09-11) | (무피해, 절차 결함 2건) ① 재시작 직전 "5분 내 도래 크론·running 잡" 확인을 생략 — 다행히 겹친 잡이 없었으나, official_price(3~7h) 같은 장시간 잡과 겹쳤으면 부팅 스윕이 cancelled 처리했을 것. ② `Restart-Service` 후 45초에 포트 소유 PID 가 빈값이라 "실패"로 오판할 뻔함 — 실측하니 서비스 "중지 대기"에만 약 1분, 기동까지 약 65초라 **45초는 판정 시점 자체가 이름**. | §3 을 3-0(사전 확인)·3-1(실행)으로 분리, 대기를 고정 40초 → 포트 폴링(최대 120초)으로 교체 |

3 세션 연속 backend 재시작 누락 = 글로벌 메모리 (사적) 박제로는 부족 → 본 룰로 git 추적.

### 5. 본 룰 비적용 사례 (false trigger 방지)

다음은 본 룰 트리거 아님:

- **FE 만 변경 PR** (frontend/* 만) = backend 가동 무관
- **md 만 변경 PR** (CLAUDE.md, .claude/*, docs/* 만) = 본 PR 같은 문서 정합 작업 = 가동 무관
- **테스트 만 추가 PR** (backend/tests/* 만) = 새 import 없으면 가동 무관
- **`crawler/*`·`routers/*` 등 실행 코드 파일이 포함돼도, diff 전체가 순수 주석/docstring
  텍스트뿐이고 실행 가능한 코드 구조(함수 정의·SQL 호출·조건문·dict 리터럴 등)가 단 한 글자도
  안 바뀐 경우** = 가동 무관. **단 이 판정은 "diff를 눈으로 봤더니 주석 같다"는 직감만으로
  내리면 안 되고, AST(추상 구문 트리) 비교 등 기계적 방법으로 "실행 코드 구조 동일"을
  실제로 확인해야 한다** — 그렇지 않으면 §5-1이 금지하는 "정적 분석만으로 단정"과 같은
  실수가 된다 (세션 386 사후검증에서 발견).

### 5-1. 정적 분석만으로 "재시작 면제" 단정 금지 (세션 257 사고)

코드 읽기·git diff·pytest 통과로 "재시작 불필요"를 단정하지 말 것. 다음은 모두 **라이브 프로세스 상태를 증명하지 못한다**:

- lazy import (`함수 내부 from X import`) 는 X 모듈만 지연 — **그 import 문을 담은 호출처 모듈 본문(함수 정의)은 부팅 때 옛 버전으로 메모리 상주**. 옛 프로세스의 옛 함수는 새 lazy import 를 애초에 호출하지 않는다.
- pytest 통과 = **디스크 코드 self-consistency** 증명 (테스트는 디스크 fresh import + fresh scheduler 생성). 부팅한 프로세스 메모리 상태와 무관.

판정은 **라이브 실측**으로만: 살아있는 엔드포인트를 실제 호출 (`.env` SUPABASE_JWT_SECRET 로 admin 토큰 발급 → GET scheduler-status) 하거나, backend.log 의 trigger/next-run 로그로 현재 프로세스의 실제 등록값을 본다. 글로벌 `[[feedback-browser-measurement-overrides-plan]]` 와 같은 패턴.

⚠ **crawler_monitor(크롤링 모니터) 잡의 실동작 확인은 위 두 방법이 전부 무효**다(세션 391 실측) — monitor 는 CrawlJob 을 안 남겨 scheduler-status 의 last_run/runs 가 영구 null/0 이고, 정상 스캔은 로그도 안 찍는다(무음 설계). 유일한 유효 경로 = prod `pg_stat_user_tables` 에서 freshness 대상 4테이블(trades·complex_price_history·crawl_jobs·complexes)의 **동시 스캔 타임스탬프가 monitor 주기(10분) 간격으로 반복**되는지 확인.

> **사건**: 2026-06-01 세션 257 — PR #102 (표시 SSOT 자동생성) 후 "재시작 불필요"를 정적 분석으로 3회 단정. 라이브 GET 으로 화면 표시가 옛값(08:30/20분/6시간) 잔존 확인 = 재시작 필요로 정정. trigger 동작은 새값이나 표시 모듈 본문이 옛 코드라 split 발생.

### 6. Cross-link

- `.claude/rules/infra.md` §스케줄러 (APScheduler) = 13 잡 + 운영 토글
- `.claude/rules/infra.md` §IP 차단 방지 = 네이버 호출 보호
- 글로벌 메모리 박제 = `[[feedback-orchestrator-restart-zombie-risk]]` + `[[feedback-backend-process-zombie-grep]]`
- 사건 일지 = `~/.claude/projects/d--naver-estate-web/memory/session{229,230,231}_summary.md`
