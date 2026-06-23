"""유료 구독 이용권 기간 계산 — 순수 함수 (DB·PortOne 무관, 단위 테스트 가능).

게이트(deps.get_approved_user)와 결제 로직(PR3 payment.py)이 공유한다.
이용권 만료일 paid_until 은 user_profiles 컬럼(V035).
"""

from datetime import datetime, timedelta, timezone


def extend_paid_until(
    current: datetime | None,
    duration_days: int,
    now: datetime | None = None,
) -> datetime:
    """결제 시 paid_until 을 연장해 새 만료일을 반환한다.

    규칙 = max(현재 만료일, now) + 구독기간. 즉:
    - 만료 전 재결제 → 남은 기간에 누적(이어붙임). 사용자 손해 없음.
    - 만료 후(또는 첫 결제) → now 기준으로 시작.

    naive datetime 방어 — DB 에 offset 없이 박힌 current 가 있으면 aware now 와 비교/연산 시
    TypeError. UTC aware 로 통일. now 미지정 시 현재 UTC.

    Args:
        current: 기존 paid_until (None = 유료 이력 없음).
        duration_days: 추가할 구독 일수 (예: 30, 365).
        now: 기준 현재 시각 (테스트 주입용, 기본 = UTC now).

    Returns:
        새 paid_until (aware UTC).
    """
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    base = now
    if current is not None:
        cur = current if current.tzinfo is not None else current.replace(tzinfo=timezone.utc)
        if cur > base:
            base = cur  # 아직 안 끝난 기간이 남았으면 그 끝에 이어붙임

    return base + timedelta(days=duration_days)
