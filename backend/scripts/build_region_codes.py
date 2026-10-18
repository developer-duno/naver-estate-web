"""지역 코드 → 이름 표(backend/data/region_codes.json) 만들기 — 운영 complexes 에서 읽기만 한다 (세션 473).

왜: sigungu_codes.json 은 일반구(안양시 만안구 41171 등)가 없고 옛 코드(전남 46·광주 29·전북 45)라
운영 단지 코드 253종 중 83종(단지 23%)이 빠진다(2026-10-18 실측). 부동산원 지역 경로
("경기>경부1권>안양시>만안구")를 우리 단지 코드에 잇는 짝짓기(crawler/region_match.py)가 이 표를 쓴다.

무엇을 뽑나: complexes.cortar_no 앞 5자리마다 **가장 많이 나온** 시도 이름(complexes.sido → 짧은 이름)과
시군구 경로(cortar_address 의 첫 낱말·마지막 낱말(읍면동)을 뺀 가운데, 예 "안양시 만안구").
한 코드에 이름이 2종 이상이면 목록을 stderr 로 찍는다(사람이 확인할 것).
코드는 우리 단지 코드 그대로 둔다(전남광주 12xxx·전북 52xxx 도 그대로 — region_stats 와의 조인이 단순하다).

사용법(backend 폴더, 운영 .env 가 있는 곳에서):
    python scripts/build_region_codes.py            # data/region_codes.json 다시 씀
    python scripts/build_region_codes.py --check    # 다시 만든 결과가 파일과 같은지만(다르면 exit 1)
새 시군구 코드가 생기면(행정구역 개편) 다시 돌린다. DB 쓰기 0.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "region_codes.json"


def build(rows) -> tuple[dict[str, dict], list[str]]:
    """rows = (prefix5, sido 칸, cortar_address, 단지 수) 묶음 → (표, 이름이 갈린 코드 경고 목록)."""
    from crawler.region_match import normalize_sido, split_gwangju_jeonnam

    sidos: dict[str, Counter] = defaultdict(Counter)
    names: dict[str, Counter] = defaultdict(Counter)
    for prefix, sido_raw, address, n in rows:
        if not prefix or len(prefix) != 5 or not prefix.isdigit():
            continue
        parts = str(address or "").split()
        sigungu = " ".join(parts[1:-1]) if len(parts) >= 3 else ""
        sido = normalize_sido(sido_raw) or normalize_sido(parts[0] if parts else None)
        if sido == "전남광주":
            sido = split_gwangju_jeonnam(sigungu)
        if sido:
            sidos[prefix][sido] += n
        if sigungu:
            names[prefix][sigungu] += n
    out: dict[str, dict] = {}
    warnings: list[str] = []
    for prefix in sorted(set(sidos) | set(names)):
        if not sidos[prefix]:
            warnings.append(f"{prefix}: 시도 이름 없음 — 건너뜀")
            continue
        if len(sidos[prefix]) > 1:
            warnings.append(f"{prefix}: 시도 이름 {len(sidos[prefix])}종 {dict(sidos[prefix])}")
        if len(names[prefix]) > 1:
            warnings.append(f"{prefix}: 시군구 이름 {len(names[prefix])}종 {dict(names[prefix])}")
        sido = sidos[prefix].most_common(1)[0][0]
        sigungu = names[prefix].most_common(1)[0][0] if names[prefix] else ""
        out[prefix] = {"sido": sido, "sigungu": sigungu}
    return out, warnings


def _read_rows():
    from dotenv import load_dotenv

    load_dotenv(os.getenv("REGION_CODES_ENV_FILE") or None)
    from sqlalchemy import text

    from db.database import SessionLocal

    with SessionLocal() as db:
        return db.execute(text(
            "SELECT substr(cortar_no, 1, 5), sido, cortar_address, count(*) FROM complexes"
            " WHERE cortar_no IS NOT NULL GROUP BY 1, 2, 3"
        )).fetchall()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="지역 코드 → 이름 표 만들기(운영 complexes 읽기만)")
    p.add_argument("--check", action="store_true", help="파일과 같은지만 확인")
    args = p.parse_args(argv)
    table, warnings = build(_read_rows())
    for w in warnings:
        print(w, file=sys.stderr)
    text_out = json.dumps(table, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if args.check:
        same = OUT_PATH.exists() and OUT_PATH.read_text(encoding="utf-8") == text_out
        print("같음" if same else "다름 — 다시 만들어야 해요")
        return 0 if same else 1
    OUT_PATH.write_text(text_out, encoding="utf-8", newline="\n")
    print(f"{OUT_PATH.name}: 코드 {len(table)}개 · 경고 {len(warnings)}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
