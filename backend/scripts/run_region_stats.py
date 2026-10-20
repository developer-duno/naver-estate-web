"""동네 공식 통계(한국부동산원 R-ONE) 수동 받기 — 표별 받은/저장/짝 안 됨 수를 찍는다 (세션 473).

사용법(backend 폴더에서):
    python scripts/run_region_stats.py --months-back 3            # 잡과 같은 범위
    python scripts/run_region_stats.py --months-back 24 --dry-run # 받기·짝짓기만, DB 쓰기 0(호출 수는 같다)

열쇠 = backend/.env 의 RONE_API_KEY(없으면 "부동산원 인증키가 없어요"로 멈춤). 호출 수 = 표 3개 × 쪽 수(1,000행당 1쪽).
"""

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


def _print_result(result: dict) -> None:
    print(f"기간 {result['start']}~{result['end']} · 상태 {result['status']}")
    if result.get("error"):
        print(f"사유: {result['error']}")
    for stat, t in result["tables"].items():
        print(
            f"- {stat}({t['statbl_id']}): 받은 행 {t['received']:,} · 넣을 행 {t['to_save']:,}"
            f" · 저장 {t['saved']:,} · 값 없음 {t['no_value']:,} · 짝 안 됨 {sum(t['unmatched'].values()):,}"
        )
        for path, n in sorted(t["unmatched"].items(), key=lambda kv: -kv[1]):
            print(f"    짝 안 됨: {path} ×{n}")
        u = result.get("uncovered_regions", {}).get(stat)
        if u:
            print(f"    값을 못 받은 우리 지역 {u['count']}곳: {' '.join(u['codes'][:40])}")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="동네 공식 통계(부동산원) 수동 받기")
    p.add_argument("--months-back", type=int, default=3, help="오늘 기준 몇 달 전부터 받을지(기본 3)")
    p.add_argument("--dry-run", action="store_true", help="받기·짝짓기만 하고 DB 에 쓰지 않는다")
    args = p.parse_args(argv)

    from crawler.service_region_stats import collect_region_stats

    result = collect_region_stats(months_back=args.months_back, dry_run=args.dry_run)
    _print_result(result)
    return 0 if result["status"] in ("completed", "dry_run") and not result.get("error") else 1


if __name__ == "__main__":
    sys.exit(main())
