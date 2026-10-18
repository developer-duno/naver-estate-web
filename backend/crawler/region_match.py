"""부동산원(R-ONE) 지역 경로 → 우리 지역 코드 5자리 짝짓기 (세션 473, 순수 함수).

재료 = backend/data/region_codes.json(우리 단지 코드 앞 5자리 → {sido 짧은 이름, sigungu "안양시 만안구"} —
scripts/build_region_codes.py 가 운영 complexes 에서 만든다). 코드는 우리 단지 코드 그대로(전남광주 12xxx·
전북 52xxx·인천/화성 새 구 포함)라 region_stats 와 단지가 앞 5자리로 바로 이어진다.

R-ONE 경로 예: "경기>경부1권>안양시>만안구" · "강원>춘천시" · "전남광주>전남" · "서울>강북지역" · "전국".
규칙
  ① 권역 조각(…권·…권역·…지역)은 버린다. 권역만 남으면(서울>강북지역) 짝 없음(None) — 시도 값으로 바꾸지 않는다.
  ② 첫 조각 = 시도(짧은 이름). "전남광주" 는 다음 조각(전남·광주)이 시도이고, 없으면 시군구 이름으로 가른다.
  ③ 시도만 남으면 시도 코드(SIDO_CODES — 시도 이름 기준 고정 표, 우리 단지 코드 앞자리와 무관). "전국" → "00000".
  ④ 시군구 조각은 "시 구" 로 이어 그 시도 안에서 찾고, 없으면 마지막 조각 단독으로 그 시도 안에서 하나뿐일 때만.
  ⑤ 못 찾으면 None(지어내지 않는다 — 짝 안 된 경로는 적재 결과 unmatched 에 남는다).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_CODES_PATH = Path(__file__).resolve().parent.parent / "data" / "region_codes.json"

NATION_CODE = "00000"
# 시도 짧은 이름 → 시도 코드(행정표준 시도 코드 + "000"). 전남·광주는 통합 전 코드(46·29)로 고정한다 —
# 우리 단지 코드 앞자리(12)는 둘을 가르지 못하므로 단지 → 시도는 이름(region_codes.json 의 sido)으로 찾는다.
SIDO_CODES: dict[str, str] = {
    "서울": "11000", "부산": "26000", "대구": "27000", "인천": "28000", "광주": "29000",
    "대전": "30000", "울산": "31000", "세종": "36000", "경기": "41000", "강원": "51000",
    "충북": "43000", "충남": "44000", "전북": "52000", "전남": "46000", "경북": "47000",
    "경남": "48000", "제주": "50000",
}
SIDO_NAME_OF_CODE: dict[str, str] = {v: k for k, v in SIDO_CODES.items()}
# 시도 이름 정규화(우리 complexes.sido·cortar_address·R-ONE 첫 조각의 여러 꼴 → 짧은 이름)
_SIDO_ALIASES: dict[str, str] = {
    "서울특별시": "서울", "서울시": "서울", "부산광역시": "부산", "부산시": "부산",
    "대구광역시": "대구", "대구시": "대구", "인천광역시": "인천", "인천시": "인천",
    "광주광역시": "광주", "광주시": "광주", "대전광역시": "대전", "대전시": "대전",
    "울산광역시": "울산", "울산시": "울산", "세종특별자치시": "세종", "세종시": "세종",
    "경기도": "경기", "강원도": "강원", "강원특별자치도": "강원", "충청북도": "충북", "충청남도": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전북도": "전북", "전라남도": "전남",
    "경상북도": "경북", "경상남도": "경남", "제주특별자치도": "제주", "제주도": "제주",
    "전남광주시": "전남광주", "전남광주특별시": "전남광주", "전남광주통합특별시": "전남광주",
}
# 전남광주 통합 체계에서 광주(옛 광역시)의 자치구 이름 — 이 밖이면 전남
GWANGJU_GU = frozenset({"동구", "서구", "남구", "북구", "광산구"})
# 시도가 곧 하나의 시군구인 곳 — 시군구 표(전세가율)에서 시도 이름만 오면 그 시도 코드로 둔다
SINGLE_SIGUNGU_SIDO = frozenset({"세종"})
_ZONE_SUFFIXES = ("권역", "권", "지역")


def normalize_sido(name) -> str | None:
    if not name:
        return None
    s = str(name).strip()
    if s in SIDO_CODES or s == "전남광주":
        return s
    return _SIDO_ALIASES.get(s)


def split_gwangju_jeonnam(sigungu: str | None) -> str:
    """전남광주 체계 단지의 시군구 이름 → "광주" 또는 "전남"."""
    first = (sigungu or "").split(" ")[0]
    return "광주" if first in GWANGJU_GU else "전남"


def _is_zone(piece: str) -> bool:
    return piece.endswith(_ZONE_SUFFIXES) and piece not in GWANGJU_GU


@lru_cache(maxsize=1)
def region_codes() -> dict[str, dict]:
    """region_codes.json 전체(5자리 → {sido, sigungu})."""
    with open(_CODES_PATH, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _indexes() -> tuple[dict[tuple[str, str], list[str]], dict[tuple[str, str], list[str]]]:
    full: dict[tuple[str, str], list[str]] = {}
    last: dict[tuple[str, str], list[str]] = {}
    for code, info in region_codes().items():
        sido, sigungu = info.get("sido"), info.get("sigungu") or ""
        if not sido or not sigungu:
            continue
        full.setdefault((sido, sigungu), []).append(code)
        last.setdefault((sido, sigungu.split(" ")[-1]), []).append(code)
    return full, last


def rone_path_to_region_code(cls_fullnm: str | None) -> str | None:
    """R-ONE CLS_FULLNM → 우리 지역 코드 5자리(시군구) · 시도 코드(앞 2자리+000) · "00000"(전국) · None."""
    if not cls_fullnm:
        return None
    raw = [p.strip() for p in str(cls_fullnm).split(">") if p.strip()]
    if not raw:
        return None
    if raw == ["전국"]:
        return NATION_CODE
    sido = normalize_sido(raw[0])
    if sido is None:
        return None
    rest = raw[1:]
    had_zone = any(_is_zone(p) for p in rest)
    rest = [p for p in rest if not _is_zone(p)]
    if sido == "전남광주":
        if rest and rest[0] in ("전남", "광주"):
            sido, rest = rest[0], rest[1:]
        elif rest:
            sido = split_gwangju_jeonnam(rest[0])
        else:
            return None   # 통합 전체 값은 우리 시도 코드표에 자리가 없다
    if not rest:
        if had_zone:
            return None   # 권역(서울>강북지역) — 시도 값으로 바꾸지 않는다
        return SIDO_CODES.get(sido)
    full, last = _indexes()
    hit = full.get((sido, " ".join(rest)))
    if hit and len(hit) == 1:
        return hit[0]
    hit = last.get((sido, rest[-1]))
    if hit and len(hit) == 1:
        return hit[0]
    return None


def sido_name_of_region(region_code: str | None) -> str | None:
    """우리 단지 코드 5자리 → 시도 짧은 이름(region_codes.json) — 없으면 None."""
    if not region_code:
        return None
    info = region_codes().get(region_code)
    return info.get("sido") if info else None


def sigungu_name_of_region(region_code: str | None) -> str | None:
    """우리 단지 코드 5자리 → 시군구 이름("천안시 동남구") — 없으면 None."""
    if not region_code:
        return None
    info = region_codes().get(region_code)
    return (info.get("sigungu") or None) if info else None
