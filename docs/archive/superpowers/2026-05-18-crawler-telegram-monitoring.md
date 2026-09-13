# 크롤링 모니터링 + 텔레그램 알림 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이버 크롤링 수집기 장애(작업 실패·마비·데이터 미축적·프로세스 다운)를 실시간 감지해 운영자 텔레그램으로 알린다.

**Architecture:** 백엔드 안에서 30분 주기 monitor job 이 crawl_jobs·데이터 신선도를 점검하고, `monitor_alerts` 테이블로 쿨다운하며 텔레그램 발송. 백엔드 프로세스 자체 다운은 별도 프로세스인 watchdog 이 감지·발송. 설계 = `docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md`.

**Tech Stack:** FastAPI + APScheduler + SQLAlchemy 2.0 + `requests`(텔레그램 HTTP) + pytest. 파이썬 표준 패턴 — 신규 의존성 0.

---

## File Structure

| 파일 | 역할 | 신규/수정 |
|---|---|---|
| `backend/services/telegram.py` | 텔레그램 메시지 발송 (best-effort) | 신규 |
| `backend/tests/test_telegram.py` | telegram 모듈 테스트 | 신규 |
| `backend/routers/admin/freshness.py` | `compute_freshness(db)` 순수 함수 추출 + 라우터는 그것 호출 | 수정 |
| `backend/db/migrations/V026__monitor_alerts.sql` | monitor_alerts 테이블 | 신규 |
| `backend/db/models.py` | `MonitorAlert` ORM 모델 | 수정 |
| `backend/crawler/monitor.py` | 감시 로직 + 쿨다운 + 텔레그램 발송 | 신규 |
| `backend/tests/test_monitor.py` | monitor 모듈 테스트 | 신규 |
| `backend/crawler/scheduler.py` | monitor job 등록 | 수정 |
| `backend/CLAUDE.md` | V026 마이그레이션 표 1행 | 수정 |
| `scripts/telegram_notify.py` | watchdog 용 소형 텔레그램 발송 | 신규 |
| `scripts/startup_orchestrator.py` | watchdog 텔레그램 훅 + health hang 감지 | 수정 |
| `backend/.env.example` | 환경변수 5종 추가 | 수정 |

커밋 단위 = Task 단위. 총 7 Task (각 1관심사·3파일 이하).

---

## Task 1: 텔레그램 발송 모듈

**Files:**
- Create: `backend/services/telegram.py`
- Test: `backend/tests/test_telegram.py`

`services/email.py` 의 best-effort 철학 답습 — 실패해도 예외 전파 안 함.

- [ ] **Step 1: 실패 테스트 작성** — `backend/tests/test_telegram.py`

```python
"""텔레그램 발송 서비스 테스트 — send_telegram
실행: python -m pytest tests/test_telegram.py -v
"""

from unittest.mock import MagicMock, patch

from services.telegram import send_telegram


@patch.dict("os.environ", {"TELEGRAM_ENABLED": "false"}, clear=False)
def test_send_telegram_disabled_returns_false():
    """TELEGRAM_ENABLED=false 면 발송 안 하고 False"""
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "", "TELEGRAM_CHAT_ID": "",
}, clear=False)
def test_send_telegram_no_credentials_returns_false():
    """토큰·chat_id 미설정이면 False"""
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_success(mock_post):
    """정상: requests.post 200 → True"""
    mock_post.return_value = MagicMock(status_code=200)
    assert send_telegram("테스트") is True
    mock_post.assert_called_once()
    url, kwargs = mock_post.call_args[0][0], mock_post.call_args[1]
    assert "bottok/sendMessage" in url
    assert kwargs["json"]["chat_id"] == "123"
    assert kwargs["json"]["text"] == "테스트"


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_http_error_returns_false(mock_post):
    """엣지: requests.post 가 예외 → False (예외 전파 안 함)"""
    mock_post.side_effect = ConnectionError("network down")
    assert send_telegram("테스트") is False


@patch.dict("os.environ", {
    "TELEGRAM_ENABLED": "true", "TELEGRAM_BOT_TOKEN": "tok", "TELEGRAM_CHAT_ID": "123",
}, clear=False)
@patch("services.telegram.requests.post")
def test_send_telegram_non_200_returns_false(mock_post):
    """엣지: 200 아닌 응답 → False"""
    mock_post.return_value = MagicMock(status_code=400)
    assert send_telegram("테스트") is False
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_telegram.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.telegram'`

