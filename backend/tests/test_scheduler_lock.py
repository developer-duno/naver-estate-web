"""crawler/scheduler_lock.py 회귀 테스트 (3-state 반환 규약 전수).

배경: uvicorn 여러 개가 뜨면 각 lifespan 이 스케줄러를 중복 실행하던 것을 파일락으로
차단한다. 이 테스트는 "락 획득 성공/경합/비활성/진짜에러" 4 경로가 각각 올바른
반환값(스케줄러 돌림 vs 스킵)을 내는지 박제한다 — sentinel 버그(false 를 None 으로
표현해 스케줄러가 스킵돼버림) 방어가 핵심.
"""

import logging

import pytest

import crawler.scheduler_lock as sl


@pytest.fixture
def lock_path(tmp_path):
    """테스트마다 격리된 락 파일 경로 (CI 병렬 경합 방지)."""
    return str(tmp_path / "scheduler.lock")


def _enable_filelock(monkeypatch):
    """이 테스트 함수 한정으로 파일락 활성화 (conftest 전역 false 를 덮어씀)."""
    monkeypatch.setenv("SCHEDULER_FILELOCK_ENABLED", "true")


def test_acquire_success_when_unheld(monkeypatch, lock_path):
    """락 미보유 → FileLock 객체 반환(non-None = 스케줄러 돌림)."""
    _enable_filelock(monkeypatch)
    lock = sl.acquire_scheduler_lock(lock_path)
    try:
        assert lock is not None  # 스케줄러 돌림
        assert hasattr(lock, "release")
    finally:
        if lock is not None:
            lock.release()


def test_second_acquire_returns_none_on_contention(monkeypatch, lock_path):
    """이미 잡힌 락을 두 번째로 잡으려 하면 None(경합 = 스케줄러 스킵)."""
    _enable_filelock(monkeypatch)
    first = sl.acquire_scheduler_lock(lock_path)
    assert first is not None
    try:
        second = sl.acquire_scheduler_lock(lock_path)
        assert second is None  # 경합 → 스킵
    finally:
        first.release()


def test_release_frees_lock_for_reacquire(monkeypatch, lock_path):
    """락 release 후 재획득 성공 — 정상 종료 시 다음 backend 가 이어받을 수 있음."""
    _enable_filelock(monkeypatch)
    first = sl.acquire_scheduler_lock(lock_path)
    assert first is not None
    first.release()

    second = sl.acquire_scheduler_lock(lock_path)
    try:
        assert second is not None  # 재획득 성공
    finally:
        second.release()


def test_disabled_returns_noop_sentinel_not_none(monkeypatch, lock_path):
    """SCHEDULER_FILELOCK_ENABLED=false → nullcontext sentinel(None 아님 = 스케줄러 돌림).

    sentinel 버그 방어의 핵심: false 를 None 으로 표현하면 스케줄러가 스킵돼버린다.
    비활성은 "락 무시하고 스케줄러는 돌려라"이므로 반드시 truthy 여야 한다.
    """
    monkeypatch.setenv("SCHEDULER_FILELOCK_ENABLED", "false")
    lock = sl.acquire_scheduler_lock(lock_path)
    assert lock is not None  # 스케줄러 돌림 (None 이면 버그)
    # release() 는 no-op 이어야 (여러 번 호출해도 안 터짐)
    lock.release()
    lock.release()


def test_non_timeout_error_returns_none_and_logs_error(monkeypatch, lock_path, caplog):
    """락 획득이 Timeout 아닌 예외(OSError)면 None + logger.error (경합/진짜에러 구분).

    경합(Timeout)은 warning, 진짜 에러(디스크·권한 OSError)는 error 로 구분해야
    운영자가 "다른 backend 가 잡음"과 "파일시스템 고장"을 구별할 수 있다.
    """
    _enable_filelock(monkeypatch)

    class _BoomLock:
        def __init__(self, *a, **k):
            pass

        def acquire(self):
            raise OSError("disk full")

    # filelock.FileLock 을 OSError 던지는 가짜로 교체 (함수 내부 import 라 sys.modules 패치)
    import filelock

    monkeypatch.setattr(filelock, "FileLock", _BoomLock)

    # OSError(진짜 에러) 경로는 운영자에게 텔레그램 알림 — 발송 함수 호출을 단언.
    # (conftest TELEGRAM_ENABLED=false 라 실발송 0, 세션 325 사고 방어 — 호출만 확인)
    sent = []
    monkeypatch.setattr(sl, "_alert_scheduler_lock_error", lambda p, e: sent.append((p, e)))

    with caplog.at_level(logging.ERROR, logger="crawler.scheduler_lock"):
        lock = sl.acquire_scheduler_lock(lock_path)

    assert lock is None  # 진짜 에러 → 스킵
    assert any(r.levelno == logging.ERROR for r in caplog.records)
    assert len(sent) == 1  # OSError 는 텔레그램 알림 (경합=Timeout 은 알림 안 함)


def test_timeout_contention_does_not_alert(monkeypatch, lock_path):
    """경합(Timeout)은 정상 중복방지 — 텔레그램 알림 안 함(노이즈 방지)."""
    _enable_filelock(monkeypatch)
    alerts = []
    monkeypatch.setattr(sl, "_alert_scheduler_lock_error", lambda p, e: alerts.append((p, e)))

    first = sl.acquire_scheduler_lock(lock_path)
    assert first is not None
    try:
        second = sl.acquire_scheduler_lock(lock_path)  # 경합 → None
        assert second is None
        assert alerts == []  # 경합엔 알림 없음
    finally:
        first.release()


def test_lock_path_defaults_to_scripts_dir():
    """기본 락 경로 = scripts/scheduler.lock (orchestrator.pid 와 같은 디렉토리)."""
    assert sl.LOCK_PATH.replace("\\", "/").endswith("scripts/scheduler.lock")
