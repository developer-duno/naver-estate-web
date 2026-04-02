"""범죄통계 수동 수집 스크립트

사용법: cd backend && python -m scripts.run_crime_stats
"""

import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

from crawler.env_service import collect_crime_stats

if __name__ == "__main__":
    print("=== 범죄통계 수집 시작 ===")
    collect_crime_stats()
    print("=== 완료 ===")