- [ ] **Step 3: 구현** — `backend/services/telegram.py`

```python
"""운영 알림 텔레그램 발송 — best-effort (실패해도 예외 전파 안 함)

크롤링 수집기 장애 알림용. 사용자(공인중개사) 대상 알림은 services/email.py.
"""

import logging
import os

import requests

logger = logging.getLogger(__name__)


def send_telegram(text: str) -> bool:
    """텔레그램 봇으로 메시지 발송. 실패 시 False 반환 (예외 전파 금지).

    환경변수: TELEGRAM_ENABLED / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID.
    """
    if os.getenv("TELEGRAM_ENABLED", "false").lower() != "true":
        logger.info("[telegram] TELEGRAM_ENABLED 아님 — 발송 건너뜀")
        return False

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        logger.info("[telegram] BOT_TOKEN/CHAT_ID 미설정 — 발송 건너뜀")
        return False

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info("[telegram] 발송 성공")
            return True
        logger.warning("[telegram] 발송 실패 — status %s", resp.status_code)
        return False
    except Exception:
        logger.warning("[telegram] 발송 예외", exc_info=True)
        return False
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_telegram.py -v`
Expected: PASS — 5 케이스 전부

- [ ] **Step 5: ruff + 커밋**

```bash
cd backend && ruff check services/telegram.py tests/test_telegram.py
cd .. && git add backend/services/telegram.py backend/tests/test_telegram.py
git commit -m "feat(monitor): 텔레그램 발송 모듈 추가"
```

---

## Task 2: 신선도 로직 순수 함수 추출

**Files:**
- Modify: `backend/routers/admin/freshness.py`
- Test: `backend/tests/test_freshness_compute.py` (Create)

현재 `get_data_freshness` 라우터 핸들러에 신선도 계산 로직이 인라인돼 있다. `monitor.py` 가 재사용하려면 `db` 세션만 받는 순수 함수로 추출한다. **라우터 응답 JSON 은 100% 동일 유지** (회귀 0).

- [ ] **Step 1: 추출 후 동작 보존 테스트 작성** — `backend/tests/test_freshness_compute.py`

```python
"""compute_freshness 순수 함수 테스트 — 라우터에서 추출된 신선도 계산
실행: python -m pytest tests/test_freshness_compute.py -v
"""

from tests.conftest import TestSession
from routers.admin.freshness import compute_freshness


def test_compute_freshness_returns_items_and_generated_at():
    """정상: compute_freshness 가 items 리스트 + generated_at 반환"""
    db = TestSession()
    try:
        result = compute_freshness(db)
        assert "items" in result
        assert "generated_at" in result
        assert isinstance(result["items"], list)
        # FRESHNESS_ITEMS 8종목
        assert len(result["items"]) == 8
    finally:
        db.close()


def test_compute_freshness_empty_db_status_unknown():
    """엣지: 빈 DB 면 last_updated None → status unknown"""
    db = TestSession()
    try:
        result = compute_freshness(db)
        for item in result["items"]:
            assert item["status"] in ("unknown", "red")
            assert "key" in item and "label" in item
    finally:
        db.close()
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_freshness_compute.py -v`
Expected: FAIL — `ImportError: cannot import name 'compute_freshness'`

- [ ] **Step 3: 추출 구현** — `backend/routers/admin/freshness.py`

`get_data_freshness` 핸들러 본문(라인 82~160)을 그대로 `compute_freshness(db)` 함수로 옮기고, 핸들러는 그것을 호출. `_to_utc`/`_status`/`_last_job`/`FRESHNESS_ITEMS` 는 기존 그대로 사용.

라인 76~161 을 아래로 교체:

