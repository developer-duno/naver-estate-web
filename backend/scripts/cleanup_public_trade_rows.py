"""옛 정부 실거래가 줄 일회성 정리 (세션 469 — 기본은 세기만).

배경
    정부 실거래가에는 단지 번호·법정동 코드가 없어 이름만으로 붙이던 동안, 같은 시군구의 같은
    이름 단지끼리 거래가 섞였고 오피스텔에도 아파트 매매 값이 붙었다. 짝짓기를 고친 뒤 주간·소급
    수집은 이번 24달 안의 옛 줄을 스스로 지우지만, 그 밖에 남는 두 가지를 이 스크립트가 다룬다.

대상 (정부 줄 = complex_price_history 의 trade_type 'A1' 이고 area_no 가 '' 이고 base_month 가 6자리 달 — 네이버 줄(8자리 달)과 NULL(공유 표의 미분양 몫)은 안 건드린다)
    ⓐ 오피스텔(OPST·OBYG) 단지의 정부 줄 전부 → --apply 때 지운다.
    ⓑ "같은 시군구(법정동 코드 앞 5자리)·같은 정규화 이름인데 법정동 코드가 둘 이상이고, 그중 정부 줄을
       가진 단지가 둘 이상"인 묶음 소속 단지의 정부 줄 중 이번 24달 시작보다 오래된 것(ⓐ 와 겹치는 단지는 ⓐ 로만 센다)
       → **지우지 않고 세기만** 한다(사장님 결정 2026-10-17). 그 단지 번호를 --out 의 "mixed" 에 남기고
       scripts/backfill_complex_list.py 가 60달 소급으로 다시 쓴다(소급이 틀린 줄을 지우고 맞는 줄을 쓴다).

사용법 (운영 적용 전 pg_dump 데이터 덤프 · 사장님 허락 — infra.md §DB 백업)
    cd backend && python scripts/cleanup_public_trade_rows.py                 # 세기만
    cd backend && python scripts/cleanup_public_trade_rows.py --out 대상.json  # 대상 단지 번호 저장(키 opst·mixed)
    cd backend && python scripts/cleanup_public_trade_rows.py --apply         # 오피스텔 줄만 1,000줄씩 지우고 그때마다 저장
"""

import argparse
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

OPST_TYPES = ("OPST", "OBYG")
CHUNK = 1_000


def _chunks(items: list, size: int = CHUNK):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def _gov_filter(model):
    """정부 줄 = A1 · area_no '' · 6자리 달(공공 경로 표식 — 네이버 경로는 8자리)."""
    from sqlalchemy import func

    return (model.trade_type == "A1", model.area_no == "", func.length(model.base_month) == 6)


def _target_complexes(db) -> tuple[list[str], list[str]]:
    """(오피스텔 단지 번호들, 섞인 묶음 소속 단지 번호들 — 오피스텔 제외)."""
    from crawler.public_data_api import _normalize_apt_name
    from db.models import Complex, ComplexPriceHistory

    with_gov = {
        no for (no,) in db.query(ComplexPriceHistory.complex_no)
        .filter(*_gov_filter(ComplexPriceHistory)).distinct()
    }
    opst: list[str] = []
    groups: dict[tuple[str, str], list[tuple[str, str]]] = {}
    for no, name, cortar_no, type_code in db.query(
        Complex.complex_no, Complex.complex_name, Complex.cortar_no, Complex.real_estate_type_code,
    ):
        if type_code in OPST_TYPES:
            opst.append(no)
        norm = _normalize_apt_name(name)
        if not cortar_no or len(cortar_no) < 5 or not norm:
            continue
        groups.setdefault((cortar_no[:5], norm), []).append((no, cortar_no))

    opst_set = set(opst)
    mixed: list[str] = []
    for members in groups.values():
        if len({code for _, code in members}) < 2:
            continue
        if sum(1 for no, _ in members if no in with_gov) < 2:
            continue
        mixed.extend(no for no, _ in members if no not in opst_set)
    return sorted(opst), sorted(mixed)


def find_targets(db, months: list[str]) -> dict[str, list[int]]:
    """지울 complex_price_history.id — {"opst": [...], "mixed_old": [...]}."""
    from db.models import ComplexPriceHistory

    opst_nos, mixed_nos = _target_complexes(db)
    window_start = min(months)
    opst_ids: list[int] = []
    for part in _chunks(opst_nos):
        opst_ids += [
            i for (i,) in db.query(ComplexPriceHistory.id)
            .filter(ComplexPriceHistory.complex_no.in_(part), *_gov_filter(ComplexPriceHistory))
        ]
    mixed_ids: list[int] = []
    for part in _chunks(mixed_nos):
        mixed_ids += [
            i for (i,) in db.query(ComplexPriceHistory.id)
            .filter(
                ComplexPriceHistory.complex_no.in_(part), *_gov_filter(ComplexPriceHistory),
                ComplexPriceHistory.base_month < window_start,
            )
        ]
    return {"opst": sorted(opst_ids), "mixed_old": sorted(mixed_ids)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="옛 정부 실거래가 줄 일회성 정리 (기본은 세기만)")
    parser.add_argument("--apply", action="store_true",
                        help="오피스텔 정부 줄만 실제로 지운다 (1,000줄씩 지우고 그때마다 저장)")
    parser.add_argument("--out", default=None,
                        help="대상 단지 번호를 JSON 파일로 저장 — 키 opst·mixed (mixed = 소급으로 다시 쓸 목록)")
    args = parser.parse_args(argv)

    from crawler.service_public import _recent_months
    from db.database import SessionLocal
    from db.models import ComplexPriceHistory

    months = _recent_months(date.today(), 24)
    with SessionLocal() as db:
        targets = find_targets(db, months)
        opst_nos, mixed_nos = _target_complexes(db)
        print(f"오피스텔 {len(targets['opst']):,}줄(--apply 때 지움)"
              f" · 섞인 묶음 창 밖 {len(targets['mixed_old']):,}줄(지우지 않음 — 소급으로 다시 씀,"
              f" 단지 {len(mixed_nos):,}곳) (24달 창 시작 {months[0]})")
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump({"opst": opst_nos, "mixed": mixed_nos}, f, ensure_ascii=False, indent=1)
            print(f"대상 단지 번호를 {args.out} 에 저장했어요")
        if not args.apply:
            print("세기만 했어요 — 오피스텔 줄을 지우려면 --apply 를 붙여 다시 실행하세요")
            return 0
        deleted = 0
        for part in _chunks(targets["opst"]):
            deleted += (
                db.query(ComplexPriceHistory)
                .filter(ComplexPriceHistory.id.in_(part))
                .delete(synchronize_session=False)
            )
            db.commit()
        print(f"지웠어요: 오피스텔 {deleted:,}줄 (섞인 묶음 줄은 그대로 — scripts/backfill_complex_list.py 로 다시 쓰기)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
