"""시세 이력 없는 단지 일괄 백필 스크립트 (세션 359, 사장님 지시 — 일회성)

배경: nearby_median_price IS NULL 인 단지 60,217개 중 실제 A1(매매) 시세 이력이
있는 건 22,975개(38%)뿐이었다. 정기 스케줄(collect_price_history, 매주 수요일
50개씩)로는 완주까지 수십 년이 걸려 사실상 영원히 못 끝난다. "이미 되는 단지는
다시 안 건드리고, 안 되는 단지만" 오늘 하루 만에 몰아서 처리한다(only_missing=True).

실측: 단지 1개당 약 3초(네이버 AdaptiveThrottle 안전장치 포함). 아직 시세 없는
단지 약 24,455개(매물 크롤은 이미 된 것 기준) 처리 시 약 20시간 예상.

중간에 문제가 생겨도 멈출 수 있도록 500개씩 나눠 반복 실행 — 배치마다 crawl_jobs
에 완료 기록이 남아(job_type="price_history") monitor.py 의 기존 감시망에 그대로
잡힌다(새 감시 축 불필요, 기존 것에 올라탐).

사용법: cd backend && python -m scripts.backfill_missing_price_history
중단하려면 Ctrl+C — 이미 처리된 단지는 시세 이력이 남아 다음 실행 시
only_missing 필터가 자동으로 건너뛴다(재실행 안전, 중복 작업 없음).
"""

import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

# 세션 359: 사장님 지시 — 20시간 도는 동안 중간중간 진행상황을 확인할 수 있게
# 콘솔뿐 아니라 파일 로그도 남긴다. scripts/backend.log 와 동일 위치 관례 답습.
_LOG_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scripts", "backfill_price_history.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(_LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

from sqlalchemy import exists

from crawler.service_price import collect_price_history
from db.database import SessionLocal
from db.models import Complex, ComplexPriceHistory

BATCH_SIZE = 500
# 배치 사이 짧은 휴지 — throttle 자체가 요청 간격을 보장하지만, 배치 경계에서도
# 서버가 계속 밀어붙이는 인상을 주지 않도록 약간의 여유를 둔다.
BATCH_PAUSE_SEC = 5


def _count_remaining(db) -> int:
    has_price_history = exists().where(
        ComplexPriceHistory.complex_no == Complex.complex_no,
        ComplexPriceHistory.trade_type == "A1",
    )
    return db.query(Complex.complex_no).filter(~has_price_history).count()


if __name__ == "__main__":
    db = SessionLocal()
    remaining = _count_remaining(db)
    db.close()
    print(f"=== 시세 이력 백필 시작 — 대상 {remaining}개 단지 (배치 {BATCH_SIZE}개씩) ===")

    round_no = 0
    while remaining > 0:
        round_no += 1
        print(f"--- 배치 {round_no}회차 시작 (남은 {remaining}개) ---")
        collect_price_history(
            batch_size=BATCH_SIZE,
            scheduler_job_id="backfill_missing_price_history",
            only_missing=True,
        )

        db = SessionLocal()
        new_remaining = _count_remaining(db)
        db.close()

        if new_remaining >= remaining:
            # 배치가 돌았는데도 안 줄면(전량 실패 등) 무한루프 방지 — 중단.
            print(f"⚠ 진행 안 됨 (남은 개수 {remaining}→{new_remaining}) — 중단합니다. 로그 확인 필요.")
            break
        remaining = new_remaining
        print(f"--- 배치 {round_no}회차 완료 (남은 {remaining}개) ---")
        if remaining > 0:
            time.sleep(BATCH_PAUSE_SEC)

    print(f"=== 종료 — 남은 {remaining}개 ===")