```python
def compute_freshness(db: Session) -> dict:
    """8개 종목 신선도 + 헛바퀴 감지 신호 계산 (DB 세션만 의존).

    라우터·monitor 양쪽이 호출. 응답 형식은 기존 /data-freshness 와 동일.
    """
    now = datetime.now(timezone.utc)

    # 종목별 (last_updated, count) — 1쿼리씩
    raw: dict[str, tuple] = {
        "complexes": db.execute(select(func.max(Complex.last_crawled_at), func.count(Complex.complex_no))).one(),
        "articles": db.execute(select(func.max(Article.updated_at), func.count(Article.article_no))).one(),
        "complex_price_history": db.execute(select(func.max(ComplexPriceHistory.recorded_at), func.count(ComplexPriceHistory.id))).one(),
        "unsold": db.execute(select(func.max(UnsoldHistory.recorded_at), func.count(UnsoldHistory.id))).one(),
        "air_quality": db.execute(select(func.max(Infra.air_updated_at), func.count(Infra.apartment_id).filter(Infra.air_updated_at.isnot(None)))).one(),
        "childcare": db.execute(
            select(
                func.max(CrawlJob.completed_at),
                func.coalesce(func.max(CrawlJob.processed_items), 0),
            ).where(
                (CrawlJob.scheduler_job_id == "collect_childcare") & (CrawlJob.status == "completed"),
            )
        ).one(),
        "crime_stats": db.execute(select(func.max(Infra.crime_updated_at), func.count(Infra.apartment_id).filter(Infra.crime_score.isnot(None)))).one(),
        "public_trades": db.execute(select(func.max(MBTrade.recorded_at), func.count(MBTrade.id))).one(),
    }

    items = []
    for meta in FRESHNESS_ITEMS:
        key = meta["key"]
        last_raw, count = raw[key]
        last_updated = _to_utc(last_raw)
        sched_id = meta.get("scheduler_job_id")

        job = _last_job(db, sched_id) if sched_id else None
        job_start = job.get("_started_at_dt") if job else None

        new_rows: int | None = None
        new_rows_kind = meta.get("new_rows_kind")
        if job_start and new_rows_kind == "created_at" and key == "articles":
            new_rows = int(db.execute(
                select(func.count(Article.article_no)).where(Article.created_at >= job_start)
            ).scalar() or 0)
        elif job_start and new_rows_kind == "created_at" and key == "complexes":
            new_rows = int(db.execute(
                select(func.count(Complex.complex_no)).where(Complex.created_at >= job_start)
            ).scalar() or 0)
        elif job_start and new_rows_kind == "recorded_at" and key == "complex_price_history":
            new_rows = int(db.execute(
                select(func.count(ComplexPriceHistory.id)).where(ComplexPriceHistory.recorded_at >= job_start)
            ).scalar() or 0)

        status = _status(last_updated, meta["expected_interval_seconds"], now)
        spinning = False
        if job is not None:
            if job["processed_items"] == 0 and job["total_items"] > 0:
                spinning = True
            if new_rows is not None and new_rows == 0 and meta.get("new_rows_expected", False):
                spinning = True
        if spinning and status in ("green", "yellow"):
            status = "red"

        last_job_out = None
        if job is not None:
            last_job_out = {k: v for k, v in job.items() if not k.startswith("_")}

        items.append({
            "key": key,
            "label": meta["label"],
            "count": int(count or 0),
            "last_updated": last_updated.isoformat() if last_updated else None,
            "expected_interval_seconds": meta["expected_interval_seconds"],
            "status": status,
            "spinning": spinning,
            "last_job": last_job_out,
            "new_rows": new_rows,
        })

    return {"items": items, "generated_at": now.isoformat()}


@router.get("/data-freshness")
def get_data_freshness(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_admin_user),
):
    """8개 종목 신선도 + 헛바퀴 감지 신호 일괄 반환."""
    return compute_freshness(db)
```

- [ ] **Step 4: 테스트 통과 + 기존 freshness 테스트 회귀 확인**

Run: `cd backend && python -m pytest tests/test_freshness_compute.py tests/ -k freshness -v`
Expected: PASS — 신규 2 + 기존 freshness 테스트 전부

- [ ] **Step 5: ruff + 커밋**

```bash
cd backend && ruff check routers/admin/freshness.py tests/test_freshness_compute.py
cd .. && git add backend/routers/admin/freshness.py backend/tests/test_freshness_compute.py
git commit -m "refactor(monitor): 신선도 계산 compute_freshness 순수 함수 추출"
```

---

## Task 3: monitor_alerts 마이그레이션 + ORM 모델

