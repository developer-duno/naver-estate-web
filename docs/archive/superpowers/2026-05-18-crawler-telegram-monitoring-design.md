# 크롤링 모니터링 + 텔레그램 알림 시스템 — 설계

작성일: 2026-05-18

## 배경 (왜 만드는가)

네이버 부동산 크롤링 수집기는 집 서버에서 APScheduler 로 무인 운영된다.
수집기가 멈추거나(IP 차단·프로세스 다운) 데이터가 안 쌓여도 운영자가 모르고
지나칠 수 있다. 현재는 `/admin` 화면을 직접 열어봐야만 장애를 인지한다.

수집기·크롤링의 불량·오류를 **실시간으로** 잡아 운영자에게 텔레그램으로
즉시 알리는 시스템이 필요하다. 이메일은 메일함이 지저분해지고 확인이
느려서 부적합 — 텔레그램으로 통일한다.

## 목표

1. 크롤 작업 실패·마비·데이터 미축적·백엔드 다운을 자동 감지
2. 감지 즉시 운영자 텔레그램으로 알림
3. 같은 장애 반복 시 알림 폭주를 쿨다운으로 억제
4. 장애 해소 시 "복구됨" 알림 1회

## 범위

### 포함 (1차 — 핵심 3컴포넌트)

- 텔레그램 발송 모듈
- 백엔드 내부 감시자 (크롤 작업 실패·마비·데이터 미축적)
- 외부 감시자 (백엔드 프로세스 다운 — 기존 watchdog 확장)

### 제외 (후속 — YAGNI)

- `/admin` "수집 모니터" 화면 카드 — 텔레그램이 본체이므로 후순위.
  필요하면 별도 spec 으로 분리.
- 사용자(공인중개사) 대상 알림 — 기존 `services/email.py` 이메일 유지.
  운영 알림만 텔레그램.

## 사용자 결정 (브레인스토밍 확정)

| 질문 | 결정 |
|---|---|
| 감시 범위 | A(작업 단위 실패) + B(프로세스 다운) 둘 다 |
| 기존 이메일 | 공인중개사 승인·거부 메일은 이메일 유지, 운영 알림만 텔레그램 |
| 알림 신호 | 4종 모두 — 작업 실패 / 마비 / 데이터 미축적 / 프로세스 다운 |
| 중복 억제 | 같은 종류 장애는 쿨다운 (상태 변화만 통보) |
| 외부 감시자 | 기존 `scripts/startup_orchestrator.py` watchdog 에 텔레그램 훅 추가 |

## 아키텍처

```
[집 서버]
 ├ scripts/startup_orchestrator.py
 │   └ watchdog() (별도 프로세스, 30초 간격)
 │       ├ 백엔드 proc 종료 감지 (기존)
 │       ├ 백엔드 /health hang 감지 (신규 — proc 살아도 무응답)
 │       └ → 텔레그램 (scripts 내 발송 함수)
 │
 └ 백엔드 (uvicorn, APScheduler)
     ├ monitor job (interval 30분)         ← 신규
     │   ├ crawl_jobs 실패·stale 조회
     │   ├ data-freshness 신선도 조회
     │   ├ monitor_alerts 대조 (쿨다운)
     │   └ → services/telegram.py
     └ services/telegram.py                ← 신규
```

## 컴포넌트 1 — 텔레그램 발송 모듈

**파일:** `backend/services/telegram.py` (신규)

`services/email.py` 와 동일한 구조·철학.

```python
def send_telegram(text: str) -> bool:
    """텔레그램 봇으로 메시지 발송. 실패해도 예외 전파 안 함 (best-effort)."""
```

- 환경변수: `TELEGRAM_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- HTTP: `requests.post` 로 `https://api.telegram.org/bot<token>/sendMessage` 호출
  (텔레그램은 표준 HTTP — curl_cffi 불필요, `requests` 는 이미 설치됨)
- 타임아웃 10초, 미설정 또는 실패 시 로그만 남기고 조용히 skip
- 의존: 백엔드 모듈 (config·DB) 의존 없음 — 순수 함수

**인터페이스:** `send_telegram(text) -> bool`. 호출부는 성공 여부만 알면 됨.

## 컴포넌트 2 — 백엔드 내부 감시자

**파일:** `backend/crawler/monitor.py` (신규) + `crawler/scheduler.py` job 1개 등록
+ 마이그레이션 `V026__monitor_alerts.sql` + ORM 모델 `MonitorAlert`

APScheduler 에 `interval` job (30분) 로 등록. 활성화 토글 `MONITOR_ENABLED`.

### 감시 신호 (3종 — 백엔드 내부)

| 신호 | 판정 쿼리 | alert_key 예시 |
|---|---|---|
| 작업 실패 | `crawl_jobs.status='failed'` 최근 발생 | `crawl_failed:<job_type>` |
| 작업 마비 | `crawl_jobs.status='running' AND started_at < now()-1h` | `crawl_stale:<job_type>` |
| 데이터 미축적 | `/api/data-freshness` 신선도 로직 재사용 (red 등급) | `freshness:<종목>` |

