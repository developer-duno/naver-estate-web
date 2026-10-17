"""정해진 단지 목록만 정부 실거래가로 다시 소급 (세션 469 — 일회성, 이틀에 나눠 실행).

왜
    이름만으로 짝을 짓던 동안 같은 시군구의 같은 이름·다른 법정동 단지끼리 거래가 섞였다. 24달 밖의 옛 줄은
    주간 수집이 못 닿으므로, 그 단지들(scripts/cleanup_public_trade_rows.py --out 의 "mixed")을 60달 소급으로
    다시 쓴다(사장님 결정 2026-10-17 — 지우지 않고 다시 쓰기). backfill_price_history 가 법정동 짝짓기로
    맞는 줄을 쓰고, 거래가 온 달의 틀린 옛 줄은 지운다(거래 0건인 달·60달 밖은 그대로).

어떻게
    목록의 단지를 세대수 큰 순으로 돌며 backfill_price_history(단지, months_back=--months)를 부른다.
    실거래가 캐시는 단지 사이에 비우지 않아 같은 시군구 단지끼리 같은 달을 한 번만 받는다(끝에 1회 비움).
    단지 하나가 끝날 때마다 진행 파일(--state)의 done 에 적어, 다시 돌리면 끝난 단지는 건너뛴다.

호출 수 세기
    창구에 실제로 나가는 쪽 단위 요청(PublicDataAPI.get_apt_trades) 횟수를 이 스크립트가 직접 센다.
    캐시로 받은 달은 세지 않는다. 한 요청 안의 재시도(최대 3번)는 1번으로 센다.

멈춤 (요청을 보내기 직전에 본다 — 상한을 넘겨 보내지 않는다)
    · 센 호출 수가 --max-calls 에 닿음
    · 창구가 알려 준 오늘 남은 횟수가 --min-remaining(기본 1,500) 아래 — 이 열쇠는 KOSPI·미분양과 같이 쓴다
    · 창구가 하루 한도 초과라고 답함
    멈춘 단지는 done 에 넣지 않는다(그 단지의 덜 끝난 저장은 되돌려진다) — 다음 실행이 그 단지부터 다시 한다.

사용법
    cd backend && python scripts/backfill_complex_list.py --list 대상.json --months 60 --max-calls 4000 --state 진행.json
"""

import argparse
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logger = logging.getLogger("backfill_complex_list")

DEFAULT_MIN_REMAINING = 1_500

STOP_WORDS = {
    "done": "다 끝남",
    "max_calls": "호출 상한에 닿음",
    "min_remaining": "창구 남은 횟수가 문턱 아래",
    "quota": "창구가 하루 한도 초과라고 답함",
}


class _Stop(Exception):
    """요청을 보내기 직전 멈춤 조건에 닿음 — 이 단지는 끝나지 않은 것으로 둔다."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _load_done(path: str | None) -> list[str]:
    if not path or not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        return list(json.load(f).get("done", []))


def _save_done(path: str | None, done: list[str]) -> None:
    if not path:
        return
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"done": done}, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)  # 쓰다 끊겨도 옛 진행 파일이 남게


def _ordered(db, complex_nos: list[str]) -> list[str]:
    """세대수 큰 순(세대수 모름은 뒤로), 같으면 단지 번호 순. DB 에 없는 번호는 뺀다."""
    from db.models import Complex

    rows = []
    for i in range(0, len(complex_nos), 1_000):
        part = complex_nos[i:i + 1_000]
        rows += db.query(Complex.complex_no, Complex.total_household_count).filter(
            Complex.complex_no.in_(part)
        ).all()
    rows.sort(key=lambda r: (-(r.total_household_count or 0), r.complex_no))
    return [r.complex_no for r in rows]


def run(complex_nos: list[str], months: int, max_calls: int, min_remaining: int, state: str | None) -> dict:
    from crawler.public_data_api import PublicDataAPI
    from crawler.service_public import PublicTradeFetchError, backfill_price_history
    from db.database import SessionLocal

    done = _load_done(state)
    done_set = set(done)
    with SessionLocal() as db:
        ordered = _ordered(db, complex_nos)
    todo = [c for c in ordered if c not in done_set]

    calls = 0
    original = PublicDataAPI.__dict__["get_apt_trades"]  # classmethod 객체 그대로 — 끝에 되돌린다
    real = PublicDataAPI.get_apt_trades

    def _counted(*args, **kwargs):
        nonlocal calls
        if calls >= max_calls:
            raise _Stop("max_calls")
        rl = PublicDataAPI.last_rate_limit()
        if rl is not None and rl["remaining"] < min_remaining:
            raise _Stop("min_remaining")
        calls += 1
        return real(*args, **kwargs)

    PublicDataAPI.get_apt_trades = staticmethod(_counted)
    failed = 0
    reason = "done"
    try:
        for cno in todo:
            try:
                result = backfill_price_history(cno, months_back=months)
            except _Stop as e:
                reason = e.reason
                break
            except PublicTradeFetchError as e:
                if e.kind == "quota":
                    reason = "quota"
                    break
                failed += 1
                logger.warning("단지 %s 소급 실패(창구 호출 실패) — 다음 실행에 다시", cno)
                continue
            except Exception as e:  # 단지 하나의 예외로 목록 전체를 멈추지 않는다
                failed += 1
                logger.warning("단지 %s 소급 실패(%s) — 다음 실행에 다시", cno, type(e).__name__)
                continue
            done.append(cno)
            done_set.add(cno)
            _save_done(state, done)
            logger.info("단지 %s 끝 — %d/%d 월 매칭 · 누적 호출 %d", cno, result["collected"], months, calls)
    finally:
        PublicDataAPI.get_apt_trades = original
        PublicDataAPI.clear_trade_cache()

    total = len(ordered)
    finished = sum(1 for c in ordered if c in done_set)
    return {"done": finished, "total": total, "calls": calls, "failed": failed, "reason": reason}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="정해진 단지 목록만 정부 실거래가로 다시 소급")
    parser.add_argument("--list", required=True, help='cleanup_public_trade_rows.py --out 파일(키 "mixed")')
    parser.add_argument("--months", type=int, default=60, help="단지마다 소급할 달 수 (기본 60)")
    parser.add_argument("--max-calls", type=int, required=True, help="이번 실행에서 창구에 보낼 요청 수 상한")
    parser.add_argument("--min-remaining", type=int, default=DEFAULT_MIN_REMAINING,
                        help=f"창구 남은 횟수가 이 아래면 멈춤 (기본 {DEFAULT_MIN_REMAINING:,})")
    parser.add_argument("--state", default=None, help="진행 파일(JSON) — 끝난 단지를 적고 다시 돌릴 때 건너뜀")
    args = parser.parse_args(argv)

    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)  # type: ignore[union-attr]
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

    with open(args.list, encoding="utf-8") as f:
        complex_nos = [str(c) for c in json.load(f).get("mixed", [])]

    st = run(complex_nos, args.months, args.max_calls, args.min_remaining, args.state)
    print(
        f"끝(done): 단지 {st['done']:,}/{st['total']:,} · 호출 {st['calls']:,} · 실패 {st['failed']:,}"
        f" · 멈춤 사유 {STOP_WORDS[st['reason']]}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
