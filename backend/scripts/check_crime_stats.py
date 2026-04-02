"""범죄통계 DB 반영 확인 스크립트

사용법: cd backend && python -m scripts.check_crime_stats
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import func, select

from db.database import SessionLocal
from db.mb_models import Infra

if __name__ == "__main__":
    db = SessionLocal()
    try:
        total = db.execute(select(func.count()).select_from(Infra)).scalar() or 0
        scored = db.execute(
            select(func.count()).select_from(Infra).where(Infra.crime_score.isnot(None))
        ).scalar() or 0
        last_updated = db.execute(select(func.max(Infra.crime_updated_at))).scalar()

        grade_rows = db.execute(
            select(Infra.crime_grade, func.count())
            .where(Infra.crime_grade.isnot(None))
            .group_by(Infra.crime_grade)
        ).all()

        print("=== 범죄통계 DB 현황 ===")
        print(f"  infra 총 레코드: {total}")
        print(f"  crime_score 반영: {scored} ({scored * 100 // max(total, 1)}%)")
        print(f"  마지막 업데이트: {last_updated or '없음'}")
        print("  등급 분포:")
        for grade, count in sorted(grade_rows, key=lambda x: x[0] or ""):
            print(f"    {grade}: {count}개")
        if not grade_rows:
            print("    (데이터 없음)")
    finally:
        db.close()
