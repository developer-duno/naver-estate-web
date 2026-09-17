"""release.md §3-0 스케줄 전수 표가 코드와 어긋나지 않게 막는 가드 (세션 412)

옛 표는 손으로 옮겨 적은 것이라 세 번 잡을 빠뜨렸다(세션 398 collect_crime_stats,
세션 403 새 잡 2종, 세션 412 주 1회 07:00 complex_detail 3종). 이제 scripts/gen_restart_schedule_table.py 가
scheduler.py·monitor.py 에서 표를 생성하고, 이 테스트가 문서와 코드의 드리프트를 잡는다.

실행: python -m pytest tests/test_restart_schedule_table.py -v
"""

import sys
from pathlib import Path

import pytest

import crawler.monitor as monitor_mod
from crawler.scheduler import extract_scheduler_job_ids

# scripts/ 는 패키지가 아니라 sys.path 에 직접 얹어 import 한다(다른 scripts 테스트 없음).
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from gen_restart_schedule_table import (  # noqa: E402
    _ID_TO_JOB_TYPE,
    BLOCK_END,
    BLOCK_START,
    _split,
    build_jobs,
    generate_block,
)

# ⚠ 상대경로로 열면 레포 루트에서 pytest 를 돌릴 때 FileNotFoundError 가 난다
#    (형제 테스트가 실제로 그렇게 깨졌다 — CLAUDE.md §테스트 현황 경고).
_BACKEND = Path(__file__).resolve().parents[1]
_RELEASE_MD = _BACKEND.parent / ".claude" / "rules" / "release.md"
_SCHEDULER_PY = _BACKEND / "crawler" / "scheduler.py"

_HOWTO = (
    "표를 다시 만들려면: cd backend && "
    "python scripts/gen_restart_schedule_table.py --write ../.claude/rules/release.md"
)


def test_every_scheduler_job_id_appears_in_table():
    """scheduler.py 의 정적 잡 id 가 전부 생성 표에 들어 있다."""
    block = generate_block()
    source = _SCHEDULER_PY.read_text(encoding="utf-8")
    missing = [
        job_id for job_id in extract_scheduler_job_ids(source) if f"`{job_id}`" not in block
    ]
    assert not missing, f"생성 표에 빠진 스케줄러 잡: {missing}. {_HOWTO}"


def test_release_md_block_matches_generated():
    """release.md 의 표가 코드에서 생성한 표와 글자 단위로 같다.

    누가 표를 손으로 고쳤거나, 잡을 추가·삭제·시각 변경하고 표를 안 고치면 실패한다.
    """
    _, current, _ = _split(_RELEASE_MD.read_text(encoding="utf-8"))
    assert current.strip() == generate_block().strip(), (
        "release.md 의 스케줄 전수 표가 코드(scheduler.py·monitor.py)와 다르다. "
        "표는 손으로 고치는 것이 아니다 — " + _HOWTO
    )


def test_generated_block_ignores_env_interval_overrides(monkeypatch):
    """라이브 .env 가 간격 상수를 덮어도(예: MONITOR_INTERVAL_MIN=10) 표는 코드 기본값으로 나온다.

    세션 412: #539 머지 직후 라이브 폴더에서 --check 가 실패했다 — 워크트리·CI(.env 없음)에서는
    crawler_monitor 30분, 라이브(.env 10분)에서는 10분. 표는 "코드 기본값" 기준이므로 생성기가
    간격 상수를 소스 기본값으로 되돌려야 하고, 그래야 라이브 폴더 전체 pytest 도 초록이다.
    """
    import crawler.scheduler as sched_mod

    baseline = generate_block()
    assert "| `crawler_monitor` | 30분마다 |" in baseline
    monkeypatch.setattr(sched_mod, "MONITOR_INTERVAL_MIN", 10)
    monkeypatch.setattr(sched_mod, "CRAWL_DETAIL_INTERVAL_MIN", 7)
    monkeypatch.setattr(sched_mod, "COMPLEX_DETAIL_APT_INTERVAL_HOURS", 9)
    assert generate_block() == baseline, "간격 상수가 .env 값으로 덮인 채 표가 만들어졌다 — 코드 기본값으로 되돌려야 한다"


@pytest.mark.parametrize(
    "broken",
    [
        f"A{BLOCK_END}B{BLOCK_START}C",  # 끝 마커가 앞 — 그대로 쓰면 본문이 중복되고 START 가 떠돈다
        f"A{BLOCK_START}X{BLOCK_END}B{BLOCK_START}Y{BLOCK_END}C",  # 두 쌍 — 둘째 쌍이 유령 표로 남는데 --check 는 통과
        "마커 없음",
    ],
    ids=["reversed", "duplicated", "missing"],
)
def test_split_rejects_broken_markers(broken):
    """마커가 뒤집히거나 두 쌍이거나 없으면 --write/--check 전에 즉시 거부한다(세션 412 검사관 MED 2건)."""
    with pytest.raises(SystemExit):
        _split(broken)


def test_stale_hours_job_types_all_map_to_registered_jobs():
    """_STALE_HOURS_BY_TYPE 의 job_type 이 전부 실제 등록 잡에 연결된다(⏰ 행 누락 0).

    연결이 끊기면 그 장시간 잡에 ⏰ 표시가 안 붙어, 표를 믿고 재시작했다가
    돌고 있던 잡을 끊게 된다.
    """
    # ⚠ 모듈 속성으로 읽는다 — `from crawler.monitor import _STALE_HOURS_BY_TYPE` 로
    #    import 시점 값을 붙들면 monkeypatch 가 안 먹혀 **가드가 자기 뮤테이션 검증을
    #    통과해 버린다**(구현 중 실측: 가짜 job_type 을 넣었는데 이 테스트가 초록이었다).
    registered = {_ID_TO_JOB_TYPE.get(job.id, job.id) for job in build_jobs()}
    orphans = sorted(set(monitor_mod._STALE_HOURS_BY_TYPE) - registered)
    assert not orphans, (
        f"_STALE_HOURS_BY_TYPE 에 있는데 등록된 잡과 연결이 안 되는 job_type: {orphans}. "
        "scripts/gen_restart_schedule_table.py 의 _ID_TO_JOB_TYPE 에 짝을 추가하거나, "
        "monitor.py 의 오타를 고칠 것 — 연결이 끊기면 그 잡에 ⏰ 가 안 붙는다."
    )