**Files:**
- Create: `backend/db/migrations/V026__monitor_alerts.sql`
- Modify: `backend/db/models.py`, `backend/CLAUDE.md`

- [ ] **Step 1: 마이그레이션 SQL 작성** — `backend/db/migrations/V026__monitor_alerts.sql`

```sql
-- V026: monitor_alerts — 크롤링 모니터 알림 쿨다운 상태 테이블
-- monitor job 이 감지한 장애의 활성·해소 상태를 추적해 텔레그램 중복 발송 억제.
-- alert_key 로 장애 종류 식별 (예: "crawl_failed:crawl_articles", "freshness:articles").

CREATE TABLE IF NOT EXISTS monitor_alerts (
    id            BIGSERIAL    PRIMARY KEY,
    alert_key     VARCHAR(100) NOT NULL UNIQUE,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active / resolved
    detail        TEXT,
    first_seen    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_notified TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 역방향 (롤백):
-- DROP TABLE IF EXISTS monitor_alerts;
```

- [ ] **Step 2: ORM 모델 추가** — `backend/db/models.py`

`CrawlJob` 클래스(라인 156~170 영역) 뒤에 추가:

```python
class MonitorAlert(Base):
    """크롤링 모니터 알림 쿨다운 상태 (V026)."""

    __tablename__ = "monitor_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    detail: Mapped[str | None] = mapped_column(Text)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_notified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
```

- [ ] **Step 3: 모델 import 정상 확인 (테스트 DB 생성 검증)**

Run: `cd backend && python -m pytest tests/test_telegram.py -v`
Expected: PASS — conftest 가 `Base.metadata.create_all` 시 monitor_alerts 포함 생성, import 에러 0

- [ ] **Step 4: CLAUDE.md V026 행 추가** — `backend/CLAUDE.md`

DB 마이그레이션 표에서 `| V025 | ... |` 행 아래 추가, 폴더 범위 표기 갱신:

```
| V026 | monitor_alerts 테이블 (크롤링 모니터) | 미실행 |
```
그리고 `` `V000__` ~ `V025__` `` → `` `V000__` ~ `V026__` ``

- [ ] **Step 5: 커밋**

```bash
cd .. && git add backend/db/migrations/V026__monitor_alerts.sql backend/db/models.py backend/CLAUDE.md
git commit -m "feat(monitor): monitor_alerts 테이블 스키마 추가"
```

---

## Task 4: monitor 감지 로직 — crawl_jobs 점검

**Files:**
- Create: `backend/crawler/monitor.py`
- Test: `backend/tests/test_monitor.py`

장애 감지 함수만 먼저 (쿨다운·발송은 Task 5). 순수 함수 — `db` 받아 장애 dict 리스트 반환.

- [ ] **Step 1: 감지 테스트 작성** — `backend/tests/test_monitor.py`

```python
"""크롤링 모니터 테스트 — 장애 감지 + 쿨다운
실행: python -m pytest tests/test_monitor.py -v
"""

from datetime import datetime, timedelta, timezone

from db.models import CrawlJob
from tests.conftest import TestSession
from crawler.monitor import detect_issues


def _utcnow():
    return datetime.now(timezone.utc)


def test_detect_issues_empty_db_no_issues():
    """정상: 빈 DB 면 장애 0건"""
    db = TestSession()
    try:
        issues = detect_issues(db)
        assert issues == []
    finally:
        db.close()


def test_detect_issues_failed_job():
    """정상: status=failed 작업이 있으면 crawl_failed 장애 1건"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_failed:complex_articles" in keys
    finally:
        db.close()


def test_detect_issues_stale_running_job():
    """정상: running 상태로 1시간 넘게 멈춘 작업 → crawl_stale 장애"""
    db = TestSession()
    try:
        old = _utcnow() - timedelta(hours=2)
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=old, created_at=old,
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_stale:crawl_details" in keys
    finally:
        db.close()


def test_detect_issues_recent_running_not_stale():
    """엣지: 방금 시작한 running 작업은 마비 아님 (장애 아님)"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="crawl_details", status="running",
            started_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        issues = detect_issues(db)
        keys = [i["alert_key"] for i in issues]
        assert "crawl_stale:crawl_details" not in keys
    finally:
        db.close()
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_monitor.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'crawler.monitor'`

