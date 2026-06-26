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


def revoke_paid_until(
    current: datetime | None,
    duration_days: int,
    now: datetime | None = None,
) -> datetime | None:
    """전체 환불 시 paid_until 을 되돌린다 — extend_paid_until 의 역함수.

    규칙 = max(현재 만료일 − 환불 구독기간, now). 즉 환불한 결제가 부여했던 기간만큼만
    빼되, 결과가 now 이전(이미 다 쓴 기간)이면 즉시 만료(now)로 막는다.

    extend 가 누적(이어붙임)이므로 revoke 도 그 결제 몫(duration_days)만 차감해야 다른 결제로
    쌓인 기간을 침범하지 않는다. current 가 None(유료 이력 없음)이면 환불할 것도 없어 None.

    naive datetime 방어 — extend 와 동일하게 UTC aware 로 통일.

    Args:
        current: 기존 paid_until (None = 유료 이력 없음 → None 반환).
        duration_days: 환불한 결제가 부여했던 구독 일수 (예: 30, 365).
        now: 기준 현재 시각 (테스트 주입용, 기본 = UTC now).

    Returns:
        새 paid_until (aware UTC). current 가 None 이면 None.
    """
    if current is None:
        return None
    if now is None:
        now = datetime.now(timezone.utc)
    elif now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    cur = current if current.tzinfo is not None else current.replace(tzinfo=timezone.utc)
    reduced = cur - timedelta(days=duration_days)
    return reduced if reduced > now else now
