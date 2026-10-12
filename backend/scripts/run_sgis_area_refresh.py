"""SGIS 동네 통계 보조 수집을 사람이 1번 돌리는 입구 (PR ②, 세션 456 — 스케줄러 등록은 PR ④).

무엇을 하나 = crawler/service_sgis.py refresh_sgis_area (요약 house·corp + 홍수·산사태, ppl 은 --only ppl 로만).
자세한 규칙은 그 모듈 머리말.

사용 (backend 폴더에서)
    python scripts/run_sgis_area_refresh.py --limit 5            # 앞 5개 동만 (호출 약 10 + 재해 목록·상세)
    python scripts/run_sgis_area_refresh.py --only flood         # 홍수만
    python scripts/run_sgis_area_refresh.py                      # 전부 (약 7천 + 재해 수천 콜)
    python scripts/run_sgis_area_refresh.py --resume             # 이어받기 — 앞 회차 시작 뒤 받은 곳은 건너뜀
    python scripts/run_sgis_area_refresh.py --resume --since "2026-10-12 09:30"   # 기준을 손으로(한국 시각)
    ⚠ 이어받기가 또 끊겼거나 사이에 작은 실행을 돌렸으면 --since 로 처음 회차 시작 시각을 준다.
    ⚠ 시험 실행(--dry-run)은 없다 — 부르는 횟수는 같아 의미가 없다. SGIS 키는 2u·미분양·상가 공용, 하루 5만 콜.
    ⚠ 같은 날 단지 짝짓기(map_complex_sgis.py)를 돌렸으면 그 호출 수와 합쳐 5만을 넘지 않게 --call-cap 을 낮춘다.

종료코드 0 = 끝남(상한 도달 포함) · 2 = 실패·코드 오류 연속으로 멈춤 · 3 = 키 없음·이어받기 거부
(실패한 동이 10% 넘어 회차가 failed 여도 종료코드는 0 — 회차 기록의 사유 문장을 본다)
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from crawler.service_sgis import DEFAULT_CALL_CAP, KINDS  # noqa: E402
from crawler.sgis_client import DEFAULT_INTERVAL  # noqa: E402


def parse_kst(text: str) -> datetime:
    """--since 값 "YYYY-MM-DD HH:MM"(한국 시각) → 시간대 붙은 UTC."""
    try:
        local = datetime.strptime(text.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        raise argparse.ArgumentTypeError(f"--since 는 \"YYYY-MM-DD HH:MM\"(한국 시각) 꼴이어야 해요: {text}") from None
    return local.replace(tzinfo=timezone(timedelta(hours=9))).astimezone(timezone.utc)


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
    parser.add_argument("--resume", action="store_true",
                        help="이어받기 — 가장 최근 회차 시작 뒤 이미 받은 (동, 종류)는 건너뛴다 (기본: 전부 받음)")
    parser.add_argument("--since", type=parse_kst, default=None,
                        help='이어받기 기준을 손으로 — "YYYY-MM-DD HH:MM" 한국 시각 (--resume 과 함께만)')
    args = parser.parse_args(argv)
    if args.since is not None and not args.resume:
        parser.error("--since 는 --resume 과 함께만 쓸 수 있어요")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    from dotenv import load_dotenv

    load_dotenv()
    key = os.getenv("SGIS_CONSUMER_KEY")
    secret = os.getenv("SGIS_CONSUMER_SECRET")
    if not key or not secret:
        print("멈춤: SGIS_CONSUMER_KEY·SGIS_CONSUMER_SECRET 환경 변수가 없어요")
        return 3

    from crawler.service_sgis import ResumeRefused, kst_minute, kst_text, refresh_sgis_area
    from crawler.sgis_client import SgisClient, TokenCache
    from db.database import SessionLocal

    client = SgisClient(TokenCache(key, secret), interval=args.interval)
    run_start = datetime.now(timezone.utc)   # 회차 잡 행보다 조금 앞 — 분 아래를 버려 찍으므로 --since 로 넣어도 안전
    with SessionLocal() as db:
        try:
            st = refresh_sgis_area(db, client, limit=args.limit, only=args.only, call_cap=args.call_cap,
                                   resume=args.resume, resume_since=args.since)
        except ResumeRefused as e:
            print(f"멈춤: {e}")
            return 3
        except KeyboardInterrupt:
            print(f"멈춤(직접 중단): 이번 회차 시작 {kst_minute(run_start)}(한국 시각)"
                  f" · SGIS 호출 {client.calls:,}(+인증 {client.tokens.issued})")
            raise
        except Exception:
            # 같은 날 다시 돌릴 때 --call-cap 을 정하려면 이번 회차가 쓴 호출 수가 필요하다
            print(f"멈춤(예외): 이번 회차 SGIS 호출 {client.calls:,}(+인증 {client.tokens.issued}) — 같은 날 다시 돌리면 --call-cap 을 그만큼 낮추세요"
                  f" · --resume 으로 돌리면 이미 받은 곳은 건너뜁니다 (이번 회차 시작 {kst_minute(run_start)}, 한국 시각)")
            raise
    print(
        f"끝({st.stop_reason}): 동 {st.dongs:,} · 호출 {client.calls:,}(+인증 {client.tokens.issued})"
        f" · 저장 {st.saved:,} · 실패 {st.failed:,}"
        f" (코드 오류 {st.code_error:,} · 값 모양 이상 {st.bad_values:,})"
        f" · 이번 회차 시작 {kst_minute(run_start)}(한국 시각)"
    )
    if args.resume:
        if st.resume_since is None:
            print("  이어받기: 앞 회차가 없어 처음부터 전부 받았어요")
        else:
            print(f"  이어받기: 기준 {kst_text(st.resume_since)}(한국 시각) · 건너뜀 {st.resumed_skips:,}")
    if st.failed_sidos:
        print(f"  재해 목록을 못 받아 비워 둔 시도: {', '.join(st.failed_sidos)}")
    if st.mismatch_sidos:
        print("  " + " ".join(st.mismatch_sidos))
    return 2 if st.stop_reason in ("consecutive_failures", "consecutive_code_errors") else 0


if __name__ == "__main__":
    sys.exit(main())
