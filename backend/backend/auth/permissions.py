"""역할 기반 권한 검사 + 쿼터 확인"""

from datetime import datetime, timezone, timedelta

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
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
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
        expires = datetime.now(timezone.utc).replace(
            hour=23, minute=59, second=59
        ) + timedelta(seconds=1)
        counter = RateLimitCounter(key=key, count=1, expires_at=expires)
        db.add(counter)

    db.commit()
