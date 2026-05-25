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

### 2. 머지 직후 3중 cross-check 의무

머지 직후 다음 3 지표를 동시 확인. 하나라도 옛 시각이면 zombie 의심.

| 지표 | 확인 명령 | 기대 |
|---|---|---|
| **orchestrator.pid mtime** | `ls -la scripts/orchestrator.pid` 또는 `stat -c '%y' scripts/orchestrator.pid` | 머지 시각 이후 |
| **backend.log 첫 줄 시각** | `head -1 scripts/backend.log` (uvicorn 부팅 시각) | 머지 시각 이후 |
| **crawl_jobs 최신 row** | 해당 PR 변경한 잡의 최신 row 가 새 코드 기대 동작 일치 (예: PR #61 = `complex_metric` total=1000) | 새 코드 동작 |

세 지표가 머지 시각 이후로 모두 갱신되어야 새 코드 반영 확정.

### 3. zombie 발견 시 처리 절차

3 지표 중 하나라도 옛 시각이면:

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

3 세션 연속 backend 재시작 누락 = 글로벌 메모리 (사적) 박제로는 부족 → 본 룰로 git 추적.

### 5. 본 룰 비적용 사례 (false trigger 방지)

다음은 본 룰 트리거 아님:

- **FE 만 변경 PR** (frontend/* 만) = backend 가동 무관
- **md 만 변경 PR** (CLAUDE.md, .claude/*, docs/* 만) = 본 PR 같은 문서 정합 작업 = 가동 무관
- **테스트 만 추가 PR** (backend/tests/* 만) = 새 import 없으면 가동 무관

### 6. Cross-link

- `.claude/rules/infra.md` §스케줄러 (APScheduler) = 13 잡 + 운영 토글
- `.claude/rules/infra.md` §IP 차단 방지 = 네이버 호출 보호
- 글로벌 메모리 박제 = `[[feedback-orchestrator-restart-zombie-risk]]` + `[[feedback-backend-process-zombie-grep]]`
- 사건 일지 = `~/.claude/projects/d--naver-estate-web/memory/session{229,230,231}_summary.md`
