"""관리자 '수집 실행' 버튼 백그라운드화 (세션 420, 사장님 결정 2026-09-26).

POST /api/admin/collect/{name} 은 수집기를 데몬 스레드로 시작하고 곧바로 started 를 준다.
- B1 요청이 수집기 끝을 기다리지 않는다
- B2 같은 수집기가 이 프로세스에서 돌거나(수동) crawl_jobs 에 running 이면(스케줄러) 409
- B3 스레드가 끝나면(성공·예외 모두) 플래그가 풀린다, 성공이면 신선도 캐시 무효화
- B5 소급 배치가 우리 하루 예산 사전 확인에 걸려 멈추면 completed + 우리말 사유

스레드 시험은 흐른 시간이 아니라 Event·join 으로 끝을 기다린다(flaky-time-check).
실행: python -m pytest tests/test_admin_collect_background.py -v
"""

import inspect
import logging
import threading
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import jwt
import pytest

from db.models import Complex, CrawlJob, UserProfile
from routers.admin import collect as collect_mod

JWT_SECRET = "test-secret-key-for-testing-only"
BUSY_WORDS = "이미 돌고 있어요 — 끝난 뒤 다시 눌러 주세요"


def _auth(uid):
    token = jwt.encode(
        {"sub": uid, "aud": "authenticated", "email": f"{uid}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )
    return {"Authorization": f"Bearer {token}"}


def _admin(db, uid):
    db.add(UserProfile(user_id=uid, email=f"{uid}@test.com", role="admin", status="approved"))
    db.commit()


def _join_collector(name):
    for t in threading.enumerate():
        if t.name == f"admin-collect-{name}":
            t.join(timeout=10)
            assert not t.is_alive(), f"{name} 수집 스레드가 끝나지 않았다"


@pytest.fixture(autouse=True)
def _clear_running_flags():
    with collect_mod._collect_lock:
        collect_mod._collect_running.clear()
    yield
    with collect_mod._collect_lock:
        collect_mod._collect_running.clear()


class _HeldCollector:
    """release 가 풀릴 때까지 붙잡혀 있는 가짜 수집기 (끝을 Event 로 알린다)."""

    def __init__(self):
        self.entered = threading.Event()
        self.release = threading.Event()
        self.finished = threading.Event()
        self.calls = 0

    def __call__(self):
        self.calls += 1
        self.entered.set()
        # 안전망 timeout — 판정은 흐른 시간이 아니라 finished 여부로 한다
        self.release.wait(timeout=10)
        self.finished.set()


def test_b1_request_returns_started_while_collector_still_running(client, db):
    """① 수집기가 붙잡혀 있는 동안에도 응답이 곧바로 started 로 온다 — 요청이 안 막힌다."""
    _admin(db, "bg1")
    held = _HeldCollector()
    try:
        with patch.object(collect_mod, "_get_collector", return_value=held):
            res = client.post("/api/admin/collect/kapt-costs", headers=_auth("bg1"))
        assert res.status_code == 200
        assert res.json() == {"status": "started", "collector": "kapt-costs"}
        # 응답을 받은 시점에 수집기는 아직 안 끝났다 (동기였다면 finished 가 이미 set)
        assert held.entered.wait(timeout=10)
        assert not held.finished.is_set()
    finally:
        held.release.set()
        _join_collector("kapt-costs")
    assert held.finished.is_set()


def test_b2_second_request_while_held_is_409_then_b3_released_allows_restart(client, db):
    """② 붙잡힌 동안 같은 수집기 두 번째 요청 → 409 / ③ 끝난 뒤엔 다시 시작된다."""
    _admin(db, "bg2")
    held = _HeldCollector()
    with patch.object(collect_mod, "_get_collector", return_value=held):
        first = client.post("/api/admin/collect/metrics", headers=_auth("bg2"))
        assert first.status_code == 200
        assert held.entered.wait(timeout=10)

        second = client.post("/api/admin/collect/metrics", headers=_auth("bg2"))
        assert second.status_code == 409
        assert second.json()["detail"] == BUSY_WORDS

        held.release.set()
        _join_collector("metrics")
        with collect_mod._collect_lock:
            assert "metrics" not in collect_mod._collect_running

        third = client.post("/api/admin/collect/metrics", headers=_auth("bg2"))
        _join_collector("metrics")
    assert third.status_code == 200
    assert third.json()["status"] == "started"
    assert held.calls == 2  # 409 는 수집기를 부르지 않았다


def test_b2_other_collector_is_not_blocked(client, db):
    """다른 수집기는 막지 않는다 — 플래그는 수집기 이름별이다."""
    _admin(db, "bg3")
    held = _HeldCollector()
    try:
        with patch.object(collect_mod, "_get_collector", return_value=held):
            assert client.post("/api/admin/collect/emergency", headers=_auth("bg3")).status_code == 200
            assert held.entered.wait(timeout=10)
            other = client.post("/api/admin/collect/crime-stats", headers=_auth("bg3"))
        assert other.status_code == 200
    finally:
        held.release.set()
        _join_collector("emergency")
        _join_collector("crime-stats")


def test_b3_collector_exception_releases_flag_and_logs(client, db, caplog):
    """④ 수집기 예외 → 플래그 해제 + 원문은 로그에만."""
    _admin(db, "bg4")

    def _boom():
        raise RuntimeError("(psycopg2.errors.QueryCanceled) canceling statement")

    with caplog.at_level(logging.ERROR, logger="routers.admin.collect"):
        with patch.object(collect_mod, "_get_collector", return_value=_boom):
            res = client.post("/api/admin/collect/childcare", headers=_auth("bg4"))
            _join_collector("childcare")
    assert res.status_code == 200
    assert "psycopg2" not in res.text
    with collect_mod._collect_lock:
        assert "childcare" not in collect_mod._collect_running
    assert any("수집 실패: childcare" in r.getMessage() for r in caplog.records)


def _running_job(db, job_type, hours_ago):
    db.add(CrawlJob(
        job_type=job_type, status="running",
        started_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
    ))
    db.commit()


def test_b2_scheduler_running_row_blocks_with_409(client, db):
    """⑤ 스케줄러가 같은 job_type 을 돌리는 중(crawl_jobs running)이면 409, 수집기는 안 부른다."""
    _admin(db, "bg5")
    _running_job(db, "kapt_costs", 1)  # 관리비 임계 3h 안 — 살아 있는 회차
    called = []
    with patch.object(collect_mod, "_get_collector", return_value=lambda: called.append(1)):
        res = client.post("/api/admin/collect/kapt-costs", headers=_auth("bg5"))
    assert res.status_code == 409
    assert res.json()["detail"] == BUSY_WORDS
    assert called == []
    with collect_mod._collect_lock:
        assert "kapt-costs" not in collect_mod._collect_running


def test_b2_stale_or_other_running_rows_do_not_block(client, db):
    """유령(임계 지난 running)·다른 job_type 의 running 은 막지 않는다."""
    _admin(db, "bg6")
    _running_job(db, "kapt_costs", 4)  # 임계 3h 초과 — 유령
    _running_job(db, "air_quality", 0.1)  # 다른 수집기
    with patch.object(collect_mod, "_get_collector", return_value=lambda: None):
        res = client.post("/api/admin/collect/kapt-costs", headers=_auth("bg6"))
        _join_collector("kapt-costs")
    assert res.status_code == 200


def test_b3_success_invalidates_freshness_cache(client, db):
    """⑥ 성공 뒤 신선도 캐시 무효화 호출."""
    _admin(db, "bg7")
    with patch.object(collect_mod, "_get_collector", return_value=lambda: None), \
            patch("routers.admin.freshness.invalidate_freshness_cache") as inv:
        client.post("/api/admin/collect/air-quality", headers=_auth("bg7"))
        _join_collector("air-quality")
    inv.assert_called_once_with()


def test_collector_job_type_map_matches_collector_code():
    """이름→job_type 표가 8종 전부 있고, 각 값이 그 수집기 모듈 소스에 문자열로 들어 있다."""
    from typing import get_args

    names = set(get_args(collect_mod.CollectorName))
    assert set(collect_mod._COLLECTOR_JOB_TYPE) == names
    for name, job_type in collect_mod._COLLECTOR_JOB_TYPE.items():
        fn = collect_mod._get_collector(name)
        src = inspect.getsource(inspect.getmodule(fn))
        assert f'"{job_type}"' in src, f"{name} → {job_type} 가 {fn.__module__} 에 없다"


# ── B5: 소급 배치 — 우리 하루 예산 사전 확인에 걸려 멈춘 회차 ──


def _add_complex(db, no, households):
    db.add(Complex(
        complex_no=no, complex_name=f"단지{no}",
        total_household_count=households, cortar_no="1100000000",
    ))
    db.commit()


def test_b5_budget_precheck_stop_leaves_plain_reason_and_stays_completed(db):
    """⑦ 사전 확인에 걸려 멈추면 completed 그대로 + '정부 실거래가 창구…' 사유, 남은 단지는 시도 안 함."""
    from crawler.plain_words import explain_error, explain_stored_error
    from crawler.service_public import backfill_price_batch

    _add_complex(db, "B51", 3000)
    _add_complex(db, "B52", 2000)
    _add_complex(db, "B53", 1000)
    quota = iter([{"remaining": 5}, {"remaining": 0}])
    with patch("crawler.quota_db.get_api_quota_status", side_effect=lambda *_a, **_k: next(quota)), \
            patch("crawler.service_public.backfill_price_history") as hist:
        result = backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price")

    assert hist.call_count == 1  # 첫 단지만 — 나머지는 부르기 전에 멈춤(시도 마커도 안 찍힘)
    assert result["quota_exhausted"] is True
    job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "backfill_price").one()
    assert job.status == "completed"
    expected = (
        "정부 실거래가 창구에 오늘 쓸 요청 몫을 다 써 3개 단지 중 1개까지 받고 멈춤"
        " — 남은 단지는 내일 이어서 받아요"
    )
    assert job.error_message == expected
    # 알림·화면 번역이 숫자째 원문을 지킨다(한도 규칙이 먼저 잡으면 숫자가 사라진다)
    assert explain_error(job.error_message) == expected
    assert explain_stored_error(job.error_message) == expected
    # 남은 단지는 시도 마커가 없다 — 내일 다시 뽑힌다
    assert db.query(Complex).filter(Complex.complex_no.in_(["B52", "B53"]),
                                    Complex.public_data_attempted_at.isnot(None)).count() == 0


def test_b5_normal_completion_has_no_reason(db):
    """사전 확인에 안 걸리고 끝까지 가면 사유 없음(completed·error_message None)."""
    from crawler.service_public import backfill_price_batch

    _add_complex(db, "B54", 1000)
    with patch("crawler.quota_db.get_api_quota_status", return_value={"remaining": 100}), \
            patch("crawler.service_public.backfill_price_history"):
        backfill_price_batch(batch_size=20, scheduler_job_id="backfill_price")
    job = db.query(CrawlJob).filter(CrawlJob.scheduler_job_id == "backfill_price").one()
    assert job.status == "completed"
    assert job.error_message is None
