"""테스트 DB 파일 경로·찌꺼기 청소 회귀 가드 (세션 415).

같은 PC 에서 pytest 두 개가 동시에 돌면 예전엔 같은 임시 DB 파일을 잡아
서로의 테이블을 지웠다(`no such table`·`WinError 32`). 경로에 PID 가 들어가는지,
그리고 그 대가로 쌓이는 찌꺼기를 안전하게(= 살아 있는 실행 파일은 남기고) 지우는지 본다.
"""

import os

from tests.conftest import _TEST_DB, _WORKER_ID, _sweep_stale_test_dbs, _unlink_db_files

# ⛔ 아래 테스트는 절대 _cleanup_test_db() 를 부르거나 _unlink_db_files 에 진짜 _TEST_DB 를
# 넘기지 않는다 — 지금 돌고 있는 이 세션의 DB 를 지워 뒤 테스트를 몰살시킨다.
# 헬퍼 검증은 전부 tmp_path 사본으로만 한다.


def _touch(path, age_sec=0.0):
    """파일을 만들고 mtime 을 지금보다 age_sec 만큼 과거로 돌린다(sleep 없이 나이 만들기)."""
    path.write_text("x")
    if age_sec:
        target = os.path.getmtime(path) - age_sec
        os.utime(path, (target, target))
    return str(path)


def test_test_db_path_has_pid_and_worker_id():
    """경로에 이 프로세스의 PID 와 워커 id 가 둘 다 들어가야 동시 실행이 안 부딪힌다."""
    name = os.path.basename(_TEST_DB)
    assert name == f"naver_estate_test_{_WORKER_ID}_{os.getpid()}.db"
    assert str(os.getpid()) in name


def test_sweep_deletes_old_keeps_fresh_and_unrelated(tmp_path):
    """오래된 대상만 지운다 — 방금 만든 것(= 돌고 있는 다른 실행)과 무관한 파일은 남긴다."""
    old_db = _touch(tmp_path / "naver_estate_test_master_111.db", age_sec=10_000)
    old_wal = _touch(tmp_path / "naver_estate_test_master_111.db-wal", age_sec=10_000)
    old_shm = _touch(tmp_path / "naver_estate_test_master_111.db-shm", age_sec=10_000)
    legacy = _touch(tmp_path / "naver_estate_test_master.db", age_sec=10_000)  # 옛 고정 이름
    fresh = _touch(tmp_path / "naver_estate_test_master_222.db")
    unrelated_old = _touch(tmp_path / "other_tool.db", age_sec=10_000)
    unrelated_ext = _touch(tmp_path / "naver_estate_test_master_333.log", age_sec=10_000)

    deleted = _sweep_stale_test_dbs(str(tmp_path), max_age_sec=3600)

    assert deleted == 4
    for gone in (old_db, old_wal, old_shm, legacy):
        assert not os.path.exists(gone)
    for kept in (fresh, unrelated_old, unrelated_ext):
        assert os.path.exists(kept)


def test_sweep_returns_zero_for_missing_directory(tmp_path):
    """없는 디렉터리를 줘도 예외 없이 0 을 돌려준다."""
    assert _sweep_stale_test_dbs(str(tmp_path / "nope"), max_age_sec=1) == 0


def test_unlink_db_files_deletes_three_suffixes(tmp_path):
    """DB 한 벌(본체·-wal·-shm)을 지우고 3 을 돌려준다 — 무관한 파일은 남긴다."""
    base = tmp_path / "some_test.db"
    for ext in ("", "-wal", "-shm"):
        _touch(tmp_path / f"some_test.db{ext}")
    unrelated = _touch(tmp_path / "some_test.db-journal")  # 대상 접미사가 아니다

    assert _unlink_db_files(str(base)) == 3

    for ext in ("", "-wal", "-shm"):
        assert not os.path.exists(str(base) + ext)
    assert os.path.exists(unrelated)


def test_unlink_db_files_returns_zero_when_nothing_exists(tmp_path):
    """지울 게 없어도(FileNotFoundError) 터지지 않고 0 을 돌려준다."""
    assert _unlink_db_files(str(tmp_path / "없는파일.db")) == 0


def test_unlink_db_files_does_not_raise_when_locked(tmp_path, monkeypatch):
    """다른 프로세스가 쥔 파일(PermissionError)이어도 종료 훅이 터지면 안 된다."""
    base = tmp_path / "locked_test.db"
    for ext in ("", "-wal", "-shm"):
        _touch(tmp_path / f"locked_test.db{ext}")

    def fake_unlink(path, *args, **kwargs):
        raise PermissionError("다른 프로세스가 사용 중")

    monkeypatch.setattr(os, "unlink", fake_unlink)

    assert _unlink_db_files(str(base)) == 0  # 예외 없이 0
    assert os.path.exists(str(base))  # 실제로 안 지워졌다


def test_sweep_does_not_raise_when_file_is_locked(tmp_path, monkeypatch):
    """윈도우에서 다른 실행이 쥔 파일은 삭제가 거부된다 — 그래도 터지지 않고 나머지를 지운다."""
    locked = _touch(tmp_path / "naver_estate_test_master_444.db", age_sec=10_000)
    other = _touch(tmp_path / "naver_estate_test_master_555.db", age_sec=10_000)

    real_unlink = os.unlink

    def fake_unlink(path, *args, **kwargs):
        if os.path.abspath(path) == os.path.abspath(locked):
            raise PermissionError("다른 프로세스가 사용 중")
        return real_unlink(path, *args, **kwargs)

    monkeypatch.setattr(os, "unlink", fake_unlink)

    deleted = _sweep_stale_test_dbs(str(tmp_path), max_age_sec=3600)

    assert deleted == 1  # 잠긴 파일은 세지 않는다
    assert os.path.exists(locked)
    assert not os.path.exists(other)
