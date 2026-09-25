"""K-apt 관리비 기존 행의 다칸 op 5종만 다시 받아 고친다 — 세션 417 후속 일회성 스크립트.

왜 있나
    PR #572(`74edccbf`) 전까지 `kapt_api._extract_amount` 는 op 응답의 **첫 숫자 칸 하나**만
    저장했다. 금액 칸이 1칸인 17 op 는 그래도 맞았지만, 여러 칸을 더해야 하는 5 op
    (인건비 9칸·제세공과금 4칸·차량유지비 4칸·그밖의부대비용 3칸·사무비 3칸 —
    `kapt_api._COST_AMOUNT_FIELDS`)는 첫 칸만 남아 월 관리비가 과소 집계됐다.
    breakdown 에는 op 당 정수 하나만 남아 있어 **다시 계산할 수 없다 → 다시 받아야 한다.**

무엇을 하나
    `fetched_at < CUTOFF` 인 행을 id 오름차순으로 돌며, 행마다 5 op 를
    `fetch_cost_item` 으로 다시 받아 `_extract_amount`(칸 합산)로 금액을 만든다 →
    breakdown 의 그 5키만 갈아 끼우고(나머지 17키 불변) → `_summarize` 로
    공용/개별/총액/세대당을 다시 계산 → `fetched_at = 지금` 으로 커밋한다(행마다 커밋).
    - 5 op 중 **하나라도** 비어 오면(미공개 모양·칸이 전부 null) 그 행은 갱신하지 않고
      `partial_blank` 로 센다(`fetched_at` 도 그대로 — 다음 실행 대상에 남는다). 저장된 행은
      22키 전부 아니면 전무라(실측) 한 번 공개됐던 자료의 일부 op 만 비어 오는 것은 이상 신호다.
      옛 값을 유지한 채 나머지만 갈아 끼우면 첫 칸 값과 칸 합이 한 행에 섞인다(세션 417 최종 검사관 A).
    - 5 op 중 하나라도 `KaptApiError`(재시도 후에도 실패)면 **그 행은 통째로 건너뛴다**
      (5개를 다 받은 뒤에만 UPDATE — 반쪽 갱신 금지). 한도 초과(`is_quota`)면 즉시 끝낸다.
      실패가 10행 연달아 나면 API 장애로 보고 끝낸다.
    - **재실행 안전**: 갱신된 행은 fetched_at 이 CUTOFF 뒤가 되어 다음 실행에서 자동 제외된다.
      중간에 끊겨도 이미 커밋된 행은 그대로이고, 다음 실행이 남은 행부터 이어간다.

개별사용료 옛 이름(…V2) 행
    931행(2026-09-25 실측)은 개별 5키가 옛 op 이름 `getHsmp…InfoV2` 로 저장돼 있다.
    `_summarize` 는 공용/개별을 **현재 op 목록(V3 이름)** 으로 가르므로, 그대로 넘기면
    V2 금액이 공용으로 넘어간다(총액은 같고 구분만 틀어진다). 그래서 요약을 낼 때만
    V2 이름을 V3 이름으로 읽어 넘긴다(`_summary_view`). 저장되는 breakdown 의 키는 바꾸지 않는다.

하루 상한·실행 창
    대상 10,521행 × 5 op = 52,605콜. K-apt 버킷(`quota:kapt:<KST 날짜>`)은 60,000/일이고
    정기 `kapt_costs` 회차가 하루 ≈12,000 을 쓴다 → `--daily-cap`(기본 45,000)에 닿으면
    정상 종료하고 다음 날 다시 돌린다(이틀 분할). 오늘 카운트는 행마다 DB 에서 다시 읽는다.
    ⚠ 45,000 은 **그날 정기 06:20 회차가 이미 돈 뒤**라는 전제의 값이다(45,000 + 이미 쓴 ≈12,000
    < 60,000). 그러니 **09:00 이후에 시작해 자정 전에 끝낸다 — 코드가 09:00 전 시작을 막고 자정에
    멈춘다.** 자정을 넘기면 카운터가 새 날짜로 바뀌어 다음 날 정기 회차 몫(≈12,000)을 이 스크립트가
    먼저 먹는다 — 06:20 회차가 한도에 걸린다.
    시작은 09:00~23:59 KST 에만 허용한다(00:00~09:00 은 정기 `kapt_costs` 06:20 회차 전후라 거부,
    `--force` 로만 무시). 돌던 중 KST 날짜가 시작 때와 달라지면(자정 통과) `date_rollover` 로 멈춘다
    (`--force` 로도 안 풀린다 — 그다음 날 상한 몫을 먹는 것이 문제라서). `crawl_jobs` 에 `kapt_costs`
    가 running 이면 시작을 거부하고, 돌던 중에도 100행마다 다시 확인해 running 이면 멈춘다.

5 op 가 전부 비어 온 행
    대상 행은 전부 한 번은 공개돼 저장된 자료다. 다시 받았는데 5 op 가 **전부** 비어 오면
    이상 신호로 보고 UPDATE 하지 않는다(`fetched_at` 도 그대로 — 다음 실행이 다시 시도).
    `all_blank` 로 따로 세고, 연달아 10행이면 멈춘다.

`--limit` 은 조회 행 상한
    id 순 앞에서 N행을 가져와 돈다 — 매핑 없음·실패·전부 빔·일부 빔(`partial_blank`)으로 건너뛴 행도 N 에 든다.
    "갱신 N행" 으로 세지 않는 이유: 건너뛴 행은 대상에 그대로 남아, 같은 `--limit` 로 다시
    돌리면 같은 앞줄을 다시 조회한다 — 조회 상한이어야 호출 수(≤ N×5)가 예측 가능하고 단순하다.

사용 (backend 폴더에서)
    python scripts/recollect_kapt_5ops.py --dry-run          # 콜 0 — 대상 수·예상 콜·첫 10행
    python scripts/recollect_kapt_5ops.py --limit 10         # 앞에서 10행 조회
    python scripts/recollect_kapt_5ops.py                    # 상한까지(09:00 이후 시작·자정에 멈춤, 하루 1회씩 이틀)
    옵션: --daily-cap N (기본 45000) · --sleep-between 초 (기본 0 — throttle 은 call_api 가 한다) · --force
"""

