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

### 2. 머지 직후 4중 cross-check 의무

머지 직후 다음 4 지표를 동시 확인. 하나라도 옛 시각/옛값이면 zombie 의심. (4번째 = 표시값 PR 한정 필수, 세션 257 신설)

| 지표 | 확인 명령 | 기대 |
|---|---|---|
| **orchestrator.pid mtime** | `ls -la scripts/orchestrator.pid` 또는 `stat -c '%y' scripts/orchestrator.pid` | 머지 시각 이후 |
| **backend.log 첫 줄 시각** | `head -1 scripts/backend.log` (uvicorn 부팅 시각) | 머지 시각 이후 |
| **crawl_jobs 최신 row** | 해당 PR 변경한 잡의 최신 row 가 새 코드 기대 동작 일치 (예: PR #61 = `complex_metric` total=1000) | 새 코드 동작 |
| **관리자 화면 표시값(라이브 GET)** | `.env` SUPABASE_JWT_SECRET 로 admin 토큰 발급 후 `GET /api/admin/scheduler-status` → `jobs[].schedule` | 새 코드 표시값 (정적 분석·pytest 로 대체 불가 — 라이브만 ground truth, §5-1 답습) |

위 지표가 머지 시각 이후로 모두 갱신되어야 새 코드 반영 확정. ⚠ 표시값 변경 PR (예: SSOT 자동생성) 은 trigger 동작이 새값이어도 **화면 표시는 표시 모듈 본문이 옛 코드라 옛값 잔존** 가능 — 4번째 지표(라이브 GET) 필수 (세션 257 사고).

### 3. zombie 발견 시 처리 절차

4 지표 중 하나라도 옛 시각/옛값이면:

```powershell
# Step 1: orchestrator pythonw 종료
Get-Process pythonw -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*startup_orchestrator*'
} | Stop-Process -Force

# Step 2: uvicorn 자식 좀비 정리 (port 8002 점유 프로세스 명시 종료)
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess
if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }

# Step 3: 3초 대기 (포트 해제 + 프로세스 graceful exit)
Start-Sleep -Seconds 3

# Step 4: 사용자 환경별 재시작
#   옵션 A (가장 안전): PC 재부팅 → Windows Startup BAT 가 orchestrator 자동 기동
#   옵션 B (수동): 사용자가 평소 쓰는 Startup BAT 경로 직접 실행

# Step 5: 부팅 로그 시각 검증
Start-Sleep -Seconds 5
Get-Content scripts\backend.log -Head 5
# 기대: 첫 줄 시각 = 머지 시각 이후
```

**가장 안전한 옵션 (권장)** = **PC 재부팅**. Windows Startup BAT 가 orchestrator + 백엔드 + tunnel 모두 자동 기동. zombie 위험 0, 추측 0.

### 4. 사건 박제 (왜 이 룰?)

| 세션 | 사고 | 영향 |
|---|---|---|
| 229 (2026-05-24) | PR #61 (가치지표 배치 200→1000, 25일 완주) 머지 후 backend 재시작 안 됨 | 가속 효과 검증 시각 미도래로 다음 세션 이월 |
| 230 (2026-05-25) | 5/25 08:30 KST cron 도래했으나 total=200 옛 코드 가동 발견 | 사용자 watchdog 수동 재시작 + 5/26 cron 검증 이월 |
| 231 (2026-05-25) | backend 5/24 15:26 부팅 = PR #61 머지 (5/25 06:09) 보다 15시간 전. zombie 동일 패턴 지속 | 사용자 옵션 3 (재시작 보류) 선택. 본 세션 232 룰 git 박제로 재발방지 |
| 257 (2026-06-01) | PR #102 후 "재시작 불필요" 정적 결론 3회 → 라이브 GET 으로 화면 표시 옛값(08:30/20분/6시간) 확인 = 재시작 필요로 정정. trigger 동작은 새값이나 표시 모듈 본문이 옛 코드 | release.md §2 에 라이브 표시값 4번째 지표 + §5-1 정적분석 함정 추가. 사용자 PC 재부팅 선택 |

3 세션 연속 backend 재시작 누락 = 글로벌 메모리 (사적) 박제로는 부족 → 본 룰로 git 추적.

### 5. 본 룰 비적용 사례 (false trigger 방지)

다음은 본 룰 트리거 아님:

- **FE 만 변경 PR** (frontend/* 만) = backend 가동 무관
- **md 만 변경 PR** (CLAUDE.md, .claude/*, docs/* 만) = 본 PR 같은 문서 정합 작업 = 가동 무관
- **테스트 만 추가 PR** (backend/tests/* 만) = 새 import 없으면 가동 무관

### 5-1. 정적 분석만으로 "재시작 면제" 단정 금지 (세션 257 사고)

코드 읽기·git diff·pytest 통과로 "재시작 불필요"를 단정하지 말 것. 다음은 모두 **라이브 프로세스 상태를 증명하지 못한다**:

- lazy import (`함수 내부 from X import`) 는 X 모듈만 지연 — **그 import 문을 담은 호출처 모듈 본문(함수 정의)은 부팅 때 옛 버전으로 메모리 상주**. 옛 프로세스의 옛 함수는 새 lazy import 를 애초에 호출하지 않는다.
- pytest 통과 = **디스크 코드 self-consistency** 증명 (테스트는 디스크 fresh import + fresh scheduler 생성). 부팅한 프로세스 메모리 상태와 무관.

판정은 **라이브 실측**으로만: 살아있는 엔드포인트를 실제 호출 (`.env` SUPABASE_JWT_SECRET 로 admin 토큰 발급 → GET scheduler-status) 하거나, backend.log 의 trigger/next-run 로그로 현재 프로세스의 실제 등록값을 본다. 글로벌 `[[feedback-browser-measurement-overrides-plan]]` 와 같은 패턴.

> **사건**: 2026-06-01 세션 257 — PR #102 (표시 SSOT 자동생성) 후 "재시작 불필요"를 정적 분석으로 3회 단정. 라이브 GET 으로 화면 표시가 옛값(08:30/20분/6시간) 잔존 확인 = 재시작 필요로 정정. trigger 동작은 새값이나 표시 모듈 본문이 옛 코드라 split 발생.

### 6. Cross-link

- `.claude/rules/infra.md` §스케줄러 (APScheduler) = 13 잡 + 운영 토글
- `.claude/rules/infra.md` §IP 차단 방지 = 네이버 호출 보호
- 글로벌 메모리 박제 = `[[feedback-orchestrator-restart-zombie-risk]]` + `[[feedback-backend-process-zombie-grep]]`
- 사건 일지 = `~/.claude/projects/d--naver-estate-web/memory/session{229,230,231}_summary.md`
