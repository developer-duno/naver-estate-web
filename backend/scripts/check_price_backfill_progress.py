"""시세 이력 백필 진행상황 확인 스크립트 (세션 359, 일회성)

backfill_missing_price_history.py 가 20시간 동안 도는 사이 언제든 실행해서
현재 진행률을 즉시 확인할 수 있다. DB 조회만 하고 아무것도 안 바꾸는
읽기 전용 스크립트 — 몇 번을 실행해도 안전.

사용법: cd backend && python -m scripts.check_price_backfill_progress
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import exists, func, select

from db.database import SessionLocal
from db.models import Complex, ComplexPriceHistory, CrawlJob

if __name__ == "__main__":
    db = SessionLocal()

    has_price_history = exists().where(
        ComplexPriceHistory.complex_no == Complex.complex_no,
        ComplexPriceHistory.trade_type == "A1",
    )
    remaining = db.query(Complex.complex_no).filter(~has_price_history).count()

    jobs = db.execute(
        select(
            CrawlJob.status,
            func.count(CrawlJob.id).label("cnt"),
            func.sum(CrawlJob.processed_items).label("total_processed"),
            func.max(CrawlJob.completed_at).label("last_completed"),
        )
        .where(CrawlJob.scheduler_job_id == "backfill_missing_price_history")
        .group_by(CrawlJob.status)
    ).all()

    db.close()

    print("=== 시세 이력 백필 진행상황 ===")
    print(f"아직 시세 이력 없는 단지: {remaining}개")
    print()
    print("배치 실행 이력:")
    if not jobs:
        print("  (아직 시작 안 됨)")
    for row in jobs:
        print(
            f"  status={row.status} | 배치수={row.cnt} | "
            f"누적처리={row.total_processed or 0}건 | 마지막완료={row.last_completed}"
        )