from __future__ import annotations

import argparse
import logging
import math
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from datetime import time as dtime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from crawler import kapt_api  # noqa: E402
from crawler.kapt_api import INDIVIDUAL_COST_OPS, KaptApiError  # noqa: E402
from crawler.quota_db import _quota_key  # noqa: E402
from crawler.service_kapt import _COST_JOB_TYPE, _summarize  # noqa: E402
from db.models import CrawlJob, KaptComplexMap, KaptManagementCost  # noqa: E402
from utils import utcnow  # noqa: E402

logger = logging.getLogger("recollect_kapt_5ops")

KST = ZoneInfo("Asia/Seoul")

# PR #572(`74edccbf`, 칸 합산 정정)이 라이브에 오른 시각 = 2026-09-25 01:02 KST.
# 그 전에 받은 행은 5 op 가 첫 칸만 담고 있다. 2026-09-25 12:58 메인 실측: 이 시각 이후
# fetched_at 인 행 0건 · 이전 행 10,521건(= 전체). 이 스크립트가 고친 행은 fetched_at 이
# 지금으로 바뀌어 이 기준 뒤로 넘어가므로 재실행해도 다시 잡히지 않는다.
CUTOFF = datetime(2026, 9, 24, 16, 2, 0, tzinfo=timezone.utc)

# 금액 칸이 2칸 이상인 공용 op 5종 — 옛 파서가 첫 칸만 저장한 대상.
# 가드: tests/test_recollect_kapt_5ops.py 가 `_COST_AMOUNT_FIELDS` 에서 파생한 집합과 대조한다.
FIVE_OPS: tuple[str, ...] = (
    "getHsmpLaborCostInfoV3",
    "getHsmpTaxdueInfoV3",
    "getHsmpVhcleMntncCostInfoV3",
    "getHsmpEtcCostInfoV3",
    "getHsmpOfcrkCostInfoV3",
)

DEFAULT_DAILY_CAP = 45_000
MAX_CONSECUTIVE_FAILURES = 10
MAX_CONSECUTIVE_ALL_BLANK = 10
PROGRESS_EVERY = 100
# 시작 허용 시각(KST) — 이 시각 전(00:00~09:00)에는 시작하지 않는다. 정기 kapt_costs(06:20 시작,
# 평시 60~90분)와 겹치지 않고, 그날 정기 회차가 쓴 뒤라는 `--daily-cap` 전제를 지키려는 것.
START_NOT_BEFORE = dtime(9, 0)

