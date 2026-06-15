---
name: live-verify
description: 코드 변경이 라이브 backend 에 실제 반영됐는지, 새 기능이 실제 동작하는지를 라이브 실측으로만 판정한다(정적분석 금지). 자율발동 = "라이브 확인", "실제 동작하나", "재시작 반영됐나", "정적분석 말고 실측", 그리고 "재시작 불필요"를 정적분석으로 단정하려는 순간.
---

# live-verify — 라이브 실측으로만 판정

코드 변경의 라이브 반영·실제 동작을 판정할 때, 정적 분석이 아니라 라이브 실측을 ground truth 로 삼는다. release.md §5-1 의 "정적분석 금지" 원칙을 일반화한 skill.

## When to Use

- "라이브 확인", "실제 동작하나", "재시작 반영됐나"
- **"재시작 불필요" 를 코드 읽기·pytest 로 단정하려는 순간** ← 세션 257·301 사고 지점

## 핵심 안티패턴 (금지)

- **pytest 통과 = 라이브 증명 아님** — pytest 는 디스크 코드 self-consistency 만 검증(fresh import + fresh scheduler). 부팅 프로세스 메모리와 무관.
- **lazy import = 안심 아님** — `함수 내부 from X import` 는 X 만 지연. 그 import 를 담은 함수 정의는 부팅 때 옛 버전 상주.
- **git diff 깔끔 = 라이브 새 코드 아님** — 세션 301: 라이브 PID 가 머지 19h 전 부팅 = 옛 코드 상주(zombie).

## 라이브 실측 3대 방법

### 1️⃣ 살아있는 엔드포인트 호출 → 응답으로 판정

`.env SUPABASE_JWT_SECRET` 로 admin 토큰(HS256, aud=authenticated, role 클레임) 발급 후 **localhost:8002 직접 호출**(api.2u.pe.kr 는 Cloudflare 1010 봇차단).

```bash
curl -s http://localhost:8002/api/admin/scheduler-status -H "Authorization: Bearer <TOKEN>"
```

응답값(`jobs[].schedule`·배치 크기 등)이 PR 새값이면 "새 코드 상주" 확정, 옛값이면 zombie. 노하우: 빈 body 422 가 새 필수필드를 요구하면 새 코드 상주 입증(세션 307).

### 2️⃣ prod PG 직접 실측 (거짓양성 제거)

라이브 응답이 "우연히 같은 결과"일 가능성 제거. `SessionLocal` 읽기전용 스크립트로 같은 PG·같은 데이터에 OLD/NEW 쿼리를 직접 던져 비교.

```bash
cd backend && PYTHONPATH=. python <읽기전용 스크립트>
# ⚠ 임시 uvicorn 금지 — lifespan 이 스케줄러를 무조건 start
```

OLD/NEW 결과가 다르면 "디스크 코드는 새 버전 정상". 라이브 응답이 OLD 결과면 zombie 확정. 패턴 예시: 정렬 PR 이면 `OLD ORDER BY` 와 `NEW ORDER BY` 를 같은 PG 데이터에 던져 결과 배열을 비교 (예: 옛 정렬 `[0,0,0,0,0]` vs 새 정렬 `[1122,1277,...]`). 스크립트는 1회용이라 글로벌 메모리 `memory/scripts/` 에 보존(repo 비추적).

### 3️⃣ backend.log / orchestrator.pid 부팅 시각

```bash
netstat -ano | grep ":8002" | grep LISTENING   # PID — ground truth
head -1 scripts/backend.log                      # 부팅 시각
stat -c '%y' scripts/orchestrator.pid
```

부팅 시각이 PR 머지 시각 이후면 새 코드, 이전이면 zombie.

## 판정 요약

| 방법 | 판정 |
|---|---|
| 엔드포인트 호출 | 응답값이 새값 → ✅ (부팅 시각 추가 확인) |
| prod PG 실측 | NEW 결과가 OLD 와 다름 → 디스크 정상, 라이브가 OLD → zombie |
| 부팅 시각 | 머지 시각 이후 → ✅ |

정적분석(코드·pytest)은 보조일 뿐, 라이브 판정이 ground truth.

## Cross-link

- `.claude/rules/release.md` §5-1 (정적분석 함정)
- `.claude/skills/release-verify/SKILL.md` — PR 머지 후 zombie cross-check
- zombie 처리 절차 = release-verify §zombie 발견 시 처리
