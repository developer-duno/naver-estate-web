# -*- coding: utf-8 -*-
"""공동주택 공시가격 수집 즉시 실행 — 세션 373, 사장님 요청으로 9/15 정기 실행을 기다리지
않고 PR-E1(#391) 개편맵 반영분을 지금 회수하기 위한 일회성 수동 트리거.

⚠ 관리자 API(routers/admin/collect.py)에는 official_price 가 등록돼 있지 않다(동기 호출
구조라 3.6~7h 짜리 잡에 안 맞음) — 그래서 스케줄러가 매달 15일에 부르는 것과 동일한
함수를 여기서 직접 부른다. schtasks 로 세션 독립 실행해야 한다(release.md §3 절차 답습 —
터미널 세션에서 직접 python 으로 띄우면 세션이 끊길 때 같이 죽는다).

실행 (schtasks 경유, 세션 독립):
    schtasks /Create /TN naver-official-price-manual /SC ONCE /ST <HH:MM> /F ^
        /TR "C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python312\\pythonw.exe D:\\naver-estate-web\\backend\\scripts\\run_official_price_now.py"
    schtasks /Run /TN naver-official-price-manual
    schtasks /Delete /TN naver-official-price-manual /F
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(
            Path(__file__).resolve().parent.parent / "scripts" / "official_price_manual.log",
            encoding="utf-8",
        ),
        logging.StreamHandler(),
    ],
)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from crawler.service_official_price import collect_official_prices  # noqa: E402

if __name__ == "__main__":
    logging.getLogger(__name__).info(
        "[manual] 공동주택 공시가격 수동 재수집 시작 (세션 373, PR-E1 개편맵 첫 검증)"
    )
    collect_official_prices(scheduler_job_id="official_price")
    logging.getLogger(__name__).info("[manual] 공동주택 공시가격 수동 재수집 완료")
