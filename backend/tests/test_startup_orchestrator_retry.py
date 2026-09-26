"""오케스트레이터 "겹쳐 띄우기" 방지 회귀 가드 (세션 421, 2026-09-27)

사고: 재부팅 직후 첫 백엔드(37336)가 30초 안에 포트를 못 잡자 main() 이 곧바로 둘째(35716)를
띄웠다. 첫 프로세스는 포트를 아직 안 잡아 _kill_port 가 놓쳤고, 01:03:21 에 포트를 잡아
둘째의 health 성공으로 오인됐다 → 둘째는 10048(포트 충돌)로 종료코드 3 → watchdog 재시작.

이 테스트는 scripts/startup_orchestrator.py(레포 루트 scripts/, 패키지 아님)를 불러와
① 살아 있으면 더 기다리고 ② 다시 띄우기 전엔 내 프로세스부터 끝내며 ③ watchdog 도 같다는 것을 본다.

⚠ 그 모듈은 import 순간 운영 startup.log(D:\\naver-estate-web\\scripts\\startup.log 절대경로)에
FileHandler 를 연다. 그대로 import 하면 운영 로그에 핸들러가 붙고 리눅스 CI 에선 이상한 파일이
생기므로, logging.FileHandler 를 NullHandler 로 바꿔 둔 채 importlib 로 불러온다.
telegram_notify 도 import 때 backend/.env 를 읽으므로 가짜 모듈로 대체한다.

실행: cd backend && python -m pytest tests/test_startup_orchestrator_retry.py -v
"""

import importlib.util
import logging
import os
import subprocess
import sys
import types
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"
_MODULE_PATH = _SCRIPTS / "startup_orchestrator.py"


class _StopLoop(Exception):
    """watchdog 무한 루프를 한 바퀴 뒤 끊기 위한 신호."""


class FakeProc:
    """subprocess.Popen 흉내 — poll·kill·wait·pid·returncode 만."""

    def __init__(self, pid, poll_value=None, wait_exc=None, calls=None):
        self.pid = pid
        self._poll_value = poll_value
        self.returncode = poll_value
        self.kill_count = 0
        self.wait_timeouts = []
        self._wait_exc = wait_exc
        self._calls = calls

    def poll(self):
        return self._poll_value

    def kill(self):
        self.kill_count += 1
        if self._calls is not None:
            self._calls.append(("kill", self.pid))
        self._poll_value = -9
        self.returncode = -9

    def wait(self, timeout=None):
        self.wait_timeouts.append(timeout)
        if self._wait_exc is not None:
            raise self._wait_exc
        return self.returncode


@pytest.fixture
def orch(monkeypatch):
    """운영 로그·.env 를 건드리지 않고 startup_orchestrator 모듈을 새로 불러온다."""
    startup_logger = logging.getLogger("startup")
    handlers_before = list(startup_logger.handlers)
    real_file_handler = logging.FileHandler  # 패치 전 진짜 클래스(아래 isinstance 판정용)

    opened_paths = []

    def fake_file_handler(path, *args, **kwargs):
        opened_paths.append(path)
        return logging.NullHandler()

    monkeypatch.setattr(logging, "FileHandler", fake_file_handler)
    monkeypatch.syspath_prepend(str(_SCRIPTS))
    fake_tg = types.ModuleType("telegram_notify")
    fake_tg.notify = lambda text: False
    monkeypatch.setitem(sys.modules, "telegram_notify", fake_tg)

    spec = importlib.util.spec_from_file_location(
        "startup_orchestrator_under_test", _MODULE_PATH
    )
    mod = importlib.util.module_from_spec(spec)
    # STARTUP_LOG 는 모듈 상수라 로드 전엔 모른다 — 경로 문자열은 모듈과 같은 식으로 계산
    expected_log = os.path.join(r"D:\naver-estate-web", "scripts", "startup.log")
    startup_log_existed = os.path.exists(expected_log)
    spec.loader.exec_module(mod)

    # 운영 startup.log 를 진짜로 열지 않았다: 가짜로만 열렸고, 진짜 FileHandler 는 붙지 않았다
    assert opened_paths == [mod.STARTUP_LOG]
    assert not any(
        isinstance(h, real_file_handler) for h in startup_logger.handlers
    )
    # 원래 없던 파일(리눅스 CI 는 항상 이 경우)이 로드 때문에 생기지 않았다
    if not startup_log_existed:
        assert not os.path.exists(mod.STARTUP_LOG)

    yield mod

    # 모듈이 붙인 StreamHandler·NullHandler 를 떼어 다른 테스트에 흔적을 남기지 않는다
    for h in list(startup_logger.handlers):
        if h not in handlers_before:
            startup_logger.removeHandler(h)