# 옛 개별사용료 op 이름(…V2) → 현재 이름(…V3). 요약 계산 때만 쓴다(저장 키는 불변).
_V2_TO_V3 = {op[:-2] + "V2": op for op in INDIVIDUAL_COST_OPS}


@dataclass
class Target:
    id: int
    complex_no: str
    cost_month: str
    kapt_code: str | None


@dataclass
class RunStats:
    processed: int = 0      # 5 op 를 다 받아 커밋한 행
    failed: int = 0         # KaptApiError 로 건너뛴 행
    partial_blank: int = 0  # 5 op 중 일부만 비어 와서 갱신하지 않은 행
    no_mapping: int = 0     # kapt_complex_map 이 없어 건너뛴 행
    all_blank: int = 0      # 5 op 가 전부 비어 와서 갱신하지 않은 행
    calls: int = 0          # 이 실행이 쓴 관리비 호출 수(재시도 포함)
    stop_reason: str = "done"
    failed_ids: list[int] = field(default_factory=list)


def before_start_window(now_kst: datetime) -> bool:
    """09:00 KST 전이면 True — 시작 거부 대상."""
    return now_kst.astimezone(KST).time() < START_NOT_BEFORE


def kapt_costs_running(db) -> bool:
    return (
        db.query(CrawlJob.id)
        .filter(CrawlJob.job_type == _COST_JOB_TYPE, CrawlJob.status == "running")
        .first()
        is not None
    )


def today_quota(db) -> int:
    """오늘(KST) K-apt 버킷 사용량 — `rate_limit_counters` 의 `quota:kapt:<날짜>`."""
    value = db.execute(
        text("SELECT count FROM rate_limit_counters WHERE key = :key"),
        {"key": _quota_key("kapt")},
    ).scalar()
    return int(value or 0)


def select_targets(db, limit: int | None = None) -> list[Target]:
    """CUTOFF 이전에 받은 행 — id 오름차순. 매핑이 없는 행도 돌려준다(건너뛰며 센다)."""
    query = (
        db.query(
            KaptManagementCost.id,
            KaptManagementCost.complex_no,
            KaptManagementCost.cost_month,
            KaptComplexMap.kapt_code,
        )
        .outerjoin(KaptComplexMap, KaptComplexMap.complex_no == KaptManagementCost.complex_no)
        .filter(KaptManagementCost.fetched_at < CUTOFF)
        .order_by(KaptManagementCost.id.asc())
    )
    if limit is not None:
        query = query.limit(limit)
    return [Target(r.id, r.complex_no, r.cost_month, r.kapt_code) for r in query.all()]


def count_targets(db) -> int:
    return (
        db.query(KaptManagementCost.id)
        .filter(KaptManagementCost.fetched_at < CUTOFF)
        .count()
    )


def fetch_five(kapt_code: str, cost_month: str) -> dict[str, int | None]:
    """5 op 를 다시 받아 {op: 칸 합 또는 None}. 한 op 라도 실패면 `KaptApiError` 가 그대로 올라간다."""
    amounts: dict[str, int | None] = {}
    for op in FIVE_OPS:
        item = kapt_api.fetch_cost_item(kapt_api._CMNUSE_URL, op, kapt_code, cost_month)
        amounts[op] = kapt_api._extract_amount(op, item) if item else None
    return amounts


def _summary_view(breakdown: dict[str, int]) -> dict[str, int]:
    """요약 계산용 사본 — 옛 개별 op 이름(…V2)을 V3 이름으로 읽는다(모듈 docstring 참조)."""
    view: dict[str, int] = {}
    for key, value in breakdown.items():
        name = _V2_TO_V3.get(key, key)
        view[name] = view.get(name, 0) + value
    return view


def apply_five(row: KaptManagementCost, amounts: dict[str, int]) -> None:
    """행에 5 op 새 금액을 반영하고 요약·fetched_at 을 고친다(커밋은 호출자).

    호출자가 5 op 가 **전부** 값이 있을 때만 부른다(하나라도 비면 `partial_blank`·`all_blank`).
    """
    breakdown = dict(row.breakdown or {})
    breakdown.update(amounts)
    summary = _summarize(_summary_view(breakdown), row.household_count)
    row.breakdown = breakdown  # 새 dict 로 바꿔 끼워야 JSON 칸 변경이 감지된다
    for key, value in summary.items():
        setattr(row, key, value)
    row.fetched_at = utcnow()


