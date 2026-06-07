"""가격 수집 라우트 — 실거래가 on-demand 수집"""

import logging
import threading
import time

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from starlette import status as http_status

from db.database import SessionLocal
from db.models import Complex as ComplexModel
from deps import get_approved_user, get_db
from utils import utcnow

from ._shared import (
    _PRICE_COLLECT_TIMEOUT,
    _PRICE_COLLECT_TTL,
    _price_collect_lock,
    _price_collect_semaphore,
    _price_collect_status,
    router,
)

logger = logging.getLogger(__name__)


def _cleanup_stale_price_collects():
    """10분 이상 된 수집 상태 자동 정리 (lock 내에서 호출)."""
    now = time.time()
    expired = [k for k, v in _price_collect_status.items()
               if now - v.get("started_at", now) > _PRICE_COLLECT_TIMEOUT]
    for k in expired:
        _price_collect_status.pop(k, None)


@router.post("/{complex_no}/price-history/start-collect")
def start_price_collect(
    complex_no: str,
    user: dict = Depends(get_approved_user),
    db: Session = Depends(get_db),
):
    """실거래가 시세 on-demand 수집 시작 (백그라운드). 24시간 TTL 내 재수집 스킵."""
    from datetime import timedelta

    from auth.permissions import check_quota, require_role
    from db.models import ComplexPriceHistory, UserProfile

    require_role(user, ["admin", "expert"])

    # 단지 존재 확인
    cpx = db.query(ComplexModel).filter(ComplexModel.complex_no == complex_no).first()
    if not cpx:
        raise HTTPException(status_code=404, detail="단지를 찾을 수 없습니다")

    # TTL 체크 — 24시간 이내 수집된 데이터가 있으면 스킵
    cutoff = utcnow() - timedelta(seconds=_PRICE_COLLECT_TTL)
    recent = (
        db.query(ComplexPriceHistory)
        .filter(
            ComplexPriceHistory.complex_no == complex_no,
            ComplexPriceHistory.recorded_at >= cutoff,
        )
        .first()
    )
    if recent:
        return {"complex_no": complex_no, "status": "fresh"}

    # 쿼터 확인
    profile = db.query(UserProfile).filter(UserProfile.user_id == user["user_id"]).first()
    quota_limit = profile.daily_price_collect_quota if profile else 5
    check_quota(db, user["user_id"], "price_collect", quota_limit)

    # 이미 수집 중인지 확인 (2분 이상 running이면 stale로 간주)
    with _price_collect_lock:
        _cleanup_stale_price_collects()
        status = _price_collect_status.get(complex_no)
        if status and status.get("status") == "running":
            elapsed = time.time() - status.get("started_at", 0)
            if elapsed < 120:  # 2분 이내면 진짜 수집 중
                raise HTTPException(status_code=409, detail="이미 수집 중입니다")
            # 2분 이상이면 stale — 정리하고 새로 시작
            _price_collect_status.pop(complex_no, None)
        elif status:
            # done/error 상태는 정리하고 새 수집 허용
            _price_collect_status.pop(complex_no, None)

    # Semaphore 확인 (동시 3개 제한)
    if not _price_collect_semaphore.acquire(blocking=False):
        raise HTTPException(
            status_code=http_status.HTTP_429_TOO_MANY_REQUESTS,
            detail="동시 수집 요청이 가득 찼습니다. 잠시 후 다시 시도해주세요.",
        )

    # 상태 등록
    with _price_collect_lock:
        _price_collect_status[complex_no] = {
            "status": "running",
            "collected": 0,
            "failed": 0,
            "total": 0,
            "started_at": time.time(),
        }

    db.commit()  # 쿼터 카운터 반영

    def _progress_callback(collected: int, failed: int, total: int):
        """수집 중 실시간 진행률 업데이트"""
        with _price_collect_lock:
            st = _price_collect_status.get(complex_no)
            if st and st["status"] == "running":
                st["collected"] = collected
                st["failed"] = failed
                st["total"] = total

    def _run():
        collect_db = SessionLocal()
        try:
            from crawler.service import collect_price_history_for_complex
            result = collect_price_history_for_complex(
                collect_db, complex_no, on_progress=_progress_callback,
            )
            # 전부 실패(수집 0 + 실패>0)면 네이버 차단/오류 → 'error' 로 구분.
            # 'done' 으로 찍으면 사용자가 "수집 실패"를 "데이터 없음"으로 오인 (세션 280).
            # collected=0 && failed=0 = 진짜 데이터 없는 신축 → 'done' 유지(차트가 빈 안내).
            _is_error = result["collected"] == 0 and result["failed"] > 0
            with _price_collect_lock:
                _price_collect_status[complex_no].update({
                    "status": "error" if _is_error else "done",
                    "error": "시세 조회 실패 (네이버 응답 없음)" if _is_error else None,
                    "collected": result["collected"],
                    "failed": result["failed"],
                    "total": result["total"],
                })
            # 캐시 무효화
            from routers.complexes import _price_history_cache
            _price_history_cache.delete_by_prefix(f"price_history:{complex_no}:")
        except Exception as e:
            logger.exception("시세 수집 실패: %s", complex_no)
            with _price_collect_lock:
                st = _price_collect_status.get(complex_no)
                if st:
                    st["status"] = "error"
                    st["error"] = str(e)[:200]
        finally:
            collect_db.close()
            _price_collect_semaphore.release()

    t = threading.Thread(target=_run, daemon=True)
    t.start()

    return {"complex_no": complex_no, "status": "started"}


@router.get("/{complex_no}/price-history/collect-status")
def get_price_collect_status(complex_no: str):
    """실거래가 수집 진행 상태 폴링."""
    with _price_collect_lock:
        _cleanup_stale_price_collects()
        status = _price_collect_status.get(complex_no)
        if not status:
            return {"complex_no": complex_no, "status": "idle",
                    "collected": 0, "failed": 0, "total": 0}
        snapshot = {k: v for k, v in status.items() if not k.startswith("_")}
        # done/error 상태는 프론트가 한 번 확인 후 정리
        if status.get("_polled_final"):
            _price_collect_status.pop(complex_no, None)
        elif status.get("status") in ("done", "error"):
            status["_polled_final"] = True
    return {"complex_no": complex_no, **snapshot}