def _wire_main(monkeypatch, mod, procs, wait_results, calls):
    """main() 의 바깥 의존을 전부 가짜로 — 호출 순서는 calls 에 기록."""
    procs = list(procs)
    wait_results = list(wait_results)
    wait_timeouts = []
    watchdog_args = []

    def fake_start():
        proc = procs.pop(0)
        calls.append(("start", proc.pid))
        return proc

    def fake_wait(timeout=None):
        wait_timeouts.append(timeout)
        calls.append(("wait", timeout))
        return wait_results.pop(0)

    monkeypatch.setattr(mod, "start_backend", fake_start)
    monkeypatch.setattr(mod, "wait_for_backend", fake_wait)
    monkeypatch.setattr(mod, "_kill_port", lambda port: calls.append(("kill_port", port)))
    monkeypatch.setattr(mod, "kill_existing_processes", lambda: None)
    monkeypatch.setattr(mod, "_check_already_running", lambda: False)
    monkeypatch.setattr(mod, "notify", lambda text: calls.append(("notify", text)))
    monkeypatch.setattr(mod, "watchdog", lambda proc: watchdog_args.append(proc))
    monkeypatch.setattr(mod.time, "sleep", lambda s: None)
    return wait_timeouts, watchdog_args


def _count(calls, name):
    return sum(1 for c in calls if c[0] == name)


def test_s1_alive_after_first_wait_waits_more_without_second_launch(orch, monkeypatch):
    """S1: 첫 대기 실패 + 프로세스 생존 + 추가 대기 성공 → 겹쳐 띄우지 않는다.

    start_backend 1회 · kill 0회 · _kill_port 0회 · 추가 대기 timeout == BACKEND_HEALTH_GRACE."""
    calls = []
    p1 = FakeProc(pid=37336, poll_value=None, calls=calls)
    wait_timeouts, watchdog_args = _wire_main(
        monkeypatch, orch, [p1], [False, True], calls
    )

    orch.main()

    assert _count(calls, "start") == 1
    assert p1.kill_count == 0
    assert _count(calls, "kill_port") == 0
    assert len(wait_timeouts) == 2
    assert wait_timeouts[1] == orch.BACKEND_HEALTH_GRACE
    assert watchdog_args == [p1]


def test_s2_alive_but_never_healthy_kills_own_proc_then_retries(orch, monkeypatch):
    """S2: 첫·추가 대기 모두 실패 + 생존 → 내 프로세스를 끝낸 뒤 재시도, 두 번째 성공.

    kill 1회(그리고 재시작보다 먼저) · start_backend 2회 · watchdog 은 둘째 프로세스를 감시."""
    calls = []
    p1 = FakeProc(pid=37336, poll_value=None, calls=calls)
    p2 = FakeProc(pid=35716, poll_value=None, calls=calls)
    wait_timeouts, watchdog_args = _wire_main(
        monkeypatch, orch, [p1, p2], [False, False, True], calls
    )

    orch.main()

    assert p1.kill_count == 1
    assert p1.wait_timeouts == [10]
    assert _count(calls, "start") == 2
    assert calls.index(("kill", 37336)) < calls.index(("start", 35716))
    assert watchdog_args == [p2]


