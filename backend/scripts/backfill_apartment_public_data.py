"""국토교통부 실거래가로 아파트 시세 이력 일괄 소급 수집 (세션 359, 일회성)

배경: backfill_price_batch(정기 스케줄, 매일 03:30 배치 20개)가 하루 10,000회
쿼터(mibunyang과 공유) 중 최대 480회(20개 x 24개월)만 써서 4.8%만 사용 중이었다.
같은 시군구 여러 단지가 (lawd_cd, deal_ymd) 를 중복 호출하는 낭비도 있었는데
public_data_api.py 에 프로세스 내 캐시를 추가해 해소했다(세션 359).

아직 A1(매매) 시세 이력이 없는 아파트 23,036개(세대수/법정동코드 보유, 정상
backfill 대상)를 오늘 하루 안에 처리한다. PublicDataAPI._check_daily_limit
(max_calls=9000)이 쿼터 안전장치로 이미 내장돼 있어 자동으로 멈춘다.

사용법: cd backend && python -m scripts.backfill_apartment_public_data
중단하려면 Ctrl+C — 이미 처리된 단지는 다음 실행 시 자동으로 건너뛴다
(선정 기준이 "이력 6개월 미만"이라 재실행 안전, 중복 작업 없음).
"""

import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

_LOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "scripts", "backfill_public_data.log"
)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(_LOG_PATH, encoding="utf-8"), logging.StreamHandler()],
)

from sqlalchemy import func

from crawler.service_public import backfill_price_batch
from db.database import SessionLocal
from db.models import Complex, ComplexPriceHistory

# 세대수 큰 순 정렬 그대로 두되(기존 우선순위 로직 존중), 배치를 크게 키운다.
# PublicDataAPI._check_daily_limit(max_calls=9000)이 쿼터 안전장치 — 초과 시
# get_apt_trades()가 None 을 반환해 이 스크립트 루프도 자연히 진행이 멈춘다.
BATCH_SIZE = 300
BATCH_PAUSE_SEC = 5


def _count_eligible_remaining(db) -> int:
    """backfill_price_batch 와 동일한 선정 기준(세대수/법정동코드 보유 + 이력 6개월 미만)."""
    rich_nos = (
        db.query(ComplexPriceHistory.complex_no)
        .group_by(ComplexPriceHistory.complex_no)
        .having(func.count() >= 6)
        .subquery()
    )
    return (
        db.query(Complex.complex_no)
        .filter(
            Complex.total_household_count.isnot(None),
            Complex.cortar_no.isnot(None),
            ~Complex.complex_no.in_(rich_nos.select()),
        )
        .count()
    )


if __name__ == "__main__":
    db = SessionLocal()
    remaining = _count_eligible_remaining(db)
    db.close()
    print(f"=== 국토부 실거래가 아파트 백필 시작 — 대상 {remaining}개 단지 (배치 {BATCH_SIZE}개씩) ===")

    round_no = 0
    while remaining > 0:
        round_no += 1
        print(f"--- 배치 {round_no}회차 시작 (남은 {remaining}개) ---")
        backfill_price_batch(
            batch_size=BATCH_SIZE, scheduler_job_id="backfill_apartment_public_data",
        )

        db = SessionLocal()
        new_remaining = _count_eligible_remaining(db)
        db.close()

        if new_remaining >= remaining:
            print(f"⚠ 진행 안 됨 (남은 개수 {remaining}→{new_remaining}) — 쿼터 소진 또는 오류. 중단합니다.")
            break
        remaining = new_remaining
        print(f"--- 배치 {round_no}회차 완료 (남은 {remaining}개) ---")
        if remaining > 0:
            time.sleep(BATCH_PAUSE_SEC)

    print(f"=== 종료 — 남은 {remaining}개 ===")
