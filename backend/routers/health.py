"""심층 헬스체크 — DB 연결 상태 확인

기존 `/health`(main.py) 는 워치독이 폴링하는 얕은 헬스체크로, DB 장애 시에도
200 을 반환해야 한다(그래야 워치독이 DB 장애를 프로세스 장애로 오인해 무의미한
재시작 루프를 돌지 않는다). 이 라우터는 그와 별개로 DB 연결까지 확인하는
심층 엔드포인트를 제공해 외부 uptime 모니터(healthcheck.yml)가 DB 장애를
감지할 수 있게 한다.
"""

import logging

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from deps import get_db

logger = logging.getLogger(__name__)

router = APIRouter()


# HEAD 도 허용 — 외부 감시 서비스가 HEAD 프로브를 쓰는데 GET 전용이라 405 를 받던 것 방지 (2026-08-09, 세션 353)
@router.get("/health/db")
@router.head("/health/db")
def health_check_db(response: Response, db: Session = Depends(get_db)):
    """DB 연결까지 확인하는 심층 헬스체크. 외부 uptime 모니터 전용.

    성공: 200 {"status":"ok","db":"ok"}
    실패: 503 {"status":"degraded","db":"down"} (HTTPException 500 대신 클린 JSON)
    """
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception as e:
        logger.warning("[HEALTH] DB 헬스체크 실패: %s", e)
        response.status_code = 503
        return {"status": "degraded", "db": "down"}