- [ ] **Step 3: 감지 함수 구현** — `backend/crawler/monitor.py`

```python
"""크롤링 수집기 모니터 — 장애 감지 + 쿨다운 + 텔레그램 알림.

APScheduler 의 monitor job 이 주기적으로 run_monitor() 를 호출한다.
감지 신호 3종: 작업 실패 / 작업 마비 / 데이터 미축적.
설계 = docs/superpowers/specs/2026-05-18-crawler-telegram-monitoring-design.md
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, func, select

from db.models import CrawlJob
from routers.admin.freshness import compute_freshness

logger = logging.getLogger(__name__)

# 작업 마비 판정 — running 인 채 이 시간 넘으면 stale
_STALE_HOURS = 1
# 실패 작업 조회 윈도 — 최근 이 시간 내 failed 만
_FAILED_WINDOW_HOURS = 24


def detect_issues(db) -> list[dict]:
    """현재 크롤링 장애를 감지해 리스트로 반환.

    각 항목: {"alert_key": str, "detail": str}
    alert_key 는 장애 종류 식별자 — monitor_alerts 쿨다운 키.
    """
    now = datetime.now(timezone.utc)
    issues: list[dict] = []

    # 1. 작업 실패 — 최근 24h failed job_type 별
    cutoff = now - timedelta(hours=_FAILED_WINDOW_HOURS)
    failed = db.execute(
        select(
            CrawlJob.job_type,
            func.count(CrawlJob.id).label("cnt"),
            func.max(CrawlJob.error_message).label("err"),
        )
        .where(and_(CrawlJob.status == "failed", CrawlJob.created_at >= cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in failed:
        issues.append({
            "alert_key": f"crawl_failed:{row.job_type}",
            "detail": f"{row.job_type} 작업 {row.cnt}건 실패 — {(row.err or '')[:200]}",
        })

    # 2. 작업 마비 — running 인 채 _STALE_HOURS 초과
    stale_cutoff = now - timedelta(hours=_STALE_HOURS)
    stale = db.execute(
        select(CrawlJob.job_type, func.count(CrawlJob.id).label("cnt"))
        .where(and_(CrawlJob.status == "running", CrawlJob.started_at < stale_cutoff))
        .group_by(CrawlJob.job_type)
    ).all()
    for row in stale:
        issues.append({
            "alert_key": f"crawl_stale:{row.job_type}",
            "detail": f"{row.job_type} 작업 {row.cnt}건이 1시간 넘게 running 상태 — 마비 의심",
        })

    # 3. 데이터 미축적 — 신선도 red 종목
    try:
        fresh = compute_freshness(db)
        for item in fresh["items"]:
            if item["status"] == "red":
                issues.append({
                    "alert_key": f"freshness:{item['key']}",
                    "detail": f"{item['label']} 데이터 미축적 (신선도 red, 마지막 갱신 {item['last_updated']})",
                })
    except Exception:
        logger.warning("[monitor] 신선도 계산 실패 — 이번 스캔 skip", exc_info=True)

    return issues
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_monitor.py -v`
Expected: PASS — 4 케이스 전부

- [ ] **Step 5: ruff + 커밋**

```bash
cd backend && ruff check crawler/monitor.py tests/test_monitor.py
cd .. && git add backend/crawler/monitor.py backend/tests/test_monitor.py
git commit -m "feat(monitor): 크롤 작업 실패·마비·미축적 감지 로직"
```

---

## Task 5: 쿨다운 + 텔레그램 발송 (run_monitor)

**Files:**
- Modify: `backend/crawler/monitor.py`
- Test: `backend/tests/test_monitor.py`

`detect_issues` 결과를 `monitor_alerts` 와 대조해 신규/지속/해소 판정 후 텔레그램 발송.

- [ ] **Step 1: 쿨다운 테스트 추가** — `backend/tests/test_monitor.py`

파일 상단 import 에 `MonitorAlert` 추가 (`from db.models import CrawlJob` →
`from db.models import CrawlJob, MonitorAlert`), 그리고 파일 끝에 아래 추가:

