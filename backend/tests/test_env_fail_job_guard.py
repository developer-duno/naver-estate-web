"""환경데이터 수집 _fail_job 새-세션 폴백 회귀 가드 (세션 278 H1).

배경: 네이버 크롤러 5종은 fail_job_safely(새 SessionLocal)로 '연결 끊김 시 job running
영구 잔존'(세션266, 5/31 11시간 실측)을 막았으나, 환경데이터 4종(air/emergency/crime/
childcare)의 _fail_job 은 같은 세션으로 rollback/commit 해 그 가드가 빠져 있었다.

이 테스트는 _fail_job 의 두 경로를 가드한다:
- 정상: 같은 세션으로 running -> failed 마킹.
- 깨진 세션: 같은-세션 commit 이 예외를 던지면 fail_job_safely(새 세션) 폴백으로 failed 마킹.

세션 378 추가: 그 폴백조차 못 도달한 실사고(job 45197 running 영구 잔존) 가드.
except 안에서 `job.id` 를 읽으면 만료·깨진 세션에서 lazy-load 가 터져 fail_job_safely
호출 전에 죽는다 — job id 를 진입 즉시 identity 로 확보했는지 단언한다.
"""
from datetime import datetime, timezone
from unittest.mock import patch

import crawler.service_common as service_common
from crawler.env_common import _fail_job
from db.models import CrawlJob


def _make_running_job(db, job_id: int) -> CrawlJob:
    job = CrawlJob(
        id=job_id,
        job_type="air_quality",
        status="running",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    return job


def test_fail_job_same_session_marks_failed(db):
    """정상 경로 — 같은 세션으로 running -> failed."""
    job = _make_running_job(db, 8101)

    _fail_job(db, job, "collect boom")

    db.expire_all()
    row = db.get(CrawlJob, 8101)
    assert row.status == "failed"
    assert row.error_message == "collect boom"
    assert row.completed_at is not None


def test_fail_job_broken_session_falls_back_to_new_session(db):
    """깨진 세션 — 같은-세션 commit 이 터지면 fail_job_safely 새-세션 폴백으로 failed 마킹.

    세션266 취약점(연결 끊김 시 rollback/commit 재예외 -> except 탈출 -> running 영구 잔존)이
    환경 수집에서 재발하지 않음을 가드. db.commit 을 1회 예외로 만들어 깨진 세션을 시뮬레이트.
    """
    job = _make_running_job(db, 8102)

    # 이 db 인스턴스의 commit 만 깨뜨림 (fail_job_safely 가 만드는 새 SessionLocal 은
    # 별도 인스턴스라 정상 동작해야 함 — 실제 운영에서 끊긴 건 요청 세션 하나뿐).
    with patch.object(db, "commit", side_effect=RuntimeError("SSL connection closed")):
        # 예외가 _fail_job 밖으로 전파되지 않아야 한다 (best-effort 폴백)
        _fail_job(db, job, "connection dropped mid-collect")

    # 새 세션이 커밋했으므로 재조회 시 failed
    db.expire_all()
    row = db.get(CrawlJob, 8102)
    assert row.status == "failed"
    assert row.error_message == "connection dropped mid-collect"
    assert row.completed_at is not None


def test_fail_job_reaches_fallback_when_job_attributes_unloadable(db, monkeypatch):
    """세션 378 실사고 재현 가드 — job 속성을 못 읽는 상태에서도 폴백까지 도달해야 한다.

    실사고(2026-08-22, job 45197): db.rollback() 이 job 속성을 만료시킨 뒤 commit 이
    QueryCanceled 로 실패 → 세션이 pending-rollback → except 안의 `job.id` 접근이
    그 깨진 세션에 lazy-load SELECT 를 쏴 PendingRollbackError → fail_job_safely 도달
    전에 _fail_job 이 통째로 죽어 job 이 'running' 으로 영구 잔존했다.

    여기서는 '만료 + detach'(db.expire → db.close)로 그 상태를 결정론적으로 재현한다.
    ⚠ 대역(stand-in)임에 유의: 실사고의 예외는 PendingRollbackError, 여기서 구코드가 던지는
    것은 DetachedInstanceError 로 클래스가 다르다 — 공통 본질(깨진 세션에서 `job.id` lazy-load
    읽기 실패)만 재현한다. 이 리깅이 없으면 구코드도 건강한 세션에서 조용히 성공해 뮤테이션
    검증이 불가능하므로 장식이 아니라 필수다(세션 378 적대검증 각도4 반영).
    검증: ① 예외가 _fail_job 밖으로 전파되지 않는다 ② fail_job_safely 가 원래 job id 와
    에러 문구로 정확히 호출된다.
    """
    job = _make_running_job(db, 8103)

    # 만료 + detach — 이 시점 이후 job 의 어떤 컬럼 접근도 lazy-load 를 시도해 실패한다.
    db.expire(job)
    db.close()

    calls: list[tuple] = []
    monkeypatch.setattr(
        service_common,
        "fail_job_safely",
        lambda job_id, error: calls.append((job_id, error)),
    )
    # 같은-세션 마킹은 반드시 실패시켜 except 경로로 몰아넣는다.
    monkeypatch.setattr(
        db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("QueryCanceled"))
    )

    # 예외가 밖으로 새면 실패 (실사고에서는 여기서 PendingRollbackError 로 죽었다)
    _fail_job(db, job, "boom")

    assert calls == [(8103, "boom")], f"폴백 호출이 기대와 다름: {calls}"


def test_fail_job_normal_path_does_not_use_fallback(db, monkeypatch):
    """정상 경로 유지 — 건강한 세션이면 같은 세션으로 마킹하고 폴백은 안 쓴다."""
    job = _make_running_job(db, 8104)

    calls: list[tuple] = []
    monkeypatch.setattr(
        service_common,
        "fail_job_safely",
        lambda job_id, error: calls.append((job_id, error)),
    )

    _fail_job(db, job, "normal failure")

    db.expire_all()
    row = db.get(CrawlJob, 8104)
    assert row.status == "failed"
    assert row.error_message == "normal failure"
    assert calls == [], "정상 경로에서는 새-세션 폴백을 쓰면 안 된다"