def _calls_now() -> int:
    return kapt_api.cost_calls_made() + kapt_api.retry_calls_made()


def run(db, *, limit: int | None = None, daily_cap: int = DEFAULT_DAILY_CAP,
        sleep_between: float = 0.0, force: bool = False,
        now_fn=lambda: datetime.now(KST)) -> RunStats:
    """재수집 본체. 시작 가드를 통과하지 못하면 stop_reason 이 refused_* 인 통계를 돌려준다."""
    stats = RunStats()
    started_kst = now_fn().astimezone(KST)
    if kapt_costs_running(db):
        stats.stop_reason = "refused_kapt_costs_running"
        logger.error("정기 K-apt 관리비 수집(kapt_costs)이 돌고 있어 시작하지 않는다 — 끝난 뒤 다시 실행")
        return stats
    if not force and before_start_window(started_kst):
        stats.stop_reason = "refused_window"
        logger.error("09:00 KST 전에는 시작하지 않는다 — 정기 관리비 수집(06:20) 몫을 먼저 쓰지 않게"
                     "(09:00~23:59 에 다시 실행, --force 로만 무시)")
        return stats

    targets = select_targets(db, limit)
    logger.info("대상 %d행 (CUTOFF %s 이전, id 오름차순) · 예상 %d콜 · 하루 상한 %d",
                len(targets), CUTOFF.isoformat(), len(targets) * len(FIVE_OPS), daily_cap)
    consecutive = 0
    consecutive_blank = 0
    for index, target in enumerate(targets):
        if index and index % PROGRESS_EVERY == 0 and kapt_costs_running(db):
            stats.stop_reason = "kapt_costs_started"
            logger.warning("정기 K-apt 관리비 수집(kapt_costs)이 시작돼 멈춘다 — 끝난 뒤 다시 실행하면 이어간다")
            break
        if now_fn().astimezone(KST).date() != started_kst.date():
            stats.stop_reason = "date_rollover"
            logger.warning("KST 자정을 넘겨 멈춘다 — 새 날짜의 K-apt 한도는 그날 정기 06:20 회차 몫이다"
                           "(09:00 뒤 다시 실행하면 이어간다)")
            break
        quota = today_quota(db)
        if quota + len(FIVE_OPS) > daily_cap:
            stats.stop_reason = "daily_cap"
            logger.info("오늘 K-apt 사용량 %d 이 상한 %d 에 닿아 멈춘다 — 내일 다시 실행하면 이어간다",
                        quota, daily_cap)
            break
        if not target.kapt_code:
            stats.no_mapping += 1
            logger.warning("행 %s(단지 %s) — K-apt 매핑이 없어 건너뜀", target.id, target.complex_no)
            continue

        before = _calls_now()
        try:
            amounts = fetch_five(target.kapt_code, target.cost_month)
        except KaptApiError as exc:
            stats.calls += _calls_now() - before
            if exc.is_quota:
                stats.stop_reason = "quota"
                logger.error("일일 한도 초과(22) — 즉시 멈춘다 (행 %s, %s)", target.id, exc)
                break
            stats.failed += 1
            stats.failed_ids.append(target.id)
            consecutive += 1
            consecutive_blank = 0
            logger.warning("행 %s(단지 %s·%s) 호출 실패 — 건너뜀 (%s)",
                           target.id, target.complex_no, target.cost_month, exc)
            if consecutive >= MAX_CONSECUTIVE_FAILURES:
                stats.stop_reason = "consecutive_failures"
                logger.error("호출 실패가 %d행 연달아 났다 — API 장애로 보고 멈춘다 (마지막 사유: %s)",
                             consecutive, exc)
                break
            continue
        stats.calls += _calls_now() - before
        consecutive = 0  # 호출은 성공했다 — API 는 살아 있다

        if all(amount is None for amount in amounts.values()):
            stats.all_blank += 1
            consecutive_blank += 1
            logger.warning("행 %s(단지 %s·%s) — 5 op 가 전부 비어 왔다(한 번 공개됐던 자료라 이상 신호) · 갱신 안 함",
                           target.id, target.complex_no, target.cost_month)
            if consecutive_blank >= MAX_CONSECUTIVE_ALL_BLANK:
                stats.stop_reason = "consecutive_all_blank"
                logger.error("5 op 전부 빈 응답이 %d행 연달아 났다 — API 응답 이상으로 보고 멈춘다", consecutive_blank)
                break
            continue
        consecutive_blank = 0
        blank_ops = [op for op, amount in amounts.items() if amount is None]
        if blank_ops:
            stats.partial_blank += 1
            logger.warning("행 %s(단지 %s·%s) — 5 op 중 %s 가 비어 왔다(이상 신호) · 갱신 안 함, 다음 실행 대상에 남김",
                           target.id, target.complex_no, target.cost_month, ", ".join(blank_ops))
            continue

        row = db.get(KaptManagementCost, target.id)
        if row is None:  # 그 사이 정기 수집·매칭 정리로 지워진 행
            continue
        apply_five(row, amounts)
        db.commit()
        stats.processed += 1

        if stats.processed % PROGRESS_EVERY == 0:
            logger.info("진행: 처리 %d · 실패 %d · 전부 빔 %d · 일부 빔 %d · 이번 실행 %d콜 · 오늘 K-apt %d",
                        stats.processed, stats.failed, stats.all_blank, stats.partial_blank, stats.calls,
                        today_quota(db))
        if sleep_between > 0:
            time.sleep(sleep_between)

    logger.info("끝(%s): 처리 %d · 실패 %d%s · 전부 빔 %d · 일부 빔 %d · 매핑 없음 %d · 이번 실행 %d콜 · 남은 대상 %d",
                stats.stop_reason, stats.processed, stats.failed,
                f"(id {stats.failed_ids[:20]})" if stats.failed_ids else "",
                stats.all_blank, stats.partial_blank, stats.no_mapping, stats.calls, count_targets(db))
    return stats


