"""관리자 판정 테스트 — role == "admin" 또는 user_id ∈ ADMIN_USER_IDS. 이메일은 보지 않는다 (세션 417)

옛 방식(ADMIN_EMAIL 이메일 목록)은 "가입 안 된 주소가 목록에 들어가는 순간 그 주소로 가입한 사람이
관리자"가 되는 구조라 user_id 기준으로 바꿨다. 이 파일은 그 전환을 지킨다:
- user_id 가 목록에 있으면 관리자 API·승인 게이트 통과
- role=admin 이면 통과
- 이메일이 (옛) 관리자 이메일과 같아도 user_id·role 이 아니면 403 ← 이메일 분기 부활 방지
- 목록이 비면 부팅 경고 로그

실행: python -m pytest tests/test_admin_email.py -v
"""
import logging

import jwt
import pytest
from fastapi import HTTPException

from db.models import UserProfile

JWT_SECRET = "test-secret-key-for-testing-only"
OWNER_ID = "b0da4fd4-487d-46a9-8b3b-cff07227429c"


def _token(sub, email=None):
    return jwt.encode(
        {"sub": sub, "aud": "authenticated", "email": email or f"{sub}@test.com"},
        JWT_SECRET,
        algorithm="HS256",
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _make_profile(db, uid, role="user", status="approved", email=None):
    p = UserProfile(user_id=uid, email=email or f"{uid}@test.com", role=role, status=status)
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def admin_ids(monkeypatch):
    """deps.ADMIN_USER_IDS 를 테스트마다 교체 (monkeypatch 가 원복)."""
    import deps

    def _set(ids):
        monkeypatch.setattr(deps, "ADMIN_USER_IDS", set(ids))

    return _set


class TestAdminByUserId:
    """(a)(b)(c) — 관리자 API 와 승인 게이트"""

    def test_empty_ids_blocks_admin_access(self, client, db, admin_ids):
        """목록 비어 있음 + role=user → 관리자 API 403 (fail-closed)"""
        admin_ids([])
        _make_profile(db, "u1", role="user")
        res = client.get("/api/admin/users", headers=_auth(_token("u1")))
        assert res.status_code == 403

    def test_user_id_in_list_grants_admin(self, client, db, admin_ids):
        """(a) user_id ∈ ADMIN_USER_IDS → role=expert 여도 관리자 API 200 (사장님 계정 모양)"""
        admin_ids([OWNER_ID])
        _make_profile(db, OWNER_ID, role="expert")
        res = client.get("/api/admin/users", headers=_auth(_token(OWNER_ID)))
        assert res.status_code == 200

    def test_role_admin_grants_admin(self, client, db, admin_ids):
        """(b) role=admin → 목록이 비어 있어도 관리자 API 200"""
        admin_ids([])
        _make_profile(db, "a1", role="admin")
        res = client.get("/api/admin/users", headers=_auth(_token("a1")))
        assert res.status_code == 200

    def test_email_alone_never_grants_admin(self, client, db, admin_ids, monkeypatch):
        """(c) 옛 ADMIN_EMAIL 과 같은 이메일이어도 user_id·role 이 아니면 403

        뮤테이션: deps.is_admin_user 에 이메일 분기를 되살리면 이 테스트가 FAIL 해야 한다.
        """
        monkeypatch.setenv("ADMIN_EMAIL", "boss@test.com")
        admin_ids([OWNER_ID])
        _make_profile(db, "impostor", role="user", email="boss@test.com")
        res = client.get(
            "/api/admin/users", headers=_auth(_token("impostor", email="boss@test.com"))
        )
        assert res.status_code == 403

    def test_approved_gate_admin_bypass_by_user_id(self, admin_ids):
        """(a) 승인 게이트 — user_id ∈ 목록이면 status=pending 이어도 통과"""
        from deps import get_approved_user

        admin_ids([OWNER_ID])
        user = {"user_id": OWNER_ID, "email": "x@test.com", "role": "expert", "status": "pending"}
        assert get_approved_user(user) is user

    def test_approved_gate_email_does_not_bypass(self, admin_ids, monkeypatch):
        """(c) 승인 게이트 — 옛 관리자 이메일이라도 pending 이면 403"""
        from deps import get_approved_user

        monkeypatch.setenv("ADMIN_EMAIL", "boss@test.com")
        admin_ids([OWNER_ID])
        user = {"user_id": "impostor", "email": "boss@test.com", "role": "user", "status": "pending"}
        with pytest.raises(HTTPException) as exc:
            get_approved_user(user)
        assert exc.value.status_code == 403


class TestFirstLoginProfile:
    """첫 로그인 프로필 자동 생성 — role/status 도 user_id 기준"""

    def test_first_login_no_auto_admin_when_empty(self, client, db, admin_ids):
        """목록 비어 있음 → 첫 로그인 프로필 role=user·pending"""
        admin_ids([])
        res = client.get("/api/admin/users", headers=_auth(_token("new1")))
        assert res.status_code == 403
        profile = db.get(UserProfile, "new1")
        assert profile is not None
        assert profile.role == "user"
        assert profile.status == "pending"

    def test_first_login_admin_by_user_id(self, client, db, admin_ids):
        """user_id ∈ 목록 → 첫 로그인 프로필 role=admin·approved"""
        admin_ids(["new-admin"])
        res = client.get("/api/admin/users", headers=_auth(_token("new-admin")))
        assert res.status_code == 200
        profile = db.get(UserProfile, "new-admin")
        assert profile.role == "admin"
        assert profile.status == "approved"

    def test_first_login_admin_email_is_not_admin(self, client, db, admin_ids, monkeypatch):
        """(c) 옛 관리자 이메일로 처음 가입해도 role=user·pending (가입 탈취 구멍 방지)"""
        monkeypatch.setenv("ADMIN_EMAIL", "boss@test.com")
        admin_ids([OWNER_ID])
        res = client.get(
            "/api/admin/users", headers=_auth(_token("new2", email="boss@test.com"))
        )
        assert res.status_code == 403
        profile = db.get(UserProfile, "new2")
        assert profile.role == "user"
        assert profile.status == "pending"


class TestBootWarning:
    """(d) 부팅 경고 로그"""

    def test_warns_when_ids_missing(self, admin_ids, monkeypatch, caplog):
        """목록 비어 있음 → '관리자 user_id 미설정' 경고, ADMIN_EMAIL 만 있으면 이전 안내도"""
        import deps

        admin_ids([])
        monkeypatch.setenv("ADMIN_EMAIL", "boss@test.com")
        with caplog.at_level(logging.WARNING, logger="deps"):
            deps._warn_admin_config()
        text = caplog.text
        assert "관리자 user_id 미설정" in text
        assert "ADMIN_EMAIL 은 더 이상 관리자 판정에 쓰이지 않습니다" in text

    def test_no_warning_when_ids_set(self, admin_ids, monkeypatch, caplog):
        """목록 설정됨 → 경고 없음 (ADMIN_EMAIL 이 남아 있어도)"""
        import deps

        admin_ids([OWNER_ID])
        monkeypatch.setenv("ADMIN_EMAIL", "boss@test.com")
        with caplog.at_level(logging.WARNING, logger="deps"):
            deps._warn_admin_config()
        assert "관리자 user_id 미설정" not in caplog.text
        assert "ADMIN_EMAIL" not in caplog.text
