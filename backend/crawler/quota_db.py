"""공유 쿼터 보호 DB 카운터

data.go.kr API 일일 호출 횟수를 RateLimitCounter 테이블에 기록.
naver-estate-web과 mibunyang이 같은 Supabase DB를 공유하므로
양쪽 프로젝트의 호출 합산이 정확하게 추적됨.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

logger = logging.getLogger(__name__)

DEFAULT_DAILY_LIMIT = 9000  # 일일 10,000회, 안전 마진 10%


def _quota_key(api_name: str = "data_go_kr") -> str:
    """오늘 날짜 기반 쿼터 키 생성"""
    return f"quota:{api_name}:{date.today().isoformat()}"


def _expires_at_eod() -> datetime:
    """오늘 자정(UTC+9) + 1시간 여유"""
    tomorrow = date.today() + timedelta(days=1)
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, 1, 0, 0, tzinfo=timezone.utc)


def increment_api_quota(
    session_factory,
    api_name: str = "data_go_kr",
    max_calls: int = DEFAULT_DAILY_LIMIT,
) -> bool:
    """일일 API 호출 카운터를 원자적으로 증가. 한도 내이면 True, 초과 시 False."""
    key = _quota_key(api_name)
    expires = _expires_at_eod()

    try:
        with session_factory() as db:
            result = db.execute(
                text(
                    "INSERT INTO rate_limit_counters (key, count, expires_at) "
                    "VALUES (:key, 1, :expires) "
                    "ON CONFLICT (key) DO UPDATE "
                    "SET count = rate_limit_counters.count + 1 "
                    "RETURNING count"
                ),
                {"key": key, "expires": expires},
            )
            count = result.scalar_one()
            db.commit()

            if count > max_calls:
                logger.warning("쿼터 한도 도달: %s = %d/%d", key, count, max_calls)
                return False
            return True
    except Exception as e:
        logger.error("쿼터 DB 업데이트 실패 (메모리 폴백 사용): %s", e)
        return True  # DB 실패 시 호출 허용 (기존 in-memory 폴백이 2차 보호)


def get_api_quota_status(
    session_factory,
    api_name: str = "data_go_kr",
    max_calls: int = DEFAULT_DAILY_LIMIT,
) -> dict:
    """오늘의 API 쿼터 현황 조회"""
    key = _quota_key(api_name)

    try:
        with session_factory() as db:
            result = db.execute(
                text("SELECT count FROM rate_limit_counters WHERE key = :key"),
                {"key": key},
            )
            row = result.fetchone()
            count = row[0] if row else 0
    except Exception as e:
        logger.error("쿼터 DB 조회 실패: %s", e)
        count = -1  # 조회 실패 표시

    return {
        "api_name": api_name,
        "date": date.today().isoformat(),
        "count": count,
        "limit": max_calls,
        "remaining": max(0, max_calls - count) if count >= 0 else -1,
        "utilization_pct": round(count / max_calls * 100, 1) if count >= 0 else -1,
    }
