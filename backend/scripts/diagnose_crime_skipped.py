"""범죄통계 건너뜀 원인 진단 — 매칭 안 되는 아파트 분석

사용법: cd backend && python -m scripts.diagnose_crime_skipped
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from collections import Counter

from sqlalchemy import func

from crawler.crime_stats_api import CrimeStatsAPI
from crawler.env_service import (
    _build_population_map,
    _build_score_lookup,
    _lookup_score,
)
from db.database import SessionLocal
from db.mb_models import Apartment, Infra, MBRegion

db = SessionLocal()
try:
    # 1) scored 재현
    rows = CrimeStatsAPI.fetch_all()
    stats = CrimeStatsAPI.aggregate_by_region(rows) if rows else {}

    subq = (
        db.query(
            MBRegion.region, MBRegion.gu,
            func.max(MBRegion.recorded_at).label("max_date"),
        )
        .group_by(MBRegion.region, MBRegion.gu)
        .subquery()
    )
    pop_rows = (
        db.query(MBRegion.region, MBRegion.gu, MBRegion.population)
        .join(
            subq,
            (MBRegion.region == subq.c.region)
            & (MBRegion.gu == subq.c.gu)
            & (MBRegion.recorded_at == subq.c.max_date),
        )
        .filter(MBRegion.population.isnot(None))
        .all()
    )
    population_map = _build_population_map(pop_rows)
    scored = CrimeStatsAPI.compute_scores(stats, population_map)
    score_lookup = _build_score_lookup(scored)

    # 2) 아파트 순회 — _lookup_score 폴백 포함
    apts = db.query(Apartment.id, Apartment.region, Apartment.gu).all()

    no_match_keys: Counter = Counter()
    no_infra = 0
    matched = 0

    for apt_id, region, gu in apts:
        result = _lookup_score(score_lookup, region, gu)
        if not result:
            key = f"{region}_{gu}" if gu else (region or "(빈값)")
            no_match_keys[key] += 1
            continue
        infra = db.get(Infra, apt_id)
        if not infra:
            no_infra += 1
            continue
        matched += 1

    print("=== 건너뜀 원인 분석 (폴백 적용 후) ===")
    print(f"  총 아파트: {len(apts)}")
    print(f"  매칭 성공: {matched}")
    print(f"  키 불일치: {sum(no_match_keys.values())}개 ({len(no_match_keys)}개 고유 키)")
    print(f"  infra 없음: {no_infra}")

    if no_match_keys:
        print("\n  매칭 안 되는 키 (전체):")
        for key, cnt in no_match_keys.most_common():
            print(f"    '{key}' — {cnt}개 아파트")

        # score_lookup 키 중 유사한 것 찾기
        print("\n  === 유사 키 제안 ===")
        for key, _ in no_match_keys.most_common():
            parts = key.split("_", 1)
            region_part = parts[0]
            gu_part = parts[1] if len(parts) > 1 else ""

            # 1) gu 부분이 포함된 키 찾기
            similar = [
                k for k in sorted(score_lookup)
                if gu_part and gu_part in k
            ][:5]

            # 2) 없으면 region 부분이 포함된 키 찾기
            if not similar and region_part:
                similar = [
                    k for k in sorted(score_lookup)
                    if region_part in k
                ][:5]

            if similar:
                print(f"    '{key}' → 유사: {similar}")
            else:
                print(f"    '{key}' → 유사 없음 (score_lookup에 region '{region_part}' 관련 키 없음)")

    # 3) score_lookup 키 목록 (region별)
    print("\n  === score_lookup 키 샘플 (region별) ===")
    region_keys: dict[str, list[str]] = {}
    for k in sorted(score_lookup):
        r = k.split("_")[0] if "_" in k else k
        region_keys.setdefault(r, []).append(k)
    for r in sorted(region_keys)[:5]:
        print(f"    {r}: {region_keys[r][:5]}")
finally:
    db.close()