```python
from unittest.mock import patch
from crawler.monitor import run_monitor


def test_run_monitor_new_issue_sends_telegram():
    """정상: 새 장애 → 텔레그램 발송 + monitor_alerts active 행 생성"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "active"
        assert alert.last_notified is not None
    finally:
        db.close()


def test_run_monitor_same_issue_within_cooldown_suppressed():
    """정상: 같은 장애가 쿨다운 내 재발 → 텔레그램 재발송 안 함"""
    db = TestSession()
    try:
        db.add(CrawlJob(
            job_type="complex_articles", status="failed",
            error_message="네이버 502", started_at=_utcnow(),
            completed_at=_utcnow(), created_at=_utcnow(),
        ))
        # 방금 알림 보낸 active 행 — 쿨다운 중
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow(),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert not mock_tg.called
    finally:
        db.close()


def test_run_monitor_resolved_issue_sends_recovery():
    """정상: 이전 active 장애가 이번 스캔에 없음 → 복구 알림 + resolved"""
    db = TestSession()
    try:
        # 장애 원인(failed job) 없음. active 행만 남아있음
        db.add(MonitorAlert(
            alert_key="crawl_failed:complex_articles", status="active",
            detail="이전", last_notified=_utcnow() - timedelta(hours=12),
        ))
        db.commit()
        with patch("crawler.monitor.send_telegram", return_value=True) as mock_tg:
            run_monitor(db)
        assert mock_tg.called  # 복구 알림
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == "crawl_failed:complex_articles")
        ).scalar_one()
        assert alert.status == "resolved"
    finally:
        db.close()
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `cd backend && python -m pytest tests/test_monitor.py -k run_monitor -v`
Expected: FAIL — `ImportError: cannot import name 'run_monitor'`

- [ ] **Step 3: run_monitor 구현** — `backend/crawler/monitor.py`

import 블록에 추가:

```python
from db.models import CrawlJob, MonitorAlert
from services.telegram import send_telegram
from utils import utcnow
```

파일 끝에 추가:

```python
def _cooldown_hours() -> int:
    """쿨다운 시간 (기본 6h)."""
    return int(os.getenv("MONITOR_COOLDOWN_HOURS", "6"))


def run_monitor(db) -> None:
    """장애 감지 → monitor_alerts 대조 → 쿨다운 적용 → 텔레그램 발송.

    APScheduler monitor job 이 주기적으로 호출. 예외는 자체 흡수.
    """
    try:
        issues = detect_issues(db)
    except Exception:
        logger.warning("[monitor] 장애 감지 실패", exc_info=True)
        return

    now = utcnow()
    current_keys = {i["alert_key"] for i in issues}
    cooldown = timedelta(hours=_cooldown_hours())

    # 1. 현재 장애 — 신규 발송 / 쿨다운 억제
    for issue in issues:
        key = issue["alert_key"]
        alert = db.execute(
            select(MonitorAlert).where(MonitorAlert.alert_key == key)
        ).scalar_one_or_none()

        if alert is None:
            # 신규 장애 — 발송 + 행 생성
            send_telegram(f"⚠ 크롤링 장애\n{issue['detail']}")
            db.add(MonitorAlert(
                alert_key=key, status="active",
                detail=issue["detail"], last_notified=now,
            ))
        elif alert.status == "resolved":
            # 해소됐던 장애 재발 — 발송 + 재활성화
            send_telegram(f"⚠ 크롤링 장애 재발\n{issue['detail']}")
            alert.status = "active"
            alert.detail = issue["detail"]
            alert.last_notified = now
        else:
            # 진행 중 장애 — 쿨다운 확인
            last = alert.last_notified
            if last is None or (now - last) >= cooldown:
                send_telegram(f"⚠ 크롤링 장애 지속\n{issue['detail']}")
                alert.last_notified = now
            alert.detail = issue["detail"]

    # 2. 해소된 장애 — 이번 스캔에 없는 active 행
    actives = db.execute(
        select(MonitorAlert).where(MonitorAlert.status == "active")
    ).scalars().all()
    for alert in actives:
        if alert.alert_key not in current_keys:
            send_telegram(f"✅ 크롤링 복구\n{alert.alert_key} — 정상으로 돌아왔습니다.")
            alert.status = "resolved"

    db.commit()
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd backend && python -m pytest tests/test_monitor.py -v`
Expected: PASS — 감지 4 + 쿨다운 3 = 7 케이스

- [ ] **Step 5: ruff + 커밋**

```bash
cd backend && ruff check crawler/monitor.py tests/test_monitor.py
cd .. && git add backend/crawler/monitor.py backend/tests/test_monitor.py
git commit -m "feat(monitor): 쿨다운 + 텔레그램 발송 run_monitor"
```

---

## Task 6: 스케줄러 monitor job 등록

**Files:**
- Modify: `backend/crawler/scheduler.py`, `backend/.env.example`

- [ ] **Step 1: 스케줄러 job 등록** — `backend/crawler/scheduler.py`

환경변수 블록(라인 36 `COMPLEX_DETAIL_BATCH_SIZE` 뒤)에 추가:

```python
MONITOR_ENABLED = os.getenv("MONITOR_ENABLED", "false").lower() == "true"
MONITOR_INTERVAL_MIN = int(os.getenv("MONITOR_INTERVAL_MIN", "30"))
```

`create_scheduler()` 안, `global _scheduler` 직전(라인 239 영역)에 job 등록 블록 추가:

```python
    # L. 크롤링 모니터 — N분마다 장애 감지 + 텔레그램 알림
    if MONITOR_ENABLED:
        from crawler.monitor import run_monitor_job

        scheduler.add_job(
            run_monitor_job,
            "interval",
            minutes=MONITOR_INTERVAL_MIN,
            id="crawler_monitor",
            name="크롤링 모니터",
            max_instances=1,
            misfire_grace_time=600,
        )
        logger.info("크롤링 모니터 활성화: %d분 간격", MONITOR_INTERVAL_MIN)
