"""best-effort 알림 발송 실패가 observable 한지 검증 (관측성 개선 fix D).

_alert_billing / _alert_operator_throttled 는 telegram 발송 실패를 삼켜 배치·결제
흐름을 깨지 않는다(best-effort 유지). 단, 실패 시 warning 로그를 남겨야 한다
(과거엔 bare `except Exception: pass` 로 완전히 무음이었음).

실행: python -m pytest tests/test_alert_swallow_logs.py -v
"""

import logging
from unittest.mock import patch

import crawler.billing_charge as billing_charge
import routers.payment as payment


def test_alert_billing_swallows_and_logs_send_failure(caplog):
    """_alert_billing: send_telegram 예외 시 raise 하지 않고 warning 로그를 남긴다."""
    billing_charge._last_alert_at.clear()
    with patch("services.telegram.send_telegram", side_effect=RuntimeError("boom")):
        with caplog.at_level(logging.WARNING, logger="crawler.billing_charge"):
            billing_charge._alert_billing("결제 3회 실패", key="test_billing_swallow")
    assert "발송 실패" in caplog.text


def test_notify_user_billing_failed_swallows_and_logs_send_failure(db, caplog):
    """_notify_user_billing_failed: send_email 예외 시 raise 하지 않고 warning 로그를 남긴다."""
    from db.models import UserProfile

    db.add(UserProfile(user_id="u_alert_test", email="u_alert_test@test.com",
                       role="user", status="approved"))
    db.commit()

    with patch("services.email.send_email", side_effect=RuntimeError("boom")):
        with caplog.at_level(logging.WARNING, logger="crawler.billing_charge"):
            billing_charge._notify_user_billing_failed(db, "u_alert_test")
    assert "발송 실패" in caplog.text


def test_alert_operator_throttled_swallows_and_logs_send_failure(caplog):
    """_alert_operator_throttled: send_telegram 예외 시 raise 하지 않고 warning 로그를 남긴다."""
    payment._last_alert_at.clear()
    with patch("services.telegram.send_telegram", side_effect=RuntimeError("boom")):
        with caplog.at_level(logging.WARNING, logger="routers.payment"):
            payment._alert_operator_throttled("test_payment_swallow", "웹훅 서명 실패 반복")
    assert "발송 실패" in caplog.text
