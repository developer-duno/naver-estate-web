"""SGIS 동네 통계 보조 수집을 사람이 1번 돌리는 입구 (PR ②, 세션 456 — 스케줄러 등록은 PR ④).

무엇을 하나 = crawler/service_sgis.py refresh_sgis_area (요약 house·corp + 홍수·산사태, ppl 은 --only ppl 로만).
자세한 규칙은 그 모듈 머리말.

사용 (backend 폴더에서)
    python scripts/run_sgis_area_refresh.py --limit 5            # 앞 5개 동만 (호출 약 10 + 재해 목록·상세)
    python scripts/run_sgis_area_refresh.py --only flood         # 홍수만
    python scripts/run_sgis_area_refresh.py                      # 전부 (약 7천 + 재해 수천 콜)
    ⚠ 시험 실행(--dry-run)은 없다 — 부르는 횟수는 같아 의미가 없다. SGIS 키는 2u·미분양·상가 공용, 하루 5만 콜.
    ⚠ 같은 날 단지 짝짓기(map_complex_sgis.py)를 돌렸으면 그 호출 수와 합쳐 5만을 넘지 않게 --call-cap 을 낮춘다.

종료코드 0 = 끝남(상한 도달 포함) · 2 = 실패·코드 오류 연속으로 멈춤 · 3 = 키 없음
(실패한 동이 10% 넘어 회차가 failed 여도 종료코드는 0 — 회차 기록의 사유 문장을 본다)
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.service_sgis import DEFAULT_CALL_CAP, KINDS  # noqa: E402
from crawler.sgis_client import DEFAULT_INTERVAL  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="SGIS 동네 통계 보조 수집(요약 house·corp + 홍수·산사태) → sgis_area_stats",
        epilog="⚠ 부른 만큼 그날 SGIS 한도(5만/일, 세 레포 공용)를 쓴다.",
    )
    parser.add_argument("--limit", type=int, default=None, help="앞에서부터 이 수의 동만")
    parser.add_argument("--only", choices=KINDS, default=None, help="이 한 가지만 받는다 (ppl 은 이걸로만)")
    parser.add_argument("--call-cap", type=int, default=DEFAULT_CALL_CAP,
                        help=f"한 번 실행의 호출 상한 (기본 {DEFAULT_CALL_CAP:,})")
    parser.add_argument("--interval", type=float, default=DEFAULT_INTERVAL, help="호출 간격 초 (기본 0.2)")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from dotenv import load_dotenv

    load_dotenv()
    key = os.getenv("SGIS_CONSUMER_KEY")
    secret = os.getenv("SGIS_CONSUMER_SECRET")
    if not key or not secret:
        print("멈춤: SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET 환경 변수가 없어요")
        return 3

    from crawler.service_sgis import refresh_sgis_area
    from crawler.sgis_client import SgisClient, TokenCache
    from db.database import SessionLocal

    client = SgisClient(TokenCache(key, secret), interval=args.interval)
    with SessionLocal() as db:
        st = refresh_sgis_area(db, client, limit=args.limit, only=args.only, call_cap=args.call_cap)
    print(
        f"끝({st.stop_reason}): 동 {st.dongs:,} · 호출 {client.calls:,}(+인증 {client.tokens.issued})"
        f" · 저장 {st.saved:,} · 실패 {st.failed:,}"
        f" (코드 오류 {st.code_error:,} · 값 모양 이상 {st.bad_values:,})"
    )
    if st.failed_sidos:
        print(f"  재해 목록을 못 받아 비워 둔 시도: {', '.join(st.failed_sidos)}")
    if st.mismatch_sidos:
        print("  " + " ".join(st.mismatch_sidos))
    return 2 if st.stop_reason in ("consecutive_failures", "consecutive_code_errors") else 0


if __name__ == "__main__":
    sys.exit(main())