```

- [ ] **Step 2: run_monitor_job 래퍼 추가** — `backend/crawler/monitor.py`

`run_monitor(db)` 는 db 세션을 인자로 받지만 스케줄러 job 은 인자 없이 호출된다. DB 세션을 열고 닫는 래퍼를 파일 끝에 추가:

```python
def run_monitor_job() -> None:
    """APScheduler 진입점 — DB 세션 열고 run_monitor 호출."""
    from db.database import SessionLocal

    db = SessionLocal()
    try:
        run_monitor(db)
    except Exception:
        logger.warning("[monitor] job 실행 실패", exc_info=True)
    finally:
        db.close()
```

- [ ] **Step 3: .env.example 환경변수 추가** — `backend/.env.example`

파일 끝에 추가:

```
# 크롤링 모니터 + 텔레그램 알림
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MONITOR_ENABLED=false
MONITOR_INTERVAL_MIN=30
MONITOR_COOLDOWN_HOURS=6
```

- [ ] **Step 4: 스케줄러 import·구문 검증**

Run: `cd backend && python -c "from crawler.scheduler import create_scheduler; from crawler.monitor import run_monitor_job; print('ok')"`
Expected: `ok` — import 에러 0

- [ ] **Step 5: ruff + 커밋**

```bash
cd backend && ruff check crawler/scheduler.py crawler/monitor.py
cd .. && git add backend/crawler/scheduler.py backend/crawler/monitor.py backend/.env.example
git commit -m "feat(monitor): 스케줄러 monitor job 등록 + 환경변수"
```

---

## Task 7: 외부 watchdog 텔레그램 훅 + health hang 감지

**Files:**
- Create: `scripts/telegram_notify.py`
- Modify: `scripts/startup_orchestrator.py`

watchdog 은 백엔드와 별도 프로세스 — `backend/services/telegram.py` 를 import 못 함. `scripts/` 안에 소형 발송 함수를 둔다. 테스트는 스크립트 레벨이라 수동 검증(설계 §테스트 계획).

- [ ] **Step 1: scripts 텔레그램 발송 함수** — `scripts/telegram_notify.py`

```python
"""watchdog 용 소형 텔레그램 발송 — backend/services/telegram.py 와 동일 로직.

watchdog 은 백엔드와 별도 프로세스라 backend 모듈 import 불가 → 격리 복제.
환경변수는 backend/.env 를 명시 로드.
"""

import logging
import os

import requests
from dotenv import load_dotenv

# backend/.env 명시 로드 (watchdog cwd 는 scripts/)
_ENV = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(_ENV)

logger = logging.getLogger("startup")


