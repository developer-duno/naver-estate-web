"""감사 로그 테스트 — IP 마스킹, 로그 생성
실행: python -m pytest tests/test_audit.py -v
"""
from auth.audit import log_action, _mask_ip
from db.models import AuditLog


def test_mask_ip_ipv4():
    """IPv4 마지막 옥텟 마스킹"""
    assert _mask_ip("192.168.1.100") == "192.168.1.xxx"


def test_mask_ip_none():
    """None 입력 → None"""
    assert _mask_ip(None) is None


def test_mask_ip_non_ipv4():
    """IPv6 등 비표준 → 그대로 반환"""
    assert _mask_ip("::1") == "::1"


def test_log_action_creates_entry(db):
    """감사 로그 DB 항목 생성"""
    log_action(db, "user-001", "login", "user", "user-001", ip="1.2.3.4")
    db.commit()
    logs = db.query(AuditLog).all()
    assert len(logs) == 1
    assert logs[0].user_id == "user-001"
    assert logs[0].action == "login"


def test_log_action_masks_ip(db):
    """저장된 IP가 마스킹됨"""
    log_action(db, "user-001", "export", "article", "A001", ip="10.0.0.55")
    db.commit()
    log = db.query(AuditLog).first()
    assert log.ip_address == "10.0.0.xxx"


def test_log_action_with_details(db):
    """JSON 상세 정보 저장"""
    log_action(db, "admin-001", "update", "user", "user-002", details={"role": "admin"}, ip="1.1.1.1")
    db.commit()
    log = db.query(AuditLog).first()
    assert log.details is not None


def test_log_action_without_optional(db):
    """선택 필드 없이 호출해도 에러 없음"""
    log_action(db, "user-001", "view", "complex", "C001")
    db.commit()
    logs = db.query(AuditLog).all()
    assert len(logs) == 1