def test_s3_already_dead_retries_immediately_without_grace(orch, monkeypatch):
    """S3: 첫 대기 실패 + 프로세스 이미 종료(poll()→3) → 추가 대기 없이 곧바로 재시도.

    wait_for_backend 2회(첫 대기 + 재시도 대기) · kill 0회(이미 죽었으니 no-op) · start_backend 2회."""
    calls = []
    p1 = FakeProc(pid=37336, poll_value=3, calls=calls)
    p2 = FakeProc(pid=35716, poll_value=None, calls=calls)
    wait_timeouts, watchdog_args = _wire_main(
        monkeypatch, orch, [p1, p2], [False, True], calls
    )

    orch.main()

    assert len(wait_timeouts) == 2
    assert orch.BACKEND_HEALTH_GRACE not in wait_timeouts
    assert p1.kill_count == 0
    assert _count(calls, "start") == 2
    assert watchdog_args == [p2]


def test_s4_terminate_proc_unit(orch):
    """S4: _terminate_proc 단위 — 살아 있으면 kill+wait(10), wait 가 TimeoutExpired 를 던져도
    예외가 밖으로 안 나가고, 이미 죽은 프로세스는 건드리지 않는다."""
    alive = FakeProc(pid=1, poll_value=None)
    orch._terminate_proc(alive)
    assert alive.kill_count == 1
    assert alive.wait_timeouts == [10]

    stuck = FakeProc(
        pid=2,
        poll_value=None,
        wait_exc=subprocess.TimeoutExpired(cmd="uvicorn", timeout=10),
    )
    orch._terminate_proc(stuck)  # 예외가 새면 여기서 테스트 실패
    assert stuck.kill_count == 1

    dead = FakeProc(pid=3, poll_value=3)
    orch._terminate_proc(dead)
    assert dead.kill_count == 0
    assert dead.wait_timeouts == []


def test_s5_watchdog_hang_terminates_own_proc_before_port_cleanup(orch, monkeypatch):
    """S5: watchdog 한 바퀴 — 프로세스는 살아 있는데 health 3회 연속 실패(hang)면
    추적 중인 프로세스를 _kill_port 보다 먼저 끝낸다(호출 순서 기록으로 단언)."""
    calls = []
    hung = FakeProc(pid=100, poll_value=None, calls=calls)
    fresh = FakeProc(pid=200, poll_value=None, calls=calls)

    real_terminate = orch._terminate_proc

    def recording_terminate(proc):
        calls.append(("terminate", proc.pid))
        real_terminate(proc)

    sleeps = []

    def fake_sleep(s):
        sleeps.append(s)
        # health 실패 3바퀴 + 재시작 뒤 한 바퀴 → 4번째 sleep 에서 루프를 끊는다
        if len(sleeps) >= 4:
            raise _StopLoop

    monkeypatch.setattr(orch, "_terminate_proc", recording_terminate)
    monkeypatch.setattr(orch, "_check_health", lambda: False)
    monkeypatch.setattr(orch, "_kill_port", lambda port: calls.append(("kill_port", port)))
    monkeypatch.setattr(orch, "start_backend", lambda: calls.append(("start", 200)) or fresh)
    monkeypatch.setattr(orch, "wait_for_backend", lambda timeout=None: True)
    monkeypatch.setattr(orch, "notify", lambda text: calls.append(("notify", text)))
    monkeypatch.setattr(orch.time, "sleep", fake_sleep)

    with pytest.raises(_StopLoop):
        orch.watchdog(hung)

    names = [c[0] for c in calls]
    assert "terminate" in names
    assert names.index("terminate") < names.index("kill_port")
    assert names.index("kill_port") < names.index("start")
    assert hung.kill_count == 1
