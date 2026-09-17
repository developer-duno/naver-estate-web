"""release.md §3-0 "스케줄 전수" 표 생성기 — scheduler.py·monitor.py 가 진실의 원천.

옛 표는 손으로 옮겨 적은 것이라 세 번 잡을 빠뜨렸다(세션 398 collect_crime_stats,
세션 403 새 잡 2종, 세션 412 주 1회 07:00 complex_detail_JGC/ABYG/OBYG — 이 생성기의 첫 실행이
찾아냈다). 손글씨를 없애고 코드에서 뽑는다 — derived-display-ssot.md 의
"파생 표시값은 source 에서 자동생성" 원칙을 문서 표에 적용한 것이다.

  생성  : python scripts/gen_restart_schedule_table.py
  검사  : python scripts/gen_restart_schedule_table.py --check ../.claude/rules/release.md
  갱신  : python scripts/gen_restart_schedule_table.py --write ../.claude/rules/release.md

DB·네트워크·scheduler.start() 없음 — create_scheduler() 는 add_job 만 한다.
"""

import argparse
import difflib
import inspect
import re
import sys
from pathlib import Path
from unittest.mock import patch

from apscheduler.triggers.cron import CronTrigger

# `cd backend && python scripts/gen_restart_schedule_table.py …` 를 PYTHONPATH 없이 그대로 칠 수 있게 backend/ 를 경로에 넣는다
# (형제 스크립트 관례). 없으면 `crawler` 를 못 찾아 ModuleNotFoundError — CI 는 pytest rootdir 가 넣어 줘서 구조적으로 못 잡는다
# (세션 412 검사관 A: release.md 가 안내하는 갱신 명령이 그대로는 실패했다).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

BLOCK_START = "<!-- restart-schedule:start -->"
BLOCK_END = "<!-- restart-schedule:end -->"

# 잡 등록을 가로막는 env 토글 — 전부 켜야 "있을 수 있는 잡 전부"가 표에 뜬다.
# (라이브에서 꺼져 있는 잡도 표에는 있어야 한다: 언제 켜질지 모르고, 켜진 뒤
#  표를 다시 고치는 것이 곧 옛 손글씨 표의 실패 방식이었다.)
_ENABLE_TOGGLES = (
    "POPULAR_CRAWL_ENABLED", "PUBLIC_DATA_ENABLED", "OFFICIAL_PRICE_ENABLED",
    "KAPT_ENABLED", "AIR_QUALITY_ENABLED", "EMERGENCY_ENABLED", "CHILDCARE_ENABLED",
    "CRIME_STATS_ENABLED", "COMPLEX_DETAIL_ENABLED", "COMPLEX_METRIC_ENABLED",
    "BILLING_AUTO_CHARGE_ENABLED", "PAYMENT_ENABLED", "MONITOR_ENABLED",
    "VACUUM_MAINTENANCE_ENABLED", "API_VERSION_MONITOR_ENABLED",
    "FIELD_DRIFT_MONITOR_ENABLED", "BACKFILL_DETAIL_ENABLED",
)

# scheduler id → crawl_jobs.job_type. 두 이름 체계가 다르다(infra.md 경고) —
# ⏰ 판정에 쓰는 _STALE_HOURS_BY_TYPE 의 키는 **job_type** 쪽이다.
# 근거 = 각 서비스 모듈의 CrawlJob(job_type=...) / _record_job(db, job_type, ...) 호출부.
_ID_TO_JOB_TYPE = {
    "discover_regions": "complex_list",
    "crawl_articles": "complex_articles",
    "crawl_details": "article_detail",
    "backfill_detail_dawn": "article_detail_backfill",
    "backfill_detail_noon": "article_detail_backfill",
    "collect_prices": "price_history",
    "backfill_price": "price_backfill",
    "popular_1030": "popular_crawl",
    "popular_1430": "popular_crawl",
    "popular_1900": "popular_crawl",
    "complex_detail_APT": "complex_detail_APT",
    "complex_detail_OPST": "complex_detail_OPST",
    "complex_detail_JGC": "complex_detail_JGC",
    "complex_detail_ABYG": "complex_detail_ABYG",
    "complex_detail_OBYG": "complex_detail_OBYG",
    "collect_public_trades": "public_trade_data",
    "collect_officetel_presale": "officetel_presale",
    "collect_rental_presale": "rental_presale",
    "official_price": "official_price",
    "kapt_match": "kapt_match",
    "kapt_costs": "kapt_costs",
    "collect_air_quality": "air_quality",
    "collect_emergency": "emergency",
    "collect_childcare": "childcare",
    "collect_crime_stats": "crime_stats",
    "crawler_monitor": "crawler_monitor",
    "collect_metrics": "complex_metric",
    "billing_charge": "billing_charge",
    "vacuum_maintenance": "vacuum_maintenance",
    "api_version_probe": "api_version_probe",
    "field_drift_monitor": "field_drift_monitor",
}


