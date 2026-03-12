"""감사 로그 기록 유틸리티"""

import logging
import re

from sqlalchemy.orm import Session

from db.models import AuditLog

logger = logging.getLogger(__name__)


def _mask_ip(ip: str | None) -> str | None:
    """IP 마지막 옥텟 마스킹 (개인정보 보호)"""
    if not ip:
        return None
    # IPv4: 192.168.1.xxx
    match = re.match(r"^(\d+\.\d+\.\d+\.)\d+$", ip)
    if match:
        return f"{match.group(1)}xxx"
    return ip


def log_action(
    db: Session,
    user_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    """감사 로그를 DB에 기록한다.

    Args:
        db: SQLAlchemy 세션
        user_id: 수행자 ID (미인증 시 None)
        action: 액션 종류 (login, crawl_trigger, export, admin_action 등)
        target_type: 대상 타입 (complex, article, user, crawl_job 등)
        target_id: 대상 식별자
        details: 추가 정보 (JSON)
        ip: 클라이언트 IP (마지막 옥텟 마스킹 적용)
    """
    try:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=_mask_ip(ip),
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("감사 로그 기록 실패: action=%s, user=%s", action, user_id)
