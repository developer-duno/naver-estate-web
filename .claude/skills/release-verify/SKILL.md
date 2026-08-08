---
name: release-verify
description: backend 변경 PR 머지 후 zombie(옛 코드 상주) 여부를 release.md §2 cross-check 로 검증한다. 자율발동 = "PR 머지 후 검증", "zombie 확인", "재시작 됐나", "backend 반영 확인", backend 변경 PR 머지 직후. FE 전용 PR 은 면제.
---

# release-verify — backend PR 머지 후 zombie 검증

backend 코드 변경 PR 머지 후, 라이브 프로세스가 새 코드를 실행하는지 확인한다. 정적 분석(코드 읽기·pytest)은 라이브 프로세스 상태를 증명하지 못한다 — 라이브 실측만 ground truth.

## When to Use

- backend 변경 PR(crawler/·routers/·main.py·db/migrations·.env·requirements) 머지 직후
- "재시작 됐나", "zombie 확인", "backend 반영" 류 질문
- **사용 안 함**: FE 전용 PR(frontend/*), md 전용 PR, 테스트만 추가 PR

## 절차

### 1단계: PR 성격 분류 (검증 차원 결정)

| PR 성격 | 적용 지표 |
|---|---|
| 스케줄러 잡 변경 (scheduler.py·monitor.py) | ①②③ + crawl_jobs 새 row |
| 표시값 변경 (API 응답값) | ①②③ + 관리자 라이브 GET |
| 정렬/쿼리 로직만 | ①②③ + 해당 API 라이브 GET (crawl_jobs·표시값 부적용 = 3중) |

⚠ "4중" 은 PR 성격 따라 줄어든다(세션 301 정정). crawl_jobs 새 row 가 안 생기는 게 정상인 PR 도 있다.

### 2단계: cross-check 동시 실행

**① backend.log 부팅 시각** (필수)
```bash
head -1 scripts/backend.log
# 기대: PR 머지 시각 이후의 uvicorn 부팅 시각
```

**② port 8002 PID — ground truth** (필수)
```bash
netstat -ano | grep ":8002" | grep LISTENING
# PID 변경이 ground truth. backend.log 는 매 부팅 truncate 라 1줄=단일 부팅이지만,
# PID 가 직전 zombie 와 다른지가 가장 확실 (세션 301: 20368→재부팅 새 PID).
```

**③ orchestrator.pid mtime** (필수)
```bash
stat -c '%y' scripts/orchestrator.pid   # 기대: 머지 시각 이후
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8002/health   # 기대: 200
```

**④ 관리자 라이브 GET** (표시값 변경 PR 전용 — 정적분석·pytest 로 대체 불가)
```bash
# .env SUPABASE_JWT_SECRET 로 admin 토큰(HS256, aud=authenticated, role 클레임) 발급 후
# localhost:8002 직접 호출 (api.2u.pe.kr 는 Cloudflare 1010 봇차단)
curl -s http://localhost:8002/api/admin/scheduler-status -H "Authorization: Bearer <TOKEN>"
# 기대: jobs[].schedule 이 새 코드 표시값
# 함정: trigger 동작은 새값이나 표시 모듈 본문이 옛 코드면 옛값 잔존 = 라이브만 ground truth (세션 257)
```

### 3단계: 판정

- 모두 머지 시각 이후 → ✅ 정상 (재시작 됨)
- 하나라도 옛 시각/옛값 → ⚠️ zombie → 처리 절차로

## zombie 발견 시 처리

상세 절차의 진실의 원천 = `release.md` §3 (Step 1~5 전문). 요약:

```powershell
# orchestrator 종료 — python·pythonw 양이름 필터 (⚠ Get-Process 는 PS 5.1 에
# CommandLine 속성이 없어 무동작 — Get-CimInstance 필수, 세션 353 발견)
Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='pythonw.exe'" |
    Where-Object { $_.CommandLine -like '*startup_orchestrator*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# 사멸 확인 0건 필수 — 살아있으면 새 인스턴스가 _check_already_running() 에서 조용히 exit
# port 8002 명시 종료
$pids = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue).OwningProcess
if ($pids) { $pids | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } }
Start-Sleep -Seconds 3
# 재시작: PC 재부팅(최선) 또는 schtasks 일회성 작업 경유 (release.md §3 Step 4)
# ⛔ Claude 세션 셸에서 python 직접 기동 금지 — 창 닫히면 트리 동반 급사 (세션 352~353 실사고)
```

**가장 안전한 옵션 = PC 재부팅** (zombie 위험 0, 추측 0). 재부팅 불가 시 schtasks 경유만.

## 핵심 경고 (release.md §5-1)

- 정적 분석(코드 읽기·git diff·pytest 통과)으로 "재시작 불필요" 단정 금지 — 디스크 self-consistency 만 증명, 부팅 프로세스 메모리와 무관.
- lazy import 도 호출처 모듈 본문은 부팅 때 옛 버전 상주 → 옛 함수는 새 import 를 애초에 호출 안 함.
- 거짓양성 차단: 라이브 결과만으론 신/구 구분 불가할 때 → prod PG 에 OLD/NEW 쿼리 직접 던져 비교([[live-verify]] 방법 2).

## Cross-link

- `.claude/rules/release.md` §2(4중/3중)·§3(처리)·§5-1(정적분석 함정)
- `.claude/skills/live-verify/SKILL.md` — 라이브 실측 3대 방법