# 트리거 간격을 .env 가 덮는 모듈 상수(`*_INTERVAL_*`). 표는 "코드 기본값" 기준이므로 원래 값으로 되돌려 만든다.
# 라이브 폴더(.env 있음)에서 만들면 crawler_monitor 가 10분으로 나와 CI·워크트리(.env 없음)의 30분과
# 어긋났다(세션 412 머지 직후 실측 — --check 실패). 기본값은 scheduler.py 소스의
# `NAME = int(os.getenv("NAME", "기본값"))` 줄에서 읽는다 — 숫자를 여기 또 적지 않는다(손글씨 재유입 금지).
_ENV_INT_DEFAULT = re.compile(
    r'^(?P<name>[A-Z_]*INTERVAL[A-Z_]*) = int\(os\.getenv\("(?P=name)", "(?P<default>\d+)"\)\)$', re.M
)


# add_job(...) 트리거 인자에 우변으로 쓰인 대문자 상수(`minutes=NAME` / `hours=NAME`). 리터럴·루프 변수는 안 잡힌다.
_TRIGGER_CONST_REF = re.compile(r"\b(?:minutes|hours)=([A-Z][A-Z0-9_]+)\b")


def _interval_code_defaults(sched_mod) -> dict[str, int]:
    """scheduler.py 소스에서 간격 상수의 코드 기본값을 읽는다(.env 로 덮인 현재값이 아니라).

    기본값 줄에서 읽은 상수 집합이 add_job 트리거에 실제로 쓰인 상수 집합과 다르면 즉시 중단한다 —
    개수를 손으로 박지 않고도, 간격 상수를 `*_INTERVAL_*` 아닌 이름으로 만들면 조용히 빠지는 일을 막는다
    (세션 412 검사관 LOW: 개명 변이에서 3개만 파싱되고 무경고였다).
    """
    source = inspect.getsource(sched_mod)
    found = {m["name"]: int(m["default"]) for m in _ENV_INT_DEFAULT.finditer(source)}
    used = set(_TRIGGER_CONST_REF.findall(source))
    if not found or used != set(found):
        raise SystemExit(
            "트리거 간격 상수와 기본값 파싱이 어긋난다 — add_job 에 쓰인 상수 "
            f"{sorted(used)} vs 기본값 줄에서 읽은 {sorted(found)}. 상수 이름 규칙(*_INTERVAL_*)이나 정규식을 맞출 것"
        )
    return found


def build_jobs() -> list:
    """토글을 전부 켜고 간격 상수를 코드 기본값으로 되돌린 채 스케줄러를 만들어 등록된 잡 목록을 돌려준다(start 안 함)."""
    from crawler import scheduler as sched_mod

    patches = [patch.object(sched_mod, name, True) for name in _ENABLE_TOGGLES]
    patches += [patch.object(sched_mod, name, value) for name, value in _interval_code_defaults(sched_mod).items()]
    for p in patches:
        p.start()
    try:
        return sched_mod.create_scheduler().get_jobs()
    finally:
        for p in reversed(patches):
            p.stop()


def _sort_key(job) -> tuple:
    """cron 은 HH:MM 순, interval 은 그 뒤(초 단위 오름차순)."""
    if isinstance(job.trigger, CronTrigger):
        f = {x.name: str(x) for x in job.trigger.fields if not x.is_default}
        hour = f.get("hour", "0")
        first_hour = int(hour.split(",")[0]) if hour.split(",")[0].isdigit() else 99
        return (0, first_hour, int(f.get("minute", "0")), job.id)
    return (1, int(job.trigger.interval.total_seconds()), 0, job.id)


