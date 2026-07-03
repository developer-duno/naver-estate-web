"""scripts/log_rotation.py 회귀 테스트.

backend.log 를 매 재시작마다 "w" 모드로 덮어써 어제 크래시 로그가 통째로
사라지던 문제(rotation 없음)를 박제한다.

scripts/log_rotation.py 는 의존성 0 순수 모듈이라 importlib 로 파일 경로 직접
로드 (scripts 패키지화·telegram_notify import 부작용 회피 — test_pid_util.py 선례
답습).
"""

import importlib.util
import os
import time

_LOG_ROTATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "log_rotation.py"
)
_spec = importlib.util.spec_from_file_location("log_rotation", _LOG_ROTATION_PATH)
_log_rotation = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_log_rotation)
rotate_backend_log = _log_rotation.rotate_backend_log


def _set_mtime_days_ago(path: str, days: float) -> None:
    ts = time.time() - days * 86400
    os.utime(path, (ts, ts))


def test_existing_backend_log_renamed_to_timestamped_archive(tmp_path):
    """기존 backend.log(비어있지 않음) → backend_<mtime>.log 로 rename."""
    scripts_dir = str(tmp_path)
    backend_log = os.path.join(scripts_dir, "backend.log")
    with open(backend_log, "w", encoding="utf-8") as f:
        f.write("어제의 크래시 로그\n")

    result = rotate_backend_log(scripts_dir)

    assert result == backend_log
    assert not os.path.exists(backend_log)
    archives = [
        name for name in os.listdir(scripts_dir)
        if name.startswith("backend_") and name.endswith(".log")
    ]
    assert len(archives) == 1
    with open(os.path.join(scripts_dir, archives[0]), encoding="utf-8") as f:
        assert f.read() == "어제의 크래시 로그\n"


def test_old_archive_beyond_keep_days_deleted(tmp_path):
    """keep_days 보다 오래된 backend_*.log 아카이브는 삭제."""
    scripts_dir = str(tmp_path)
    old_archive = os.path.join(scripts_dir, "backend_20250101T000000.log")
    with open(old_archive, "w", encoding="utf-8") as f:
        f.write("old\n")
    _set_mtime_days_ago(old_archive, days=10)

    recent_archive = os.path.join(scripts_dir, "backend_20260101T000000.log")
    with open(recent_archive, "w", encoding="utf-8") as f:
        f.write("recent\n")
    _set_mtime_days_ago(recent_archive, days=1)

    rotate_backend_log(scripts_dir, keep_days=7)

    assert not os.path.exists(old_archive)
    assert os.path.exists(recent_archive)


def test_returns_backend_log_path(tmp_path):
    """반환값은 항상 안정 경로 backend.log (release.md §2 부팅시각 확인 대상)."""
    scripts_dir = str(tmp_path)
    result = rotate_backend_log(scripts_dir)
    assert result == os.path.join(scripts_dir, "backend.log")


def test_missing_backend_log_no_rename_no_crash(tmp_path):
    """backend.log 가 아예 없으면 rename 시도 없이 조용히 통과."""
    scripts_dir = str(tmp_path)
    result = rotate_backend_log(scripts_dir)
    assert result == os.path.join(scripts_dir, "backend.log")
    assert not os.listdir(scripts_dir)


def test_empty_backend_log_no_rename(tmp_path):
    """backend.log 가 존재하지만 빈 파일이면 rename 하지 않는다 (보존할 내용 없음)."""
    scripts_dir = str(tmp_path)
    backend_log = os.path.join(scripts_dir, "backend.log")
    open(backend_log, "w", encoding="utf-8").close()

    result = rotate_backend_log(scripts_dir)

    assert result == backend_log
    assert os.path.exists(backend_log)
    # 아카이브가 새로 생기지 않아야 함
    archives = [
        name for name in os.listdir(scripts_dir)
        if name.startswith("backend_") and name.endswith(".log")
    ]
    assert archives == []