def dry_run(db, daily_cap: int = DEFAULT_DAILY_CAP) -> dict:
    """콜 0 — SELECT 만. 대상 수·예상 콜·필요 일수·첫 10행을 출력한다."""
    total = count_targets(db)
    calls = total * len(FIVE_OPS)
    quota = today_quota(db)
    days = math.ceil(calls / daily_cap) if daily_cap > 0 else None
    print(f"[dry-run] 대상 {total}행 (fetched_at < {CUTOFF.isoformat()}) · 예상 {calls}콜 "
          f"({len(FIVE_OPS)} op × 행) · 하루 상한 {daily_cap} → 최소 {days}일 "
          f"(정기 kapt_costs 몫 포함, 오늘 K-apt 사용량 {quota})")
    print(f"[dry-run] 정기 수집 running: {kapt_costs_running(db)} · 지금 KST {datetime.now(KST):%H:%M}"
          f" · 시작 허용 {START_NOT_BEFORE:%H:%M}~23:59 (자정에 멈춤)")
    first = select_targets(db, 10)
    for t in first:
        row = db.get(KaptManagementCost, t.id)
        current = {op[len("getHsmp"):-len("InfoV3")]: (row.breakdown or {}).get(op) for op in FIVE_OPS}
        print(f"  id={t.id} 단지={t.complex_no} 월={t.cost_month} kapt={t.kapt_code} 현재5={current}")
    return {"targets": total, "calls": calls, "days": days, "quota_today": quota, "first": first}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="K-apt 관리비 기존 행의 다칸 op 5종 재수집")
    parser.add_argument("--dry-run", action="store_true", help="콜 0 — 대상 수·예상 콜·첫 10행만")
    parser.add_argument("--limit", type=int, default=None,
                        help="조회 행 상한 — id 순 앞에서 N행(건너뛴 행도 센다, 모듈 docstring 참조)")
    parser.add_argument("--daily-cap", type=int, default=DEFAULT_DAILY_CAP,
                        help=f"오늘 K-apt 사용량이 이 값에 닿으면 멈춤 (기본 {DEFAULT_DAILY_CAP})")
    parser.add_argument("--sleep-between", type=float, default=0.0, help="행 사이 대기(초)")
    parser.add_argument("--force", action="store_true", help="09:00 KST 전 시작 거부를 무시(자정 정지는 그대로)")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from db.database import SessionLocal

    with SessionLocal() as db:
        if args.dry_run:
            dry_run(db, args.daily_cap)
            return 0
        stats = run(db, limit=args.limit, daily_cap=args.daily_cap,
                    sleep_between=args.sleep_between, force=args.force)
    if stats.stop_reason.startswith("refused"):
        return 3
    if stats.stop_reason in ("quota", "consecutive_failures", "consecutive_all_blank"):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
