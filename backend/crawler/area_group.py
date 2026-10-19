"""전용면적 묶음 — 정수 ㎡ 로 내림 (세션 474 B27, 사장님 결정 D2 「ㄱ. 정수 ㎡로 내림」).

84.36 · 84.94 · 84.97㎡ 는 전부 84 묶음이다. 손님이 말하는 "59·84㎡" 와 같고, 정부 응답 면적(84.94)과
평형표 면적(84.93)의 소수 둘째 차이에 흔들리지 않는다. 부동산원·미분양의 "같은 주택 = 소수 둘째까지 같음"
정의와는 다르므로 화면 출처 줄에 "전용 84㎡ 대" 라고 밝힌다(db/area_price_queries.py area_price_source).

쓰는 곳: 수집기(crawler/public_trade_match.py aggregate_by_area) · 가치지표(crawler/service_metrics.py) ·
단지 상세 직렬화·그래프(routers·db/price_queries.py). 프런트 lib/area-group.ts 가 같은 규칙(내림)을 쓴다.
"""

import math
import re

_DIGITS = re.compile(r"\d+")


def area_group_of(value) -> int | None:
    """전용면적 → 정수 ㎡ 묶음. 문자열·숫자 모두 받는다. 0 이하·못 읽는 값은 None.

    "84.94" → 84 · "84.00" → 84 · "84.99" → 84 · 59.98 → 59 · "" / None / "abc" / 0 → None.
    """
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(num) or num <= 0:
        return None
    group = math.floor(num)
    return group if group > 0 else None


def parse_households(value) -> int:
    """평형별 세대수 문자열("116" · "116세대") → 정수. 못 읽으면 0."""
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return max(value, 0)
    if not isinstance(value, str):
        return 0
    m = _DIGITS.search(value.replace(",", ""))
    return int(m.group()) if m else 0


def load_pyeong_tables(db, complex_nos=None) -> dict[str, list[tuple[int, int | None, int]]]:
    """평형표를 단지별로 한 번에 읽는다 → {단지: [(pyeong_no, 묶음 ㎡ | None, 세대수)]}.

    complex_nos 를 주면 그 단지들만(500개씩 나눠 읽음), None 이면 전부(가치지표 잡 — 한 번 읽기).
    """
    from db.models import ComplexPyeongDetail

    cols = (
        ComplexPyeongDetail.complex_no,
        ComplexPyeongDetail.pyeong_no,
        ComplexPyeongDetail.exclusive_area,
        ComplexPyeongDetail.household_count_by_pyeong,
    )
    if complex_nos is None:
        rows = db.query(*cols).all()
    else:
        nos = list(complex_nos)
        rows = []
        for i in range(0, len(nos), 500):
            rows.extend(db.query(*cols).filter(ComplexPyeongDetail.complex_no.in_(nos[i:i + 500])).all())
    out: dict[str, list[tuple[int, int | None, int]]] = {}
    for complex_no, pyeong_no, exclusive_area, households in rows:
        out.setdefault(complex_no, []).append(
            (int(pyeong_no), area_group_of(exclusive_area), parse_households(households))
        )
    return out


def groups_of_table(table: list[tuple[int, int | None, int]]) -> dict[int, int]:
    """평형표 한 단지분 → {pyeong_no: 묶음 ㎡}(면적을 못 읽는 평형은 뺀다)."""
    return {pno: area for pno, area, _ in table if area is not None}


def pyeong_area_groups(db, complex_no: str) -> dict[int, int]:
    """그 단지 평형번호 → 묶음 ㎡. 평형표가 없으면 빈 dict."""
    return groups_of_table(load_pyeong_tables(db, [complex_no]).get(complex_no, []))


def pick_representative(
    table: list[tuple[int, int | None, int]] | None, trade_counts: dict[int, int] | None,
) -> int | None:
    """대표 면적 묶음 — 평형표 묶음별 세대수 합 최다 → 동률이면 거래 수 많은 쪽 → 그래도 같으면 작은 면적.

    평형표가 없거나(면적을 하나도 못 읽음) 비면 trade_counts(최근 6개월 거래 수) 최다 → 동률이면 작은 면적.
    둘 다 없으면 None.
    """
    counts = trade_counts or {}
    households: dict[int, int] = {}
    for _pno, area, hh in table or []:
        if area is not None:
            households[area] = households.get(area, 0) + hh
    if households:
        return min(households, key=lambda a: (-households[a], -counts.get(a, 0), a))
    if counts:
        return min(counts, key=lambda a: (-counts[a], a))
    return None


def representative_area(db, complex_no: str, fallback_counts: dict[int, int] | None) -> int | None:
    """그 단지 대표 면적 묶음(pick_representative 규칙). fallback_counts = 묶음별 최근 6개월 거래 수."""
    table = load_pyeong_tables(db, [complex_no]).get(complex_no, [])
    return pick_representative(table, fallback_counts)
