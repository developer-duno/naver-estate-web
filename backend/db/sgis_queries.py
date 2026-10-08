"""단지 상세 "이 동네는" 카드 — SGIS 동네 통계 조회·조립 (PR ②, 세션 456).

설계서 = docs/superpowers/specs/2026-10-08-sgis-neighborhood-card-design.md §6.
표 `sgis_area_stats`(긴 모양, V071)에서 단지의 행정동(complexes.sgis_emd_cd) 한 곳의 고정 항목만 읽는다.
complexes 의 sgis_* 두 칸은 Complex 모델에 아직 없어(V071 운영 적용 전 재시작 대비 — map_complex_sgis.py 와 같은
이유) 그 칸만 text SQL 로 읽는다.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

NEIGHBORHOOD_YEAR = 2024
NEIGHBORHOOD_SOURCE = "국가데이터처 통계지리정보 센서스 2024, 홍수·산사태 위험지도 2025"
OLD_HOUSE_CUTOFF = "2004년 이전"
# 2004년 이전 지은 집 = 건축년도 구간 라벨 4개의 합(설계서 §10-1)
_OLD_HOUSE_ITEMS = (
    "ho_cy_label_0000_1979",
    "ho_cy_label_1980_1989",
    "ho_cy_label_1990_1999",
    "ho_cy_label_2000_2004",
)
_HOUSE_MIX = (   # 응답 칸 → housesummary 원문 칸(분모 = 거처 전체, 비율 그대로)
    ("apt_pct", "api_apart_per"),
    ("officetel_pct", "api_officetel_per"),
    ("row_pct", "api_row_house_per"),
    ("detached_pct", "api_detach_house_per"),
)
_DISASTER_KINDS = (("flood", "ndsm_flood"), ("landslide", "ndsm_lndsld"))
NEIGHBORHOOD_ITEMS = (
    "adm_nm", "to_in_001", "to_in_002", "to_ga_001", "ga_sd_005", "to_ho_001", "to_fa_010", "to_em_020",
    "api_corp_1006_per", *_OLD_HOUSE_ITEMS, *(code for _, code in _HOUSE_MIX),
    *(f"{p}_{s}" for _, p in _DISASTER_KINDS for s in ("affected", "affc_pop", "adm_pop", "year")),
)

Items = dict[str, tuple[Decimal | None, str | None]]


def get_complex_sgis_emd_cd(db: Session, complex_no: str) -> tuple[bool, str | None]:
    """(단지가 있나, 그 단지의 SGIS 행정동 8글자 코드 또는 None)."""
    row = db.execute(
        text("SELECT sgis_emd_cd FROM complexes WHERE complex_no = :no"), {"no": complex_no}
    ).first()
    if row is None:
        return False, None
    return True, (row[0] or None)


def get_sgis_neighborhood_items(db: Session, adm_cd: str, year: int = NEIGHBORHOOD_YEAR) -> Items:
    """그 동·연도의 카드용 항목만 → {item_code: (value, value_text)}. 행이 없는 항목은 키가 없다."""
    stmt = text(
        "SELECT item_code, value, value_text FROM sgis_area_stats"
        " WHERE adm_cd = :cd AND year = :y AND item_code IN :items"
    ).bindparams(bindparam("items", expanding=True))
    rows = db.execute(stmt, {"cd": adm_cd, "y": year, "items": list(NEIGHBORHOOD_ITEMS)}).fetchall()
    return {r[0]: (None if r[1] is None else Decimal(str(r[1])), r[2]) for r in rows}


def _num(items: Items, code: str) -> Decimal | None:
    return items.get(code, (None, None))[0]


def _round1(d: Decimal) -> float:
    return float(d.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def _int(d: Decimal | None) -> int | None:
    return None if d is None else int(d)


def _pct(part: Decimal | None, whole: Decimal | None) -> float | None:
    if part is None or whole is None or whole == 0:
        return None
    return _round1(part / whole * 100)


def _disaster(items: Items, prefix: str) -> dict | None:
    affected = _num(items, f"{prefix}_affected")
    if affected is None:
        return None   # 아직 안 받음(또는 그 시도 목록 호출 실패)
    if affected == 0:
        return {"affected": False}
    return {
        "affected": True,
        "pop": _int(_num(items, f"{prefix}_affc_pop")),
        "pop_total": _int(_num(items, f"{prefix}_adm_pop")),
        "year": _int(_num(items, f"{prefix}_year")),
    }


def build_neighborhood(emd_cd: str, items: Items, year: int = NEIGHBORHOOD_YEAR) -> dict | None:
    """카드 응답(설계서 §6). 그 동에 총인구(to_in_001) 행이 없으면 None(→ 404).

    산식에 드는 값이 하나라도 NULL·없음이면 그 칸만 null(0 으로 채우지 않는다).
    """
    if "to_in_001" not in items:
        return None
    avg_age = _num(items, "to_in_002")
    old_parts = [_num(items, c) for c in _OLD_HOUSE_ITEMS]
    old_sum = None if any(p is None for p in old_parts) else sum(old_parts, Decimal(0))
    mix = {key: _num(items, code) for key, code in _HOUSE_MIX}
    broker = _num(items, "api_corp_1006_per")
    return {
        "emd_cd": emd_cd,
        "emd_nm": items.get("adm_nm", (None, None))[1],
        "year": year,
        "population": _int(_num(items, "to_in_001")),
        "avg_age": None if avg_age is None else _round1(avg_age),
        "one_person_pct": _pct(_num(items, "ga_sd_005"), _num(items, "to_ga_001")),
        "households": _int(_num(items, "to_ga_001")),
        "house_mix": None if any(v is None for v in mix.values()) else {k: _round1(v) for k, v in mix.items()},
        "old_house_pct": _pct(old_sum, _num(items, "to_ho_001")),
        "old_house_cutoff": OLD_HOUSE_CUTOFF,
        "corp_cnt": _int(_num(items, "to_fa_010")),
        "worker_cnt": _int(_num(items, "to_em_020")),
        # 원문 비율 그대로(설계서 §6 예시 3.02 — 소수 2자리)
        "broker_pct": None if broker is None else float(broker),
        "flood": _disaster(items, "ndsm_flood"),
        "landslide": _disaster(items, "ndsm_lndsld"),
        "source": NEIGHBORHOOD_SOURCE,
    }
