"""역할 기반 권한 검사 + 쿼터 확인"""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from db.models import RateLimitCounter


def require_admin(user: dict) -> None:
    """관리자 역할 필수. 403 if not admin."""
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="관리자 권한이 필요합니다",
        )


def require_role(user: dict, allowed_roles: list[str]) -> None:
    """허용된 역할 목록에 포함되어야 함. 403 otherwise."""
    if user.get("role") not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="접근 권한이 없습니다",
        )


def check_quota(db: Session, user_id: str, quota_type: str, daily_limit: int) -> None:
    """일일 쿼터 확인. 초과 시 429.

    Args:
        db: SQLAlchemy 세션
        user_id: 사용자 ID
        quota_type: 쿼터 종류 (crawl, export)
        daily_limit: 일일 허용 횟수
    """
    # 한국 사용자 서비스라 일일 한도 리셋은 KST 자정 기준
    # (UTC 날짜를 키로 쓰면 한도가 KST 오전 9시에 리셋돼 하루가 어긋난다)
    now_kst = datetime.now(ZoneInfo("Asia/Seoul"))
    today = now_kst.strftime("%Y-%m-%d")
    key = f"user:{user_id}:{quota_type}:{today}"

    counter = db.get(RateLimitCounter, key)
    if counter:
        if counter.count >= daily_limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"일일 {quota_type} 한도({daily_limit}회)를 초과했습니다",
            )
        counter.count += 1
    else:
        # 키 수명은 리셋 기준(KST 자정)과 정합해야 한다 — UTC 23:59 로 두면
        # KST 08:59 에 만료돼 아직 살아있어야 할 오늘 버킷이 먼저 사라진다.
        # 저장은 UTC aware 로 변환 (expires_at = DateTime(timezone=True))
        next_kst_midnight = now_kst.replace(
            hour=0, minute=0, second=0, microsecond=0
        ) + timedelta(days=1)
        expires = next_kst_midnight.astimezone(timezone.utc)
        counter = RateLimitCounter(key=key, count=1, expires_at=expires)
        db.add(counter)

    # commit은 호출자가 전체 작업 완료 후 단일 트랜잭션으로 처리
