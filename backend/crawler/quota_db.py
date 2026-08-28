"""공유 쿼터 보호 DB 카운터

data.go.kr API 일일 호출 횟수를 RateLimitCounter 테이블에 기록.
naver-estate-web과 mibunyang이 같은 Supabase DB를 공유하므로
양쪽 프로젝트의 호출 합산이 정확하게 추적됨.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text

logger = logging.getLogger(__name__)

DEFAULT_DAILY_LIMIT = 9000  # 일일 10,000회, 안전 마진 10%

KST = ZoneInfo("Asia/Seoul")


def _today_kst() -> date:
    """오늘 날짜(KST 기준).

    date.today() 는 서버 로컬 시간대에 의존해 CI·컨테이너(UTC)에서 KST 와 하루
    어긋난다. 집 서버는 KST 라 운영 동작은 동일하고, 환경 의존만 제거한다.
    """
    return datetime.now(KST).date()


def _quota_key(api_name: str = "data_go_kr") -> str:
    """오늘 날짜(KST) 기반 쿼터 키 생성"""
    return f"quota:{api_name}:{_today_kst().isoformat()}"


def _expires_at_eod() -> datetime:
    """오늘 자정(KST) + 1시간 여유. 저장은 UTC aware 로 변환."""
    tomorrow = _today_kst() + timedelta(days=1)
    return datetime(
        tomorrow.year, tomorrow.month, tomorrow.day, 1, 0, 0, tzinfo=KST
    ).astimezone(timezone.utc)


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


def purge_expired_counters(db) -> int:
    """만료된 쿼터 카운터 행을 삭제하고 삭제 건수를 반환.

    `rate_limit_counters` 는 `quota:{api}:{날짜}` 처럼 **날짜별로 새 키**를 만들기
    때문에 행이 매일 늘어난다. `expires_at` 컬럼은 처음부터 있었지만 이 값을 보고
    지우는 주체가 아무도 없어, 2026-04-15 이후 만료분이 전부 잔존해 있었다
    (조사 시점 ~135행). 기능 장애는 아니지만 청소 주체가 없다는 것 자체가 결함이라
    일일 유지보수 잡(`crawler/vacuum_maintenance.py`)이 함께 치우게 한다.

    ⚠ `expires_at` 이 NULL 인 행은 건드리지 않는다 — 만료 개념이 없는(또는 아직
    정해지지 않은) 행이라 "만료됐다" 고 단정할 근거가 없다. 컬럼은 NOT NULL 이지만
    스키마 변경·수동 INSERT 로 NULL 이 생길 가능성에 대비해 조건을 명시한다.

    dialect 분기 없이 한 문장으로 처리한다 — 비교 기준을 DB 함수(now())가 아니라
    **Python 이 만든 UTC aware 값**으로 바인딩하므로 PostgreSQL·SQLite 양쪽에서
    같은 의미로 동작한다(`db/price_queries.py:48` 의 dialect 분기가 필요했던
    PostgreSQL 전용 문법을 애초에 쓰지 않는다).
    """
    now = datetime.now(timezone.utc)
    result = db.execute(
        text(
            "DELETE FROM rate_limit_counters "
            "WHERE expires_at IS NOT NULL AND expires_at < :now"
        ),
        {"now": now},
    )
    db.commit()
    return result.rowcount or 0


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