기존 자산 재사용 — 신규 쿼리 최소화:
- `routers/admin/jobs.py` 의 crawl-failures 집계 로직
- `routers/admin/freshness.py` 의 신선도 판정 로직 (8종목 + 헛바퀴 감지)
- 이 로직들을 `monitor.py` 에서 함수로 호출. 라우터 핸들러에 인라인된
  로직이면 공용 함수로 추출(예: `db/` 또는 `services/` 로) 후 라우터와
  `monitor.py` 양쪽이 호출 — 이 추출 작업도 컴포넌트 2 범위에 포함.
  추출 시 기존 라우터 응답은 동일하게 유지(회귀 0).

### 쿨다운 (monitor_alerts 테이블)

감지 결과를 `monitor_alerts` 테이블과 대조:

- **새 장애** + 마지막 알림 6시간 경과 → 텔레그램 발송 + 행 갱신
- **같은 장애 지속** → 억제 (재발송 없음)
- **장애 해소** (이번 스캔에 없음) → "복구됨" 텔레그램 1회 + status='resolved'

쿨다운 시간 `MONITOR_COOLDOWN_HOURS` (기본 6) 환경변수.

### V026 마이그레이션 — monitor_alerts 테이블

```sql
CREATE TABLE monitor_alerts (
    id            BIGSERIAL    PRIMARY KEY,
    alert_key     VARCHAR(100) NOT NULL UNIQUE,  -- 장애 종류 식별자
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active / resolved
    detail        TEXT,         -- 마지막 감지 시 상세 (error_message 등)
    first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_notified TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

롤백: `DROP TABLE IF EXISTS monitor_alerts;`

## 컴포넌트 3 — 외부 감시자 (watchdog 텔레그램 훅)

**파일:** `scripts/startup_orchestrator.py` 의 `watchdog()` 함수 확장
+ `scripts/` 내 소형 텔레그램 발송 함수

watchdog 은 백엔드와 **별도 프로세스**라 `backend/services/telegram.py` 를
import 할 수 없다 (다른 cwd·sys.path). `scripts/` 안에 약 15줄짜리 발송
함수를 둔다 — `services/telegram.py` 와 로직 중복이나 프로세스 격리상 불가피.
환경변수는 `scripts/.env` 또는 `backend/.env` 를 명시 로드.

### watchdog 확장 (3가지 알림 지점)

1. 백엔드 proc 종료 감지 (현 라인 158) → "백엔드 다운 — 재시작 시도"
2. 재시작 실패 (현 라인 166) → "백엔드 재시작 실패"
3. 연속 5회 실패 (현 라인 168) → "백엔드 5회 연속 재시작 실패 — 점검 필요"

### 빈틈 보완 — health hang 감지

현 watchdog 은 `proc.poll()` 로 **프로세스 종료만** 본다. 프로세스는
살아있지만 `/health` 가 응답 안 하는(스케줄러 hang·교착) 경우는 못 잡는다.
watchdog 루프에 health URL 체크 추가 — `proc.poll()` 살아있어도 `/health`
가 연속 N회(예: 3회 = 90초) timeout 이면 다운으로 간주, 재시작 + 텔레그램.

## 데이터 흐름

### 정상 — 장애 없음
monitor job 30분마다 실행 → crawl_jobs·freshness 조회 → 장애 0건 →
monitor_alerts 의 기존 active 행 있으면 resolved 처리 + "복구됨" 발송 →
없으면 조용히 종료.

### 장애 발생
monitor job → 장애 감지 → monitor_alerts 조회 → 해당 alert_key 없음 →
INSERT (status=active, last_notified=now) → 텔레그램 "⚠ 크롤 작업 실패: ..." 발송.

### 장애 지속
monitor job → 같은 장애 재감지 → monitor_alerts 에 active 행 존재 +
last_notified 6시간 이내 → 억제 (발송 안 함, updated_at 만 갱신).

### 장애 해소
monitor job → 이번 스캔에 해당 장애 없음 → monitor_alerts active 행을
resolved 로 → 텔레그램 "✅ 복구됨: ..." 발송.

## 오류 처리

- `send_telegram` 실패 → 로그만, 예외 전파 안 함 (감시 job 자체는 계속)
- monitor job 내부 예외 → try/except 로 감싸 로그, 스케줄러 죽지 않게
- DB 조회 실패 → 해당 스캔 skip, 다음 주기 재시도
- watchdog 텔레그램 실패 → 재시작 로직에 영향 없음 (알림은 부가)

## 테스트 계획

- `backend/tests/test_telegram.py` — `send_telegram` (requests.post 모킹,
  성공·실패·미설정 케이스). `test_email.py` 패턴 답습.
- `backend/tests/test_monitor.py` — 감지 로직 + 쿨다운 (새 장애·지속·해소
  3시나리오, monitor_alerts SQLite 인메모리 DB).
- watchdog 텔레그램 훅은 스크립트 레벨이라 수동 검증 (테스트 봇으로
  실제 발송 1회 확인).

## 환경변수 추가

`backend/.env.example` 및 운영 `.env`:

```
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MONITOR_ENABLED=false
MONITOR_COOLDOWN_HOURS=6
```

## 후속 (1차 범위 밖)

- V026 마이그레이션 Supabase 수동 실행
- 운영자 텔레그램 봇 생성 + 토큰·chat_id 확보 (BotFather)
- 필요 시 `/admin` 수집 모니터 화면 카드 (별도 spec)
