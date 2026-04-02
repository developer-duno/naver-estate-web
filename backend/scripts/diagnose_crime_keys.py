"""범죄통계 키 매칭 진단 — stats vs population_map 키 비교

사용법: cd backend && python -m scripts.diagnose_crime_keys
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

from sqlalchemy import func

from crawler.crime_stats_api import CrimeStatsAPI
from db.database import SessionLocal
from db.mb_models import MBRegion

# 1) API 키 샘플
print("=== [1] 범죄통계 API 데이터 ===")
rows = CrimeStatsAPI.fetch_all()
if not rows:
    print("  API 응답 없음!")
    sys.exit(1)

print(f"  레코드 수: {len(rows)}")
print(f"  첫 레코드 키: {list(rows[0].keys())[:10]}...")

# aggregate
stats = CrimeStatsAPI.aggregate_by_region(rows)
print(f"\n  집계된 시군구: {len(stats)}개")
stats_keys = sorted(stats.keys())[:10]
print(f"  stats 키 샘플: {stats_keys}")

# 2) population_map 키 샘플
print("\n=== [2] regions 테이블 인구수 ===")
db = SessionLocal()
try:
    subq = (
        db.query(
            MBRegion.region,
            MBRegion.gu,
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
    population_map = {
        f"{r}_{g}" if g else r: pop
        for r, g, pop in pop_rows
    }
    print(f"  인구수 항목: {len(population_map)}개")
    pop_keys = sorted(population_map.keys())[:10]
    print(f"  population 키 샘플: {pop_keys}")

    # 3) 키 비교
    print("\n=== [3] 키 매칭 분석 ===")
    stats_set = set(stats.keys())
    pop_set = set(population_map.keys())
    matched = stats_set & pop_set
    stats_only = stats_set - pop_set
    pop_only = pop_set - stats_set

    print(f"  매칭됨: {len(matched)}개")
    print(f"  stats에만 존재: {len(stats_only)}개")
    print(f"  population에만 존재: {len(pop_only)}개")

    if stats_only:
        print("\n  stats에만 있는 키 (상위 20):")
        for k in sorted(stats_only)[:20]:
            print(f"    '{k}'")

    if pop_only:
        print("\n  population에만 있는 키 (상위 20):")
        for k in sorted(pop_only)[:20]:
            print(f"    '{k}'")
finally:
    db.close()