def _time_cell(job, period: str) -> str:
    """시각 칸 — cron 은 "HH:MM"(여러 번이면 · 로 나열), interval 은 "—"."""
    if not isinstance(job.trigger, CronTrigger):
        return "—"
    f = {x.name: str(x) for x in job.trigger.fields if not x.is_default}
    hour, minute = f.get("hour"), int(f.get("minute", "0"))
    if hour is None or not all(h.isdigit() for h in hour.split(",")):
        return period or "—"  # 미지원 조합 — 주기 문구로 대체
    return "·".join(f"{int(h):02d}:{minute:02d}" for h in hour.split(","))


def generate_block() -> str:
    """마커 사이에 들어갈 본문(마커 포함, 끝 개행 없음)."""
    from crawler.monitor import _STALE_HOURS, _STALE_HOURS_BY_TYPE
    from crawler.schedule_describe import describe_trigger

    rows, long_jobs = [], []
    for job in sorted(build_jobs(), key=_sort_key):
        period = describe_trigger(job.trigger)
        job_type = _ID_TO_JOB_TYPE.get(job.id, job.id)
        hours = _STALE_HOURS_BY_TYPE.get(job_type, _STALE_HOURS)
        mark = "⏰ " if hours > _STALE_HOURS else ""
        if mark:
            long_jobs.append(f"{job.id}({hours}h)")
        rows.append(
            f"| {_time_cell(job, period)} | {mark}`{job.id}` | {period or '—'} | {hours}h |"
        )

    lines = [
        BLOCK_START,
        "<!-- 이 표는 backend/scripts/gen_restart_schedule_table.py 가 생성한다. 손으로 고치지 말 것. -->",
        "",
        "| 시각 | 잡 | 주기 | 스윕 임계 |",
        "|---|---|---|---|",
        *rows,
        "",
        f"⏰ = 재시작 절대 금지 구간(스윕 임계 {_STALE_HOURS}h 초과 = 오래 도는 잡): "
        + " · ".join(long_jobs),
        BLOCK_END,
    ]
    return "\n".join(lines)


def _split(text: str) -> tuple[str, str, str]:
    """파일 본문을 (앞, 블록, 뒤) 로 쪼갠다.

    마커가 없거나·두 쌍이거나·끝이 시작보다 앞이면 즉시 거부한다 — 그대로 진행하면 --write 가
    본문을 중복시키거나 유령 표를 남기는데 --check 는 통과해 버린다(세션 412 검사관 MED 2건).
    """
    if text.count(BLOCK_START) != 1 or text.count(BLOCK_END) != 1:
        raise SystemExit(f"마커({BLOCK_START} / {BLOCK_END})가 정확히 한 쌍이 아니다: 파일이 손상됐는지 확인할 것")
    i, j = text.find(BLOCK_START), text.find(BLOCK_END)
    if j < i:
        raise SystemExit("끝 마커가 시작 마커보다 앞에 있다: 파일이 손상됐는지 확인할 것")
    return text[:i], text[i : j + len(BLOCK_END)], text[j + len(BLOCK_END) :]


def main() -> int:
    ap = argparse.ArgumentParser(description="release.md 스케줄 전수 표 생성·검사·갱신")
    ap.add_argument("--check", metavar="PATH", help="파일 안의 블록이 생성 결과와 같은지 검사(다르면 1)")
    ap.add_argument("--write", metavar="PATH", help="파일 안의 블록을 생성 결과로 교체")
    args = ap.parse_args()
    block = generate_block()

    path = args.check or args.write
    if path is None:
        print(block)
        return 0

    text = Path(path).read_text(encoding="utf-8")
    head, current, tail = _split(text)
    if args.write:
        Path(path).write_text(head + block + tail, encoding="utf-8", newline="")
        print(f"갱신 완료: {path}")
        return 0
    if current.strip() == block.strip():
        return 0
    print("\n".join(difflib.unified_diff(
        current.splitlines(), block.splitlines(),
        fromfile=f"{path} (현재)", tofile="생성 결과", lineterm="",
    )))
    print("\n표가 코드와 어긋났다. 갱신: cd backend && "
          "python scripts/gen_restart_schedule_table.py --write ../.claude/rules/release.md")
    return 1


if __name__ == "__main__":
    sys.exit(main())
