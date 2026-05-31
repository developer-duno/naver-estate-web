"""scripts/pid_util.py 회귀 테스트.

PID 재활용 함정(2026-05-31 사고: 재부팅 후 옛 PID 17720 이 Codex 크롬 확장에
재할당 → 오케스트레이터가 "이미 실행 중" 오판 → 백엔드 미기동)을 박제한다.

scripts/pid_util.py 는 의존성 0 순수 모듈이라 importlib 로 파일 경로 직접 로드
(scripts 패키지화·telegram_notify import 부작용 회피).
"""

import importlib.util
import os

import pytest

_PID_UTIL_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "pid_util.py"
)
_spec = importlib.util.spec_from_file_location("pid_util", _PID_UTIL_PATH)
_pid_util = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_pid_util)
pid_is_live_orchestrator = _pid_util.pid_is_live_orchestrator


def _csv_row(image: str, pid: int, mem_kb: str = "10,000 K") -> str:
    """tasklist /FO CSV /NH 한 행 팩토리 (실제 출력 형식)."""
    return f'"{image}","{pid}","Console","1","{mem_kb}"\n'


def test_live_python_orchestrator_returns_true():
    """살아있는 python.exe 오케스트레이터 행 → True."""
    out = _csv_row("python.exe", 17720)
    assert pid_is_live_orchestrator(out, 17720) is True


def test_recycled_pid_nonpython_returns_false():
    """오늘 사고 회귀 차단: PID 17720 이 Codex 크롬 확장(extension-host.exe)에
    재할당 → python 아니므로 False (오케스트레이터 자살 방지)."""
    out = _csv_row("extension-host.exe", 17720, mem_kb="45,120 K")
    assert pid_is_live_orchestrator(out, 17720) is False


def test_substring_in_memory_column_returns_false():
    """substring 오판 차단: pid=580 인데 다른 행 메모리 '113,580 K' 에 580 이
    우연히 포함 → CSV PID 컬럼 정확 비교라 False."""
    out = _csv_row("python.exe", 6752, mem_kb="113,580 K")
    assert pid_is_live_orchestrator(out, 580) is False


def test_korean_no_task_banner_returns_false():
    """매칭 작업 없을 때 tasklist 한국어 배너 → CSV 행 아니므로 False."""
    out = "정보: 지정한 검색 조건과 일치하는 작업이 없습니다.\n"
    assert pid_is_live_orchestrator(out, 17720) is False


def test_pythonw_returns_true():
    """미래 pythonw 전환 가드: pythonw.exe 행도 오케스트레이터로 인정 → True."""
    out = _csv_row("pythonw.exe", 8476)
    assert pid_is_live_orchestrator(out, 8476) is True


@pytest.mark.parametrize("empty", ["", "\n", "   "])
def test_empty_output_returns_false(empty):
    """빈 출력 → False (방어)."""
    assert pid_is_live_orchestrator(empty, 1234) is False