def notify(text: str) -> bool:
    """텔레그램 발송. 실패해도 예외 전파 안 함."""
    if os.getenv("TELEGRAM_ENABLED", "false").lower() != "true":
        return False
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")
    if not token or not chat_id:
        return False
    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text},
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        logger.warning("[watchdog] 텔레그램 발송 실패", exc_info=True)
        return False
```

- [ ] **Step 2: watchdog health hang 감지 + 텔레그램 훅** — `scripts/startup_orchestrator.py`

import 블록(라인 17 `import urllib.request` 뒤)에 추가:

```python
from telegram_notify import notify
```

`watchdog()` 함수(라인 149~179)를 아래로 교체:

```python
def watchdog(backend_proc: subprocess.Popen, tunnel_proc: subprocess.Popen):
    """프로세스 생존 감시 + 자동 재시작. 다운 감지 시 텔레그램 알림."""
    logger.info("Watchdog 시작 (30초 간격 감시)")
    backend_fail_count = 0
    health_fail_count = 0

    while True:
        time.sleep(WATCHDOG_INTERVAL)

        # 백엔드 다운 판정: 프로세스 종료 OR health 무응답 연속 3회
        proc_dead = backend_proc.poll() is not None
        health_ok = _check_health()
        if health_ok:
            health_fail_count = 0
        else:
            health_fail_count += 1

        if proc_dead or health_fail_count >= 3:
            backend_fail_count += 1
            reason = "프로세스 종료" if proc_dead else "health 무응답 (hang)"
            logger.warning(f"백엔드 다운 감지 ({reason}) — 재시작 (연속 실패: {backend_fail_count})")
            notify(f"⚠ 백엔드 다운 ({reason}) — 재시작 시도 중")

            _kill_port(BACKEND_PORT)
            backend_proc = start_backend()
            health_fail_count = 0
            if not wait_for_backend():
                logger.error("백엔드 재시작 실패")
                notify("⚠ 백엔드 재시작 실패")
                if backend_fail_count >= 5:
                    logger.error("연속 5회 재시작 실패 — 60초 대기 후 재시도")
                    notify("\U0001f6a8 백엔드 5회 연속 재시작 실패 — 점검 필요")
                    time.sleep(60)
                    backend_fail_count = 0
                continue
            backend_fail_count = 0
            notify("✅ 백엔드 복구 완료")
        else:
            backend_fail_count = 0

        # 터널 체크
        if tunnel_proc.poll() is not None:
            logger.warning("터널 프로세스 종료 감지 — 재시작")
            notify("⚠ Cloudflare 터널 다운 — 재시작 시도")
            tunnel_proc = start_tunnel()


def _check_health() -> bool:
    """백엔드 /health 응답 확인 (3초 타임아웃)."""
    try:
        resp = urllib.request.urlopen(
            f"http://localhost:{BACKEND_PORT}/health", timeout=3
        )
        return resp.status == 200
    except Exception:
        return False
```

- [ ] **Step 3: 스크립트 구문 검증**

Run: `cd scripts && python -c "import ast; ast.parse(open('startup_orchestrator.py', encoding='utf-8').read()); ast.parse(open('telegram_notify.py', encoding='utf-8').read()); print('ok')"`
Expected: `ok` — 구문 에러 0

- [ ] **Step 4: 커밋**

```bash
cd .. && git add scripts/telegram_notify.py scripts/startup_orchestrator.py
git commit -m "feat(monitor): watchdog 텔레그램 훅 + health hang 감지"
```

---

## 최종 검증 (전체 Task 완료 후)

- [ ] **BE 회귀**: `cd backend && ruff check . && python -m pytest --tb=short -q`
  Expected: ruff 통과, 기존 620 + 신규(telegram 5 + freshness 2 + monitor 7 = 14) ≈ 634 passed
- [ ] **PR 생성**: 7 커밋 묶어 PR. 본문에 설계 문서 링크 + 후속(V026 수동 실행·봇 토큰 발급) 명시.

## 후속 (사용자 — 1차 범위 밖)

- BotFather 로 텔레그램 봇 생성 → `TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` 확보
- V026 마이그레이션 Supabase 수동 실행
- `backend/.env` 에 `TELEGRAM_ENABLED=true`·`MONITOR_ENABLED=true` + 토큰 설정
- 집 서버 watchdog(`startup_orchestrator.py`) 재시작 (코드 갱신 반영)
